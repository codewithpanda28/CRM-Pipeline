/** EventEnvelope v1 — stored in outbox_events.payload (ADR-019 / EVENTS.md). */
export interface EventActor {
  type: 'user' | 'api_key' | 'system' | 'automation' | 'platform_user';
  id: string;
}

export interface EventEnvelopeV1 {
  id: string;
  type: string;
  spec_version: '1';
  occurred_at: string;
  tenant_id: string | null;
  actor: EventActor;
  aggregate: { type: string; id: string };
  data: Record<string, unknown>;
  metadata: {
    correlation_id: string;
    causation_id?: string;
    idempotency_key?: string;
    schema_hash?: string;
  };
}

export interface AppendOutboxInput {
  tenantId: string | null;
  eventType: string;
  aggregateType: string | null;
  aggregateId: string | null;
  /** Full envelope or opaque data; recorder wraps if needed. */
  payload: Record<string, unknown>;
  occurredAt?: Date;
  availableAt?: Date;
  dedupeKey?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  jobName?: string | null;
}

export type OutboxStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'dead';
