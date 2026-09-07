/**
 * Real Postgres helpers for transactional outbox atomicity (Phase 2B Task 6).
 * Do NOT mock away PostgreSQL transaction behavior.
 */
import { randomUUID } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder } from './recorder';
import { withUnitOfWork } from './uow';
import { MemoryJobQueue } from '@vencore/job-runtime';
import { OutboxPublisher } from './publisher';

/** Cause a statement failure inside the open transaction (simulates outbox write failure). */
export async function forceOutboxInsertFailure(
  trx: Transaction<Database>,
  reason = 'forced_outbox_failure',
): Promise<never> {
  await sql`SELECT 1 / 0`.execute(trx);
  throw new Error(reason);
}

export async function commitBusinessAndOutbox(
  db: Kysely<Database>,
  opts: {
    tenantId: string;
    marker: string;
    mutate: (trx: Transaction<Database>) => Promise<void>;
    eventType?: string;
    jobName?: string;
  },
): Promise<{ outboxId: string }> {
  return withUnitOfWork(db, async (trx, recorder) => {
    await opts.mutate(trx);
    const r = await recorder.append({
      tenantId: opts.tenantId,
      eventType: opts.eventType ?? 'crm.pipeline.stage_changed',
      aggregateType: 'pipeline_item',
      aggregateId: randomUUID(),
      jobName: opts.jobName ?? 'automation.pipeline.evaluate',
      dedupeKey: opts.marker,
      payload: { marker: opts.marker },
    });
    return { outboxId: r.id };
  });
}

export async function publishCommittedOutbox(
  db: Kysely<Database>,
  queue: MemoryJobQueue,
): Promise<{ published: number; claimed: number; failed: number }> {
  const publisher = new OutboxPublisher({ db, jobQueue: queue });
  return publisher.tick();
}

export { EventRecorder, withUnitOfWork, MemoryJobQueue, OutboxPublisher };
