import { type Kysely, sql } from 'kysely';

/**
 * CRM Block 1 — additive search indexes for global CRM search (REQ-CRM-008).
 * Contacts already have pg_trgm GIN indexes (20260615_003). This migration:
 * - ensures pg_trgm
 * - adds GIN trgm indexes only where missing (IF NOT EXISTS)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS leads_workspace_name_trgm_idx
    ON leads USING GIN (name gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS leads_workspace_email_trgm_idx
    ON leads USING GIN (email gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS leads_workspace_company_name_trgm_idx
    ON leads USING GIN (company_name gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS companies_workspace_name_trgm_idx
    ON companies USING GIN (name gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS deals_workspace_name_trgm_idx
    ON deals USING GIN (name gin_trgm_ops)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_parties_workspace_display_name_trgm_idx
    ON customer_parties USING GIN (display_name gin_trgm_ops)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX IF EXISTS customer_parties_workspace_display_name_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS deals_workspace_name_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS companies_workspace_name_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS leads_workspace_company_name_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS leads_workspace_email_trgm_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS leads_workspace_name_trgm_idx`.execute(db);
}
