/**
 * Business Operations Round 1 — org model, business-task extensions, targets.
 *
 * Additive only. Does NOT touch Automation engine, PM project_tasks writes,
 * or Finance ledger rules.
 *
 * Entitlement policy (canonical, same as automation Phase 6.5):
 * - Source of truth for defaults = ModuleDefinition.defaultEnabled on MODULE_REGISTRY
 * - OPS_MODULE.defaultEnabled === true
 * - Insert enabled=true ONLY when the workspace_modules row is missing
 * - Never overwrite an existing row (intentional disable must stick)
 * - Member role (is_default) gets ops.* permissions with defaultRoles including 'member'
 */
import { type Kysely, sql } from 'kysely';

/** Member-facing Operations permissions (matches OPS_MODULE defaultRoles). */
export const OPS_MEMBER_PERMISSIONS = [
  'ops.employees.view',
  'ops.tasks.view',
  'ops.tasks.manage',
  'ops.targets.view_own',
] as const;

/** System target metric catalog seeded in up(). */
export const OPS_SYSTEM_TARGET_METRICS = [
  { metric_key: 'leads.created', label: 'Leads created', unit: 'count', description: 'Leads created in period' },
  { metric_key: 'leads.contacted', label: 'Leads contacted', unit: 'count', description: 'Leads contacted in period' },
  { metric_key: 'leads.qualified', label: 'Leads qualified', unit: 'count', description: 'Leads qualified in period' },
  { metric_key: 'demos.completed', label: 'Demos completed', unit: 'count', description: 'Demo tasks/activities completed' },
  { metric_key: 'proposals.sent', label: 'Proposals sent', unit: 'count', description: 'Quotes sent in period' },
  { metric_key: 'deals.won', label: 'Deals won', unit: 'count', description: 'Deals marked won' },
  { metric_key: 'revenue.won', label: 'Revenue won', unit: 'currency', description: 'Won deal amounts' },
  { metric_key: 'collections.received', label: 'Collections received', unit: 'currency', description: 'Payments received' },
  { metric_key: 'tasks.completed', label: 'Tasks completed', unit: 'count', description: 'Business tasks completed' },
  { metric_key: 'followups.completed', label: 'Follow-ups completed', unit: 'count', description: 'Follow-up/call tasks completed' },
] as const;

/** Whether a missing workspace_modules row should be inserted as enabled. */
export function shouldBackfillOpsModule(existingEnabled: boolean | undefined): boolean {
  return existingEnabled === undefined;
}

/** Inserted enabled value when backfilling — registry defaultEnabled. */
export function opsBackfillEnabledValue(): boolean {
  return true;
}

/**
 * API-facing legacy status map. DB keeps `todo` as-is; callers map via this helper.
 * Unknown values pass through unchanged.
 */
export function mapLegacyTaskStatus(status: string): string {
  if (status === 'todo') return 'open';
  return status;
}

/**
 * Target achievement percent: actual / goal, null when goal is 0 or non-finite.
 */
export function computeTargetPctAchieved(goalValue: number, actualValue: number): number | null {
  if (!Number.isFinite(goalValue) || !Number.isFinite(actualValue) || goalValue === 0) {
    return null;
  }
  return actualValue / goalValue;
}

/** remaining = max(goal - actual, 0) */
export function computeTargetRemaining(goalValue: number, actualValue: number): number {
  if (!Number.isFinite(goalValue) || !Number.isFinite(actualValue)) return 0;
  return Math.max(goalValue - actualValue, 0);
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // ── Departments ────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, name)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS departments_workspace_id_idx
      ON departments (workspace_id)
  `.execute(db);

  // ── Teams ──────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS teams_workspace_id_idx
      ON teams (workspace_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS teams_department_id_idx
      ON teams (department_id)
  `.execute(db);

  // ── Employee profiles ──────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS employee_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      employee_code TEXT NULL,
      display_name TEXT NOT NULL,
      designation TEXT NULL,
      primary_department_id UUID NULL REFERENCES departments(id) ON DELETE SET NULL,
      primary_team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
      manager_employee_id UUID NULL REFERENCES employee_profiles(id) ON DELETE SET NULL,
      joined_on DATE NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      work_email TEXT NULL,
      work_phone TEXT NULL,
      commission_eligible BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, user_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS employee_profiles_workspace_id_idx
      ON employee_profiles (workspace_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS employee_profiles_manager_employee_id_idx
      ON employee_profiles (manager_employee_id)
  `.execute(db);

  // ── Team members ───────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS team_members (
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (team_id, employee_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS team_members_workspace_id_idx
      ON team_members (workspace_id)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_primary_per_employee_uidx
      ON team_members (workspace_id, employee_id)
      WHERE is_primary = true
  `.execute(db);

  // ── Reporting history ──────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS employee_reporting_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
      from_manager_id UUID NULL REFERENCES employee_profiles(id) ON DELETE SET NULL,
      to_manager_id UUID NULL REFERENCES employee_profiles(id) ON DELETE SET NULL,
      effective_at TIMESTAMPTZ NOT NULL,
      changed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS employee_reporting_history_workspace_employee_idx
      ON employee_reporting_history (workspace_id, employee_id)
  `.execute(db);

  // ── Business task recurrence (CRM-side; not PM recurring_task_rules) ─
  await sql`
    CREATE TABLE IF NOT EXISTS business_task_recurrence_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL,
      frequency TEXT NOT NULL
        CHECK (frequency IN ('daily', 'weekly', 'monthly')),
      interval_n INTEGER NOT NULL DEFAULT 1,
      next_run_at TIMESTAMPTZ NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS business_task_recurrence_rules_workspace_id_idx
      ON business_task_recurrence_rules (workspace_id)
  `.execute(db);

  // ── Extend CRM tasks ───────────────────────────────────────────────
  await sql`
    ALTER TABLE tasks
      ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'other',
      ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'NONE',
      ADD COLUMN IF NOT EXISTS assigned_by_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS body TEXT NULL,
      ADD COLUMN IF NOT EXISTS related_lead_id UUID NULL REFERENCES leads(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS related_customer_party_id UUID NULL REFERENCES customer_parties(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS related_deal_id UUID NULL REFERENCES deals(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS related_quote_id UUID NULL REFERENCES quotes(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS related_invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS recurrence_rule_id UUID NULL REFERENCES business_task_recurrence_rules(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS completion_outcome TEXT NULL
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tasks_priority_check'
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_priority_check
          CHECK (priority IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'));
      END IF;
    END $$
  `.execute(db);

  // Drop any existing status CHECKs, then allow expanded + legacy values.
  await sql`
    DO $$
    DECLARE
      r RECORD;
    BEGIN
      FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'tasks'
          AND nsp.nspname = 'public'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      LOOP
        EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END $$
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tasks_status_check'
      ) THEN
        ALTER TABLE tasks
          ADD CONSTRAINT tasks_status_check
          CHECK (status IN ('todo', 'open', 'in_progress', 'done', 'cancelled'));
      END IF;
    END $$
  `.execute(db);

  // Sync due_at from legacy due_date; leave status `todo` as-is (API maps).
  await sql`
    UPDATE tasks
    SET due_at = due_date::timestamptz
    WHERE due_at IS NULL
      AND due_date IS NOT NULL
  `.execute(db);

  // ── Target metrics (global catalog) ────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS target_metrics (
      metric_key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      description TEXT NULL,
      unit TEXT NOT NULL DEFAULT 'count'
        CHECK (unit IN ('count', 'currency')),
      calculator_version TEXT NOT NULL DEFAULT '1',
      active BOOLEAN NOT NULL DEFAULT true
    )
  `.execute(db);

  await sql`
    INSERT INTO target_metrics (metric_key, label, description, unit, calculator_version, active)
    VALUES
      ('leads.created', 'Leads created', 'Leads created in period', 'count', '1', true),
      ('leads.contacted', 'Leads contacted', 'Leads contacted in period', 'count', '1', true),
      ('leads.qualified', 'Leads qualified', 'Leads qualified in period', 'count', '1', true),
      ('demos.completed', 'Demos completed', 'Demo tasks/activities completed', 'count', '1', true),
      ('proposals.sent', 'Proposals sent', 'Quotes sent in period', 'count', '1', true),
      ('deals.won', 'Deals won', 'Deals marked won', 'count', '1', true),
      ('revenue.won', 'Revenue won', 'Won deal amounts', 'currency', '1', true),
      ('collections.received', 'Collections received', 'Payments received', 'currency', '1', true),
      ('tasks.completed', 'Tasks completed', 'Business tasks completed', 'count', '1', true),
      ('followups.completed', 'Follow-ups completed', 'Follow-up/call tasks completed', 'count', '1', true)
    ON CONFLICT (metric_key) DO NOTHING
  `.execute(db);

  // ── Target periods ─────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS target_periods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      granularity TEXT NOT NULL
        CHECK (granularity IN ('daily', 'weekly', 'monthly')),
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'closed')),
      closed_at TIMESTAMPTZ NULL,
      closed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (period_end > period_start),
      UNIQUE (workspace_id, granularity, period_start)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS target_periods_workspace_status_idx
      ON target_periods (workspace_id, status)
  `.execute(db);

  // ── Targets ────────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS targets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      period_id UUID NOT NULL REFERENCES target_periods(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL REFERENCES target_metrics(metric_key) ON DELETE RESTRICT,
      subject_type TEXT NOT NULL
        CHECK (subject_type IN ('employee', 'team', 'department', 'tenant')),
      subject_id UUID NULL,
      goal_value NUMERIC NOT NULL,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS targets_workspace_id_idx
      ON targets (workspace_id)
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS targets_period_metric_subject_uidx
      ON targets (
        period_id,
        metric_key,
        subject_type,
        COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
      )
  `.execute(db);

  // ── Achievement snapshots ──────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS achievement_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
      period_id UUID NOT NULL REFERENCES target_periods(id) ON DELETE CASCADE,
      metric_key TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id UUID NULL,
      goal_value NUMERIC NOT NULL,
      actual_value NUMERIC NOT NULL,
      remaining NUMERIC NULL,
      pct_achieved NUMERIC NULL,
      calculator_version TEXT NOT NULL DEFAULT '1',
      closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS achievement_snapshots_workspace_period_idx
      ON achievement_snapshots (workspace_id, period_id)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS achievement_snapshots_target_id_idx
      ON achievement_snapshots (target_id)
  `.execute(db);

  // ── workspace_modules backfill for ops ─────────────────────────────
  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT w.id, 'ops', true
    FROM workspaces w
    WHERE NOT EXISTS (
      SELECT 1
      FROM workspace_modules wm
      WHERE wm.workspace_id = w.id
        AND wm.module_id = 'ops'
    )
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);

  // Member (is_default) roles get member-default ops permissions
  await sql`
    INSERT INTO role_permissions (workspace_id, role_id, permission)
    SELECT r.workspace_id, r.id, p.permission
    FROM roles r
    CROSS JOIN (
      VALUES
        ('ops.employees.view'),
        ('ops.tasks.view'),
        ('ops.tasks.manage'),
        ('ops.targets.view_own')
    ) AS p(permission)
    WHERE r.is_default = true
    ON CONFLICT (role_id, permission) DO NOTHING
  `.execute(db);

  // ── employee_profiles backfill (active members + workspace users) ──
  await sql`
    INSERT INTO employee_profiles (
      workspace_id,
      user_id,
      display_name,
      status,
      commission_eligible
    )
    SELECT
      u.workspace_id,
      u.id,
      COALESCE(NULLIF(TRIM(u.name), ''), u.email),
      'active',
      false
    FROM users u
    WHERE (
      EXISTS (
        SELECT 1
        FROM tenant_memberships tm
        WHERE tm.user_id = u.id
          AND tm.tenant_id = u.workspace_id
          AND tm.status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM workspaces w WHERE w.id = u.workspace_id
      )
    )
    ON CONFLICT (workspace_id, user_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS achievement_snapshots CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS targets CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS target_periods CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS target_metrics CASCADE`.execute(db);

  await sql`
    ALTER TABLE tasks
      DROP COLUMN IF EXISTS task_type,
      DROP COLUMN IF EXISTS priority,
      DROP COLUMN IF EXISTS assigned_by_id,
      DROP COLUMN IF EXISTS due_at,
      DROP COLUMN IF EXISTS body,
      DROP COLUMN IF EXISTS related_lead_id,
      DROP COLUMN IF EXISTS related_customer_party_id,
      DROP COLUMN IF EXISTS related_deal_id,
      DROP COLUMN IF EXISTS related_quote_id,
      DROP COLUMN IF EXISTS related_invoice_id,
      DROP COLUMN IF EXISTS recurrence_rule_id,
      DROP COLUMN IF EXISTS reminder_at,
      DROP COLUMN IF EXISTS completed_at,
      DROP COLUMN IF EXISTS completion_outcome
  `.execute(db);

  await sql`
    DO $$
    BEGIN
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
      ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END $$
  `.execute(db);

  await sql`DROP TABLE IF EXISTS business_task_recurrence_rules CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS employee_reporting_history CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS team_members CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS employee_profiles CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS teams CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS departments CASCADE`.execute(db);

  // Do not delete workspace_modules.ops — may reflect intentional entitlement.
  await sql`
    DELETE FROM role_permissions
    WHERE permission IN (
      'ops.employees.view',
      'ops.tasks.view',
      'ops.tasks.manage',
      'ops.targets.view_own'
    )
    AND role_id IN (SELECT id FROM roles WHERE is_default = true)
  `.execute(db);
}
