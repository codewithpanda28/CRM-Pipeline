/**
 * Canonical Automation EventEnvelope (Architecture Contract §3).
 * Voice/WhatsApp appear only as source.system seams — no runtime adapters in R1.
 */
export type EnvelopeActorType =
  | 'user'
  | 'api_key'
  | 'system'
  | 'automation'
  | 'platform_user'
  | 'voice'
  | 'whatsapp';

export type EnvelopeSourceSystem =
  | 'crm'
  | 'finance'
  | 'accounting'
  | 'documents'
  | 'notifications'
  | 'voice'
  | 'whatsapp'
  | 'webhook'
  | 'schedule'
  | 'manual'
  | 'automation';

export interface AutomationEventEnvelope {
  event_id: string;
  tenant_id: string;
  event_name: string;
  occurred_at: string;
  actor: { type: EnvelopeActorType; id: string };
  source: { system: EnvelopeSourceSystem; component?: string };
  payload: Record<string, unknown>;
  correlation_id: string;
  causation_id?: string;
  idempotency_key: string;
}

export function normalizeEnvelope(raw: Record<string, unknown>, tenantId: string): AutomationEventEnvelope {
  const meta = (raw['metadata'] as Record<string, unknown> | undefined) ?? {};
  const actor = (raw['actor'] as Record<string, unknown> | undefined) ?? {};
  const source = (raw['source'] as Record<string, unknown> | undefined) ?? {};
  const eventId = String(raw['event_id'] ?? raw['id'] ?? '');
  const eventName = String(raw['event_name'] ?? raw['type'] ?? raw['eventType'] ?? '');
  const tid = String(raw['tenant_id'] ?? tenantId);
  const idem =
    String(raw['idempotency_key'] ?? meta['idempotency_key'] ?? eventId) || eventId;

  return {
    event_id: eventId,
    tenant_id: tid,
    event_name: eventName,
    occurred_at: String(raw['occurred_at'] ?? new Date().toISOString()),
    actor: {
      type: (actor['type'] as EnvelopeActorType) || 'system',
      id: String(actor['id'] ?? 'system'),
    },
    source: {
      system: (source['system'] as EnvelopeSourceSystem) || 'automation',
      component: source['component'] ? String(source['component']) : undefined,
    },
    payload:
      (raw['payload'] as Record<string, unknown>) ??
      (raw['data'] as Record<string, unknown>) ??
      {},
    correlation_id: String(raw['correlation_id'] ?? meta['correlation_id'] ?? eventId),
    causation_id: raw['causation_id']
      ? String(raw['causation_id'])
      : meta['causation_id']
        ? String(meta['causation_id'])
        : undefined,
    idempotency_key: idem,
  };
}
