/**
 * Phase 6.5 — Automation module entitlement backfill.
 *
 * Root cause: workspaces seeded before AUTOMATION_MODULE entered MODULE_REGISTRY
 * never received a workspace_modules row (seed uses ON CONFLICT DO NOTHING).
 * Sidebar injects /automation* keys, then isEnabled('automation') hides children
 * when the row is missing (missing top-level module ⇒ false).
 *
 * Policy (canonical):
 * - Source of truth for defaults = ModuleDefinition.defaultEnabled on MODULE_REGISTRY
 * - AUTOMATION_MODULE.defaultEnabled === true
 * - Insert enabled=true ONLY when the row is missing
 * - Never overwrite an existing row (intentional disable must stick)
 * - Member role (is_default) gets automation:* permissions with defaultRoles including 'member'
 * - Administrator grants_all is unaffected
 */
import { type Kysely, sql } from 'kysely';

/** Member-facing Automation permissions (matches AUTOMATION_MODULE defaultRoles). */
export const AUTOMATION_MEMBER_PERMISSIONS = [
  'automation:workflows:view',
  'automation:runs:view',
  'automation:approvals:view',
] as const;

/** Whether a missing workspace_modules row should be inserted as enabled. */
export function shouldBackfillAutomationModule(existingEnabled: boolean | undefined): boolean {
  // Only when absent. Explicit false/true rows are left alone.
  return existingEnabled === undefined;
}

/** Inserted enabled value when backfilling — registry defaultEnabled. */
export function automationBackfillEnabledValue(): boolean {
  return true;
}

/**
 * Pure nav gate mirroring client ModulesContext + Sidebar permission check.
 * Zero workflows must NOT affect visibility.
 */
export function automationSidebarChildrenVisible(opts: {
  moduleRowEnabled: boolean | undefined;
  hasWorkflowsViewPermission: boolean;
  workflowCount?: number;
}): boolean {
  void opts.workflowCount; // explicitly irrelevant
  const moduleOn = opts.moduleRowEnabled ?? false;
  return moduleOn && opts.hasWorkflowsViewPermission;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // 1) Module entitlement for every workspace missing the automation row
  await sql`
    insert into workspace_modules (workspace_id, module_id, enabled)
    select w.id, 'automation', true
    from workspaces w
    where not exists (
      select 1
      from workspace_modules wm
      where wm.workspace_id = w.id
        and wm.module_id = 'automation'
    )
    on conflict (workspace_id, module_id) do nothing
  `.execute(db);

  // 2) Member (is_default) roles get view-level automation permissions
  await sql`
    insert into role_permissions (workspace_id, role_id, permission)
    select r.workspace_id, r.id, p.permission
    from roles r
    cross join (
      values
        ('automation:workflows:view'),
        ('automation:runs:view'),
        ('automation:approvals:view')
    ) as p(permission)
    where r.is_default = true
    on conflict (role_id, permission) do nothing
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Do not delete workspace_modules.automation — may reflect intentional entitlement.
  // Only remove permissions this migration introduced for default member roles.
  await sql`
    delete from role_permissions
    where permission in (
      'automation:workflows:view',
      'automation:runs:view',
      'automation:approvals:view'
    )
    and role_id in (select id from roles where is_default = true)
  `.execute(db);
}
