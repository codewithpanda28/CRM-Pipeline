import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder } from '@vencore/events';
import { sha256Canonical } from '../hash';
import { loadEngineV2Flags } from '../flags';
import { incrementUsage } from '../usage';

export type ApprovalStatus = 'pending' | 'authorized' | 'rejected' | 'expired' | 'revoked';

export interface CreateApprovalInput {
  tenantId: string;
  workflowId: string;
  workflowVersionId: string;
  workflowRunId: string;
  workflowRunStepId: string;
  actionType: string;
  payloadSnapshot: Record<string, unknown>;
  requesterType: string;
  requesterId: string;
  expiresAt: Date;
  idempotencyKey: string;
}

export interface ValidateExecutionResult {
  ok: boolean;
  reason?: string;
  approval?: Awaited<ReturnType<AutomationApprovalService['get']>>;
}

async function appendApprovalEvent(
  db: Kysely<Database>,
  opts: {
    tenantId: string;
    approvalId: string;
    eventType:
      | 'requested'
      | 'authorized'
      | 'rejected'
      | 'expired'
      | 'revoked'
      | 'validation_failed';
    actorType: string;
    actorId: string | null;
    detail?: Record<string, unknown>;
  },
) {
  await db
    .insertInto('automation_approval_events')
    .values({
      tenant_id: opts.tenantId,
      approval_id: opts.approvalId,
      event_type: opts.eventType,
      actor_type: opts.actorType,
      actor_id: opts.actorId,
      detail: opts.detail ?? {},
    })
    .execute();
}

async function securityAudit(
  db: Kysely<Database>,
  event: {
    tenant_id: string;
    actor_type: string;
    actor_id: string | null;
    action: string;
    entity_id: string;
    meta?: Record<string, unknown>;
  },
): Promise<string | null> {
  try {
    const id = randomUUID();
    await db
      .insertInto('security_audit_events')
      .values({
        id,
        tenant_id: event.tenant_id,
        actor_type: event.actor_type,
        actor_id: event.actor_id,
        action: event.action,
        entity_type: 'automation_approval',
        entity_id: event.entity_id,
        meta: event.meta ?? {},
      })
      .execute();
    return id;
  } catch {
    return null;
  }
}

export class AutomationApprovalService {
  constructor(private readonly db: Kysely<Database>) {}

  async get(tenantId: string, approvalId: string) {
    return this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', '=', approvalId)
      .executeTakeFirst();
  }

  async create(input: CreateApprovalInput) {
    const payloadHash = sha256Canonical(input.payloadSnapshot);
    const existing = await this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .where('idempotency_key', '=', input.idempotencyKey)
      .executeTakeFirst();
    if (existing) return existing;

    const id = randomUUID();
    const auditId = await securityAudit(this.db, {
      tenant_id: input.tenantId,
      actor_type: input.requesterType,
      actor_id: input.requesterId,
      action: 'automation.approval.requested',
      entity_id: id,
      meta: {
        workflow_id: input.workflowId,
        workflow_version_id: input.workflowVersionId,
        workflow_run_id: input.workflowRunId,
        workflow_run_step_id: input.workflowRunStepId,
        action_type: input.actionType,
        payload_hash: payloadHash,
        requested_payload_snapshot: input.payloadSnapshot,
      },
    });

    await this.db
      .insertInto('automation_approvals')
      .values({
        id,
        tenant_id: input.tenantId,
        workflow_id: input.workflowId,
        workflow_version_id: input.workflowVersionId,
        workflow_run_id: input.workflowRunId,
        workflow_run_step_id: input.workflowRunStepId,
        action_type: input.actionType,
        requested_payload_snapshot: input.payloadSnapshot,
        payload_hash: payloadHash,
        requester_type: input.requesterType,
        requester_id: input.requesterId,
        status: 'pending',
        expires_at: input.expiresAt,
        idempotency_key: input.idempotencyKey,
        audit_link_id: auditId,
      })
      .execute();

    await appendApprovalEvent(this.db, {
      tenantId: input.tenantId,
      approvalId: id,
      eventType: 'requested',
      actorType: input.requesterType,
      actorId: input.requesterId,
      detail: { payload_hash: payloadHash },
    });

    await incrementUsage(this.db, input.tenantId, 'approvals_requested', `approval:req:${id}`);

    // Notify via outbox (dispatch only — not approval)
    const recorder = new EventRecorder(this.db);
    await recorder.append({
      tenantId: input.tenantId,
      eventType: 'automation.approval_required',
      aggregateType: 'automation_approval',
      aggregateId: id,
      jobName: null,
      dedupeKey: `automation:approval_required:${id}`,
      payload: {
        event_id: id,
        tenant_id: input.tenantId,
        event_name: 'automation.approval_required',
        approval_id: id,
        workflow_run_id: input.workflowRunId,
        action_type: input.actionType,
      },
    });

    return (await this.get(input.tenantId, id))!;
  }

  async authorize(opts: {
    tenantId: string;
    approvalId: string;
    approverType: string;
    approverId: string;
    comment?: string;
  }) {
    const flags = await loadEngineV2Flags(this.db, opts.tenantId);
    const row = await this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('id', '=', opts.approvalId)
      .forUpdate()
      .executeTakeFirst();

    if (!row) throw new Error('APPROVAL_NOT_FOUND');
    if (row.status !== 'pending') throw new Error(`APPROVAL_NOT_PENDING:${row.status}`);
    if (row.expires_at.getTime() <= Date.now()) {
      await this.expire({ tenantId: opts.tenantId, approvalId: opts.approvalId, actorType: 'system', actorId: 'expiry' });
      throw new Error('APPROVAL_EXPIRED');
    }
    if (!flags.selfApproval && row.requester_type === 'user' && row.requester_id === opts.approverId) {
      throw new Error('SELF_APPROVAL_FORBIDDEN');
    }

    await this.db
      .updateTable('automation_approvals')
      .set({
        status: 'authorized',
        decision: 'approve',
        approver_type: opts.approverType,
        approver_id: opts.approverId,
        comment: opts.comment ?? null,
        decided_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', opts.approvalId)
      .where('tenant_id', '=', opts.tenantId)
      .execute();

    await appendApprovalEvent(this.db, {
      tenantId: opts.tenantId,
      approvalId: opts.approvalId,
      eventType: 'authorized',
      actorType: opts.approverType,
      actorId: opts.approverId,
      detail: { comment: opts.comment ?? null, payload_hash: row.payload_hash },
    });

    await securityAudit(this.db, {
      tenant_id: opts.tenantId,
      actor_type: opts.approverType,
      actor_id: opts.approverId,
      action: 'automation.approval.authorized',
      entity_id: opts.approvalId,
      meta: {
        workflow_id: row.workflow_id,
        workflow_version_id: row.workflow_version_id,
        workflow_run_id: row.workflow_run_id,
        workflow_run_step_id: row.workflow_run_step_id,
        action_type: row.action_type,
        payload_hash: row.payload_hash,
        requested_payload_snapshot: row.requested_payload_snapshot,
        decision: 'approve',
        comment: opts.comment ?? null,
      },
    });

    await incrementUsage(this.db, opts.tenantId, 'approvals_authorized', `approval:auth:${opts.approvalId}`);

    // Wake run advance via outbox — NEVER marks approval itself
    const recorder = new EventRecorder(this.db);
    await recorder.append({
      tenantId: opts.tenantId,
      eventType: 'automation.run.advance',
      aggregateType: 'workflow_run',
      aggregateId: row.workflow_run_id,
      jobName: 'automation.run.advance',
      dedupeKey: `automation:advance:after-auth:${opts.approvalId}`,
      payload: {
        tenant_id: opts.tenantId,
        workflow_run_id: row.workflow_run_id,
        reason: 'approval_authorized',
        // Explicit: forged approved flags must be ignored by executor
        approved: true,
      },
    });

    return (await this.get(opts.tenantId, opts.approvalId))!;
  }

  async reject(opts: {
    tenantId: string;
    approvalId: string;
    approverType: string;
    approverId: string;
    reason: string;
  }) {
    const row = await this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('id', '=', opts.approvalId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new Error('APPROVAL_NOT_FOUND');
    if (row.status !== 'pending') throw new Error(`APPROVAL_NOT_PENDING:${row.status}`);

    await this.db
      .updateTable('automation_approvals')
      .set({
        status: 'rejected',
        decision: 'reject',
        approver_type: opts.approverType,
        approver_id: opts.approverId,
        reason: opts.reason,
        decided_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', opts.approvalId)
      .where('tenant_id', '=', opts.tenantId)
      .execute();

    await appendApprovalEvent(this.db, {
      tenantId: opts.tenantId,
      approvalId: opts.approvalId,
      eventType: 'rejected',
      actorType: opts.approverType,
      actorId: opts.approverId,
      detail: { reason: opts.reason },
    });

    await securityAudit(this.db, {
      tenant_id: opts.tenantId,
      actor_type: opts.approverType,
      actor_id: opts.approverId,
      action: 'automation.approval.rejected',
      entity_id: opts.approvalId,
      meta: { reason: opts.reason, payload_hash: row.payload_hash },
    });

    if (row.workflow_run_step_id) {
      await this.db
        .updateTable('workflow_run_steps')
        .set({ status: 'failed', error: { code: 'APPROVAL_REJECTED', reason: opts.reason }, finished_at: new Date(), updated_at: new Date() })
        .where('id', '=', row.workflow_run_step_id)
        .where('tenant_id', '=', opts.tenantId)
        .execute();
    }
    await this.db
      .updateTable('workflow_runs')
      .set({ status: 'failed', error: { code: 'APPROVAL_REJECTED' }, finished_at: new Date(), updated_at: new Date() })
      .where('id', '=', row.workflow_run_id)
      .where('tenant_id', '=', opts.tenantId)
      .execute();

    return (await this.get(opts.tenantId, opts.approvalId))!;
  }

  async expire(opts: {
    tenantId: string;
    approvalId: string;
    actorType: string;
    actorId: string | null;
  }) {
    const row = await this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('id', '=', opts.approvalId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    if (row.status !== 'pending') return row;

    await this.db
      .updateTable('automation_approvals')
      .set({
        status: 'expired',
        decision: 'expire',
        decided_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', opts.approvalId)
      .execute();

    await appendApprovalEvent(this.db, {
      tenantId: opts.tenantId,
      approvalId: opts.approvalId,
      eventType: 'expired',
      actorType: opts.actorType,
      actorId: opts.actorId,
    });

    await securityAudit(this.db, {
      tenant_id: opts.tenantId,
      actor_type: opts.actorType,
      actor_id: opts.actorId,
      action: 'automation.approval.expired',
      entity_id: opts.approvalId,
    });

    if (row.workflow_run_step_id) {
      await this.db
        .updateTable('workflow_run_steps')
        .set({ status: 'failed', error: { code: 'APPROVAL_EXPIRED' }, finished_at: new Date(), updated_at: new Date() })
        .where('id', '=', row.workflow_run_step_id)
        .execute();
    }
    await this.db
      .updateTable('workflow_runs')
      .set({ status: 'failed', error: { code: 'APPROVAL_EXPIRED' }, finished_at: new Date(), updated_at: new Date() })
      .where('id', '=', row.workflow_run_id)
      .execute();

    return (await this.get(opts.tenantId, opts.approvalId))!;
  }

  async revoke(opts: {
    tenantId: string;
    approvalId: string;
    actorType: string;
    actorId: string;
    reason: string;
  }) {
    const row = await this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('id', '=', opts.approvalId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) throw new Error('APPROVAL_NOT_FOUND');
    if (row.status !== 'authorized') throw new Error(`APPROVAL_NOT_AUTHORIZED:${row.status}`);

    // If step already succeeded with this approval, revoke-as-undo is forbidden
    if (row.workflow_run_step_id) {
      const step = await this.db
        .selectFrom('workflow_run_steps')
        .select(['status'])
        .where('id', '=', row.workflow_run_step_id)
        .executeTakeFirst();
      if (step?.status === 'succeeded') throw new Error('APPROVAL_ALREADY_EXECUTED');
    }

    await this.db
      .updateTable('automation_approvals')
      .set({
        status: 'revoked',
        decision: 'revoke',
        reason: opts.reason,
        revoked_at: new Date(),
        revoked_by: opts.actorId,
        updated_at: new Date(),
      })
      .where('id', '=', opts.approvalId)
      .execute();

    await appendApprovalEvent(this.db, {
      tenantId: opts.tenantId,
      approvalId: opts.approvalId,
      eventType: 'revoked',
      actorType: opts.actorType,
      actorId: opts.actorId,
      detail: { reason: opts.reason },
    });

    await securityAudit(this.db, {
      tenant_id: opts.tenantId,
      actor_type: opts.actorType,
      actor_id: opts.actorId,
      action: 'automation.approval.revoked',
      entity_id: opts.approvalId,
      meta: { reason: opts.reason },
    });

    return (await this.get(opts.tenantId, opts.approvalId))!;
  }

  /**
   * ADR-027 gate — MUST be called under FOR UPDATE before Class B execute.
   * Ignores any job.data.approved / NL / AI signals (caller must not pass them as authority).
   */
  async validateForExecution(opts: {
    tenantId: string;
    approvalId: string;
    workflowRunId: string;
    workflowRunStepId: string;
    workflowVersionId: string;
  }): Promise<ValidateExecutionResult> {
    const approval = await this.db
      .selectFrom('automation_approvals')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('id', '=', opts.approvalId)
      .forUpdate()
      .executeTakeFirst();

    const fail = async (reason: string): Promise<ValidateExecutionResult> => {
      if (approval) {
        await appendApprovalEvent(this.db, {
          tenantId: opts.tenantId,
          approvalId: opts.approvalId,
          eventType: 'validation_failed',
          actorType: 'system',
          actorId: 'executor',
          detail: { reason },
        });
        await securityAudit(this.db, {
          tenant_id: opts.tenantId,
          actor_type: 'system',
          actor_id: 'executor',
          action: 'automation.approval.validation_failed',
          entity_id: opts.approvalId,
          meta: { reason },
        });
      }
      return { ok: false, reason };
    };

    if (!approval) return fail('missing');
    if (approval.tenant_id !== opts.tenantId) return fail('tenant_mismatch');
    if (approval.status === 'pending') return fail('pending');
    if (approval.status === 'rejected') return fail('rejected');
    if (approval.status === 'expired') return fail('expired');
    if (approval.status === 'revoked' || approval.revoked_at) return fail('revoked');
    if (approval.status !== 'authorized') return fail(`status:${approval.status}`);
    if (approval.expires_at.getTime() <= Date.now()) return fail('expired');
    if (approval.workflow_run_id !== opts.workflowRunId) return fail('run_mismatch');
    if (approval.workflow_run_step_id !== opts.workflowRunStepId) return fail('step_mismatch');
    if (approval.workflow_version_id !== opts.workflowVersionId) return fail('version_mismatch');
    if (!approval.approver_id) return fail('approver_missing');

    const recomputed = sha256Canonical(approval.requested_payload_snapshot);
    if (recomputed !== approval.payload_hash) return fail('payload_hash_mismatch');

    return { ok: true, approval };
  }

  async expireDue(limit = 100): Promise<number> {
    const due = await sql<{ id: string; tenant_id: string }>`
      SELECT id, tenant_id FROM automation_approvals
      WHERE status = 'pending' AND expires_at <= now()
      ORDER BY expires_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `.execute(this.db);

    let n = 0;
    for (const row of due.rows) {
      await this.expire({
        tenantId: row.tenant_id,
        approvalId: row.id,
        actorType: 'system',
        actorId: 'approval.timeout',
      });
      n++;
    }
    return n;
  }
}
