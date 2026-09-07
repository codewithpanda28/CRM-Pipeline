/**
 * Quote domain events — same-TX outbox; never BullMQ from domain.
 * Does not emit pipeline automation.
 */
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { logger } from '../logger';

export type QuoteDomainEvent =
  | 'crm.quote.created'
  | 'crm.quote.updated'
  | 'crm.quote.sent'
  | 'crm.quote.accepted'
  | 'crm.quote.rejected'
  | 'crm.quote.cancelled'
  | 'crm.quote.expired';

export async function appendQuoteDomainEvent(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    quoteId: string;
    eventType: QuoteDomainEvent;
    transitionKey: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; deduped: boolean }> {
  const dedupeKey = [opts.workspaceId, opts.eventType, opts.quoteId, opts.transitionKey].join(':');
  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId: opts.workspaceId,
    eventType: opts.eventType,
    aggregateType: 'quote',
    aggregateId: opts.quoteId,
    jobName: 'crm.quote.record',
    dedupeKey,
    correlationId: opts.quoteId,
    payload: {
      id: dedupeKey,
      type: opts.eventType,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: opts.workspaceId,
      actor: { type: 'system', id: 'crm.quotes' },
      aggregate: { type: 'quote', id: opts.quoteId },
      data: {
        quote_id: opts.quoteId,
        workspace_id: opts.workspaceId,
        ...(opts.data ?? {}),
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: opts.quoteId,
        idempotency_key: dedupeKey,
      },
    },
  });
  logger.info(
    { tenantId: opts.workspaceId, eventType: opts.eventType, quoteId: opts.quoteId, deduped: result.deduped },
    'quote domain outbox appended',
  );
  return result;
}

export async function onQuoteCreated(
  trx: DbOrTx,
  opts: { workspaceId: string; quoteId: string; quoteNumber: string; version: number },
): Promise<void> {
  await appendQuoteDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    quoteId: opts.quoteId,
    eventType: 'crm.quote.created',
    transitionKey: `${opts.quoteNumber}:v${opts.version}`,
    data: { quote_number: opts.quoteNumber, version: opts.version },
  });
}

export async function onQuoteUpdated(
  trx: DbOrTx,
  opts: { workspaceId: string; quoteId: string; changeKey: string },
): Promise<void> {
  await appendQuoteDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    quoteId: opts.quoteId,
    eventType: 'crm.quote.updated',
    transitionKey: opts.changeKey,
  });
}

export async function onQuoteLifecycle(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    quoteId: string;
    eventType: Exclude<QuoteDomainEvent, 'crm.quote.created' | 'crm.quote.updated'>;
    fromStatus: string;
    toStatus: string;
  },
): Promise<void> {
  await appendQuoteDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    quoteId: opts.quoteId,
    eventType: opts.eventType,
    transitionKey: `${opts.fromStatus}->${opts.toStatus}`,
    data: { from_status: opts.fromStatus, to_status: opts.toStatus },
  });
}
