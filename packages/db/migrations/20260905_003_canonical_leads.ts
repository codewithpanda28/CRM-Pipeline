/**
 * Phase 3A.2 — canonical Lead + conversion lineage (expand).
 * No production Lead data — greenfield. Does not alter deals/pipeline_items.
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      first_name TEXT NULL,
      last_name TEXT NULL,
      email TEXT NULL,
      phone TEXT NULL,
      alternate_phone TEXT NULL,
      company_name TEXT NULL,
      website TEXT NULL,
      source TEXT NULL,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN (
          'new', 'contacted', 'qualified', 'converted',
          'unqualified', 'lost', 'abandoned'
        )),
      rating TEXT NULL
        CHECK (rating IS NULL OR rating IN ('hot', 'warm', 'cold')),
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
      company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
      deal_id UUID NULL REFERENCES deals(id) ON DELETE SET NULL,
      notes TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      converted_at TIMESTAMPTZ NULL,
      converted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      lost_reason TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS leads_workspace_status_idx
    ON leads (workspace_id, status)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS leads_workspace_owner_idx
    ON leads (workspace_id, owner_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS leads_workspace_email_lower_idx
    ON leads (workspace_id, lower(email))
    WHERE deleted_at IS NULL AND email IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS lead_conversion_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL
        CHECK (entity_type IN ('contact', 'company', 'deal')),
      entity_id UUID NOT NULL,
      action TEXT NOT NULL
        CHECK (action IN ('created', 'reused')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (lead_id, entity_type)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS lead_conversion_links_workspace_idx
    ON lead_conversion_links (workspace_id, lead_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS lead_conversion_links_entity_idx
    ON lead_conversion_links (workspace_id, entity_type, entity_id)
  `.execute(db);

  // Enable crm:leads for workspaces that already have CRM parent enabled
  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT wm.workspace_id, 'crm:leads', wm.enabled
    FROM workspace_modules wm
    WHERE wm.module_id = 'crm'
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS lead_conversion_links`.execute(db);
  await sql`DROP TABLE IF EXISTS leads`.execute(db);
}
