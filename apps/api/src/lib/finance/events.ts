/**
 * Finance domain events — same-TX outbox; never BullMQ from domain.
 */
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { logger } from '../logger';

export type FinanceDomainEvent =
  | 'finance.invoice.created'
  | 'finance.invoice.issued'
  | 'finance.invoice.partially_paid'
  | 'finance.invoice.paid'
  | 'finance.invoice.overdue'
  | 'finance.invoice.voided'
  | 'finance.invoice.cancelled'
  | 'finance.payment.received'
  | 'finance.payment.refunded'
  | 'finance.expense.created'
  | 'finance.credit_note.created'
  | 'finance.debit_note.created';

export async function appendFinanceDomainEvent(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    aggregateType: string;
    aggregateId: string;
    eventType: FinanceDomainEvent;
    transitionKey: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; deduped: boolean }> {
  const dedupeKey = [opts.workspaceId, opts.eventType, opts.aggregateId, opts.transitionKey].join(':');
  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId: opts.workspaceId,
    eventType: opts.eventType,
    aggregateType: opts.aggregateType,
    aggregateId: opts.aggregateId,
    jobName: 'finance.record',
    dedupeKey,
    correlationId: opts.aggregateId,
    payload: {
      id: dedupeKey,
      type: opts.eventType,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: opts.workspaceId,
      actor: { type: 'system', id: 'finance' },
      aggregate: { type: opts.aggregateType, id: opts.aggregateId },
      data: {
        workspace_id: opts.workspaceId,
        ...(opts.data ?? {}),
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: opts.aggregateId,
        idempotency_key: dedupeKey,
      },
    },
  });
  logger.info(
    {
      tenantId: opts.workspaceId,
      eventType: opts.eventType,
      aggregateId: opts.aggregateId,
      deduped: result.deduped,
    },
    'finance domain outbox appended',
  );
  return result;
}
