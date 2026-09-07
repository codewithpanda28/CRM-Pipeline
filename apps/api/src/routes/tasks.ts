import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { queueWebhook } from '../lib/queue-webhook';
import { logActivity } from '../lib/log-activity';
import {
  taskSchedulingFieldsSchema,
  validateTaskScheduling,
} from '../lib/crm/task-scheduling';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['todo', 'done', 'open', 'in_progress', 'cancelled']).optional(),
  assignee_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  show_all: z.coerce.boolean().optional(),
});

const createTaskSchema = z
  .object({
    title: z.string().min(1),
    due_date: z.string().optional(),
    assignee_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    record_id: z.string().uuid().nullable().optional(),
    /** Prefer related_deal_id; deal_id accepted as alias for older clients. */
    related_deal_id: z.string().uuid().optional(),
    deal_id: z.string().uuid().optional(),
    status: z.enum(['todo', 'done', 'open', 'in_progress', 'cancelled']).optional(),
  })
  .merge(taskSchedulingFieldsSchema);

const updateTaskSchema = z
  .object({
    title: z.string().min(1).optional(),
    due_date: z.string().optional(),
    status: z.enum(['todo', 'done', 'open', 'in_progress', 'cancelled']).optional(),
    assignee_id: z.string().uuid().optional(),
  })
  .merge(taskSchedulingFieldsSchema);

export function createTasksRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  router.get('/', requirePermission('tasks:view'), async (req, res, next) => {
    try {
      const { workspace, user, isAdmin } = req as unknown as AuthenticatedRequest;

      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const { page, per_page, status, assignee_id, contact_id, show_all } = parsed.data;
      // show_all=true (admin only) returns all workspace tasks regardless of assignee
      const showAll = show_all === true && isAdmin;
      // When filtering by contact_id, skip the assignee scope so all tasks for that contact are returned
      const effectiveAssignee = contact_id ? null : (showAll ? null : (assignee_id ?? user.id));

      let query = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .selectAll()
        .orderBy('due_date', 'asc')
        .orderBy('created_at', 'desc')
        .limit(per_page)
        .offset((page - 1) * per_page);

      if (status) query = query.where('status', '=', status);
      if (effectiveAssignee) query = query.where('assignee_id', '=', effectiveAssignee);
      if (contact_id) query = query.where('contact_id', '=', contact_id);

      const tasks = await query.execute();

      let countQuery = db
        .selectFrom('tasks')
        .where('workspace_id', '=', workspace.id)
        .select(db.fn.countAll<number>().as('count'));

      if (status) countQuery = countQuery.where('status', '=', status);
      if (effectiveAssignee) countQuery = countQuery.where('assignee_id', '=', effectiveAssignee);
      if (contact_id) countQuery = countQuery.where('contact_id', '=', contact_id);

      const { count } = await countQuery.executeTakeFirstOrThrow();

      res.json({ data: tasks, total: Number(count), page, per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requirePermission('tasks:create'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const body = createTaskSchema.parse(req.body);
      const relatedDealId = body.related_deal_id ?? body.deal_id ?? null;

      if (relatedDealId) {
        const deal = await db
          .selectFrom('deals')
          .select('id')
          .where('id', '=', relatedDealId)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .executeTakeFirst();
        if (!deal) {
          res.status(400).json({
            data: null,
            error: { code: 'INVALID_DEAL', message: 'related_deal_id not found in tenant' },
          });
          return;
        }
      }

      if (body.contact_id) {
        const contact = await db
          .selectFrom('contacts')
          .select('id')
          .where('id', '=', body.contact_id)
          .where('workspace_id', '=', workspace.id)
          .executeTakeFirst();
        if (!contact) {
          res.status(400).json({
            data: null,
            error: { code: 'INVALID_CONTACT', message: 'contact_id not found in tenant' },
          });
          return;
        }
      }

      const dueAt = body.due_date ? new Date(body.due_date) : null;
      const scheduling = validateTaskScheduling(body);
      if (!scheduling.ok) {
        res.status(400).json({
          data: null,
          error: { code: scheduling.code, message: scheduling.message },
        });
        return;
      }

      const task = await db
        .insertInto('tasks')
        .values({
          workspace_id: workspace.id,
          assignee_id: body.assignee_id ?? user.id,
          title: body.title,
          due_date: dueAt,
          due_at: dueAt,
          contact_id: body.contact_id ?? null,
          // record_id is legacy pipeline_records FK — do NOT alias deal ids here.
          record_id: body.record_id ?? null,
          related_deal_id: relatedDealId,
          status: body.status ?? 'open',
          task_type: 'follow_up',
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

      queueWebhook(db, workspace.id, 'task.created', {
        task_id: task.id,
        title: task.title,
        due_date: task.due_date ? new Date(task.due_date).toISOString() : null,
        assignee_id: task.assignee_id,
        workspace_id: workspace.id,
        timestamp: new Date().toISOString(),
      }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

      res.status(201).json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requirePermission('tasks:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const deleted = await db
        .deleteFrom('tasks')
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returning(['id'])
        .executeTakeFirst();
      if (!deleted) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ data: { id: deleted.id }, error: null });
    } catch (err) { next(err); }
  });

  router.patch('/:id', requirePermission('tasks:edit'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const body = updateTaskSchema.parse(req.body);

      const patch: Record<string, unknown> = { updated_at: new Date() };
      if (body.title !== undefined) patch['title'] = body.title;
      if (body.status !== undefined) patch['status'] = body.status;
      if (body.assignee_id !== undefined) patch['assignee_id'] = body.assignee_id;
      if (body.due_date !== undefined) {
        const dueAt = body.due_date ? new Date(body.due_date) : null;
        patch['due_date'] = dueAt;
        patch['due_at'] = dueAt;
      }

      const hasScheduling =
        body.scheduling_mode !== undefined ||
        body.start_at !== undefined ||
        body.end_at !== undefined ||
        body.duration_minutes !== undefined ||
        body.timezone !== undefined ||
        body.meeting_mode !== undefined ||
        body.location !== undefined;

      if (hasScheduling) {
        const current = await db
          .selectFrom('tasks')
          .select([
            'scheduling_mode',
            'start_at',
            'end_at',
            'duration_minutes',
            'timezone',
            'meeting_mode',
            'location',
          ])
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspace.id)
          .executeTakeFirst();
        if (!current) {
          res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
          return;
        }
        const scheduling = validateTaskScheduling({
          scheduling_mode: body.scheduling_mode ?? current.scheduling_mode,
          start_at:
            body.start_at !== undefined
              ? body.start_at
              : current.start_at
                ? new Date(current.start_at).toISOString()
                : null,
          end_at:
            body.end_at !== undefined
              ? body.end_at
              : current.end_at
                ? new Date(current.end_at).toISOString()
                : null,
          duration_minutes:
            body.duration_minutes !== undefined ? body.duration_minutes : current.duration_minutes,
          timezone: body.timezone !== undefined ? body.timezone : current.timezone,
          meeting_mode: body.meeting_mode !== undefined ? body.meeting_mode : current.meeting_mode,
          location: body.location !== undefined ? body.location : current.location,
        });
        if (!scheduling.ok) {
          res.status(400).json({
            data: null,
            error: { code: scheduling.code, message: scheduling.message },
          });
          return;
        }
        Object.assign(patch, scheduling.values);
      }

      const currentTask = body.status === 'done'
        ? await db
            .selectFrom('tasks')
            .select(['status'])
            .where('id', '=', req.params['id']!)
            .where('workspace_id', '=', workspace.id)
            .executeTakeFirst()
        : null;

      const task = await db
        .updateTable('tasks')
        .set(patch)
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .returningAll()
        .executeTakeFirst();

      if (!task) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }

      if (body.status === 'done' && currentTask?.status !== 'done') {
        queueWebhook(db, workspace.id, 'task.completed', {
          task_id: task.id,
          title: task.title,
          assignee_id: task.assignee_id,
          workspace_id: workspace.id,
          timestamp: new Date().toISOString(),
        }).catch((err: unknown) => logger.error({ err }, 'queueWebhook failed'));

        void logActivity(db, {
          workspace_id: workspace.id,
          user_id: task.assignee_id ?? null,
          type: 'task_done',
          source_module_id: 'crm',
          body: `Task completed: "${task.title}"`,
          contact_id: task.contact_id ?? undefined,
          record_id: task.record_id ?? undefined,
        }).catch((err: unknown) => logger.error({ err }, 'logActivity failed'));
      }

      res.json({ data: task, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

import { bridgeRegistry } from '@vencore/plugin-runtime';

export function registerTasksBridgeMethods(): void {
  bridgeRegistry
    .register('tasks.list', 'tasks:read', async (ctx, p, db) => {
      const filter = (p.filter ?? {}) as Record<string, unknown>;
      let q = db.selectFrom('tasks').selectAll().where('workspace_id', '=', ctx.workspaceId);
      if (filter.status) q = q.where('status', '=', filter.status as string);
      if (filter.assignee_id) q = q.where('assignee_id', '=', filter.assignee_id as string);
      if (filter.contact_id) q = q.where('contact_id', '=', filter.contact_id as string);
      if (filter.deal_id) q = q.where('deal_id', '=', filter.deal_id as string);
      if (filter.limit) q = q.limit(Number(filter.limit));
      return q.execute();
    })
    .register('tasks.get', 'tasks:read', async (ctx, p, db) => {
      const row = await db.selectFrom('tasks').selectAll()
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .executeTakeFirst();
      if (!row) throw { code: 'NOT_FOUND', message: 'Task not found' };
      return row;
    })
    .register('tasks.create', 'tasks:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.insertInto('tasks')
        .values({ ...data, workspace_id: ctx.workspaceId } as any)
        .returningAll().execute();
      return row;
    })
    .register('tasks.update', 'tasks:write', async (ctx, p, db) => {
      const data = p.data as Record<string, unknown>;
      const [row] = await db.updateTable('tasks')
        .set({ ...data, updated_at: new Date() } as any)
        .where('workspace_id', '=', ctx.workspaceId)
        .where('id', '=', p.id as string)
        .returningAll().execute();
      if (!row) throw { code: 'NOT_FOUND', message: 'Task not found' };
      return row;
    });
}
