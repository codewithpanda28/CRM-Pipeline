import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { JobQueue, QueueName } from '@vencore/job-runtime';
import { outboxMetrics } from './metrics';

const DEFAULT_BATCH = 20;
const DEFAULT_LEASE_MS = 30_000;
const MAX_PUBLISH_ATTEMPTS = 8;

export interface OutboxPublisherOptions {
  db: Kysely<Database>;
  jobQueue: JobQueue;
  publisherId?: string;
  batchSize?: number;
  leaseMs?: number;
  /** Cap per tenant per tick for fairness. */
  perTenantCap?: number;
  logger?: {
    info: (obj: object, msg?: string) => void;
    warn: (obj: object, msg?: string) => void;
    error: (obj: object, msg?: string) => void;
  };
}

function mapJobToQueue(jobName: string | null): QueueName {
  if (!jobName) return 'integrations';
  if (jobName.startsWith('webhook.')) return 'webhooks';
  if (jobName.startsWith('automation.')) return 'automation';
  if (jobName.startsWith('notification.')) return 'notifications';
  if (jobName.startsWith('document.')) return 'documents';
  if (jobName.startsWith('ai.')) return 'ai';
  return 'integrations';
}

function publishBackoffMs(attempts: number): number {
  const base = 2_000 * Math.pow(2, Math.max(0, attempts - 1));
  const capped = Math.min(base, 15 * 60_000);
  return Math.floor(capped + capped * 0.2 * Math.random());
}

/**
 * Claims pending outbox rows with FOR UPDATE SKIP LOCKED, enqueues via JobQueue,
 * marks published. Safe under multiple publisher instances — no global lock.
 */
export class OutboxPublisher {
  private readonly publisherId: string;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly perTenantCap: number;
  private readonly log: NonNullable<OutboxPublisherOptions['logger']>;

  constructor(private readonly opts: OutboxPublisherOptions) {
    this.publisherId = opts.publisherId ?? `pub-${randomUUID().slice(0, 8)}`;
    this.batchSize = opts.batchSize ?? DEFAULT_BATCH;
    this.leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
    this.perTenantCap = opts.perTenantCap ?? 10;
    this.log = opts.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
  }

  /** Reclaim expired publishing leases → pending. Concurrent-safe. */
  async reclaimExpiredLeases(): Promise<number> {
    const result = await sql`
      UPDATE outbox_events
      SET status = 'pending',
          locked_by = NULL,
          locked_until = NULL,
          last_error = COALESCE(last_error, 'lease_expired')
      WHERE status = 'publishing'
        AND locked_until IS NOT NULL
        AND locked_until < NOW()
      RETURNING id
    `.execute(this.opts.db);
    const n = result.rows.length;
    if (n > 0) {
      outboxMetrics.leaseReclaims += n;
      this.log.warn({ count: n, publisherId: this.publisherId }, 'outbox leases reclaimed');
    }
    return n;
  }

  async tick(): Promise<{ claimed: number; published: number; failed: number }> {
    await this.reclaimExpiredLeases();

    const leaseUntil = new Date(Date.now() + this.leaseMs);
    const claimed = await sql<{
      id: string;
      tenant_id: string | null;
      event_type: string;
      payload: Record<string, unknown>;
      job_name: string | null;
      dedupe_key: string | null;
      correlation_id: string | null;
      causation_id: string | null;
      attempts: number;
      aggregate_type: string | null;
      aggregate_id: string | null;
    }>`
      UPDATE outbox_events AS o
      SET status = 'publishing',
          locked_by = ${this.publisherId},
          locked_until = ${leaseUntil.toISOString()}::timestamptz,
          attempts = o.attempts + 1
      FROM (
        SELECT id
        FROM outbox_events
        WHERE status = 'pending'
          AND available_at <= NOW()
        ORDER BY available_at ASC, id ASC
        LIMIT ${sql.lit(this.batchSize)}
        FOR UPDATE SKIP LOCKED
      ) AS picked
      WHERE o.id = picked.id
      RETURNING o.id, o.tenant_id, o.event_type, o.payload, o.job_name, o.dedupe_key,
                o.correlation_id, o.causation_id, o.attempts, o.aggregate_type, o.aggregate_id
    `.execute(this.opts.db);

    let published = 0;
    let failed = 0;
    const perTenant = new Map<string, number>();

    for (const row of claimed.rows) {
      const tid = row.tenant_id ?? '__platform__';
      const used = perTenant.get(tid) ?? 0;
      if (used >= this.perTenantCap) {
        // Release back to pending for next tick (fairness)
        await this.opts.db
          .updateTable('outbox_events')
          .set({
            status: 'pending',
            locked_by: null,
            locked_until: null,
            attempts: row.attempts - 1,
          })
          .where('id', '=', row.id)
          .where('locked_by', '=', this.publisherId)
          .execute();
        continue;
      }
      perTenant.set(tid, used + 1);

      try {
        const jobName = row.job_name ?? 'integrations.dispatch';
        const queue = mapJobToQueue(jobName);
        const idempotencyKey =
          row.dedupe_key ?? `outbox:${row.id}`;
        const payload =
          typeof row.payload === 'object' && row.payload !== null
            ? (row.payload as Record<string, unknown>)
            : { raw: row.payload };

        const handle = await this.opts.jobQueue.enqueue({
          name: jobName,
          tenantId: row.tenant_id,
          scope: row.tenant_id ? 'tenant' : 'platform',
          queue,
          payload: {
            ...payload,
            outboxEventId: row.id,
            eventType: row.event_type,
          },
          idempotencyKey,
          priority: 'normal',
          trace: {
            correlationId: row.correlation_id ?? row.id,
            causationId: row.causation_id ?? undefined,
          },
        });

        await this.opts.db
          .updateTable('outbox_events')
          .set({
            status: 'published',
            published_at: new Date(),
            job_handle: handle.externalId,
            locked_by: null,
            locked_until: null,
            last_error: null,
          })
          .where('id', '=', row.id)
          .where('locked_by', '=', this.publisherId)
          .execute();

        published += 1;
        outboxMetrics.published += 1;
      } catch (err) {
        failed += 1;
        outboxMetrics.publishFailures += 1;
        const msg = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
        const attempts = row.attempts;
        if (attempts >= MAX_PUBLISH_ATTEMPTS) {
          await this.opts.db
            .updateTable('outbox_events')
            .set({
              status: 'dead',
              last_error: msg,
              locked_by: null,
              locked_until: null,
            })
            .where('id', '=', row.id)
            .execute();
          outboxMetrics.dead += 1;
          this.log.error(
            { outboxId: row.id, attempts, err: msg, publisherId: this.publisherId },
            'outbox event moved to dead',
          );
        } else {
          const delay = publishBackoffMs(attempts);
          await this.opts.db
            .updateTable('outbox_events')
            .set({
              status: 'pending',
              available_at: new Date(Date.now() + delay),
              last_error: msg,
              locked_by: null,
              locked_until: null,
            })
            .where('id', '=', row.id)
            .execute();
          outboxMetrics.retries += 1;
          this.log.warn(
            { outboxId: row.id, attempts, delayMs: delay, err: msg },
            'outbox publish failed — will retry',
          );
        }
      }
    }

    return { claimed: claimed.rows.length, published, failed };
  }
}
