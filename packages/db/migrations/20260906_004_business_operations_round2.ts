/**
 * Business Operations Round 2 — DPR + commission hook events.
 * Additive only. Does not modify Round 1 tables except indexes if needed.
 */
import { type Kysely, sql } from 'kysely';

export const OPS_R2_MEMBER_PERMISSIONS = [
  'ops.dpr.view_own',
  'ops.dpr.create',
  'ops.performance.view_own',
] as const;

export const OPS_R2_MANAGER_PERMISSIONS = [
  'ops.employees.view',
  'ops.tasks.view',
  'ops.tasks.manage',
  'ops.tasks.assign',
  'ops.targets.view_own',
  'ops.targets.view_team',
  'ops.dpr.view_own',
  'ops.dpr.create',
  'ops.dpr.view_team',
  'ops.dpr.review',
  'ops.performance.view_own',
  'ops.performance.view_team',
] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS dpr_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
      report_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'submitted', 'reviewed', 'returned')),
      system_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      manual_overlay JSONB NOT NULL DEFAULT '{}'::jsonb,
      calculator_version TEXT NOT NULL DEFAULT '1',
      submitted_at TIMESTAMPTZ NULL,
      submitted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ NULL,
      reviewed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      review_comment TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, employee_id, report_date)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS dpr_entries_workspace_date_idx
      ON dpr_entries (workspace_id, report_date DESC)
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS dpr_entries_workspace_status_idx
      ON dpr_entries (workspace_id, status)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS dpr_review_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      dpr_entry_id UUID NOT NULL REFERENCES dpr_entries(id) ON DELETE CASCADE,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      comment TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS dpr_review_events_entry_idx
      ON dpr_review_events (workspace_id, dpr_entry_id, created_at DESC)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS ops_commission_hook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL
        CHECK (event_type IN ('deal.won', 'payment.succeeded')),
      source_type TEXT NOT NULL,
      source_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'recorded'
        CHECK (status IN ('recorded')),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, event_type, source_id, employee_id)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS ops_commission_hook_events_workspace_idx
      ON ops_commission_hook_events (workspace_id, created_at DESC)
  `.execute(db);

  // Member default R2 permissions (idempotent)
  await sql`
    INSERT INTO role_permissions (workspace_id, role_id, permission)
    SELECT r.workspace_id, r.id, p.permission
    FROM roles r
    CROSS JOIN (
      VALUES
        ('ops.dpr.view_own'),
        ('ops.dpr.create'),
        ('ops.performance.view_own')
    ) AS p(permission)
    WHERE r.is_default = true
    ON CONFLICT (role_id, permission) DO NOTHING
  `.execute(db);

  // Manager system role template per workspace (idempotent by name+is_system)
  await sql`
    INSERT INTO roles (
      workspace_id, name, description, color, is_system, grants_all, is_default, rank
    )
    SELECT
      w.id,
      'Manager',
      'Team lead: tasks, team targets, DPR review, team performance.',
      '#0f766e',
      true,
      false,
      false,
      50
    FROM workspaces w
    WHERE NOT EXISTS (
      SELECT 1 FROM roles r
      WHERE r.workspace_id = w.id
        AND r.name = 'Manager'
        AND r.is_system = true
    )
  `.execute(db);

  await sql`
    INSERT INTO role_permissions (workspace_id, role_id, permission)
    SELECT r.workspace_id, r.id, p.permission
    FROM roles r
    CROSS JOIN (
      VALUES
        ('ops.employees.view'),
        ('ops.tasks.view'),
        ('ops.tasks.manage'),
        ('ops.tasks.assign'),
        ('ops.targets.view_own'),
        ('ops.targets.view_team'),
        ('ops.dpr.view_own'),
        ('ops.dpr.create'),
        ('ops.dpr.view_team'),
        ('ops.dpr.review'),
        ('ops.performance.view_own'),
        ('ops.performance.view_team')
    ) AS p(permission)
    WHERE r.name = 'Manager'
      AND r.is_system = true
      AND r.grants_all = false
    ON CONFLICT (role_id, permission) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS ops_commission_hook_events CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS dpr_review_events CASCADE`.execute(db);
  await sql`DROP TABLE IF EXISTS dpr_entries CASCADE`.execute(db);

  await sql`
    DELETE FROM role_permissions
    WHERE permission IN (
      'ops.dpr.view_own',
      'ops.dpr.create',
      'ops.dpr.view_team',
      'ops.dpr.review',
      'ops.performance.view_own',
      'ops.performance.view_team',
      'ops.performance.view_department',
      'ops.performance.view_company',
      'ops.commission_hooks.view'
    )
  `.execute(db);
}
