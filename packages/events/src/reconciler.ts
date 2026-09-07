import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { BullMqJobQueue } from '@vencore/job-runtime';
import { outboxMetrics } from './metrics';

export interface OutboxReconcileReport {
  pending: number;
  publishing: number;
  dead: number;
  oldestPendingAgeSec: number | null;
  stuckPublishing: number;
  publishedMissingHandle: number;
  queueDepth?: {
    waiting: number;
    active: number;
    failed: number;
  };
  at: string;
}

/**
 * Minimal reconciler — metrics/logs for future Pulse. Does not overbuild Ops Center.
 */
export class OutboxReconciler {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly jobQueue?: BullMqJobQueue,
  ) {}

  async reclaimStuckLeases(): Promise<number> {
    const result = await sql`
      UPDATE outbox_events
      SET status = 'pending', locked_by = NULL, locked_until = NULL,
          last_error = COALESCE(last_error, 'reconciler_lease_reclaim')
      WHERE status = 'publishing'
        AND (locked_until IS NULL OR locked_until < NOW())
      RETURNING id
    `.execute(this.db);
    return result.rows.length;
  }

  async collect(): Promise<OutboxReconcileReport> {
    const counts = await sql<{ status: string; n: string }>`
      SELECT status, COUNT(*)::text AS n
      FROM outbox_events
      GROUP BY status
    `.execute(this.db);

    const byStatus = Object.fromEntries(counts.rows.map((r) => [r.status, Number(r.n)]));
    const pending = byStatus['pending'] ?? 0;
    const publishing = byStatus['publishing'] ?? 0;
    const dead = byStatus['dead'] ?? 0;

    const oldest = await sql<{ age_sec: string | null }>`
      SELECT EXTRACT(EPOCH FROM (NOW() - MIN(available_at)))::text AS age_sec
      FROM outbox_events
      WHERE status = 'pending'
    `.execute(this.db);

    const stuck = await sql<{ n: string }>`
      SELECT COUNT(*)::text AS n FROM outbox_events
      WHERE status = 'publishing'
        AND (locked_until IS NULL OR locked_until < NOW() - INTERVAL '1 minute')
    `.execute(this.db);

    const missingHandle = await sql<{ n: string }>`
      SELECT COUNT(*)::text AS n FROM outbox_events
      WHERE status = 'published' AND (job_handle IS NULL OR job_handle = '')
    `.execute(this.db);

    const oldestPendingAgeSec = oldest.rows[0]?.age_sec
      ? Math.floor(Number(oldest.rows[0].age_sec))
      : null;

    outboxMetrics.pending = pending;
    outboxMetrics.publishing = publishing;
    outboxMetrics.dead = dead;
    outboxMetrics.oldestPendingAgeSec = oldestPendingAgeSec;

    let queueDepth: OutboxReconcileReport['queueDepth'];
    if (this.jobQueue) {
      try {
        const c = await this.jobQueue.getQueueCounts('webhooks');
        queueDepth = { waiting: c.waiting, active: c.active, failed: c.failed };
      } catch {
        queueDepth = undefined;
      }
    }

    return {
      pending,
      publishing,
      dead,
      oldestPendingAgeSec,
      stuckPublishing: Number(stuck.rows[0]?.n ?? 0),
      publishedMissingHandle: Number(missingHandle.rows[0]?.n ?? 0),
      queueDepth,
      at: new Date().toISOString(),
    };
  }
}
