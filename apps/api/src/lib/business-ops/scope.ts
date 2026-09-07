/**
 * Ops visibility scope — own / team / department / company.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import {
  collectSubtreeIds,
  getEmployeeByUserId,
  loadManagerEdges,
} from './hierarchy';

export type OpsScopeMode = 'own' | 'team' | 'department' | 'company';

export interface OpsScopeRequest {
  workspaceId: string;
  userId: string;
  isAdmin: boolean;
  permissions: Set<string>;
  /** Requested scope from query; may be downgraded */
  requested?: 'mine' | 'team' | 'all' | OpsScopeMode;
}

export interface OpsScopeResult {
  mode: OpsScopeMode;
  /** User ids in scope (assignees). null = entire tenant */
  userIds: string[] | null;
  /** Employee profile ids in scope. null = entire tenant */
  employeeIds: string[] | null;
  selfEmployeeId: string | null;
  departmentId: string | null;
}

function normalizeRequested(
  requested: OpsScopeRequest['requested'],
): OpsScopeMode {
  if (!requested || requested === 'mine') return 'own';
  if (requested === 'all') return 'company';
  if (requested === 'team' || requested === 'department' || requested === 'company' || requested === 'own') {
    return requested;
  }
  return 'own';
}

export function canUseScopeMode(
  mode: OpsScopeMode,
  opts: { isAdmin: boolean; permissions: Set<string> },
): boolean {
  if (opts.isAdmin) return true;
  if (mode === 'own') {
    return (
      opts.permissions.has('ops.tasks.view') ||
      opts.permissions.has('ops.performance.view_own') ||
      opts.permissions.has('ops.targets.view_own') ||
      opts.permissions.has('ops.dpr.view_own')
    );
  }
  if (mode === 'team') {
    return (
      opts.permissions.has('ops.tasks.assign') ||
      opts.permissions.has('ops.targets.view_team') ||
      opts.permissions.has('ops.performance.view_team') ||
      opts.permissions.has('ops.dpr.view_team')
    );
  }
  if (mode === 'department') {
    return (
      opts.permissions.has('ops.targets.view_department') ||
      opts.permissions.has('ops.performance.view_department')
    );
  }
  return (
    opts.permissions.has('ops.targets.view_company') ||
    opts.permissions.has('ops.performance.view_company')
  );
}

/** Pure: pick highest allowed mode ≤ requested. */
export function resolveRequestedScopeMode(
  requested: OpsScopeMode,
  opts: { isAdmin: boolean; permissions: Set<string> },
): OpsScopeMode {
  const order: OpsScopeMode[] = ['own', 'team', 'department', 'company'];
  const wantIdx = order.indexOf(requested);
  for (let i = wantIdx; i >= 0; i--) {
    const m = order[i]!;
    if (canUseScopeMode(m, opts)) return m;
  }
  return 'own';
}

export async function resolveOpsScope(
  db: Kysely<Database>,
  req: OpsScopeRequest,
): Promise<OpsScopeResult> {
  const requested = normalizeRequested(req.requested);
  const mode = resolveRequestedScopeMode(requested, {
    isAdmin: req.isAdmin,
    permissions: req.permissions,
  });

  const self = await getEmployeeByUserId(db, req.workspaceId, req.userId);
  const selfEmployeeId = self?.id ?? null;
  const departmentId = self?.primary_department_id ?? null;

  if (mode === 'company') {
    return {
      mode,
      userIds: null,
      employeeIds: null,
      selfEmployeeId,
      departmentId,
    };
  }

  if (mode === 'own' || !self) {
    return {
      mode: 'own',
      userIds: [req.userId],
      employeeIds: selfEmployeeId ? [selfEmployeeId] : [],
      selfEmployeeId,
      departmentId,
    };
  }

  if (mode === 'department' && departmentId) {
    const emps = await db
      .selectFrom('employee_profiles')
      .select(['id', 'user_id'])
      .where('workspace_id', '=', req.workspaceId)
      .where('primary_department_id', '=', departmentId)
      .where('status', '=', 'active')
      .execute();
    return {
      mode,
      userIds: emps.map((e) => e.user_id),
      employeeIds: emps.map((e) => e.id),
      selfEmployeeId,
      departmentId,
    };
  }

  // team = managed subtree inclusive
  const edges = await loadManagerEdges(db, req.workspaceId);
  const subtree = collectSubtreeIds(edges, self.id);
  const profiles = await db
    .selectFrom('employee_profiles')
    .select(['id', 'user_id'])
    .where('workspace_id', '=', req.workspaceId)
    .where('id', 'in', [...subtree])
    .execute();

  return {
    mode: 'team',
    userIds: profiles.map((p) => p.user_id),
    employeeIds: profiles.map((p) => p.id),
    selfEmployeeId,
    departmentId,
  };
}
