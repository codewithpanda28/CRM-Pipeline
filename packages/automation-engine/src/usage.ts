import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export type UsageCounterName =
  | 'runs_started'
  | 'runs_completed'
  | 'runs_failed'
  | 'steps_executed'
  | 'actions_class_a'
  | 'actions_class_b'
  | 'approvals_requested'
  | 'approvals_authorized';

function periodStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Idempotent counter bump via usage_events unique (tenant_id, dedupe_key). */
export async function incrementUsage(
  db: Kysely<Database>,
  tenantId: string,
  counter: UsageCounterName,
  dedupeKey: string,
): Promise<boolean> {
  const inserted = await sql<{ id: string }>`
    INSERT INTO automation_usage_events (tenant_id, dedupe_key, counter_name)
    VALUES (${tenantId}::uuid, ${dedupeKey}, ${counter})
    ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
    RETURNING id
  `.execute(db);

  if (!inserted.rows[0]?.id) return false;

  const ps = periodStart();
  await sql`
    INSERT INTO automation_usage_counters (
      tenant_id, period_start, ${sql.raw(counter)}, updated_at
    ) VALUES (
      ${tenantId}::uuid, ${ps}::date, 1, now()
    )
    ON CONFLICT (tenant_id, period_start) DO UPDATE SET
      ${sql.raw(counter)} = automation_usage_counters.${sql.raw(counter)} + 1,
      updated_at = now()
  `.execute(db);

  return true;
}
