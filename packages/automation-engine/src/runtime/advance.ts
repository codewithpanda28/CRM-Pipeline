import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder } from '@vencore/events';
import { getActionClass, getActionDefinition } from '../actions/registry';
import { AutomationApprovalService } from '../approval/service';
import { sha256Canonical } from '../hash';
import { incrementUsage } from '../usage';
import type { WorkflowGraph } from '../definition/service';
import { executeClassAAction, executeCriticalStub } from '../actions/execute';

const MAX_ATTEMPTS = 5;

function getPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export class RunAdvanceExecutor {
  private readonly approvals: AutomationApprovalService;

  constructor(private readonly db: Kysely<Database>) {
    this.approvals = new AutomationApprovalService(db);
  }

  async advance(opts: {
    tenantId: string;
    workflowRunId: string;
    /** Ignored for authorization — ADR-027 */
    forgedApprovedFlag?: unknown;
  }): Promise<{ status: string; detail?: string }> {
    // Explicitly ignore forged job flags
    void opts.forgedApprovedFlag;

    const run = await this.db
      .selectFrom('workflow_runs')
      .selectAll()
      .where('tenant_id', '=', opts.tenantId)
      .where('id', '=', opts.workflowRunId)
      .forUpdate()
      .executeTakeFirst();

    if (!run) return { status: 'missing' };
    if (['completed', 'failed', 'cancelled', 'dead_lettered'].includes(run.status)) {
      return { status: run.status };
    }
    if (run.status === 'paused') return { status: 'paused' };

    if (run.run_timeout_at && run.run_timeout_at.getTime() <= Date.now()) {
      await this.failRun(run.id, opts.tenantId, { code: 'RUN_TIMEOUT' });
      return { status: 'failed', detail: 'RUN_TIMEOUT' };
    }

    if (run.status === 'queued') {
      await this.db
        .updateTable('workflow_runs')
        .set({ status: 'running', started_at: run.started_at ?? new Date(), updated_at: new Date() })
        .where('id', '=', run.id)
        .execute();
    }

    const version = await this.db
      .selectFrom('workflow_versions')
      .selectAll()
      .where('id', '=', run.workflow_version_id)
      .where('tenant_id', '=', opts.tenantId)
      .executeTakeFirstOrThrow();

    const graph = version.graph as unknown as WorkflowGraph;

    const ready = await this.db
      .selectFrom('workflow_run_steps')
      .selectAll()
      .where('workflow_run_id', '=', run.id)
      .where('tenant_id', '=', opts.tenantId)
      .where('status', 'in', ['ready', 'awaiting_approval'])
      .orderBy('created_at', 'asc')
      .execute();

    // Resume waiting delays that are due
    const dueWaits = await this.db
      .selectFrom('workflow_run_steps')
      .selectAll()
      .where('workflow_run_id', '=', run.id)
      .where('tenant_id', '=', opts.tenantId)
      .where('status', '=', 'waiting')
      .where('scheduled_at', '<=', new Date())
      .execute();

    for (const w of dueWaits) {
      await this.db
        .updateTable('workflow_run_steps')
        .set({ status: 'ready', updated_at: new Date() })
        .where('id', '=', w.id)
        .execute();
      ready.push({ ...w, status: 'ready' });
    }

    if (ready.length === 0) {
      const pending = await this.db
        .selectFrom('workflow_run_steps')
        .select(['status'])
        .where('workflow_run_id', '=', run.id)
        .execute();
      if (pending.some((s) => s.status === 'waiting')) {
        await this.db
          .updateTable('workflow_runs')
          .set({ status: 'waiting', updated_at: new Date() })
          .where('id', '=', run.id)
          .execute();
        return { status: 'waiting' };
      }
      if (pending.some((s) => s.status === 'awaiting_approval')) {
        await this.db
          .updateTable('workflow_runs')
          .set({ status: 'awaiting_approval', updated_at: new Date() })
          .where('id', '=', run.id)
          .execute();
        return { status: 'awaiting_approval' };
      }
      if (pending.every((s) => ['succeeded', 'skipped'].includes(s.status)) || pending.length === 0) {
        await this.completeRun(run.id, opts.tenantId);
        return { status: 'completed' };
      }
      return { status: run.status };
    }

    for (const step of ready) {
      if (step.status === 'awaiting_approval') {
        if (!step.approval_id) continue;
        const v = await this.approvals.validateForExecution({
          tenantId: opts.tenantId,
          approvalId: step.approval_id,
          workflowRunId: run.id,
          workflowRunStepId: step.id,
          workflowVersionId: run.workflow_version_id,
        });
        if (!v.ok) {
          if (v.reason === 'pending') {
            await this.db
              .updateTable('workflow_runs')
              .set({ status: 'awaiting_approval', updated_at: new Date() })
              .where('id', '=', run.id)
              .execute();
            return { status: 'awaiting_approval' };
          }
          await this.failStep(step, opts.tenantId, { code: 'APPROVAL_INVALID', reason: v.reason });
          await this.failRun(run.id, opts.tenantId, { code: 'APPROVAL_INVALID', reason: v.reason });
          return { status: 'failed', detail: v.reason };
        }
        // Execute Class B with approved snapshot ONLY
        await this.executeApprovedAction(run, step, v.approval!, graph);
        continue;
      }

      await this.runStep(run, step, graph);
      // Re-read run status after step
      const fresh = await this.db
        .selectFrom('workflow_runs')
        .select(['status'])
        .where('id', '=', run.id)
        .executeTakeFirst();
      if (fresh && ['awaiting_approval', 'waiting', 'failed', 'completed', 'paused'].includes(fresh.status)) {
        return { status: fresh.status };
      }
    }

    // More work?
    const recorder = new EventRecorder(this.db);
    await recorder.append({
      tenantId: opts.tenantId,
      eventType: 'automation.run.advance',
      aggregateType: 'workflow_run',
      aggregateId: run.id,
      jobName: 'automation.run.advance',
      dedupeKey: `automation:advance:cont:${run.id}:${Date.now()}`,
      payload: { tenant_id: opts.tenantId, workflow_run_id: run.id },
    });

    return { status: 'running' };
  }

  private async runStep(
    run: { id: string; tenant_id: string; workflow_id: string; workflow_version_id: string; trigger_payload: Record<string, unknown> },
    step: {
      id: string;
      node_id: string;
      step_type: string;
      attempt: number;
      tenant_id: string;
    },
    graph: WorkflowGraph,
  ) {
    const node = graph.nodes.find((n) => n.id === step.node_id);
    if (!node) {
      await this.failStep(step, run.tenant_id, { code: 'NODE_MISSING' });
      await this.failRun(run.id, run.tenant_id, { code: 'NODE_MISSING' });
      return;
    }

    await this.db
      .updateTable('workflow_run_steps')
      .set({ status: 'running', started_at: new Date(), updated_at: new Date() })
      .where('id', '=', step.id)
      .execute();

    await this.db
      .insertInto('workflow_run_step_attempts')
      .values({
        tenant_id: run.tenant_id,
        workflow_run_step_id: step.id,
        attempt_number: step.attempt,
        status: 'running',
      })
      .onConflict((oc) => oc.columns(['workflow_run_step_id', 'attempt_number']).doNothing())
      .execute();

    try {
      await this.auditStep(run.tenant_id, step.id, 'automation.step.started', {});

      if (step.step_type === 'condition') {
        const path = String(node.config?.['path'] ?? '');
        const op = String(node.config?.['op'] ?? 'eq');
        const value = node.config?.['value'];
        const actual = getPath({ payload: run.trigger_payload, trigger: run.trigger_payload }, path);
        const ok = op === 'eq' ? actual === value : actual !== value;
        await this.succeedStep(step, run.tenant_id, { result: ok });
        await this.enqueueNext(run, graph, step.node_id, ok ? 'true' : 'false');
        return;
      }

      if (step.step_type === 'branch') {
        const cases = (node.config?.['cases'] as Array<{ when: string; label?: string }>) ?? [];
        let matched = 'default';
        for (const c of cases) {
          const path = String((c as { path?: string }).path ?? node.config?.['path'] ?? '');
          const expected = (c as { value?: unknown }).value;
          const actual = getPath({ payload: run.trigger_payload }, path);
          if (actual === expected) {
            matched = c.when;
            break;
          }
        }
        await this.succeedStep(step, run.tenant_id, { matched });
        await this.enqueueNext(run, graph, step.node_id, matched);
        return;
      }

      if (step.step_type === 'delay') {
        const delayMs = Number(node.config?.['delay_ms'] ?? 0);
        const scheduled = new Date(Date.now() + Math.max(0, delayMs));
        await this.db
          .updateTable('workflow_run_steps')
          .set({ status: 'waiting', scheduled_at: scheduled, updated_at: new Date() })
          .where('id', '=', step.id)
          .execute();
        await this.db
          .updateTable('workflow_runs')
          .set({ status: 'waiting', updated_at: new Date() })
          .where('id', '=', run.id)
          .execute();
        const recorder = new EventRecorder(this.db);
        await recorder.append({
          tenantId: run.tenant_id,
          eventType: 'automation.wait.wakeup',
          aggregateType: 'workflow_run',
          aggregateId: run.id,
          jobName: 'automation.run.advance',
          availableAt: scheduled,
          dedupeKey: `automation:wakeup:${step.id}:${scheduled.toISOString()}`,
          payload: { tenant_id: run.tenant_id, workflow_run_id: run.id },
        });
        return;
      }

      if (step.step_type === 'approval') {
        const actionType = String(node.config?.['action_type'] ?? 'critical.stub');
        const cls = getActionClass(actionType);
        if (cls === 'C') throw new Error(`CLASS_C_BLOCKED:${actionType}`);
        if (cls !== 'B') throw new Error(`APPROVAL_STEP_REQUIRES_CLASS_B:${actionType}`);
        const def = getActionDefinition(actionType);
        if (def?.reserved) throw new Error(`ACTION_NOT_IMPLEMENTED:${actionType}`);

        const payloadSnapshot = {
          action_type: actionType,
          params: (node.config?.['params'] as Record<string, unknown>) ?? {},
          context: (run.trigger_payload as { payload?: Record<string, unknown> })?.payload ?? run.trigger_payload,
        };
        const expiresIn = Number(node.config?.['expires_in_seconds'] ?? 86400);
        const approval = await this.approvals.create({
          tenantId: run.tenant_id,
          workflowId: run.workflow_id,
          workflowVersionId: run.workflow_version_id,
          workflowRunId: run.id,
          workflowRunStepId: step.id,
          actionType,
          payloadSnapshot,
          requesterType: 'automation',
          requesterId: run.id,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
          idempotencyKey: `approval:${step.id}`,
        });

        await this.db
          .updateTable('workflow_run_steps')
          .set({
            status: 'awaiting_approval',
            approval_id: approval.id,
            input_snapshot: payloadSnapshot,
            updated_at: new Date(),
          })
          .where('id', '=', step.id)
          .execute();
        await this.db
          .updateTable('workflow_runs')
          .set({ status: 'awaiting_approval', updated_at: new Date() })
          .where('id', '=', run.id)
          .execute();
        return;
      }

      if (step.step_type === 'action') {
        const actionType = String(node.config?.['action_type'] ?? '');
        const cls = getActionClass(actionType);
        if (cls === 'C') throw new Error(`CLASS_C_BLOCKED:${actionType}`);
        if (cls === 'B') throw new Error(`CLASS_B_REQUIRES_APPROVAL_STEP:${actionType}`);
        if (cls !== 'A') throw new Error(`UNKNOWN_ACTION:${actionType}`);

        const params = (node.config?.['params'] as Record<string, unknown>) ?? {};
        const result = await executeClassAAction(this.db, {
          tenantId: run.tenant_id,
          actionType,
          params,
          triggerPayload: run.trigger_payload,
          idempotencyKey: `action:${step.id}`,
        });
        await this.succeedStep(step, run.tenant_id, result);
        await incrementUsage(this.db, run.tenant_id, 'actions_class_a', `action:a:${step.id}`);
        await this.enqueueNext(run, graph, step.node_id, 'default');
        return;
      }

      throw new Error(`UNKNOWN_STEP_TYPE:${step.step_type}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = !message.startsWith('CLASS_C') && !message.startsWith('CLASS_B') && !message.startsWith('APPROVAL');
      if (retryable && step.attempt < MAX_ATTEMPTS) {
        const nextAttempt = step.attempt + 1;
        const backoff = Math.min(60_000, 1000 * 2 ** step.attempt) + Math.floor(Math.random() * 500);
        await this.db
          .updateTable('workflow_run_steps')
          .set({
            status: 'waiting',
            attempt: nextAttempt,
            scheduled_at: new Date(Date.now() + backoff),
            error: { message },
            updated_at: new Date(),
          })
          .where('id', '=', step.id)
          .execute();
        await this.db
          .insertInto('workflow_run_step_attempts')
          .values({
            tenant_id: run.tenant_id,
            workflow_run_step_id: step.id,
            attempt_number: step.attempt,
            status: 'failed',
            error: { message },
            finished_at: new Date(),
          })
          .onConflict((oc) =>
            oc.columns(['workflow_run_step_id', 'attempt_number']).doUpdateSet({
              status: 'failed',
              error: { message },
              finished_at: new Date(),
            }),
          )
          .execute();
        return;
      }
      await this.failStep(step, run.tenant_id, { message });
      await this.deadLetter(run, step, message);
      await this.failRun(run.id, run.tenant_id, { message });
    }
  }

  private async executeApprovedAction(
    run: { id: string; tenant_id: string; workflow_id: string; workflow_version_id: string },
    step: { id: string; node_id: string; tenant_id: string },
    approval: {
      id: string;
      action_type: string;
      requested_payload_snapshot: Record<string, unknown>;
      payload_hash: string;
    },
    graph: WorkflowGraph,
  ) {
    const snapshot = approval.requested_payload_snapshot;
    const hash = sha256Canonical(snapshot);
    if (hash !== approval.payload_hash) {
      await this.failStep(step, run.tenant_id, { code: 'PAYLOAD_HASH_MISMATCH' });
      await this.failRun(run.id, run.tenant_id, { code: 'PAYLOAD_HASH_MISMATCH' });
      return;
    }

    const result = await executeCriticalStub({
      tenantId: run.tenant_id,
      approvalId: approval.id,
      snapshot,
      payloadHash: hash,
    });

    await this.succeedStep(step, run.tenant_id, result);
    await incrementUsage(this.db, run.tenant_id, 'actions_class_b', `action:b:${step.id}`);

    try {
      await this.db
        .insertInto('security_audit_events')
        .values({
          tenant_id: run.tenant_id,
          actor_type: 'system',
          actor_id: 'executor',
          action: 'automation.action.class_b.executed',
          entity_type: 'workflow_run_step',
          entity_id: step.id,
          meta: {
            approval_id: approval.id,
            action_type: approval.action_type,
            payload_hash: hash,
            requested_payload_snapshot: snapshot,
            result,
          },
        })
        .execute();
    } catch {
      /* ignore */
    }

    await this.db
      .updateTable('workflow_runs')
      .set({ status: 'running', updated_at: new Date() })
      .where('id', '=', run.id)
      .execute();

    await this.enqueueNext(run, graph, step.node_id, 'default');
  }

  private async enqueueNext(
    run: { id: string; tenant_id: string; trigger_payload?: Record<string, unknown> },
    graph: WorkflowGraph,
    fromNodeId: string,
    when: string,
  ) {
    const edges = (graph.edges ?? []).filter((e) => e.from === fromNodeId);
    const matched = edges.filter((e) => !e.when || e.when === when || (when === 'default' && !e.when));
    const targets = matched.length ? matched : edges.filter((e) => !e.when);
    for (const edge of targets) {
      const node = graph.nodes.find((n) => n.id === edge.to);
      if (!node || node.type === 'trigger') continue;
      await this.db
        .insertInto('workflow_run_steps')
        .values({
          tenant_id: run.tenant_id,
          workflow_run_id: run.id,
          node_id: edge.to,
          step_type: node.type as 'condition' | 'branch' | 'delay' | 'approval' | 'action',
          status: 'ready',
          step_key: `${run.id}:${edge.to}:1`,
          input_snapshot: {},
        })
        .onConflict((oc) => oc.columns(['tenant_id', 'step_key']).doNothing())
        .execute();
    }
  }

  private async succeedStep(
    step: { id: string; tenant_id: string },
    tenantId: string,
    output: Record<string, unknown>,
  ) {
    await this.db
      .updateTable('workflow_run_steps')
      .set({
        status: 'succeeded',
        output_snapshot: output,
        finished_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', step.id)
      .execute();
    await incrementUsage(this.db, tenantId, 'steps_executed', `step:ok:${step.id}`);
    await this.auditStep(tenantId, step.id, 'automation.step.succeeded', { output });
  }

  private async failStep(
    step: { id: string; tenant_id?: string },
    tenantId: string,
    error: Record<string, unknown>,
  ) {
    await this.db
      .updateTable('workflow_run_steps')
      .set({
        status: 'failed',
        error,
        finished_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', step.id)
      .execute();
    await this.auditStep(tenantId, step.id, 'automation.step.failed', { error });
  }

  private async failRun(runId: string, tenantId: string, error: Record<string, unknown>) {
    await this.db
      .updateTable('workflow_runs')
      .set({ status: 'failed', error, finished_at: new Date(), updated_at: new Date() })
      .where('id', '=', runId)
      .where('tenant_id', '=', tenantId)
      .execute();
    await incrementUsage(this.db, tenantId, 'runs_failed', `run:fail:${runId}`);
    const recorder = new EventRecorder(this.db);
    await recorder.append({
      tenantId,
      eventType: 'automation.run.failed',
      aggregateType: 'workflow_run',
      aggregateId: runId,
      dedupeKey: `automation:run:failed:${runId}`,
      payload: { workflow_run_id: runId, error },
    });
  }

  private async completeRun(runId: string, tenantId: string) {
    await this.db
      .updateTable('workflow_runs')
      .set({ status: 'completed', finished_at: new Date(), updated_at: new Date() })
      .where('id', '=', runId)
      .where('tenant_id', '=', tenantId)
      .execute();
    await incrementUsage(this.db, tenantId, 'runs_completed', `run:ok:${runId}`);
  }

  private async deadLetter(
    run: { id: string; tenant_id: string },
    step: { id: string; attempt: number },
    message: string,
  ) {
    await this.db
      .insertInto('automation_dead_letters')
      .values({
        tenant_id: run.tenant_id,
        workflow_run_id: run.id,
        workflow_run_step_id: step.id,
        reason: message,
        last_error: { message },
        attempts: step.attempt,
      })
      .execute();
    await this.db
      .updateTable('workflow_runs')
      .set({ status: 'dead_lettered', updated_at: new Date() })
      .where('id', '=', run.id)
      .execute();
    try {
      await this.db
        .insertInto('security_audit_events')
        .values({
          tenant_id: run.tenant_id,
          actor_type: 'system',
          actor_id: 'executor',
          action: 'automation.dead_letter',
          entity_type: 'workflow_run',
          entity_id: run.id,
          meta: { step_id: step.id, message },
        })
        .execute();
    } catch {
      /* ignore */
    }
  }

  private async auditStep(tenantId: string, stepId: string, action: string, meta: Record<string, unknown>) {
    try {
      await this.db
        .insertInto('security_audit_events')
        .values({
          tenant_id: tenantId,
          actor_type: 'system',
          actor_id: 'executor',
          action,
          entity_type: 'workflow_run_step',
          entity_id: stepId,
          meta,
        })
        .execute();
    } catch {
      /* ignore */
    }
  }
}

export async function pauseRun(db: Kysely<Database>, tenantId: string, runId: string, reason: string, actorId: string) {
  await db
    .updateTable('workflow_runs')
    .set({ status: 'paused', pause_reason: reason, updated_at: new Date() })
    .where('id', '=', runId)
    .where('tenant_id', '=', tenantId)
    .where('status', 'in', ['queued', 'running', 'waiting', 'awaiting_approval'])
    .execute();
  await db
    .insertInto('security_audit_events')
    .values({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: actorId,
      action: 'automation.run.paused',
      entity_type: 'workflow_run',
      entity_id: runId,
      meta: { reason },
    })
    .execute()
    .catch(() => undefined);
}

export async function resumeRun(db: Kysely<Database>, tenantId: string, runId: string, actorId: string) {
  await db
    .updateTable('workflow_runs')
    .set({ status: 'running', pause_reason: null, updated_at: new Date() })
    .where('id', '=', runId)
    .where('tenant_id', '=', tenantId)
    .where('status', '=', 'paused')
    .execute();
  const recorder = new EventRecorder(db);
  await recorder.append({
    tenantId,
    eventType: 'automation.run.advance',
    aggregateType: 'workflow_run',
    aggregateId: runId,
    jobName: 'automation.run.advance',
    dedupeKey: `automation:advance:resume:${runId}:${randomUUID()}`,
    payload: { tenant_id: tenantId, workflow_run_id: runId },
  });
  await db
    .insertInto('security_audit_events')
    .values({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: actorId,
      action: 'automation.run.resumed',
      entity_type: 'workflow_run',
      entity_id: runId,
      meta: {},
    })
    .execute()
    .catch(() => undefined);
}

/** Replay is NOT approval — only re-queues advance. */
export async function replayRun(db: Kysely<Database>, tenantId: string, runId: string, actorId: string) {
  const run = await db
    .selectFrom('workflow_runs')
    .selectAll()
    .where('id', '=', runId)
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();
  if (!run) throw new Error('RUN_NOT_FOUND');

  if (['completed', 'cancelled'].includes(run.status)) {
    // Soft reopen only failed/dead_lettered/paused/awaiting
  }
  if (run.status === 'failed' || run.status === 'dead_lettered') {
    await db
      .updateTable('workflow_runs')
      .set({ status: 'running', error: null, updated_at: new Date() })
      .where('id', '=', runId)
      .execute();
  }

  const recorder = new EventRecorder(db);
  await recorder.append({
    tenantId,
    eventType: 'automation.run.advance',
    aggregateType: 'workflow_run',
    aggregateId: runId,
    jobName: 'automation.run.advance',
    dedupeKey: `automation:advance:replay:${runId}:${randomUUID()}`,
    payload: { tenant_id: tenantId, workflow_run_id: runId, replay: true },
  });

  await db
    .insertInto('security_audit_events')
    .values({
      tenant_id: tenantId,
      actor_type: 'user',
      actor_id: actorId,
      action: 'automation.run.replay',
      entity_type: 'workflow_run',
      entity_id: runId,
      meta: { note: 'replay_is_not_approval' },
    })
    .execute()
    .catch(() => undefined);
}
