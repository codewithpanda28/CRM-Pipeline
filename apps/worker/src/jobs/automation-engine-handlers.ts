import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import {
  TriggerMatcher,
  RunAdvanceExecutor,
  AutomationApprovalService,
} from '@vencore/automation-engine';
import type { JobHandler } from '@vencore/job-runtime';
import { logger } from '../lib/logger';

export function createAutomationEventDispatchHandler(db: Kysely<Database>): JobHandler {
  const matcher = new TriggerMatcher(db);
  return async (ctx) => {
    if (!ctx.tenantId) throw new Error('automation.event.dispatch missing tenantId');
    const data =
      ctx.payload['data'] && typeof ctx.payload['data'] === 'object'
        ? (ctx.payload['data'] as Record<string, unknown>)
        : ctx.payload;
    const result = await matcher.dispatch({
      tenantId: ctx.tenantId,
      payload: {
        ...data,
        tenant_id: ctx.tenantId,
        event_id: String(data['event_id'] ?? data['id'] ?? ctx.correlationId ?? ''),
        event_name: String(data['event_name'] ?? data['type'] ?? data['eventType'] ?? ''),
        idempotency_key: String(
          data['idempotency_key'] ??
            (data['metadata'] as { idempotency_key?: string } | undefined)?.idempotency_key ??
            ctx.idempotencyKey ??
            '',
        ),
      },
    });
    logger.info(
      { job: 'automation.event.dispatch', tenantId: ctx.tenantId, ...result },
      'automation.event.dispatch done',
    );
  };
}

export function createAutomationRunAdvanceHandler(db: Kysely<Database>): JobHandler {
  const executor = new RunAdvanceExecutor(db);
  return async (ctx) => {
    if (!ctx.tenantId) throw new Error('automation.run.advance missing tenantId');
    const data =
      ctx.payload['data'] && typeof ctx.payload['data'] === 'object'
        ? (ctx.payload['data'] as Record<string, unknown>)
        : ctx.payload;
    const runId = String(data['workflow_run_id'] ?? '');
    if (!runId) throw new Error('automation.run.advance missing workflow_run_id');
    // forged approved flag must be ignored by executor
    const result = await executor.advance({
      tenantId: ctx.tenantId,
      workflowRunId: runId,
      forgedApprovedFlag: data['approved'],
    });
    logger.info(
      { job: 'automation.run.advance', tenantId: ctx.tenantId, runId, ...result },
      'automation.run.advance done',
    );
  };
}

export function createAutomationApprovalTimeoutHandler(db: Kysely<Database>): JobHandler {
  const approvals = new AutomationApprovalService(db);
  return async () => {
    const n = await approvals.expireDue(100);
    logger.info({ job: 'automation.approval.timeout', expired: n }, 'approval timeout sweep');
  };
}

/** Minimal bridge: fan CRM/Finance ack payloads into v2 dispatch (flag-gated inside matcher). */
export async function bridgeDomainEventToAutomationDispatch(
  db: Kysely<Database>,
  tenantId: string | null | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!tenantId) return;
  const matcher = new TriggerMatcher(db);
  await matcher.dispatch({
    tenantId,
    payload: {
      ...payload,
      tenant_id: tenantId,
      event_name: String(payload['eventType'] ?? payload['event_name'] ?? payload['type'] ?? ''),
      event_id: String(payload['id'] ?? payload['event_id'] ?? ''),
      idempotency_key: String(
        payload['idempotency_key'] ??
          (payload['metadata'] as { idempotency_key?: string } | undefined)?.idempotency_key ??
          payload['id'] ??
          '',
      ),
    },
  });
}
