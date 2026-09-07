/**
 * Phase 6 Round 1 — Automation engine foundation (ADR-027).
 * Additive only. Does NOT alter automation_rules / pipeline_automations.
 * Does NOT create voice_* / whatsapp_* tables.
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS workflows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
      current_draft_version_id UUID NULL,
      current_published_version_id UUID NULL,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflows_tenant_status_updated_idx
      ON workflows (tenant_id, status, updated_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS workflow_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'draft'
        CHECK (state IN ('draft', 'published', 'superseded')),
      graph JSONB NOT NULL DEFAULT '{}'::jsonb,
      schema_hash TEXT NOT NULL,
      published_at TIMESTAMPTZ NULL,
      published_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workflow_id, version_number)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflow_versions_tenant_workflow_idx
      ON workflow_versions (tenant_id, workflow_id)
  `.execute(db);

  await sql`
    DO $$ BEGIN
      ALTER TABLE workflows
        ADD CONSTRAINT workflows_current_draft_version_fk
        FOREIGN KEY (current_draft_version_id) REFERENCES workflow_versions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `.execute(db);

  await sql`
    DO $$ BEGIN
      ALTER TABLE workflows
        ADD CONSTRAINT workflows_current_published_version_fk
        FOREIGN KEY (current_published_version_id) REFERENCES workflow_versions(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS workflow_triggers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
      event_name TEXT NOT NULL,
      filter JSONB NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflow_triggers_tenant_event_active_idx
      ON workflow_triggers (tenant_id, event_name)
      WHERE is_active = true
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN (
          'queued', 'running', 'waiting', 'awaiting_approval', 'paused',
          'completed', 'failed', 'cancelled', 'dead_lettered'
        )),
      trigger_event_id UUID NULL,
      trigger_event_name TEXT NULL,
      trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      correlation_id TEXT NULL,
      causation_id TEXT NULL,
      run_key TEXT NOT NULL,
      pause_reason TEXT NULL,
      error JSONB NULL,
      started_at TIMESTAMPTZ NULL,
      finished_at TIMESTAMPTZ NULL,
      run_timeout_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, run_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflow_runs_tenant_created_idx
      ON workflow_runs (tenant_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflow_runs_tenant_status_idx
      ON workflow_runs (tenant_id, status)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS automation_approvals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
      workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      workflow_run_step_id UUID NULL,
      action_type TEXT NOT NULL,
      requested_payload_snapshot JSONB NOT NULL,
      payload_hash TEXT NOT NULL,
      requester_type TEXT NOT NULL,
      requester_id TEXT NOT NULL,
      approver_type TEXT NULL,
      approver_id TEXT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'authorized', 'rejected', 'expired', 'revoked')),
      decision TEXT NULL,
      reason TEXT NULL,
      comment TEXT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_at TIMESTAMPTZ NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ NULL,
      revoked_by TEXT NULL,
      audit_link_id UUID NULL,
      idempotency_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, idempotency_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS automation_approvals_tenant_payload_hash_idx
      ON automation_approvals (tenant_id, payload_hash)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS automation_approvals_pending_expires_idx
      ON automation_approvals (status, expires_at)
      WHERE status = 'pending'
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS workflow_run_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      node_id TEXT NOT NULL,
      step_type TEXT NOT NULL
        CHECK (step_type IN ('condition', 'branch', 'delay', 'approval', 'action')),
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
          'pending', 'ready', 'running', 'waiting', 'awaiting_approval',
          'succeeded', 'failed', 'skipped', 'cancelled'
        )),
      attempt INTEGER NOT NULL DEFAULT 1,
      step_key TEXT NOT NULL,
      input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      output_snapshot JSONB NULL,
      approval_id UUID NULL REFERENCES automation_approvals(id) ON DELETE SET NULL,
      error JSONB NULL,
      scheduled_at TIMESTAMPTZ NULL,
      started_at TIMESTAMPTZ NULL,
      finished_at TIMESTAMPTZ NULL,
      step_timeout_at TIMESTAMPTZ NULL,
      parent_step_id UUID NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, step_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflow_run_steps_run_node_idx
      ON workflow_run_steps (workflow_run_id, node_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workflow_run_steps_waiting_scheduled_idx
      ON workflow_run_steps (status, scheduled_at)
      WHERE status = 'waiting'
  `.execute(db);

  await sql`
    DO $$ BEGIN
      ALTER TABLE automation_approvals
        ADD CONSTRAINT automation_approvals_step_fk
        FOREIGN KEY (workflow_run_step_id) REFERENCES workflow_run_steps(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS automation_approvals_step_open_uidx
      ON automation_approvals (workflow_run_step_id)
      WHERE workflow_run_step_id IS NOT NULL
        AND status IN ('pending', 'authorized')
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS workflow_run_step_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_run_step_id UUID NOT NULL REFERENCES workflow_run_steps(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL,
      status TEXT NOT NULL,
      error JSONB NULL,
      worker_id TEXT NULL,
      job_handle TEXT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at TIMESTAMPTZ NULL,
      UNIQUE (workflow_run_step_id, attempt_number)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS automation_approval_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      approval_id UUID NOT NULL REFERENCES automation_approvals(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL
        CHECK (event_type IN (
          'requested', 'authorized', 'rejected', 'expired', 'revoked', 'validation_failed'
        )),
      actor_type TEXT NOT NULL,
      actor_id TEXT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      detail JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS automation_approval_events_approval_idx
      ON automation_approval_events (approval_id, at)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS automation_dead_letters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
      workflow_run_step_id UUID NULL REFERENCES workflow_run_steps(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      last_error JSONB NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ NULL,
      resolved_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS automation_dead_letters_tenant_created_idx
      ON automation_dead_letters (tenant_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS automation_usage_counters (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      period_start DATE NOT NULL,
      runs_started INTEGER NOT NULL DEFAULT 0,
      runs_completed INTEGER NOT NULL DEFAULT 0,
      runs_failed INTEGER NOT NULL DEFAULT 0,
      steps_executed INTEGER NOT NULL DEFAULT 0,
      actions_class_a INTEGER NOT NULL DEFAULT 0,
      actions_class_b INTEGER NOT NULL DEFAULT 0,
      approvals_requested INTEGER NOT NULL DEFAULT 0,
      approvals_authorized INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, period_start)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS automation_usage_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      dedupe_key TEXT NOT NULL,
      counter_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, dedupe_key)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS automation_usage_events`.execute(db);
  await sql`DROP TABLE IF EXISTS automation_usage_counters`.execute(db);
  await sql`DROP TABLE IF EXISTS automation_dead_letters`.execute(db);
  await sql`DROP TABLE IF EXISTS automation_approval_events`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_run_step_attempts`.execute(db);
  await sql`ALTER TABLE automation_approvals DROP CONSTRAINT IF EXISTS automation_approvals_step_fk`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_run_steps`.execute(db);
  await sql`DROP TABLE IF EXISTS automation_approvals`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_triggers`.execute(db);
  await sql`ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_current_draft_version_fk`.execute(db);
  await sql`ALTER TABLE workflows DROP CONSTRAINT IF EXISTS workflows_current_published_version_fk`.execute(db);
  await sql`DROP TABLE IF EXISTS workflow_versions`.execute(db);
  await sql`DROP TABLE IF EXISTS workflows`.execute(db);
}
