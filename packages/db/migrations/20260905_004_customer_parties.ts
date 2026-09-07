/**
 * Phase 3A.3 Step 1 — CustomerParty foundation (expand only).
 *
 * Creates customer_parties + customer_party_merge_events.
 * Does NOT:
 * - add FK on deals.customer_party_id (still stub; integrity rejects non-null)
 * - extend lead_conversion_links
 * - create customer_party_contacts (P6 deferred)
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS customer_parties (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      party_type TEXT NOT NULL
        CHECK (party_type IN ('contact', 'company')),
      party_id UUID NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'merged')),
      primary_owner_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      merged_into_id UUID NULL REFERENCES customer_parties(id) ON DELETE SET NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL,
      CONSTRAINT customer_parties_merged_consistency_chk
        CHECK (
          (status = 'merged' AND merged_into_id IS NOT NULL)
          OR (status <> 'merged' AND merged_into_id IS NULL)
        )
    )
  `.execute(db);

  // Active (non-deleted, non-merged) identity is unique per tenant — never duplicate parties.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS customer_parties_workspace_identity_uidx
    ON customer_parties (workspace_id, party_type, party_id)
    WHERE deleted_at IS NULL AND status <> 'merged'
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_parties_workspace_status_idx
    ON customer_parties (workspace_id, status)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_parties_workspace_owner_idx
    ON customer_parties (workspace_id, primary_owner_id)
    WHERE deleted_at IS NULL AND primary_owner_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_parties_merged_into_idx
    ON customer_parties (workspace_id, merged_into_id)
    WHERE merged_into_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS customer_party_merge_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      from_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      into_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT customer_party_merge_events_distinct_chk
        CHECK (from_party_id <> into_party_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_party_merge_events_workspace_idx
    ON customer_party_merge_events (workspace_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_party_merge_events_from_idx
    ON customer_party_merge_events (workspace_id, from_party_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS customer_party_merge_events_into_idx
    ON customer_party_merge_events (workspace_id, into_party_id)
  `.execute(db);

  // Enable crm:customers for workspaces that already have CRM parent enabled
  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT wm.workspace_id, 'crm:customers', wm.enabled
    FROM workspace_modules wm
    WHERE wm.module_id = 'crm'
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS customer_party_merge_events`.execute(db);
  await sql`DROP TABLE IF EXISTS customer_parties`.execute(db);
}
