/**
 * Phase 5 — Production Business Core (non-automation).
 * Additive only: accounting GL, document artifacts, notification deliveries,
 * MFA columns, tenant export jobs. Does NOT touch automation workflow tables.
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Chart of accounts ──────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL
        CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
      is_control BOOLEAN NOT NULL DEFAULT false,
      control_key TEXT NULL,
      is_system BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      parent_id UUID NULL REFERENCES accounts(id) ON DELETE SET NULL,
      description TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, code)
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS accounts_workspace_control_key_uidx
      ON accounts (workspace_id, control_key)
      WHERE control_key IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS accounts_workspace_type_idx
      ON accounts (workspace_id, account_type)
  `.execute(db);

  // ── Accounting periods ─────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS accounting_periods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'soft_closed', 'locked')),
      closed_at TIMESTAMPTZ NULL,
      closed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      locked_at TIMESTAMPTZ NULL,
      locked_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (end_date >= start_date),
      UNIQUE (workspace_id, start_date, end_date)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS accounting_periods_workspace_status_idx
      ON accounting_periods (workspace_id, status)
  `.execute(db);

  // ── Journals ───────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      entry_number TEXT NOT NULL,
      entry_date DATE NOT NULL,
      period_id UUID NOT NULL REFERENCES accounting_periods(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'posted'
        CHECK (status IN ('draft', 'posted', 'reversed')),
      memo TEXT NULL,
      source_type TEXT NOT NULL,
      source_id UUID NULL,
      posting_key TEXT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      posted_at TIMESTAMPTZ NULL,
      posted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      reversed_by_entry_id UUID NULL,
      reverses_entry_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, entry_number),
      UNIQUE (workspace_id, posting_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS journal_entries_workspace_date_idx
      ON journal_entries (workspace_id, entry_date)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS journal_entries_workspace_source_idx
      ON journal_entries (workspace_id, source_type, source_id)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS journal_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL,
      account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      description TEXT NULL,
      debit NUMERIC(18, 2) NOT NULL DEFAULT 0,
      credit NUMERIC(18, 2) NOT NULL DEFAULT 0,
      party_type TEXT NULL,
      party_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (debit >= 0 AND credit >= 0),
      CHECK (NOT (debit > 0 AND credit > 0)),
      CHECK (debit > 0 OR credit > 0),
      UNIQUE (journal_entry_id, line_no)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS journal_lines_workspace_account_idx
      ON journal_lines (workspace_id, account_id)
  `.execute(db);

  // ── Document templates + artifacts ─────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS document_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL
        CHECK (doc_type IN ('quote', 'invoice', 'credit_note', 'debit_note')),
      version INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      engine TEXT NOT NULL DEFAULT 'html_playwright',
      body_html TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'en-IN',
      paper_size TEXT NOT NULL DEFAULT 'A4',
      status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('draft', 'published', 'archived')),
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, doc_type, version)
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS document_templates_system_uidx
      ON document_templates (doc_type, version)
      WHERE workspace_id IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS document_artifacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL
        CHECK (doc_type IN ('quote', 'invoice', 'credit_note', 'debit_note')),
      source_type TEXT NOT NULL,
      source_id UUID NOT NULL,
      template_id UUID NULL REFERENCES document_templates(id) ON DELETE SET NULL,
      template_version INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'rendering', 'ready', 'failed')),
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      storage_key TEXT NULL,
      sha256 TEXT NULL,
      byte_size INTEGER NULL,
      page_count INTEGER NULL,
      branding_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      error_message TEXT NULL,
      render_idempotency_key TEXT NOT NULL,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ready_at TIMESTAMPTZ NULL,
      UNIQUE (workspace_id, render_idempotency_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS document_artifacts_workspace_source_idx
      ON document_artifacts (workspace_id, source_type, source_id)
  `.execute(db);

  // ── Notification delivery ledger (idempotent bus) ──────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email')),
      severity TEXT NOT NULL DEFAULT 'info'
        CHECK (severity IN ('info', 'warning', 'critical')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      resource_type TEXT NULL,
      resource_id UUID NULL,
      notification_id UUID NULL REFERENCES notifications(id) ON DELETE SET NULL,
      delivery_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
      error_message TEXT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      delivered_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, delivery_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS notification_deliveries_user_idx
      ON notification_deliveries (workspace_id, user_id, created_at DESC)
  `.execute(db);

  await sql`
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info',
      ADD COLUMN IF NOT EXISTS delivery_key TEXT NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS notifications_workspace_delivery_key_uidx
      ON notifications (workspace_id, delivery_key)
      WHERE delivery_key IS NOT NULL
  `.execute(db);

  // ── Reminder runs (native scheduled reminders — NOT automation) ────
  await sql`
    CREATE TABLE IF NOT EXISTS reminder_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id UUID NOT NULL,
      fire_key TEXT NOT NULL,
      fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, fire_key)
    )
  `.execute(db);

  // ── Tenant export jobs ─────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS tenant_export_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'ready', 'failed')),
      requested_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      storage_key TEXT NULL,
      byte_size INTEGER NULL,
      sha256 TEXT NULL,
      error_message TEXT NULL,
      include_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  // ── MFA (workspace users + platform users) ─────────────────────────
  await sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT NULL,
      ADD COLUMN IF NOT EXISTS mfa_recovery_codes_hash JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ NULL
  `.execute(db);

  await sql`
    ALTER TABLE platform_users
      ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT NULL,
      ADD COLUMN IF NOT EXISTS mfa_recovery_codes_hash JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS mfa_enrolled_at TIMESTAMPTZ NULL
  `.execute(db);

  // Seed finance accounting submodule flags (idempotent)
  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT w.id, m.module_id, true
    FROM workspaces w
    CROSS JOIN (VALUES
      ('finance:accounting'),
      ('finance:documents')
    ) AS m(module_id)
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS tenant_export_jobs`.execute(db);
  await sql`DROP TABLE IF EXISTS reminder_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS notification_deliveries`.execute(db);
  await sql`DROP TABLE IF EXISTS document_artifacts`.execute(db);
  await sql`DROP TABLE IF EXISTS document_templates`.execute(db);
  await sql`DROP TABLE IF EXISTS journal_lines`.execute(db);
  await sql`DROP TABLE IF EXISTS journal_entries`.execute(db);
  await sql`DROP TABLE IF EXISTS accounting_periods`.execute(db);
  await sql`DROP TABLE IF EXISTS accounts`.execute(db);
}
