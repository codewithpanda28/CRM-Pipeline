/**
 * Round B — Sales Workflow employee experience (non-destructive).
 * - activities.occurred_at / heading for timeline + communications
 * - widen activities.type for CRM workflow events
 */
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE activities
      ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS heading TEXT NULL
  `.execute(db);

  await sql`
    UPDATE activities SET occurred_at = created_at WHERE occurred_at IS NULL
  `.execute(db);

  await sql`
    ALTER TABLE activities
      ALTER COLUMN type TYPE VARCHAR(40)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS activities_ws_occurred_idx
      ON activities (workspace_id, occurred_at DESC, id DESC)
  `.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Non-destructive
}
