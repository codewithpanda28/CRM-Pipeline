/**
 * Business Operations Round 2 — DPR + commission-hooks read APIs.
 */
import type { Router, RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { recordSecurityAudit } from '../lib/security-audit';
import { getEmployeeByUserId } from '../lib/business-ops/hierarchy';
import { resolveOpsScope } from '../lib/business-ops/scope';
import {
  buildDprSystemSnapshot,
  isDprMutable,
  mergeManualOverlay,
  reportDateForInstant,
  resolveTenantTimezone,
} from '../lib/business-ops/dpr';
import { CALCULATOR_VERSION } from '../lib/business-ops/metrics';

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

async function appendReviewEvent(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    dprEntryId: string;
    fromStatus: string;
    toStatus: string;
    actorUserId: string;
    comment?: string | null;
  },
) {
  await db
    .insertInto('dpr_review_events')
    .values({
      workspace_id: opts.workspaceId,
      dpr_entry_id: opts.dprEntryId,
      from_status: opts.fromStatus,
      to_status: opts.toStatus,
      actor_user_id: opts.actorUserId,
      comment: opts.comment ?? null,
    })
    .execute();
}

export function registerDprRoutes(
  router: Router,
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): void {
  router.get('/dpr/me', requirePermission('ops.dpr.view_own'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const timeZone = await resolveTenantTimezone(db, auth.workspace.id);
      const date =
        typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : reportDateForInstant(new Date(), timeZone);

      const emp = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
      if (!emp) return fail(res, 400, 'NO_EMPLOYEE', 'Employee profile required for DPR');

      let entry = await db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('workspace_id', '=', auth.workspace.id)
        .where('employee_id', '=', emp.id)
        .where('report_date', '=', new Date(date))
        .executeTakeFirst();

      if (!entry) {
        if (!auth.isAdmin && !auth.permissions.has('ops.dpr.create')) {
          return fail(res, 403, 'FORBIDDEN', 'Cannot create DPR');
        }
        const snapshot = await buildDprSystemSnapshot(db, {
          workspaceId: auth.workspace.id,
          employeeId: emp.id,
          userId: auth.user.id,
          reportDate: date,
          timeZone,
        });
        entry = await db
          .insertInto('dpr_entries')
          .values({
            workspace_id: auth.workspace.id,
            employee_id: emp.id,
            report_date: new Date(date),
            status: 'draft',
            system_snapshot: snapshot as never,
            manual_overlay: {},
            calculator_version: CALCULATOR_VERSION,
          })
          .onConflict((oc) =>
            oc.columns(['workspace_id', 'employee_id', 'report_date']).doNothing(),
          )
          .returningAll()
          .executeTakeFirst();

        if (!entry) {
          entry = await db
            .selectFrom('dpr_entries')
            .selectAll()
            .where('workspace_id', '=', auth.workspace.id)
            .where('employee_id', '=', emp.id)
            .where('report_date', '=', new Date(date))
            .executeTakeFirstOrThrow();
        }
      }

      res.json({ data: entry, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/dpr/inbox', requirePermission('ops.dpr.view_team'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const timeZone = await resolveTenantTimezone(db, auth.workspace.id);
      const today = reportDateForInstant(new Date(), timeZone);
      const from =
        typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
          ? req.query.from
          : today;
      const to =
        typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
          ? req.query.to
          : from;

      const scope = await resolveOpsScope(db, {
        workspaceId: auth.workspace.id,
        userId: auth.user.id,
        isAdmin: auth.isAdmin,
        permissions: auth.permissions,
        requested: auth.isAdmin ? 'company' : 'team',
      });

      let q = db
        .selectFrom('dpr_entries as d')
        .innerJoin('employee_profiles as e', 'e.id', 'd.employee_id')
        .select([
          'd.id',
          'd.workspace_id',
          'd.employee_id',
          'd.report_date',
          'd.status',
          'd.submitted_at',
          'd.reviewed_at',
          'd.review_comment',
          'd.created_at',
          'd.updated_at',
          'e.display_name',
          'e.user_id',
        ])
        .where('d.workspace_id', '=', auth.workspace.id)
        .where('d.report_date', '>=', new Date(from))
        .where('d.report_date', '<=', new Date(to))
        .where('d.status', 'in', ['submitted', 'reviewed', 'returned'])
        .orderBy('d.report_date', 'desc');

      if (scope.employeeIds !== null) {
        if (scope.employeeIds.length === 0) {
          res.json({ data: [], error: null });
          return;
        }
        q = q.where('d.employee_id', 'in', scope.employeeIds);
      }

      const rows = await q.execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/dpr', requirePermission('ops.dpr.view_own'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const scope = await resolveOpsScope(db, {
        workspaceId: auth.workspace.id,
        userId: auth.user.id,
        isAdmin: auth.isAdmin,
        permissions: auth.permissions,
        requested: (req.query.scope as any) ?? 'own',
      });

      // Team/company list requires view_team (or admin)
      if (scope.mode !== 'own' && !auth.isAdmin && !auth.permissions.has('ops.dpr.view_team')) {
        return fail(res, 403, 'FORBIDDEN', 'Team DPR view not permitted');
      }

      let q = db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('workspace_id', '=', auth.workspace.id)
        .orderBy('report_date', 'desc')
        .limit(100);

      if (scope.employeeIds !== null) {
        if (scope.employeeIds.length === 0) {
          res.json({ data: [], error: null });
          return;
        }
        q = q.where('employee_id', 'in', scope.employeeIds);
      }

      const rows = await q.execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/dpr/:id', requirePermission('ops.dpr.view_own'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const entry = await db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!entry) return fail(res, 404, 'NOT_FOUND', 'DPR not found');

      const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
      const isOwn = self && entry.employee_id === self.id;
      if (!isOwn && !auth.isAdmin && !auth.permissions.has('ops.dpr.view_team')) {
        return fail(res, 403, 'FORBIDDEN', 'Cannot view this DPR');
      }
      if (!isOwn && !auth.isAdmin) {
        const scope = await resolveOpsScope(db, {
          workspaceId: auth.workspace.id,
          userId: auth.user.id,
          isAdmin: auth.isAdmin,
          permissions: auth.permissions,
          requested: 'team',
        });
        if (scope.employeeIds && !scope.employeeIds.includes(entry.employee_id)) {
          return fail(res, 403, 'FORBIDDEN', 'DPR outside team scope');
        }
      }

      const events = await db
        .selectFrom('dpr_review_events')
        .selectAll()
        .where('workspace_id', '=', auth.workspace.id)
        .where('dpr_entry_id', '=', entry.id)
        .orderBy('created_at', 'asc')
        .execute();

      res.json({ data: { ...entry, review_events: events }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/dpr/:id/refresh', requirePermission('ops.dpr.create'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const entry = await db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!entry) return fail(res, 404, 'NOT_FOUND', 'DPR not found');
      if (!isDprMutable(entry.status)) {
        return fail(res, 409, 'IMMUTABLE', 'Submitted/reviewed DPR cannot refresh');
      }

      const emp = await db
        .selectFrom('employee_profiles')
        .selectAll()
        .where('id', '=', entry.employee_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirstOrThrow();

      if (emp.user_id !== auth.user.id && !auth.isAdmin) {
        return fail(res, 403, 'FORBIDDEN', 'Can only refresh own DPR');
      }

      const reportDate =
        entry.report_date instanceof Date
          ? entry.report_date.toISOString().slice(0, 10)
          : String(entry.report_date).slice(0, 10);

      const timeZone = await resolveTenantTimezone(db, auth.workspace.id);
      const snapshot = await buildDprSystemSnapshot(db, {
        workspaceId: auth.workspace.id,
        employeeId: emp.id,
        userId: emp.user_id,
        reportDate,
        timeZone,
      });

      const updated = await db
        .updateTable('dpr_entries')
        .set({
          system_snapshot: snapshot as never,
          calculator_version: CALCULATOR_VERSION,
          updated_at: new Date(),
        })
        .where('id', '=', entry.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/dpr/:id', requirePermission('ops.dpr.create'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          notes: z.string().nullable().optional(),
          adjustments: z.record(z.number()).optional(),
        })
        .parse(req.body);

      const entry = await db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!entry) return fail(res, 404, 'NOT_FOUND', 'DPR not found');
      if (!isDprMutable(entry.status)) {
        return fail(res, 409, 'IMMUTABLE', 'Cannot edit submitted/reviewed DPR');
      }

      const emp = await db
        .selectFrom('employee_profiles')
        .select(['id', 'user_id'])
        .where('id', '=', entry.employee_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirstOrThrow();
      if (emp.user_id !== auth.user.id && !auth.isAdmin) {
        return fail(res, 403, 'FORBIDDEN', 'Can only edit own DPR');
      }

      const overlay = mergeManualOverlay(
        (entry.manual_overlay as Record<string, unknown>) ?? {},
        body,
      );

      const updated = await db
        .updateTable('dpr_entries')
        .set({
          manual_overlay: overlay as never,
          // returned → draft when editing
          status: entry.status === 'returned' ? 'draft' : entry.status,
          updated_at: new Date(),
        })
        .where('id', '=', entry.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      if (entry.status === 'returned' && updated.status === 'draft') {
        await appendReviewEvent(db, {
          workspaceId: auth.workspace.id,
          dprEntryId: entry.id,
          fromStatus: 'returned',
          toStatus: 'draft',
          actorUserId: auth.user.id,
          comment: 'Edited after return',
        });
      }

      await audit(db, auth, 'ops.dpr.overlay_update', 'dpr_entry', entry.id, {
        notes: body.notes !== undefined,
        adjustments: body.adjustments ?? null,
      });

      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/dpr/:id/submit', requirePermission('ops.dpr.create'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const entry = await db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!entry) return fail(res, 404, 'NOT_FOUND', 'DPR not found');
      if (!isDprMutable(entry.status)) {
        return fail(res, 409, 'IMMUTABLE', 'Already submitted');
      }

      const emp = await db
        .selectFrom('employee_profiles')
        .selectAll()
        .where('id', '=', entry.employee_id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirstOrThrow();
      if (emp.user_id !== auth.user.id && !auth.isAdmin) {
        return fail(res, 403, 'FORBIDDEN', 'Can only submit own DPR');
      }

      const reportDate =
        entry.report_date instanceof Date
          ? entry.report_date.toISOString().slice(0, 10)
          : String(entry.report_date).slice(0, 10);

      // Freeze fresh system snapshot on submit
      const timeZone = await resolveTenantTimezone(db, auth.workspace.id);
      const snapshot = await buildDprSystemSnapshot(db, {
        workspaceId: auth.workspace.id,
        employeeId: emp.id,
        userId: emp.user_id,
        reportDate,
        timeZone,
      });

      const fromStatus = entry.status;
      const updated = await db
        .updateTable('dpr_entries')
        .set({
          status: 'submitted',
          system_snapshot: snapshot as never,
          calculator_version: CALCULATOR_VERSION,
          submitted_at: new Date(),
          submitted_by: auth.user.id,
          updated_at: new Date(),
        })
        .where('id', '=', entry.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await appendReviewEvent(db, {
        workspaceId: auth.workspace.id,
        dprEntryId: entry.id,
        fromStatus,
        toStatus: 'submitted',
        actorUserId: auth.user.id,
      });
      await audit(db, auth, 'ops.dpr.submit', 'dpr_entry', entry.id, { report_date: reportDate });

      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/dpr/:id/review', requirePermission('ops.dpr.review'), async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          decision: z.enum(['approve', 'return']),
          comment: z.string().nullable().optional(),
        })
        .parse(req.body);

      const entry = await db
        .selectFrom('dpr_entries')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      if (!entry) return fail(res, 404, 'NOT_FOUND', 'DPR not found');
      if (entry.status !== 'submitted') {
        return fail(res, 409, 'INVALID_STATE', 'Only submitted DPRs can be reviewed');
      }

      // Scope: manager of submitter or admin
      if (!auth.isAdmin) {
        const scope = await resolveOpsScope(db, {
          workspaceId: auth.workspace.id,
          userId: auth.user.id,
          isAdmin: auth.isAdmin,
          permissions: auth.permissions,
          requested: 'team',
        });
        if (scope.employeeIds && !scope.employeeIds.includes(entry.employee_id)) {
          return fail(res, 403, 'FORBIDDEN', 'DPR outside managed team');
        }
        // Reviewer should not be the submitter themselves unless admin
        const self = await getEmployeeByUserId(db, auth.workspace.id, auth.user.id);
        if (self && self.id === entry.employee_id) {
          return fail(res, 403, 'FORBIDDEN', 'Cannot review own DPR');
        }
      }

      const toStatus = body.decision === 'approve' ? 'reviewed' : 'returned';
      const updated = await db
        .updateTable('dpr_entries')
        .set({
          status: toStatus,
          reviewed_at: new Date(),
          reviewed_by: auth.user.id,
          review_comment: body.comment ?? null,
          updated_at: new Date(),
        })
        .where('id', '=', entry.id)
        .where('workspace_id', '=', auth.workspace.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      await appendReviewEvent(db, {
        workspaceId: auth.workspace.id,
        dprEntryId: entry.id,
        fromStatus: 'submitted',
        toStatus,
        actorUserId: auth.user.id,
        comment: body.comment,
      });
      await audit(db, auth, 'ops.dpr.review', 'dpr_entry', entry.id, {
        decision: body.decision,
        comment: body.comment ?? null,
      });

      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get(
    '/commission-hooks',
    requirePermission('ops.commission_hooks.view'),
    async (req, res, next) => {
      try {
        const auth = req as AuthenticatedRequest;
        const rows = await db
          .selectFrom('ops_commission_hook_events')
          .selectAll()
          .where('workspace_id', '=', auth.workspace.id)
          .orderBy('created_at', 'desc')
          .limit(200)
          .execute();
        res.json({ data: rows, error: null });
      } catch (e) {
        next(e);
      }
    },
  );
}
