/**
 * Phase 5 — accounting periods (open / soft_closed / locked).
 */
import type { DbOrTx } from '@vencore/events';

function fiscalYearBounds(d = new Date()): { start: string; end: string; name: string } {
  const y = d.getUTCFullYear();
  // Calendar year MVP (management books)
  return {
    start: `${y}-01-01`,
    end: `${y}-12-31`,
    name: `FY ${y}`,
  };
}

export async function ensureCurrentPeriod(db: DbOrTx, workspaceId: string) {
  const { start, end, name } = fiscalYearBounds();
  const existing = await db
    .selectFrom('accounting_periods')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('start_date', '=', start)
    .where('end_date', '=', end)
    .executeTakeFirst();
  if (existing) return existing;

  const now = new Date();
  return db
    .insertInto('accounting_periods')
    .values({
      workspace_id: workspaceId,
      name,
      start_date: start,
      end_date: end,
      status: 'open',
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) => oc.columns(['workspace_id', 'start_date', 'end_date']).doNothing())
    .returningAll()
    .executeTakeFirst()
    .then(async (row) => {
      if (row) return row;
      return (
        (await db
          .selectFrom('accounting_periods')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .where('start_date', '=', start)
          .where('end_date', '=', end)
          .executeTakeFirstOrThrow())
      );
    });
}

export async function listPeriods(db: DbOrTx, workspaceId: string) {
  await ensureCurrentPeriod(db, workspaceId);
  return db
    .selectFrom('accounting_periods')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .orderBy('start_date', 'desc')
    .execute();
}

export async function resolvePeriodForDate(
  db: DbOrTx,
  workspaceId: string,
  entryDate: string,
): Promise<
  | { ok: true; period: Awaited<ReturnType<typeof ensureCurrentPeriod>> }
  | { ok: false; reason: 'no_period' | 'locked' | 'soft_closed' }
> {
  await ensureCurrentPeriod(db, workspaceId);
  const period = await db
    .selectFrom('accounting_periods')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('start_date', '<=', entryDate)
    .where('end_date', '>=', entryDate)
    .executeTakeFirst();
  if (!period) return { ok: false, reason: 'no_period' };
  if (period.status === 'locked') return { ok: false, reason: 'locked' };
  // soft_closed: allow posting of reversals only — callers decide; default reject new source posts
  return { ok: true, period };
}

export async function setPeriodStatus(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    status: 'open' | 'soft_closed' | 'locked';
    actorId?: string | null;
  },
) {
  const now = new Date();
  const patch: Record<string, unknown> = {
    status: opts.status,
    updated_at: now,
  };
  if (opts.status === 'soft_closed') {
    patch.closed_at = now;
    patch.closed_by = opts.actorId ?? null;
  }
  if (opts.status === 'locked') {
    patch.locked_at = now;
    patch.locked_by = opts.actorId ?? null;
  }
  if (opts.status === 'open') {
    patch.closed_at = null;
    patch.closed_by = null;
    patch.locked_at = null;
    patch.locked_by = null;
  }
  return (
    (await db
      .updateTable('accounting_periods')
      .set(patch)
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
