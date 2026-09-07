/**
 * Canonical Deal domain events (Phase 3A.1).
 * Same-TX outbox only — never import BullMQ.
 *
 * Automation stays on crm.pipeline.* → automation.pipeline.evaluate (exactly once).
 * crm.deal.* uses job crm.deal.record (ack-only) so domain events are durable without
 * double-firing pipeline automation.
 */
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { queueWebhook } from '../queue-webhook';
import { logger } from '../logger';

export type DealDomainEvent =
  | 'crm.deal.created'
  | 'crm.deal.updated'
  | 'crm.deal.stage_changed'
  | 'crm.deal.won'
  | 'crm.deal.lost';

export async function appendDealDomainEvent(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    dealId: string;
    eventType: DealDomainEvent;
    transitionKey: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; deduped: boolean }> {
  const dedupeKey = [opts.workspaceId, opts.eventType, opts.dealId, opts.transitionKey].join(':');
  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId: opts.workspaceId,
    eventType: opts.eventType,
    aggregateType: 'deal',
    aggregateId: opts.dealId,
    jobName: 'crm.deal.record',
    dedupeKey,
    correlationId: opts.dealId,
    payload: {
      id: dedupeKey,
      type: opts.eventType,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: opts.workspaceId,
      actor: { type: 'system', id: 'crm.deals' },
      aggregate: { type: 'deal', id: opts.dealId },
      data: {
        deal_id: opts.dealId,
        workspace_id: opts.workspaceId,
        ...(opts.data ?? {}),
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: opts.dealId,
        idempotency_key: dedupeKey,
      },
    },
  });
  logger.info(
    {
      tenantId: opts.workspaceId,
      eventType: opts.eventType,
      dealId: opts.dealId,
      deduped: result.deduped,
    },
    'deal domain outbox appended',
  );
  return result;
}

/** Stage change: domain events + legacy webhooks. Caller still runs pipeline automation once. */
export async function onDealStageChanged(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    dealId: string;
    pipelineId: string;
    fromStageId: string;
    toStageId: string;
    isWon?: boolean;
    isLost?: boolean;
  },
): Promise<void> {
  const transitionKey = `${opts.fromStageId}->${opts.toStageId}`;
  await appendDealDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    dealId: opts.dealId,
    eventType: 'crm.deal.stage_changed',
    transitionKey,
    data: {
      pipeline_id: opts.pipelineId,
      from_stage_id: opts.fromStageId,
      to_stage_id: opts.toStageId,
    },
  });

  if (opts.isWon) {
    await appendDealDomainEvent(trx, {
      workspaceId: opts.workspaceId,
      dealId: opts.dealId,
      eventType: 'crm.deal.won',
      transitionKey: `won:${transitionKey}`,
      data: { pipeline_id: opts.pipelineId, stage_id: opts.toStageId },
    });
  }
  if (opts.isLost) {
    await appendDealDomainEvent(trx, {
      workspaceId: opts.workspaceId,
      dealId: opts.dealId,
      eventType: 'crm.deal.lost',
      transitionKey: `lost:${transitionKey}`,
      data: { pipeline_id: opts.pipelineId, stage_id: opts.toStageId },
    });
  }
}

export async function onDealCreated(
  trx: DbOrTx,
  opts: { workspaceId: string; dealId: string; pipelineId: string; stageId: string },
): Promise<void> {
  await appendDealDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    dealId: opts.dealId,
    eventType: 'crm.deal.created',
    transitionKey: opts.stageId,
    data: { pipeline_id: opts.pipelineId, stage_id: opts.stageId },
  });
}

export async function onDealUpdated(
  trx: DbOrTx,
  opts: { workspaceId: string; dealId: string; changeKey: string },
): Promise<void> {
  await appendDealDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    dealId: opts.dealId,
    eventType: 'crm.deal.updated',
    transitionKey: opts.changeKey,
  });
}

/** Compatibility: ensure deal.lost webhook fires (legacy only had won). */
export async function queueDealLostWebhook(
  trx: DbOrTx,
  opts: { workspaceId: string; dealId: string; pipelineId: string; stageId: string },
): Promise<void> {
  await queueWebhook(trx, opts.workspaceId, 'deal.lost', {
    deal_id: opts.dealId,
    pipeline_id: opts.pipelineId,
    stage_id: opts.stageId,
  });
}
