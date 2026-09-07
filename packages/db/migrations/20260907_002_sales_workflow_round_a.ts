/**
 * Round A — Sales Workflow Core foundation (non-destructive).
 * - CRM field/section/option metadata (ADR-013 hybrid)
 * - pipeline_stages default_probability + archived_at
 * - tasks scheduling_mode / time-bound columns
 */
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS crm_record_sections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'customer_party', 'deal')),
      section_key TEXT NOT NULL,
      label TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, entity_type, section_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS crm_record_sections_ws_entity_idx
      ON crm_record_sections (workspace_id, entity_type, position)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS crm_field_definitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'customer_party', 'deal')),
      section_id UUID NULL REFERENCES crm_record_sections(id) ON DELETE SET NULL,
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK (field_type IN (
        'text', 'long_text', 'number', 'currency', 'date', 'datetime',
        'phone', 'email', 'url', 'single_select', 'multi_select', 'checkbox', 'user_ref'
      )),
      required BOOLEAN NOT NULL DEFAULT false,
      default_json JSONB NULL,
      validation_json JSONB NULL,
      position INT NOT NULL DEFAULT 0,
      searchable BOOLEAN NOT NULL DEFAULT false,
      archived_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, entity_type, field_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS crm_field_definitions_ws_entity_idx
      ON crm_field_definitions (workspace_id, entity_type, position)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS crm_field_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      field_id UUID NOT NULL REFERENCES crm_field_definitions(id) ON DELETE CASCADE,
      option_value TEXT NOT NULL,
      label TEXT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (field_id, option_value)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS crm_field_options_field_idx
      ON crm_field_options (field_id, position)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS crm_field_values (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('lead', 'customer_party', 'deal')),
      entity_id UUID NOT NULL,
      field_key TEXT NOT NULL,
      value_json JSONB NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, entity_type, entity_id, field_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS crm_field_values_entity_idx
      ON crm_field_values (workspace_id, entity_type, entity_id)
  `.execute(db);

  await sql`
    ALTER TABLE pipeline_stages
      ADD COLUMN IF NOT EXISTS default_probability INT NULL,
      ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL
  `.execute(db);

  await sql`
    ALTER TABLE pipeline_stages
      DROP CONSTRAINT IF EXISTS pipeline_stages_default_probability_check
  `.execute(db);

  await sql`
    ALTER TABLE pipeline_stages
      ADD CONSTRAINT pipeline_stages_default_probability_check
      CHECK (default_probability IS NULL OR (default_probability >= 0 AND default_probability <= 100))
  `.execute(db);

  await sql`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS scheduling_mode TEXT NOT NULL DEFAULT 'unbounded',
      ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS duration_minutes INT NULL,
      ADD COLUMN IF NOT EXISTS timezone TEXT NULL,
      ADD COLUMN IF NOT EXISTS meeting_mode TEXT NULL,
      ADD COLUMN IF NOT EXISTS location TEXT NULL
  `.execute(db);

  await sql`
    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS tasks_scheduling_mode_check
  `.execute(db);

  await sql`
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_scheduling_mode_check
      CHECK (scheduling_mode IN ('unbounded', 'time_bound'))
  `.execute(db);

  await sql`
    ALTER TABLE tasks
      DROP CONSTRAINT IF EXISTS tasks_meeting_mode_check
  `.execute(db);

  await sql`
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_meeting_mode_check
      CHECK (meeting_mode IS NULL OR meeting_mode IN ('online', 'offline'))
  `.execute(db);
}

export async function down(_db: Kysely<unknown>): Promise<void> {
  // Non-destructive down: Round A columns/tables may already hold live metadata.
}
