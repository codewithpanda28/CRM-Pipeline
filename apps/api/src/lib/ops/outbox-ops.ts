/**
 * Failed outbox visibility + safe replay (set status back to pending).
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export async function listFailedOutbox(
  db: Kysely<Database>,
  opts: {
    tenantId?: string | null;
    limit?: number;
    statuses?: Array<'failed' | 'dead'>;
  } = {},
) {
  const limit = opts.limit ?? 50;
  const statuses = opts.statuses ?? (['failed', 'dead'] as const);
  let q = db
    .selectFrom('outbox_events')
    .selectAll()
    .where('status', 'in', [...statuses])
    .orderBy('occurred_at', 'desc')
    .limit(limit);

  if (opts.tenantId) {
    q = q.where('tenant_id', '=', opts.tenantId);
  }

  return q.execute();
}

/**
 * Replay failed/dead outbox rows by resetting to pending.
 * Idempotent: only touches failed/dead; clears lock + last_error.
 */
export async function replayOutbox(
  db: Kysely<Database>,
  opts: { ids: string[]; tenantId?: string | null },
): Promise<{ replayed: number }> {
  if (opts.ids.length === 0) return { replayed: 0 };

  let q = db
    .updateTable('outbox_events')
    .set({
      status: 'pending',
      available_at: new Date(),
      last_error: null,
      locked_until: null,
      locked_by: null,
      job_handle: null,
    })
    .where('id', 'in', opts.ids)
    .where('status', 'in', ['failed', 'dead']);

  if (opts.tenantId) {
    q = q.where('tenant_id', '=', opts.tenantId);
  }

  const result = await q.executeTakeFirst();
  return { replayed: Number(result.numUpdatedRows ?? 0) };
}
