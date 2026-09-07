/**
 * CustomerParty domain events (Phase 3A.3 Step 1).
 * Same-TX outbox only — never import BullMQ.
 * Job crm.customer_party.record is ack-only.
 */
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { logger } from '../logger';

export type CustomerPartyDomainEvent =
  | 'crm.customer_party.created'
  | 'crm.customer_party.updated'
  | 'crm.customer_party.linked'
  | 'crm.customer_party.merged';

export async function appendCustomerPartyDomainEvent(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    partyId: string;
    eventType: CustomerPartyDomainEvent;
    transitionKey: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; deduped: boolean }> {
  const dedupeKey = [opts.workspaceId, opts.eventType, opts.partyId, opts.transitionKey].join(':');
  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId: opts.workspaceId,
    eventType: opts.eventType,
    aggregateType: 'customer_party',
    aggregateId: opts.partyId,
    jobName: 'crm.customer_party.record',
    dedupeKey,
    correlationId: opts.partyId,
    payload: {
      id: dedupeKey,
      type: opts.eventType,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: opts.workspaceId,
      actor: { type: 'system', id: 'crm.customer_parties' },
      aggregate: { type: 'customer_party', id: opts.partyId },
      data: {
        customer_party_id: opts.partyId,
        workspace_id: opts.workspaceId,
        ...(opts.data ?? {}),
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: opts.partyId,
        idempotency_key: dedupeKey,
      },
    },
  });
  logger.info(
    {
      tenantId: opts.workspaceId,
      eventType: opts.eventType,
      partyId: opts.partyId,
      deduped: result.deduped,
    },
    'customer_party domain outbox appended',
  );
  return result;
}

export async function onCustomerPartyCreated(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    partyId: string;
    partyType: string;
    identityId: string;
  },
): Promise<void> {
  await appendCustomerPartyDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    partyId: opts.partyId,
    eventType: 'crm.customer_party.created',
    transitionKey: `${opts.partyType}:${opts.identityId}`,
    data: {
      party_type: opts.partyType,
      party_id: opts.identityId,
    },
  });
}

export async function onCustomerPartyUpdated(
  trx: DbOrTx,
  opts: { workspaceId: string; partyId: string; changeKey: string },
): Promise<void> {
  await appendCustomerPartyDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    partyId: opts.partyId,
    eventType: 'crm.customer_party.updated',
    transitionKey: opts.changeKey,
  });
}

/** Prepared for Step 2+ Deal/Lead link hooks — not called in Step 1. */
export async function onCustomerPartyLinked(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    partyId: string;
    linkType: string;
    linkId: string;
  },
): Promise<void> {
  await appendCustomerPartyDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    partyId: opts.partyId,
    eventType: 'crm.customer_party.linked',
    transitionKey: `${opts.linkType}:${opts.linkId}`,
    data: {
      link_type: opts.linkType,
      link_id: opts.linkId,
    },
  });
}

/** Prepared for admin merge MVP — not called in Step 1. */
export async function onCustomerPartyMerged(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    fromPartyId: string;
    intoPartyId: string;
    reason: string;
  },
): Promise<void> {
  await appendCustomerPartyDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    partyId: opts.intoPartyId,
    eventType: 'crm.customer_party.merged',
    transitionKey: `${opts.fromPartyId}->${opts.intoPartyId}`,
    data: {
      from_party_id: opts.fromPartyId,
      into_party_id: opts.intoPartyId,
      reason: opts.reason,
    },
  });
}
