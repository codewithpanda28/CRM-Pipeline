/**
 * Commission hook writers — record-only, never calculate amounts or touch ledger.
 * Best-effort: callers MUST catch errors and never fail the financial path.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { recordSecurityAudit } from '../security-audit';

export type CommissionHookEventType = 'deal.won' | 'payment.succeeded';

export async function recordCommissionHookEvent(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    eventType: CommissionHookEventType;
    sourceType: string;
    sourceId: string;
    /** User id that owns the deal / is attributed */
    ownerUserId: string | null;
    meta?: Record<string, unknown>;
  },
): Promise<{ recorded: boolean; reason?: string }> {
  if (!opts.ownerUserId) {
    return { recorded: false, reason: 'no_owner' };
  }

  const emp = await db
    .selectFrom('employee_profiles')
    .select(['id', 'commission_eligible'])
    .where('workspace_id', '=', opts.workspaceId)
    .where('user_id', '=', opts.ownerUserId)
    .where('status', '=', 'active')
    .executeTakeFirst();

  if (!emp) return { recorded: false, reason: 'no_employee' };
  if (!emp.commission_eligible) return { recorded: false, reason: 'not_eligible' };

  // Strip any amount-like keys if callers pass them by mistake
  const meta = { ...(opts.meta ?? {}) };
  delete meta.commission_amount;
  delete meta.amount_calculated;
  delete meta.payout;

  const inserted = await db
    .insertInto('ops_commission_hook_events')
    .values({
      workspace_id: opts.workspaceId,
      employee_id: emp.id,
      event_type: opts.eventType,
      source_type: opts.sourceType,
      source_id: opts.sourceId,
      status: 'recorded',
      meta,
    })
    .onConflict((oc) =>
      oc.columns(['workspace_id', 'event_type', 'source_id', 'employee_id']).doNothing(),
    )
    .returning('id')
    .executeTakeFirst();

  if (!inserted) return { recorded: false, reason: 'duplicate' };

  try {
    await recordSecurityAudit(db, {
      tenant_id: opts.workspaceId,
      actor_type: 'system',
      actor_id: null,
      action: 'ops.commission_hook.recorded',
      entity_type: 'ops_commission_hook_event',
      entity_id: inserted.id,
      ip: null,
      user_agent: null,
      meta: {
        event_type: opts.eventType,
        source_type: opts.sourceType,
        source_id: opts.sourceId,
        employee_id: emp.id,
      },
    });
  } catch {
    // audit failure must not matter for hook recording
  }

  return { recorded: true };
}

/** Fire-and-forget wrapper — never throws to caller. */
export function recordCommissionHookBestEffort(
  db: Kysely<Database>,
  opts: Parameters<typeof recordCommissionHookEvent>[1],
): void {
  void recordCommissionHookEvent(db, opts).catch(() => {
    // intentionally swallow
  });
}
