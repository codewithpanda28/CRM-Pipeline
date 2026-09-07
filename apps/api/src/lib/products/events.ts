/**
 * Product domain events — same-TX outbox; never BullMQ from domain.
 */
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { logger } from '../logger';

export type ProductDomainEvent =
  | 'crm.product.created'
  | 'crm.product.updated'
  | 'crm.product.deleted';

export async function appendProductDomainEvent(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    productId: string;
    eventType: ProductDomainEvent;
    transitionKey: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; deduped: boolean }> {
  const dedupeKey = [opts.workspaceId, opts.eventType, opts.productId, opts.transitionKey].join(':');
  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId: opts.workspaceId,
    eventType: opts.eventType,
    aggregateType: 'product',
    aggregateId: opts.productId,
    jobName: 'crm.product.record',
    dedupeKey,
    correlationId: opts.productId,
    payload: {
      id: dedupeKey,
      type: opts.eventType,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: opts.workspaceId,
      actor: { type: 'system', id: 'crm.products' },
      aggregate: { type: 'product', id: opts.productId },
      data: {
        product_id: opts.productId,
        workspace_id: opts.workspaceId,
        ...(opts.data ?? {}),
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: opts.productId,
        idempotency_key: dedupeKey,
      },
    },
  });
  logger.info(
    { tenantId: opts.workspaceId, eventType: opts.eventType, productId: opts.productId, deduped: result.deduped },
    'product domain outbox appended',
  );
  return result;
}

export async function onProductCreated(
  trx: DbOrTx,
  opts: { workspaceId: string; productId: string; sku: string },
): Promise<void> {
  await appendProductDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    productId: opts.productId,
    eventType: 'crm.product.created',
    transitionKey: opts.sku,
    data: { sku: opts.sku },
  });
}

export async function onProductUpdated(
  trx: DbOrTx,
  opts: { workspaceId: string; productId: string; changeKey: string },
): Promise<void> {
  await appendProductDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    productId: opts.productId,
    eventType: 'crm.product.updated',
    transitionKey: opts.changeKey,
  });
}

export async function onProductDeleted(
  trx: DbOrTx,
  opts: { workspaceId: string; productId: string },
): Promise<void> {
  await appendProductDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    productId: opts.productId,
    eventType: 'crm.product.deleted',
    transitionKey: 'soft',
  });
}
