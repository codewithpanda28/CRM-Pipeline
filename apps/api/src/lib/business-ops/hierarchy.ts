/**
 * Org hierarchy helpers — cycle detection and managed subtree.
 * Pure functions + thin DB loaders.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export function wouldCreateManagerCycle(
  edges: Map<string, string | null>,
  employeeId: string,
  newManagerId: string | null,
): boolean {
  if (!newManagerId) return false;
  if (newManagerId === employeeId) return true;
  let cursor: string | null = newManagerId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === employeeId) return true;
    if (seen.has(cursor)) return true; // corrupt cycle already present
    seen.add(cursor);
    cursor = edges.get(cursor) ?? null;
  }
  return false;
}

/** Collect employee ids in the subtree rooted at managerId (inclusive). */
export function collectSubtreeIds(
  edges: Map<string, string | null>,
  managerId: string,
): Set<string> {
  const childrenByManager = new Map<string, string[]>();
  for (const [empId, mgrId] of edges) {
    if (!mgrId) continue;
    const list = childrenByManager.get(mgrId) ?? [];
    list.push(empId);
    childrenByManager.set(mgrId, list);
  }
  const out = new Set<string>([managerId]);
  const stack = [managerId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of childrenByManager.get(cur) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

export async function loadManagerEdges(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<Map<string, string | null>> {
  const rows = await db
    .selectFrom('employee_profiles')
    .select(['id', 'manager_employee_id'])
    .where('workspace_id', '=', workspaceId)
    .execute();
  const map = new Map<string, string | null>();
  for (const r of rows) {
    map.set(r.id, r.manager_employee_id);
  }
  return map;
}

export async function getEmployeeByUserId(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
) {
  return db
    .selectFrom('employee_profiles')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
}

export async function getManagedUserIds(
  db: Kysely<Database>,
  workspaceId: string,
  managerEmployeeId: string,
): Promise<string[]> {
  const edges = await loadManagerEdges(db, workspaceId);
  const subtree = collectSubtreeIds(edges, managerEmployeeId);
  const profiles = await db
    .selectFrom('employee_profiles')
    .select(['id', 'user_id'])
    .where('workspace_id', '=', workspaceId)
    .where('id', 'in', [...subtree])
    .execute();
  return profiles.map((p) => p.user_id);
}
