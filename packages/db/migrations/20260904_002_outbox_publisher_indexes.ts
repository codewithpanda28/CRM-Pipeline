/**
 * Additive indexes for outbox publisher lease reclaim + tenant fairness.
 * DO NOT DROP legacy columns.
 */
import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS outbox_events_lease_idx
    ON outbox_events (status, locked_until)
    WHERE status = 'publishing'
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS outbox_events_tenant_pending_idx
    ON outbox_events (tenant_id, status, available_at)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS outbox_events_job_handle_idx
    ON outbox_events (job_handle)
    WHERE job_handle IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS outbox_events_job_handle_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS outbox_events_tenant_pending_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS outbox_events_lease_idx`.execute(db);
}
