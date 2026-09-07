import { Kysely, sql } from 'kysely';

/**
 * Freeze tenant seller branding on invoices at issue time (World 2).
 * Additive JSONB — does not rewrite historical rows when branding changes later.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS seller_branding_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE invoices
      DROP COLUMN IF EXISTS seller_branding_snapshot
  `.execute(db);
}
