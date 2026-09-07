/**
 * Business Operations Round 1+2 — org / today / targets / performance / DPR APIs.
 * Mounted at /api/ops under requireModule('ops').
 * Does NOT replace platform ops (export/outbox) routes.
 */
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { recordSecurityAudit } from '../lib/security-audit';
import { logActivity } from '../lib/log-activity';
import {
  wouldCreateManagerCycle,
  loadManagerEdges,
  getEmployeeByUserId,
  getManagedUserIds,
  collectSubtreeIds,
} from '../lib/business-ops/hierarchy';
import {
  BUSINESS_TASK_TYPES,
  BUSINESS_TASK_PRIORITIES,
  mapBusinessToStoredStatus,
  mapStoredToBusinessStatus,
  toLegacyTodoDone,
  isOpenBusinessStatus,
  nextDueFromFrequency,
  computeRemaining,
  computeTargetPct,
} from '../lib/business-ops/task-mapping';
import { TARGET_METRICS, calculateMetricActual, CALCULATOR_VERSION } from '../lib/business-ops/metrics';
import { periodWindow, assertPeriodOpen, type PeriodGranularity } from '../lib/business-ops/periods';
import { resolveOpsScope } from '../lib/business-ops/scope';
import { enrichTasksWithContext } from '../lib/business-ops/task-context';
import { validateTaskScheduling } from '../lib/crm/task-scheduling';
import { sortMyTasks } from '../lib/crm/my-tasks-sort';
import {
  buildPerformanceRows,
  resolveAllowedPerformanceSubjects,
} from '../lib/business-ops/performance';
import { registerDprRoutes } from './business-ops-dpr';

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

async function audit(
  db: Kysely<Database>,
  req: AuthenticatedRequest,
  action: string,
  entity_type: string,
  entity_id: string | null,
  meta: Record<string, unknown> = {},
) {
  await recordSecurityAudit(db, {
    tenant_id: req.workspace.id,
    actor_type: 'user',
    actor_id: req.user.id,
    action,
    entity_type,
    entity_id,
    ip: (req as any).ip ?? null,
    user_agent: req.get?.('user-agent') ?? null,
    meta,
  });
}

async function resolveTaskAssigneeScope(
  db: Kysely<Database>,
  req: AuthenticatedRequest,
): Promise<{ mode: 'all' } | { mode: 'users'; userIds: string[] }> {
  if (req.isAdmin || req.permissions.has('ops.targets.view_company')) {
    return { mode: 'all' };
  }
  const emp = await getEmployeeByUserId(db, req.workspace.id, req.user.id);
  if (!emp) return { mode: 'users', userIds: [req.user.id] };

  const canTeam =
    req.permissions.has('ops.tasks.assign') ||
    req.permissions.has('ops.targets.view_team') ||
    req.permissions.has('ops.targets.view_department');

  if (canTeam) {
    const ids = await getManagedUserIds(db, req.workspace.id, emp.id);
    return { mode: 'users', userIds: [...new Set([req.user.id, ...ids])] };
  }
  return { mode: 'users', userIds: [req.user.id] };
}

export function createBusinessOpsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): Router {
  const router = Router();

  // ── Departments ────────────────────────────────────────────────────
  router.get('/departments', requirePermission('ops.employees.view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      const rows = await db
        .selectFrom('departments')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .orderBy('name')
        .execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/departments', requirePermission('ops.departments.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({ name: z.string().min(1), status: z.enum(['active', 'inactive']).optional() })
        .parse(req.body);
      const row = await db
        .insertInto('departments')
        .values({
          workspace_id: auth.workspace.id,
          name: body.name.trim(),
          status: body.status ?? 'active',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(db, auth, 'ops.department.create', 'department', row.id, { name: row.name });
      res.status(201).json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/departments/:id', requirePermission('ops.departments.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          name: z.string().min(1).optional(),
          status: z.enum(['active', 'inactive']).optional(),
        })
        .parse(req.body);
      const row = await db
        .updateTable('departments')
        .set({ ...body, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Department not found');
      await audit(db, auth, 'ops.department.update', 'department', row.id, body);
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  // ── Teams ──────────────────────────────────────────────────────────
  router.get('/teams', requirePermission('ops.employees.view'), async (req, res, next) => {
    try {
      const { workspace } = req as AuthenticatedRequest;
      let q = db
        .selectFrom('teams')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .orderBy('name');
      const dept = typeof req.query['department_id'] === 'string' ? req.query['department_id'] : null;
      if (dept) q = q.where('department_id', '=', dept);
      res.json({ data: await q.execute(), error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/teams', requirePermission('ops.departments.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          name: z.string().min(1),
          department_id: z.string().uuid(),
          status: z.enum(['active', 'inactive']).optional(),
        })
        .parse(req.body);
      const dept = await db
        .selectFrom('departments')
        .select('id')
        .where('id', '=', body.department_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!dept) return fail(res, 400, 'INVALID_DEPARTMENT', 'Department not in workspace');
      const row = await db
        .insertInto('teams')
        .values({
          workspace_id: auth.workspace.id,
          department_id: body.department_id,
          name: body.name.trim(),
          status: body.status ?? 'active',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit(db, auth, 'ops.team.create', 'team', row.id, { name: row.name });
      res.status(201).json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/teams/:id', requirePermission('ops.departments.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          name: z.string().min(1).optional(),
          status: z.enum(['active', 'inactive']).optional(),
          department_id: z.string().uuid().optional(),
        })
        .parse(req.body);
      if (body.department_id) {
        const dept = await db
          .selectFrom('departments')
          .select('id')
          .where('id', '=', body.department_id)
          .where('workspace_id', '=', auth.workspace.id)
          .executeTakeFirst();
        if (!dept) return fail(res, 400, 'INVALID_DEPARTMENT', 'Department not in workspace');
      }
      const row = await db
        .updateTable('teams')
        .set({ ...body, updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirst();
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Team not found');
      await audit(db, auth, 'ops.team.update', 'team', row.id, body);
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/teams/:id/members', requirePermission('ops.departments.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          employee_id: z.string().uuid(),
          is_primary: z.boolean().optional(),
        })
        .parse(req.body);
      const team = await db
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!team) return fail(res, 404, 'NOT_FOUND', 'Team not found');
      const emp = await db
        .selectFrom('employee_profiles')
        .select('id')
        .where('id', '=', body.employee_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!emp) return fail(res, 400, 'INVALID_EMPLOYEE', 'Employee not in workspace');

      if (body.is_primary) {
        await db
          .updateTable('team_members')
          .set({ is_primary: false })
          .where('workspace_id', '=', auth.workspace.id)
          .where('employee_id', '=', body.employee_id)
          .execute();
        await db
          .updateTable('employee_profiles')
          .set({ primary_team_id: team.id, updated_at: new Date() })
          .where('id', '=', body.employee_id)
          .where('workspace_id', '=', auth.workspace.id)
          .execute();
      }

      await db
        .insertInto('team_members')
        .values({
          workspace_id: auth.workspace.id,
          team_id: team.id,
          employee_id: body.employee_id,
          is_primary: body.is_primary ?? false,
        })
        .onConflict((oc) =>
          oc.columns(['team_id', 'employee_id']).doUpdateSet({
            is_primary: body.is_primary ?? false,
          }),
        )
        .execute();

      await audit(db, auth, 'ops.team.member_add', 'team', team.id, body);
      res.status(201).json({ data: { team_id: team.id, ...body }, error: null });
    } catch (e) {
      next(e);
    }
  });

  // ── Employees ──────────────────────────────────────────────────────
  router.get('/employees', requirePermission('ops.employees.view'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      let q = db
        .selectFrom('employee_profiles')
        .selectAll()
        .where('workspace_id', '=', auth.workspace.id)
        .orderBy('display_name');

      // Non-admins without company view: own + managed subtree only
      if (!auth.isAdmin && !auth.permissions.has('ops.targets.view_company')) {
        const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
        if (!self) {
          res.json({ data: [], error: null });
          return;
        }
        const edges = await loadManagerEdges(db, auth.workspace.id);
        const canTeam = auth.permissions.has('ops.targets.view_team') || auth.permissions.has('ops.tasks.assign');
        const ids = canTeam ? [...collectSubtreeIds(edges, self.id)] : [self.id];
        q = q.where('id', 'in', ids);
      }

      res.json({ data: await q.execute(), error: null });
    } catch (e) {
      next(e);
    }
  });

  /**
   * Assignees permitted for task reassign/create.
   * Empty when caller lacks ops.tasks.assign (non-admin).
   * Admin → all active employees; assign → managed subtree (incl. self).
   */
  router.get('/employees/assignable', requirePermission('ops.tasks.view'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      if (!auth.isAdmin && !auth.permissions.has('ops.tasks.assign')) {
        res.json({ data: [], error: null });
        return;
      }

      let q = db
        .selectFrom('employee_profiles')
        .select(['id', 'user_id', 'display_name', 'status', 'manager_employee_id'])
        .where('workspace_id', '=', auth.workspace.id)
        .where('status', '=', 'active')
        .orderBy('display_name');

      if (!auth.isAdmin) {
        const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
        if (!self) {
          res.json({ data: [], error: null });
          return;
        }
        const edges = await loadManagerEdges(db, auth.workspace.id);
        const ids = [...collectSubtreeIds(edges, self.id)];
        q = q.where('id', 'in', ids);
      }

      res.json({ data: await q.execute(), error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/employees/me', requirePermission('ops.employees.view'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const row = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
      res.json({ data: row ?? null, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/employees', requirePermission('ops.employees.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          user_id: z.string().uuid(),
          display_name: z.string().min(1).optional(),
          employee_code: z.string().nullable().optional(),
          designation: z.string().nullable().optional(),
          primary_department_id: z.string().uuid().nullable().optional(),
          primary_team_id: z.string().uuid().nullable().optional(),
          manager_employee_id: z.string().uuid().nullable().optional(),
          joined_on: z.string().nullable().optional(),
          status: z.enum(['active', 'inactive']).optional(),
          work_email: z.string().nullable().optional(),
          work_phone: z.string().nullable().optional(),
          commission_eligible: z.boolean().optional(),
        })
        .parse(req.body);

      const user = await db
        .selectFrom('users')
        .select(['id', 'name', 'email', 'workspace_id'])
        .where('id', '=', body.user_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!user) return fail(res, 400, 'INVALID_USER', 'User not in workspace');

      if (body.manager_employee_id) {
        const edges = await loadManagerEdges(db, auth.workspace.id);
        // provisional id unknown — check after insert via update path; for create use temp
        edges.set('__new__', body.manager_employee_id);
        // can't cycle on create without own id; validate manager exists
        const mgr = await db
          .selectFrom('employee_profiles')
          .select('id')
          .where('id', '=', body.manager_employee_id)
          .where('workspace_id', '=', auth.workspace.id)
          .executeTakeFirst();
        if (!mgr) return fail(res, 400, 'INVALID_MANAGER', 'Manager not in workspace');
      }

      const row = await db
        .insertInto('employee_profiles')
        .values({
          workspace_id: auth.workspace.id,
          user_id: body.user_id,
          display_name: body.display_name ?? user.name ?? user.email,
          employee_code: body.employee_code ?? null,
          designation: body.designation ?? null,
          primary_department_id: body.primary_department_id ?? null,
          primary_team_id: body.primary_team_id ?? null,
          manager_employee_id: body.manager_employee_id ?? null,
          joined_on: body.joined_on ? new Date(body.joined_on) : null,
          status: body.status ?? 'active',
          work_email: body.work_email ?? user.email,
          work_phone: body.work_phone ?? null,
          commission_eligible: body.commission_eligible ?? false,
        })
        .onConflict((oc) => oc.columns(['workspace_id', 'user_id']).doNothing())
        .returningAll()
        .executeTakeFirst();

      const final =
        row ??
        (await getEmployeeByUserId(db, auth.workspace.id, body.user_id));

      if (!final) return fail(res, 409, 'CONFLICT', 'Could not create employee profile');
      await audit(db, auth, 'ops.employee.create', 'employee_profile', final.id, { user_id: body.user_id });
      res.status(201).json({ data: final, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/employees/:id', requirePermission('ops.employees.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          display_name: z.string().min(1).optional(),
          employee_code: z.string().nullable().optional(),
          designation: z.string().nullable().optional(),
          primary_department_id: z.string().uuid().nullable().optional(),
          primary_team_id: z.string().uuid().nullable().optional(),
          manager_employee_id: z.string().uuid().nullable().optional(),
          joined_on: z.string().nullable().optional(),
          status: z.enum(['active', 'inactive']).optional(),
          work_email: z.string().nullable().optional(),
          work_phone: z.string().nullable().optional(),
          commission_eligible: z.boolean().optional(),
        })
        .parse(req.body);

      const current = await db
        .selectFrom('employee_profiles')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Employee not found');

      if (body.manager_employee_id !== undefined) {
        const edges = await loadManagerEdges(db, auth.workspace.id);
        if (wouldCreateManagerCycle(edges, current.id, body.manager_employee_id)) {
          return fail(res, 400, 'MANAGER_CYCLE', 'Manager assignment would create a cycle');
        }
        if (body.manager_employee_id !== current.manager_employee_id) {
          await db
            .insertInto('employee_reporting_history')
            .values({
              workspace_id: auth.workspace.id,
              employee_id: current.id,
              from_manager_id: current.manager_employee_id,
              to_manager_id: body.manager_employee_id,
              effective_at: new Date(),
              changed_by: auth.user.id,
            })
            .execute();
          await audit(db, auth, 'ops.employee.manager_changed', 'employee_profile', current.id, {
            from: current.manager_employee_id,
            to: body.manager_employee_id,
          });
        }
      }

      const row = await db
        .updateTable('employee_profiles')
        .set({
          ...body,
          joined_on: body.joined_on === undefined ? undefined : body.joined_on ? new Date(body.joined_on) : null,
          updated_at: new Date(),
        })
        .where('id', '=', current.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await audit(db, auth, 'ops.employee.update', 'employee_profile', row.id, body);
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  // ── Today / My Work / Tasks ────────────────────────────────────────
  async function listBusinessTasks(
    auth: AuthenticatedRequest,
    opts: {
      openOnly?: boolean;
      highPriority?: boolean;
      scopeOverride?: 'mine' | 'team' | 'all' | 'own' | 'department' | 'company';
      type?: string;
      priority?: string;
      status?: string;
      forceAssigneeUserId?: string;
    } = {},
  ) {
    let userFilter: string[] | null = null; // null = all tenant

    if (opts.forceAssigneeUserId) {
      userFilter = [opts.forceAssigneeUserId];
    } else if (opts.scopeOverride) {
      const opsScope = await resolveOpsScope(db, {
        workspaceId: auth.workspace.id,
        userId: auth.user.id,
        isAdmin: auth.isAdmin,
        permissions: auth.permissions,
        requested: opts.scopeOverride,
      });
      userFilter = opsScope.userIds;
    } else {
      const scope = await resolveTaskAssigneeScope(db, auth);
      userFilter = scope.mode === 'all' ? null : scope.userIds;
    }

    let q = db
      .selectFrom('tasks')
      .selectAll()
      .where('workspace_id', '=', auth.workspace.id)
      .orderBy('priority', 'desc')
      .orderBy('due_at', 'asc')
      .orderBy('due_date', 'asc');

    if (userFilter !== null) {
      q = q.where('assignee_id', 'in', userFilter.length ? userFilter : ['00000000-0000-0000-0000-000000000000']);
    }
    if (opts.type) q = q.where('task_type', '=', opts.type as any);
    if (opts.priority) q = q.where('priority', '=', opts.priority as any);

    const rows = await q.execute();
    return rows
      .filter((t) => {
        if (opts.openOnly && !isOpenBusinessStatus(t.status)) return false;
        if (opts.highPriority && t.priority !== 'URGENT' && t.priority !== 'HIGH') return false;
        if (opts.status) {
          const biz = mapStoredToBusinessStatus(t.status);
          if (biz !== opts.status && t.status !== opts.status) return false;
        }
        return true;
      })
      .map((t) => ({
        ...t,
        status_business: mapStoredToBusinessStatus(t.status),
        status_legacy: toLegacyTodoDone(t.status),
        due: t.due_at ?? t.due_date,
      }));
  }

  function bucketTasks(tasks: Awaited<ReturnType<typeof listBusinessTasks>>) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const end = new Date(start.getTime() + 86400000);
    const week = new Date(start.getTime() + 7 * 86400000);
    const overdue: typeof tasks = [];
    const today: typeof tasks = [];
    const upcoming: typeof tasks = [];
    const high_priority: typeof tasks = [];
    for (const t of tasks) {
      if (!isOpenBusinessStatus(t.status)) continue;
      if (t.priority === 'URGENT' || t.priority === 'HIGH') high_priority.push(t);
      const due = t.due ? new Date(t.due) : null;
      if (!due) {
        upcoming.push(t);
        continue;
      }
      if (due < start) overdue.push(t);
      else if (due < end) today.push(t);
      else if (due < week) upcoming.push(t);
      else upcoming.push(t);
    }
    return { overdue, today, upcoming, high_priority };
  }

  router.get('/today', requirePermission('ops.tasks.view'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const scopeQ = typeof req.query.scope === 'string' ? req.query.scope : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const tasks = await listBusinessTasks(auth, {
        openOnly: true,
        scopeOverride: scopeQ as any,
        type,
        priority,
      });
      const enriched = await enrichTasksWithContext(db, auth.workspace.id, tasks);
      const buckets = bucketTasks(enriched as any);
      // re-attach context onto bucketed rows
      const byId = new Map(enriched.map((t) => [t.id, t]));
      const withCtx = (arr: typeof tasks) =>
        arr.map((t) => byId.get(t.id) ?? { ...t, context: [] });
      res.json({
        data: {
          overdue: withCtx(buckets.overdue),
          today: withCtx(buckets.today),
          upcoming: withCtx(buckets.upcoming),
          high_priority: withCtx(buckets.high_priority),
          scope: scopeQ ?? 'default',
        },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/my-work', requirePermission('ops.tasks.view'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      const mapped = await listBusinessTasks(auth, {
        forceAssigneeUserId: auth.user.id,
        type,
        priority,
        status,
      });
      const enriched = await enrichTasksWithContext(db, auth.workspace.id, mapped);
      res.json({
        data: {
          open: enriched.filter((t) => isOpenBusinessStatus(t.status)),
          done: enriched.filter((t) => mapStoredToBusinessStatus(t.status) === 'done'),
          buckets: bucketTasks(enriched as any),
        },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/tasks', requirePermission('ops.tasks.view'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const scopeQ = typeof req.query.scope === 'string' ? req.query.scope : undefined;
      const type = typeof req.query.type === 'string' ? req.query.type : undefined;
      const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const includeDone = req.query['include_done'] === '1' || status === 'done' || status === 'cancelled';
      const tasks = await listBusinessTasks(auth, {
        scopeOverride: scopeQ as any,
        type,
        priority,
        status,
        openOnly: !includeDone && !status,
      });
      const enriched = await enrichTasksWithContext(db, auth.workspace.id, tasks);
      const sorted = sortMyTasks(enriched as any);
      res.json({ data: sorted, error: null });
    } catch (e) {
      next(e);
    }
  });

  const taskBodySchema = z.object({
    title: z.string().min(1),
    task_type: z.enum(BUSINESS_TASK_TYPES as unknown as [string, ...string[]]).optional(),
    priority: z.enum(BUSINESS_TASK_PRIORITIES as unknown as [string, ...string[]]).optional(),
    assignee_id: z.string().uuid().optional(),
    due_at: z.string().optional(),
    due_date: z.string().optional(),
    body: z.string().nullable().optional(),
    related_lead_id: z.string().uuid().nullable().optional(),
    related_customer_party_id: z.string().uuid().nullable().optional(),
    related_deal_id: z.string().uuid().nullable().optional(),
    related_quote_id: z.string().uuid().nullable().optional(),
    related_invoice_id: z.string().uuid().nullable().optional(),
    reminder_at: z.string().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    record_id: z.string().uuid().nullable().optional(),
    scheduling_mode: z.enum(['unbounded', 'time_bound']).optional(),
    start_at: z.string().nullable().optional(),
    end_at: z.string().nullable().optional(),
    duration_minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
    timezone: z.string().min(1).max(64).nullable().optional(),
    meeting_mode: z.enum(['online', 'offline']).nullable().optional(),
    location: z.string().max(500).nullable().optional(),
    recurrence: z
      .object({
        frequency: z.enum(['daily', 'weekly', 'monthly']),
        interval_n: z.number().int().min(1).max(30).optional(),
      })
      .optional(),
  });

  router.post('/tasks', requirePermission('ops.tasks.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = taskBodySchema.parse(req.body);
      let assigneeId = body.assignee_id ?? auth.user.id;

      if (assigneeId !== auth.user.id) {
        const canAssign = auth.isAdmin || auth.permissions.has('ops.tasks.assign');
        if (!canAssign) return fail(res, 403, 'FORBIDDEN', 'Cannot assign tasks');
        if (!auth.isAdmin) {
          const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
          if (!self) return fail(res, 403, 'FORBIDDEN', 'No employee profile');
          const managed = await getManagedUserIds(db, auth.workspace.id, self.id);
          if (!managed.includes(assigneeId) && assigneeId !== auth.user.id) {
            return fail(res, 403, 'FORBIDDEN', 'Assignee outside managed subtree');
          }
        }
      }

      const dueAt = body.due_at
        ? new Date(body.due_at)
        : body.due_date
          ? new Date(body.due_date)
          : null;

      const scheduling = validateTaskScheduling({
        scheduling_mode: body.scheduling_mode,
        start_at: body.start_at,
        end_at: body.end_at,
        duration_minutes: body.duration_minutes,
        timezone: body.timezone,
        meeting_mode: body.meeting_mode,
        location: body.location,
      });
      if (!scheduling.ok) {
        return fail(res, 400, scheduling.code, scheduling.message);
      }

      const task = await db
        .insertInto('tasks')
        .values({
          workspace_id: auth.workspace.id,
          title: body.title,
          assignee_id: assigneeId,
          assigned_by_id: auth.user.id,
          status: 'open',
          task_type: (body.task_type as any) ?? 'follow_up',
          priority: (body.priority as any) ?? 'MEDIUM',
          due_at: dueAt,
          due_date: dueAt,
          body: body.body ?? null,
          related_lead_id: body.related_lead_id ?? null,
          related_customer_party_id: body.related_customer_party_id ?? null,
          related_deal_id: body.related_deal_id ?? null,
          related_quote_id: body.related_quote_id ?? null,
          related_invoice_id: body.related_invoice_id ?? null,
          reminder_at: body.reminder_at ? new Date(body.reminder_at) : null,
          contact_id: body.contact_id ?? null,
          record_id: body.record_id ?? null,
          ...(scheduling.values as {
            scheduling_mode: 'unbounded' | 'time_bound';
            start_at: Date | null;
            end_at: Date | null;
            duration_minutes: number | null;
            timezone: string | null;
            meeting_mode: 'online' | 'offline' | null;
            location: string | null;
          }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const isMeeting =
        (body.task_type as string | undefined) === 'meeting' ||
        body.scheduling_mode === 'time_bound';
      void logActivity(db, {
        workspace_id: auth.workspace.id,
        user_id: auth.user.id,
        type: isMeeting ? 'meeting_scheduled' : 'task_created',
        source_module_id: 'crm',
        body: task.title,
        record_id: body.related_deal_id ?? body.record_id ?? undefined,
        meta: {
          task_id: task.id,
          assignee_id: task.assignee_id,
          related_lead_id: body.related_lead_id ?? null,
          related_customer_party_id: body.related_customer_party_id ?? null,
          related_deal_id: body.related_deal_id ?? null,
          scheduling_mode: scheduling.values['scheduling_mode'],
          meeting_mode: scheduling.values['meeting_mode'],
          reminders: isMeeting ? ['T-24h', 'T-2h', 'T-30m'] : null,
        },
      });

      if (body.recurrence) {
        const next = dueAt
          ? nextDueFromFrequency(dueAt, body.recurrence.frequency, body.recurrence.interval_n ?? 1)
          : null;
        const rule = await db
          .insertInto('business_task_recurrence_rules')
          .values({
            workspace_id: auth.workspace.id,
            task_id: task.id,
            frequency: body.recurrence.frequency,
            interval_n: body.recurrence.interval_n ?? 1,
            next_run_at: next,
            active: true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await db
          .updateTable('tasks')
          .set({ recurrence_rule_id: rule.id })
          .where('id', '=', task.id)
          .execute();
        (task as any).recurrence_rule_id = rule.id;
      }

      if (assigneeId !== auth.user.id) {
        await audit(db, auth, 'ops.task.assigned', 'task', task.id, { assignee_id: assigneeId });
      }
      res.status(201).json({ data: task, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/tasks/:id', requirePermission('ops.tasks.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          title: z.string().min(1).optional(),
          status: z.string().optional(),
          priority: z.enum(BUSINESS_TASK_PRIORITIES as unknown as [string, ...string[]]).optional(),
          task_type: z.enum(BUSINESS_TASK_TYPES as unknown as [string, ...string[]]).optional(),
          assignee_id: z.string().uuid().optional(),
          due_at: z.string().nullable().optional(),
          body: z.string().nullable().optional(),
          completion_outcome: z.string().nullable().optional(),
          reminder_at: z.string().nullable().optional(),
          related_lead_id: z.string().uuid().nullable().optional(),
          related_customer_party_id: z.string().uuid().nullable().optional(),
          related_deal_id: z.string().uuid().nullable().optional(),
          related_quote_id: z.string().uuid().nullable().optional(),
          related_invoice_id: z.string().uuid().nullable().optional(),
        })
        .parse(req.body);

      const current = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Task not found');

      if (body.assignee_id && body.assignee_id !== current.assignee_id) {
        const canAssign = auth.isAdmin || auth.permissions.has('ops.tasks.assign');
        if (!canAssign) return fail(res, 403, 'FORBIDDEN', 'Cannot reassign');
        if (!auth.isAdmin) {
          const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
          if (!self) return fail(res, 403, 'FORBIDDEN', 'No employee profile');
          const managed = await getManagedUserIds(db, auth.workspace.id, self.id);
          if (!managed.includes(body.assignee_id) && body.assignee_id !== auth.user.id) {
            return fail(res, 403, 'FORBIDDEN', 'Assignee outside managed subtree');
          }
        }
        await audit(db, auth, 'ops.task.reassigned', 'task', current.id, {
          from: current.assignee_id,
          to: body.assignee_id,
        });
      }

      const storedStatus = body.status ? mapBusinessToStoredStatus(body.status) : undefined;
      const completing =
        storedStatus === 'done' && mapStoredToBusinessStatus(current.status) !== 'done';

      const dueAt =
        body.due_at === undefined ? undefined : body.due_at ? new Date(body.due_at) : null;

      const task = await db
        .updateTable('tasks')
        .set({
          title: body.title,
          status: storedStatus as any,
          priority: body.priority as any,
          task_type: body.task_type as any,
          assignee_id: body.assignee_id,
          due_at: dueAt,
          due_date: dueAt === undefined ? undefined : dueAt,
          body: body.body === undefined ? undefined : body.body,
          completion_outcome: body.completion_outcome === undefined ? undefined : body.completion_outcome,
          reminder_at:
            body.reminder_at === undefined
              ? undefined
              : body.reminder_at
                ? new Date(body.reminder_at)
                : null,
          related_lead_id: body.related_lead_id,
          related_customer_party_id: body.related_customer_party_id,
          related_deal_id: body.related_deal_id,
          related_quote_id: body.related_quote_id,
          related_invoice_id: body.related_invoice_id,
          completed_at: completing ? new Date() : storedStatus && storedStatus !== 'done' ? null : undefined,
          updated_at: new Date(),
        })
        .where('id', '=', current.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      if (completing) {
        await audit(db, auth, 'ops.task.completed', 'task', task.id, {
          completion_outcome: body.completion_outcome ?? null,
        });
        void logActivity(db, {
          workspace_id: auth.workspace.id,
          user_id: auth.user.id,
          type: 'task_done',
          source_module_id: 'ops',
          body: `Task completed: "${task.title}"`,
          contact_id: task.contact_id ?? undefined,
          record_id: task.record_id ?? undefined,
        });

        // Recurrence: spawn next open task once
        if (task.recurrence_rule_id) {
          const rule = await db
            .selectFrom('business_task_recurrence_rules')
            .selectAll()
            .where('id', '=', task.recurrence_rule_id)
            .where('workspace_id', '=', auth.workspace.id)
            .where('active', '=', true)
            .executeTakeFirst();
          if (rule) {
            const base = task.due_at ?? new Date();
            const nextDue = nextDueFromFrequency(base, rule.frequency, rule.interval_n);
            await db
              .insertInto('tasks')
              .values({
                workspace_id: auth.workspace.id,
                title: task.title,
                assignee_id: task.assignee_id,
                assigned_by_id: auth.user.id,
                status: 'open',
                task_type: task.task_type,
                priority: task.priority,
                due_at: nextDue,
                due_date: nextDue,
                body: task.body,
                related_lead_id: task.related_lead_id,
                related_customer_party_id: task.related_customer_party_id,
                related_deal_id: task.related_deal_id,
                related_quote_id: task.related_quote_id,
                related_invoice_id: task.related_invoice_id,
                recurrence_rule_id: rule.id,
                contact_id: task.contact_id,
                record_id: task.record_id,
              })
              .execute();
            await db
              .updateTable('business_task_recurrence_rules')
              .set({ next_run_at: nextDue, updated_at: new Date() })
              .where('id', '=', rule.id)
              .execute();
          }
        }
      }

      res.json({ data: task, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/tasks/:id/complete', requirePermission('ops.tasks.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          completion_outcome: z.string().max(2000).nullable().optional(),
        })
        .parse(req.body ?? {});

      const current = await db
        .selectFrom('tasks')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Task not found');

      if (mapStoredToBusinessStatus(current.status) === 'done') {
        res.json({ data: current, error: null });
        return;
      }

      const task = await db
        .updateTable('tasks')
        .set({
          status: 'done',
          completion_outcome: body.completion_outcome ?? current.completion_outcome,
          completed_at: new Date(),
          updated_at: new Date(),
        })
        .where('id', '=', current.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await audit(db, auth, 'ops.task.completed', 'task', task.id, {
        completion_outcome: body.completion_outcome ?? null,
      });
      void logActivity(db, {
        workspace_id: auth.workspace.id,
        user_id: auth.user.id,
        type: 'task_done',
        source_module_id: 'ops',
        body: `Task completed: "${task.title}"`,
        contact_id: task.contact_id ?? undefined,
        record_id: task.record_id ?? undefined,
      });

      if (task.recurrence_rule_id) {
        const rule = await db
          .selectFrom('business_task_recurrence_rules')
          .selectAll()
          .where('id', '=', task.recurrence_rule_id)
          .where('workspace_id', '=', auth.workspace.id)
          .where('active', '=', true)
          .executeTakeFirst();
        if (rule) {
          const base = task.due_at ?? new Date();
          const nextDue = nextDueFromFrequency(base, rule.frequency, rule.interval_n);
          await db
            .insertInto('tasks')
            .values({
              workspace_id: auth.workspace.id,
              title: task.title,
              assignee_id: task.assignee_id,
              assigned_by_id: auth.user.id,
              status: 'open',
              task_type: task.task_type,
              priority: task.priority,
              due_at: nextDue,
              due_date: nextDue,
              body: task.body,
              related_lead_id: task.related_lead_id,
              related_customer_party_id: task.related_customer_party_id,
              related_deal_id: task.related_deal_id,
              related_quote_id: task.related_quote_id,
              related_invoice_id: task.related_invoice_id,
              recurrence_rule_id: rule.id,
              contact_id: task.contact_id,
              record_id: task.record_id,
            })
            .execute();
          await db
            .updateTable('business_task_recurrence_rules')
            .set({ next_run_at: nextDue, updated_at: new Date() })
            .where('id', '=', rule.id)
            .execute();
        }
      }

      res.json({ data: task, error: null });
    } catch (e) {
      next(e);
    }
  });

  // ── Targets ────────────────────────────────────────────────────────
  router.get('/target-metrics', requirePermission('ops.targets.view_own'), async (_req, res) => {
    res.json({ data: TARGET_METRICS, error: null });
  });

  router.get('/periods', requirePermission('ops.targets.view_own'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const rows = await db
        .selectFrom('target_periods')
        .selectAll()
        .where('workspace_id', '=', auth.workspace.id)
        .orderBy('period_start', 'desc')
        .execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/periods', requirePermission('ops.targets.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          granularity: z.enum(['daily', 'weekly', 'monthly']),
          period_start: z.string().optional(),
          period_end: z.string().optional(),
        })
        .parse(req.body);

      let start: Date;
      let end: Date;
      if (body.period_start && body.period_end) {
        start = new Date(body.period_start);
        end = new Date(body.period_end);
      } else {
        const w = periodWindow(body.granularity as PeriodGranularity);
        start = w.period_start;
        end = w.period_end;
      }

      const row = await db
        .insertInto('target_periods')
        .values({
          workspace_id: auth.workspace.id,
          granularity: body.granularity,
          period_start: start,
          period_end: end,
          status: 'open',
        })
        .onConflict((oc) =>
          oc.columns(['workspace_id', 'granularity', 'period_start']).doNothing(),
        )
        .returningAll()
        .executeTakeFirst();

      const final =
        row ??
        (await db
          .selectFrom('target_periods')
          .selectAll()
          .where('workspace_id', '=', auth.workspace.id)
          .where('granularity', '=', body.granularity)
          .where('period_start', '=', start)
          .executeTakeFirstOrThrow());

      await audit(db, auth, 'ops.target_period.create', 'target_period', final.id, {});
      res.status(201).json({ data: final, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/periods/:id/close', requirePermission('ops.targets.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const period = await db
        .selectFrom('target_periods')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!period) return fail(res, 404, 'NOT_FOUND', 'Period not found');
      if (period.status === 'closed') return fail(res, 400, 'ALREADY_CLOSED', 'Period already closed');

      const targets = await db
        .selectFrom('targets')
        .selectAll()
        .where('period_id', '=', period.id)
        .where('workspace_id', '=', auth.workspace.id)
        .execute();

      for (const t of targets) {
        const actual = await calculateMetricActual(db, t.metric_key, {
          workspaceId: auth.workspace.id,
          subjectType: t.subject_type,
          subjectId: t.subject_id,
          periodStart: period.period_start,
          periodEnd: period.period_end,
        });
        const goal = Number(t.goal_value);
        await db
          .insertInto('achievement_snapshots')
          .values({
            workspace_id: auth.workspace.id,
            target_id: t.id,
            period_id: period.id,
            metric_key: t.metric_key,
            subject_type: t.subject_type,
            subject_id: t.subject_id,
            goal_value: String(goal),
            actual_value: String(actual),
            remaining: String(computeRemaining(goal, actual)),
            pct_achieved:
              computeTargetPct(goal, actual) === null
                ? null
                : String((computeTargetPct(goal, actual) as number) / 100),
            calculator_version: CALCULATOR_VERSION,
            closed_at: new Date(),
            snapshot: {},
          })
          .execute();
      }

      const closed = await db
        .updateTable('target_periods')
        .set({
          status: 'closed',
          closed_at: new Date(),
          closed_by: auth.user.id,
          updated_at: new Date(),
        })
        .where('id', '=', period.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await audit(db, auth, 'ops.target_period.close', 'target_period', period.id, {
        targets: targets.length,
      });
      res.json({ data: closed, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/targets', requirePermission('ops.targets.view_own'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const periodId = typeof req.query.period_id === 'string' ? req.query.period_id : undefined;
      const granularity =
        typeof req.query.granularity === 'string' ? req.query.granularity : undefined;
      const subjectType =
        typeof req.query.subject_type === 'string' ? req.query.subject_type : undefined;

      let q = db
        .selectFrom('targets as t')
        .innerJoin('target_periods as p', 'p.id', 't.period_id')
        .select([
          't.id',
          't.workspace_id',
          't.period_id',
          't.metric_key',
          't.subject_type',
          't.subject_id',
          't.goal_value',
          't.created_by',
          't.created_at',
          't.updated_at',
          'p.granularity',
          'p.period_start',
          'p.period_end',
          'p.status as period_status',
        ])
        .where('t.workspace_id', '=', auth.workspace.id);

      if (periodId) q = q.where('t.period_id', '=', periodId);
      if (granularity) q = q.where('p.granularity', '=', granularity as any);
      if (subjectType) q = q.where('t.subject_type', '=', subjectType as any);

      const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);

      if (!auth.isAdmin && !auth.permissions.has('ops.targets.view_company')) {
        const allowed: Array<{ type: string; id: string | null }> = [];
        if (self) allowed.push({ type: 'employee', id: self.id });
        if (auth.permissions.has('ops.targets.view_team') && self?.primary_team_id) {
          allowed.push({ type: 'team', id: self.primary_team_id });
        }
        if (auth.permissions.has('ops.targets.view_department') && self?.primary_department_id) {
          allowed.push({ type: 'department', id: self.primary_department_id });
        }
        // Filter in memory after fetch for simplicity when few rows
        const all = await q.execute();
        const filtered = all.filter((row) => {
          if (row.subject_type === 'tenant') return auth.permissions.has('ops.targets.view_company');
          return allowed.some((a) => a.type === row.subject_type && a.id === row.subject_id);
        });
        const withActuals = await Promise.all(
          filtered.map(async (row) => {
            if (row.period_status === 'closed') {
              const snap = await db
                .selectFrom('achievement_snapshots')
                .selectAll()
                .where('target_id', '=', row.id)
                .executeTakeFirst();
              const goal = Number(row.goal_value);
              const actual = Number(snap?.actual_value ?? 0);
              return {
                ...row,
                goal_value: goal,
                actual_value: actual,
                remaining: computeRemaining(goal, actual),
                pct_achieved: computeTargetPct(goal, actual),
                from_snapshot: !!snap,
              };
            }
            const actual = await calculateMetricActual(db, row.metric_key, {
              workspaceId: auth.workspace.id,
              subjectType: row.subject_type,
              subjectId: row.subject_id,
              periodStart: row.period_start,
              periodEnd: row.period_end,
            });
            const goal = Number(row.goal_value);
            return {
              ...row,
              goal_value: goal,
              actual_value: actual,
              remaining: computeRemaining(goal, actual),
              pct_achieved: computeTargetPct(goal, actual),
              from_snapshot: false,
            };
          }),
        );
        res.json({ data: withActuals, error: null });
        return;
      }

      const all = await q.execute();
      const withActuals = await Promise.all(
        all.map(async (row) => {
          if (row.period_status === 'closed') {
            const snap = await db
              .selectFrom('achievement_snapshots')
              .selectAll()
              .where('target_id', '=', row.id)
              .executeTakeFirst();
            const goal = Number(row.goal_value);
            const actual = Number(snap?.actual_value ?? 0);
            return {
              ...row,
              goal_value: goal,
              actual_value: actual,
              remaining: computeRemaining(goal, actual),
              pct_achieved: computeTargetPct(goal, actual),
              from_snapshot: !!snap,
            };
          }
          const actual = await calculateMetricActual(db, row.metric_key, {
            workspaceId: auth.workspace.id,
            subjectType: row.subject_type,
            subjectId: row.subject_id,
            periodStart: row.period_start,
            periodEnd: row.period_end,
          });
          const goal = Number(row.goal_value);
          return {
            ...row,
            goal_value: goal,
            actual_value: actual,
            remaining: computeRemaining(goal, actual),
            pct_achieved: computeTargetPct(goal, actual),
            from_snapshot: false,
          };
        }),
      );
      res.json({ data: withActuals, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/targets', requirePermission('ops.targets.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          period_id: z.string().uuid(),
          metric_key: z.string().min(1),
          subject_type: z.enum(['employee', 'team', 'department', 'tenant']),
          subject_id: z.string().uuid().nullable().optional(),
          goal_value: z.number().finite(),
        })
        .parse(req.body);

      if (!TARGET_METRICS.some((m) => m.key === body.metric_key)) {
        return fail(res, 400, 'INVALID_METRIC', 'Unknown metric key');
      }

      const period = await db
        .selectFrom('target_periods')
        .selectAll()
        .where('id', '=', body.period_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!period) return fail(res, 404, 'NOT_FOUND', 'Period not found');
      try {
        assertPeriodOpen(period.status);
      } catch {
        return fail(res, 400, 'TARGET_PERIOD_CLOSED', 'Cannot create target on closed period');
      }

      if (body.subject_type !== 'tenant' && !body.subject_id) {
        return fail(res, 400, 'INVALID_SUBJECT', 'subject_id required');
      }

      const row = await db
        .insertInto('targets')
        .values({
          workspace_id: auth.workspace.id,
          period_id: body.period_id,
          metric_key: body.metric_key,
          subject_type: body.subject_type,
          subject_id: body.subject_type === 'tenant' ? null : body.subject_id!,
          goal_value: String(body.goal_value),
          created_by: auth.user.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await audit(db, auth, 'ops.target.create', 'target', row.id, body);
      res.status(201).json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/targets/:id', requirePermission('ops.targets.manage'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z.object({ goal_value: z.number().finite() }).parse(req.body);
      const current = await db
        .selectFrom('targets')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Target not found');

      const period = await db
        .selectFrom('target_periods')
        .selectAll()
        .where('id', '=', current.period_id)
        .executeTakeFirstOrThrow();
      try {
        assertPeriodOpen(period.status);
      } catch {
        return fail(res, 400, 'TARGET_PERIOD_CLOSED', 'Cannot edit target on closed period');
      }

      const row = await db
        .updateTable('targets')
        .set({ goal_value: String(body.goal_value), updated_at: new Date() })
        .where('id', '=', current.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await audit(db, auth, 'ops.target.update', 'target', row.id, {
        from: current.goal_value,
        to: body.goal_value,
      });
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/performance/summary', requirePermission('ops.targets.view_own'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      // R2 prefers performance.view_*; R1 callers with targets.view_own still work
      if (
        !auth.isAdmin &&
        !auth.permissions.has('ops.performance.view_own') &&
        !auth.permissions.has('ops.targets.view_own')
      ) {
        return fail(res, 403, 'FORBIDDEN', 'Performance view not permitted');
      }

      const periodId = typeof req.query.period_id === 'string' ? req.query.period_id : undefined;
      const granularity = (
        typeof req.query.granularity === 'string' ? req.query.granularity : 'monthly'
      ) as 'daily' | 'weekly' | 'monthly';
      const subjectType = typeof req.query.subject_type === 'string' ? req.query.subject_type : undefined;
      const subjectId = typeof req.query.subject_id === 'string' ? req.query.subject_id : undefined;

      const { allowed, defaultSubject } = await resolveAllowedPerformanceSubjects(db, {
        workspaceId: auth.workspace.id,
        userId: auth.user.id,
        isAdmin: auth.isAdmin,
        permissions: auth.permissions,
      });

      const effectiveType = (subjectType as any) ?? defaultSubject?.type ?? 'employee';
      const effectiveId =
        subjectId !== undefined ? subjectId : (defaultSubject?.id ?? null);

      // Deny peer employee performance without team/dept/company
      if (
        effectiveType === 'employee' &&
        effectiveId &&
        allowed &&
        !allowed.some((a) => a.type === 'employee' && a.id === effectiveId)
      ) {
        return fail(res, 403, 'FORBIDDEN', 'Cannot view peer performance');
      }

      const built = await buildPerformanceRows(db, {
        workspaceId: auth.workspace.id,
        periodId,
        granularity,
        subjectType: effectiveType,
        subjectId: effectiveId,
        allowedSubjects: allowed,
        includePrior: true,
      });

      res.json({
        data: {
          period: built.period,
          targets: built.targets,
          subject: { type: effectiveType, id: effectiveId },
          note: built.period
            ? built.period.status === 'closed'
              ? 'Closed period — values from achievement_snapshots'
              : 'Open period — live metric derivation'
            : 'No period found',
        },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get(
    '/performance/subjects/:type/:id',
    requirePermission('ops.targets.view_own'),
    async (req, res, next) => {
      try {
        const auth = req as AuthenticatedRequest;
        const type = req.params['type'] as string;
        const id = req.params['id'] === 'tenant' ? null : req.params['id']!;
        const periodId = typeof req.query.period_id === 'string' ? req.query.period_id : undefined;
        const granularity = (
          typeof req.query.granularity === 'string' ? req.query.granularity : 'monthly'
        ) as 'daily' | 'weekly' | 'monthly';

        if (!['employee', 'team', 'department', 'tenant'].includes(type)) {
          return fail(res, 400, 'INVALID_TYPE', 'Invalid subject type');
        }

        const needPerm =
          type === 'employee'
            ? 'ops.performance.view_own'
            : type === 'team'
              ? 'ops.performance.view_team'
              : type === 'department'
                ? 'ops.performance.view_department'
                : 'ops.performance.view_company';

        if (
          !auth.isAdmin &&
          !auth.permissions.has(needPerm) &&
          !(type === 'employee' && auth.permissions.has('ops.targets.view_own'))
        ) {
          return fail(res, 403, 'FORBIDDEN', 'Insufficient performance scope');
        }

        const { allowed } = await resolveAllowedPerformanceSubjects(db, {
          workspaceId: auth.workspace.id,
          userId: auth.user.id,
          isAdmin: auth.isAdmin,
          permissions: auth.permissions,
        });

        if (type === 'employee' && id && allowed) {
          if (!allowed.some((a) => a.type === 'employee' && a.id === id)) {
            return fail(res, 403, 'FORBIDDEN', 'Cannot view peer performance');
          }
        }

        const built = await buildPerformanceRows(db, {
          workspaceId: auth.workspace.id,
          periodId,
          granularity,
          subjectType: type as any,
          subjectId: id,
          allowedSubjects: allowed,
          includePrior: true,
        });

        res.json({
          data: {
            subject: { type, id },
            period: built.period,
            targets: built.targets,
          },
          error: null,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  registerDprRoutes(router, db, requirePermission);

  return router;
}
