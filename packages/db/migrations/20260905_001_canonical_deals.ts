/**
 * Phase 3A.1 — canonical Deal table (expand).
 * Does NOT drop pipeline_items / field_values.
 * Backfill is idempotent (same id as pipeline_items when present).
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS deals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE RESTRICT,
      stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      currency VARCHAR(3) NOT NULL DEFAULT 'INR',
      probability SMALLINT NOT NULL DEFAULT 0
        CHECK (probability >= 0 AND probability <= 100),
      expected_close_at TIMESTAMPTZ NULL,
      source TEXT NULL,
      primary_contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
      company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
      customer_party_id UUID NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'won', 'lost', 'abandoned')),
      won_at TIMESTAMPTZ NULL,
      lost_at TIMESTAMPTZ NULL,
      lost_reason TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      source_pipeline_item_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  // No FK on source_pipeline_item_id: Deal-first creates insert the item after the deal
  // (same UUID). Traceability uses the UUID + unique index only.

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS deals_source_pipeline_item_uidx
    ON deals (source_pipeline_item_id)
    WHERE source_pipeline_item_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS deals_workspace_status_idx
    ON deals (workspace_id, status)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS deals_workspace_pipeline_stage_idx
    ON deals (workspace_id, pipeline_id, stage_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS deals_workspace_owner_idx
    ON deals (workspace_id, owner_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS deal_migration_traces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      source_pipeline_item_id UUID NOT NULL,
      mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'migrated'
        CHECK (status IN ('migrated', 'skipped', 'failed')),
      error TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source_pipeline_item_id)
    )
  `.execute(db);

  // Idempotent backfill: one Deal per live pipeline_item (same id).
  await sql`
    INSERT INTO deals (
      id, workspace_id, pipeline_id, stage_id, name, owner_id,
      amount, currency, probability, expected_close_at, source,
      primary_contact_id, company_id, status, custom_fields,
      source_pipeline_item_id, created_at, updated_at, deleted_at
    )
    SELECT
      i.id,
      i.workspace_id,
      i.pipeline_id,
      i.stage_id,
      COALESCE(
        NULLIF(TRIM(i.field_values->>'name'), ''),
        NULLIF(TRIM(i.field_values->>'title'), ''),
        'Untitled deal'
      ),
      COALESCE(
        CASE
          WHEN (i.field_values->>'owner_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (i.field_values->>'owner_id')::uuid
          ELSE NULL
        END,
        (
          SELECT u.id FROM users u
          WHERE u.workspace_id = i.workspace_id
          ORDER BY u.created_at ASC
          LIMIT 1
        )
      ),
      COALESCE(
        NULLIF(regexp_replace(COALESCE(i.field_values->>'amount', i.field_values->>'value', '0'), '[^0-9.-]', '', 'g'), '')::numeric,
        0
      ),
      UPPER(COALESCE(NULLIF(TRIM(i.field_values->>'currency'), ''), 'INR')),
      LEAST(100, GREATEST(0, COALESCE(
        NULLIF(regexp_replace(COALESCE(i.field_values->>'probability', '0'), '[^0-9]', '', 'g'), '')::int,
        0
      ))),
      CASE
        WHEN (i.field_values->>'expected_close_at') IS NOT NULL
          THEN (i.field_values->>'expected_close_at')::timestamptz
        WHEN (i.field_values->>'close_date') IS NOT NULL
          THEN (i.field_values->>'close_date')::timestamptz
        ELSE NULL
      END,
      NULLIF(TRIM(i.field_values->>'source'), ''),
      CASE
        WHEN EXISTS (
          SELECT 1 FROM contacts c
          WHERE c.id = CASE
            WHEN (i.field_values->>'primary_contact_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (i.field_values->>'primary_contact_id')::uuid
            WHEN (i.field_values->>'contact_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (i.field_values->>'contact_id')::uuid
            ELSE NULL
          END
          AND c.workspace_id = i.workspace_id
          AND c.deleted_at IS NULL
        )
        THEN CASE
          WHEN (i.field_values->>'primary_contact_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          THEN (i.field_values->>'primary_contact_id')::uuid
          ELSE (i.field_values->>'contact_id')::uuid
        END
        ELSE NULL
      END,
      CASE
        WHEN (i.field_values->>'company_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND EXISTS (
            SELECT 1 FROM companies co
            WHERE co.id = (i.field_values->>'company_id')::uuid
              AND co.workspace_id = i.workspace_id
              AND co.deleted_at IS NULL
          )
        THEN (i.field_values->>'company_id')::uuid
        ELSE NULL
      END,
      CASE
        WHEN s.is_won THEN 'won'
        WHEN s.is_lost THEN 'lost'
        ELSE 'open'
      END,
      COALESCE(i.field_values, '{}'::jsonb)
        - 'name' - 'title' - 'value' - 'amount' - 'currency' - 'owner_id'
        - 'close_date' - 'expected_close_at' - 'source' - 'probability'
        - 'contact_id' - 'primary_contact_id' - 'company_id',
      i.id,
      i.created_at,
      i.updated_at,
      i.deleted_at
    FROM pipeline_items i
    INNER JOIN pipeline_stages s ON s.id = i.stage_id
    WHERE EXISTS (
      SELECT 1 FROM users u WHERE u.workspace_id = i.workspace_id
    )
    ON CONFLICT (id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO deal_migration_traces (
      workspace_id, deal_id, source_pipeline_item_id, mapping, status
    )
    SELECT
      d.workspace_id,
      d.id,
      d.source_pipeline_item_id,
      jsonb_build_object(
        'strategy', 'same_id',
        'name_from', 'field_values.name|title',
        'amount_from', 'field_values.amount|value',
        'owner_from', 'field_values.owner_id|workspace_first_user'
      ),
      'migrated'
    FROM deals d
    WHERE d.source_pipeline_item_id IS NOT NULL
    ON CONFLICT (source_pipeline_item_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS deal_migration_traces`.execute(db);
  await sql`DROP TABLE IF EXISTS deals`.execute(db);
}
