import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import type { AppendOutboxInput } from './types';
import { canonicalizeEventType } from './aliases';

export type DbOrTx = Kysely<Database> | Transaction<Database>;

/**
 * Appends outbox rows on the SAME transaction/connection as business writes.
 * MUST NOT enqueue BullMQ / JobQueue.
 *
 * Dedupe uses ON CONFLICT so Postgres does not abort the surrounding transaction
 * (unlike try/catch around a unique violation).
 */
export class EventRecorder {
  constructor(private readonly db: DbOrTx) {}

  static forTransaction(trx: Transaction<Database>): EventRecorder {
    return new EventRecorder(trx);
  }

  async append(input: AppendOutboxInput): Promise<{ id: string; deduped: boolean }> {
    const id = randomUUID();
    const eventType = canonicalizeEventType(input.eventType);
    const now = new Date();
    const payloadJson = JSON.stringify(input.payload ?? {});

    const result = await sql<{ id: string }>`
      INSERT INTO outbox_events (
        id, tenant_id, event_type, aggregate_type, aggregate_id, payload,
        occurred_at, available_at, status, attempts, dedupe_key,
        correlation_id, causation_id, job_name
      ) VALUES (
        ${id}::uuid,
        ${input.tenantId}::uuid,
        ${eventType},
        ${input.aggregateType},
        ${input.aggregateId},
        ${payloadJson}::jsonb,
        ${input.occurredAt ?? now},
        ${input.availableAt ?? now},
        'pending',
        0,
        ${input.dedupeKey ?? null},
        ${input.correlationId ?? id},
        ${input.causationId ?? null},
        ${input.jobName ?? null}
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id
    `.execute(this.db);

    if (result.rows[0]?.id) {
      return { id: result.rows[0].id, deduped: false };
    }

    if (!input.dedupeKey) {
      throw new Error('outbox insert returned no row and no dedupe_key');
    }

    const existing = await this.db
      .selectFrom('outbox_events')
      .select(['id'])
      .where('dedupe_key', '=', input.dedupeKey)
      .executeTakeFirst();

    if (!existing) {
      throw new Error('outbox dedupe conflict but existing row not found');
    }
    return { id: existing.id, deduped: true };
  }
}
