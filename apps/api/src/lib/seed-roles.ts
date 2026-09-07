import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { getDefaultPermissionsForRole, OPS_MANAGER_PERMISSIONS } from '@vencore/modules';

export interface SeededRoles {
  adminRoleId: string;
  memberRoleId: string;
  managerRoleId?: string;
}

/**
 * Ensure the workspace Member (is_default) role has every current
 * getDefaultPermissionsForRole('member') key. Idempotent.
 * Fixes roles created before new modules (e.g. automation) were registered.
 */
export async function ensureMemberDefaultPermissions(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
  memberRoleId: string,
): Promise<void> {
  const memberPermissions = getDefaultPermissionsForRole('member');
  if (memberPermissions.length === 0) return;
  await db
    .insertInto('role_permissions')
    .values(
      memberPermissions.map((permission) => ({
        workspace_id: workspaceId,
        role_id: memberRoleId,
        permission,
      })),
    )
    .onConflict((oc) => oc.columns(['role_id', 'permission']).doNothing())
    .execute();
}

/**
 * Ensure system Manager role template exists with OPS_MANAGER_PERMISSIONS.
 * Does not assign the role to any user. Never flips intentional disables.
 */
export async function ensureManagerRoleTemplate(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
): Promise<string> {
  let manager = await db
    .selectFrom('roles')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('name', '=', 'Manager')
    .where('is_system', '=', true)
    .executeTakeFirst();

  if (!manager) {
    manager = await db
      .insertInto('roles')
      .values({
        workspace_id: workspaceId,
        name: 'Manager',
        description: 'Team lead: tasks, team targets, DPR review, team performance.',
        color: '#0f766e',
        is_system: true,
        grants_all: false,
        is_default: false,
        rank: 50,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
  }

  if ((OPS_MANAGER_PERMISSIONS?.length ?? 0) > 0) {
    await db
      .insertInto('role_permissions')
      .values(
        [...OPS_MANAGER_PERMISSIONS].map((permission) => ({
          workspace_id: workspaceId,
          role_id: manager!.id,
          permission,
        })),
      )
      .onConflict((oc) => oc.columns(['role_id', 'permission']).doNothing())
      .execute();
  }

  return manager.id;
}

/**
 * Seeds the two system roles every workspace needs: Administrator (grants_all)
 * and Member (is_default). Idempotent — returns existing IDs if already seeded.
 * Always syncs Member default permissions for newly registered modules.
 */
export async function seedWorkspaceRoles(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
): Promise<SeededRoles> {
  const existingAdmin = await db
    .selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('grants_all', '=', true)
    .select('id')
    .executeTakeFirst();
  const existingMember = await db
    .selectFrom('roles')
    .where('workspace_id', '=', workspaceId)
    .where('is_default', '=', true)
    .select('id')
    .executeTakeFirst();

  const admin = existingAdmin ?? await db
    .insertInto('roles')
    .values({
      workspace_id: workspaceId,
      name: 'Administrator',
      description: 'Full access to everything.',
      color: '#1e3a8a',
      is_system: true,
      grants_all: true,
      rank: 100,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const member = existingMember ?? await db
    .insertInto('roles')
    .values({
      workspace_id: workspaceId,
      name: 'Member',
      description: 'Baseline access.',
      color: '#2d6a4f',
      is_system: true,
      is_default: true,
      rank: 0,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  await ensureMemberDefaultPermissions(db, workspaceId, member.id);
  const managerRoleId = await ensureManagerRoleTemplate(db, workspaceId);

  return { adminRoleId: admin.id, memberRoleId: member.id, managerRoleId };
}
