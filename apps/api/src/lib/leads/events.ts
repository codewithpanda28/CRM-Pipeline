/**
 * Canonical Lead domain events (Phase 3A.2).
 * Same-TX outbox only — never import BullMQ.
 * Job crm.lead.record is ack-only (no pipeline automation fan-out).
 */
import { EventRecorder, type DbOrTx } from '@vencore/events';
import { logger } from '../logger';

export type LeadDomainEvent =
  | 'crm.lead.created'
  | 'crm.lead.updated'
  | 'crm.lead.status_changed'
  | 'crm.lead.converted'
  | 'crm.lead.lost';

export async function appendLeadDomainEvent(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    leadId: string;
    eventType: LeadDomainEvent;
    transitionKey: string;
    data?: Record<string, unknown>;
  },
): Promise<{ id: string; deduped: boolean }> {
  const dedupeKey = [opts.workspaceId, opts.eventType, opts.leadId, opts.transitionKey].join(':');
  const recorder = new EventRecorder(trx);
  const result = await recorder.append({
    tenantId: opts.workspaceId,
    eventType: opts.eventType,
    aggregateType: 'lead',
    aggregateId: opts.leadId,
    jobName: 'crm.lead.record',
    dedupeKey,
    correlationId: opts.leadId,
    payload: {
      id: dedupeKey,
      type: opts.eventType,
      spec_version: '1',
      occurred_at: new Date().toISOString(),
      tenant_id: opts.workspaceId,
      actor: { type: 'system', id: 'crm.leads' },
      aggregate: { type: 'lead', id: opts.leadId },
      data: {
        lead_id: opts.leadId,
        workspace_id: opts.workspaceId,
        ...(opts.data ?? {}),
        idempotency_key: dedupeKey,
      },
      metadata: {
        correlation_id: opts.leadId,
        idempotency_key: dedupeKey,
      },
    },
  });
  logger.info(
    {
      tenantId: opts.workspaceId,
      eventType: opts.eventType,
      leadId: opts.leadId,
      deduped: result.deduped,
    },
    'lead domain outbox appended',
  );
  return result;
}

export async function onLeadCreated(
  trx: DbOrTx,
  opts: { workspaceId: string; leadId: string; status: string },
): Promise<void> {
  await appendLeadDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    eventType: 'crm.lead.created',
    transitionKey: opts.status,
    data: { status: opts.status },
  });
}

export async function onLeadUpdated(
  trx: DbOrTx,
  opts: { workspaceId: string; leadId: string; changeKey: string },
): Promise<void> {
  await appendLeadDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    eventType: 'crm.lead.updated',
    transitionKey: opts.changeKey,
  });
}

export async function onLeadStatusChanged(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    leadId: string;
    fromStatus: string;
    toStatus: string;
  },
): Promise<void> {
  await appendLeadDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    eventType: 'crm.lead.status_changed',
    transitionKey: `${opts.fromStatus}->${opts.toStatus}`,
    data: { from_status: opts.fromStatus, to_status: opts.toStatus },
  });
  if (opts.toStatus === 'lost' || opts.toStatus === 'unqualified') {
    await appendLeadDomainEvent(trx, {
      workspaceId: opts.workspaceId,
      leadId: opts.leadId,
      eventType: 'crm.lead.lost',
      transitionKey: `${opts.toStatus}:${opts.fromStatus}`,
      data: { status: opts.toStatus },
    });
  }
}

export async function onLeadConverted(
  trx: DbOrTx,
  opts: {
    workspaceId: string;
    leadId: string;
    contactId: string;
    companyId: string | null;
    dealId: string | null;
  },
): Promise<void> {
  await appendLeadDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    eventType: 'crm.lead.converted',
    transitionKey: `convert:${opts.contactId}`,
    data: {
      contact_id: opts.contactId,
      company_id: opts.companyId,
      deal_id: opts.dealId,
    },
  });
  await appendLeadDomainEvent(trx, {
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    eventType: 'crm.lead.status_changed',
    transitionKey: `->converted:${opts.contactId}`,
    data: { to_status: 'converted' },
  });
}
