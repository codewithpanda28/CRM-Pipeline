/**
 * Canonical domain → outbox helpers (Phase 2B Task 6 — same-TX).
 * NEVER enqueue BullMQ from here — publisher owns JobQueue.
 *
 * Critical automation/webhook appends MUST run on the caller's Transaction.
 * Failures throw so the unit-of-work rolls back the business mutation.
 */
import type { Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import {
  EventRecorder,
  type DbOrTx,
  withUnitOfWork,
} from '@vencore/events';
import { resolveJobsRuntime } from '@vencore/job-runtime';
import type { PMEvent } from '@vencore/automation';
import { pmEvents } from './pm-events';
import { logger } from './logger';
import { queueWebhook } from './queue-webhook';

export type { DbOrTx };
export { withUnitOfWork };

export type PipelineAutomationEventType = 'stage_changed' | 'field_changed' | 'item_created';

export interface PipelineAutomationOutboxEvent {
  event_type: PipelineAutomationEventType;
  item_id: string;
  pipeline_id: string;
  workspace_id: string;
  payload: Record<string, unknown>;
  /** Stable fragment for dedupe (e.g. from→to stage). */
  transitionKey: string;
}

function jobsViaOutbox(): boolean {
  return resolveJobsRuntime(process.env['JOBS_RUNTIME']) === 'bullmq';
}

export async function enqueuePipelineAutomation(
  db: DbOrTx,
  event: PipelineAutomationOutboxEvent,
): Promise<{ id: string; deduped: boolean } | null> {
  if (!jobsViaOutbox()) return null;

  const tenantId = event.workspace_id;
  const dedupeKey = [
    tenantId,
    'pipeline',
    event.pipeline_id,
    event.item_id,
    event.event_type,
    event.transitionKey,
  ].join(':');

  const recorder = new EventRecorder(db);
  const result = await recorder.append({
    tenantId,
    eventType: `crm.pipeline.${event.event_type}`,
    aggregateType: 'pipeline_item',
    aggregateId: event.item_id,
    jobName: 'automation.pipeline.evaluate',
    dedupeKey,
    correlationId: event.item_id,
    payload: {
      id: dedupeKey,
      type: `crm.pipeline.${event.event_type}`,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      actor: { type: 'system', id: 'pipeline' },
      aggregate: { type: 'pipeline_item', id: event.item_id },
      data: {
        event_type: event.event_type,
        item_id: event.item_id,
        pipeline_id: event.pipeline_id,
        workspace_id: event.workspace_id,
        payload: event.payload,
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: event.item_id,
        idempotency_key: dedupeKey,
      },
    },
  });

  logger.info(
    {
      tenantId,
      job: 'automation.pipeline.evaluate',
      eventType: event.event_type,
      itemId: event.item_id,
      deduped: result.deduped,
    },
    'pipeline automation outbox appended',
  );
  return result;
}

/** Same-TX: automation outbox + deal webhooks for stage change. */
export async function onPipelineStageChanged(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    itemId: string;
    pipelineId: string;
    fromStageId: string;
    toStageId: string;
    isWon?: boolean;
  },
): Promise<void> {
  await enqueuePipelineAutomation(trx, {
    event_type: 'stage_changed',
    item_id: opts.itemId,
    pipeline_id: opts.pipelineId,
    workspace_id: opts.workspaceId,
    transitionKey: `${opts.fromStageId}->${opts.toStageId}`,
    payload: {
      from_stage_id: opts.fromStageId,
      to_stage_id: opts.toStageId,
    },
  });

  await queueWebhook(trx, opts.workspaceId, 'deal.stage_changed', {
    deal_id: opts.itemId,
    pipeline_id: opts.pipelineId,
    from_stage_id: opts.fromStageId,
    to_stage_id: opts.toStageId,
  });

  if (opts.isWon) {
    await queueWebhook(trx, opts.workspaceId, 'deal.won', {
      deal_id: opts.itemId,
      pipeline_id: opts.pipelineId,
      stage_id: opts.toStageId,
    });
  }
}

export async function onPipelineItemCreated(
  trx: DbOrTx,
  opts: { workspaceId: string; itemId: string; pipelineId: string; stageId: string },
): Promise<void> {
  await enqueuePipelineAutomation(trx, {
    event_type: 'item_created',
    item_id: opts.itemId,
    pipeline_id: opts.pipelineId,
    workspace_id: opts.workspaceId,
    transitionKey: opts.stageId,
    payload: { stage_id: opts.stageId },
  });

  await queueWebhook(trx, opts.workspaceId, 'deal.created', {
    deal_id: opts.itemId,
    pipeline_id: opts.pipelineId,
    stage_id: opts.stageId,
  });
}

export async function onPipelineFieldChanged(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    itemId: string;
    pipelineId: string;
    fieldKey: string;
  },
): Promise<void> {
  await enqueuePipelineAutomation(trx, {
    event_type: 'field_changed',
    item_id: opts.itemId,
    pipeline_id: opts.pipelineId,
    workspace_id: opts.workspaceId,
    transitionKey: opts.fieldKey,
    payload: { field_key: opts.fieldKey },
  });
}

function pmAggregateId(event: PMEvent): string {
  switch (event.type) {
    case 'task_status_changed':
    case 'task_overdue':
    case 'task_assigned':
      return event.taskId;
    case 'milestone_completed':
      return event.milestoneId;
    case 'client_approved':
    case 'client_rejected':
      return event.approvalId;
    case 'sprint_started':
    case 'sprint_ended':
      return event.sprintId;
  }
}

function pmTransitionKey(event: PMEvent): string {
  if (event.type === 'task_status_changed') return event.to_status_id;
  if (event.type === 'task_assigned') return event.userId;
  return event.type;
}

/** Append PM automation outbox on the given trx (throws on failure → rollback). */
export async function appendPmAutomationOutbox(
  trx: DbOrTx,
  workspaceId: string,
  event: PMEvent,
): Promise<{ id: string; deduped: boolean } | null> {
  if (!jobsViaOutbox()) return null;

  const tenantId = workspaceId;
  const aggregateId = pmAggregateId(event);
  const transitionKey = pmTransitionKey(event);
  const dedupeKey = [tenantId, 'pm', event.projectId, event.type, aggregateId, transitionKey].join(
    ':',
  );

  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId,
    eventType: `pm.${event.type}`,
    aggregateType: 'project',
    aggregateId: event.projectId,
    jobName: 'automation.pm.evaluate',
    dedupeKey,
    correlationId: aggregateId,
    payload: {
      id: dedupeKey,
      type: `pm.${event.type}`,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: tenantId,
      actor: { type: 'system', id: 'pm' },
      aggregate: { type: 'project', id: event.projectId },
      data: {
        event,
        workspace_id: workspaceId,
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: aggregateId,
        idempotency_key: dedupeKey,
      },
    },
  });

  logger.info(
    {
      tenantId,
      job: 'automation.pm.evaluate',
      eventType: event.type,
      projectId: event.projectId,
      deduped: result.deduped,
    },
    'pm automation outbox appended',
  );
  return result;
}

/**
 * Prefer calling `appendPmAutomationOutbox(trx, …)` inside `withUnitOfWork`.
 * This helper appends on the given connection and notifies in-process listeners after append
 * (legacy path). Under bullmq, listeners are disabled — outbox is the automation path.
 */
export async function emitPmDomainEvent(
  db: DbOrTx,
  workspaceId: string,
  event: PMEvent,
): Promise<void> {
  await appendPmAutomationOutbox(db, workspaceId, event);
  pmEvents.emit('pm', event);
}

/** Convenience: open UoW, run mutate+append callback, then notify PM listeners after commit. */
export async function withPmAutomationEvent<T>(
  db: import('kysely').Kysely<Database>,
  workspaceId: string,
  event: PMEvent,
  mutate: (trx: Transaction<Database>) => Promise<T>,
): Promise<T> {
  const result = await withUnitOfWork(db, async (trx) => {
    const value = await mutate(trx);
    await appendPmAutomationOutbox(trx, workspaceId, event);
    return value;
  });
  pmEvents.emit('pm', event);
  return result;
}
