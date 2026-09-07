/**
 * Expenses session API (Phase 4 Finance).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import { createExpense, updateExpense, softDeleteExpense, getExpense } from '../lib/finance';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  vendor_id: z.string().uuid().optional(),
  payment_status: z.enum(['unpaid', 'paid', 'partial']).optional(),
});

const createSchema = z.object({
  vendor_id: z.string().uuid().nullable().optional(),
  category: z.string().nullable().optional(),
  expense_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  amount: z.union([z.string(), z.number()]),
  tax_amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  tax_breakup: z.record(z.unknown()).optional(),
  payment_status: z.enum(['unpaid', 'paid', 'partial']).optional(),
  receipt_ref: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const updateSchema = createSchema.partial();

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapFail(f: string): { status: number; code: string; msg: string } {
  const map: Record<string, { status: number; code: string; msg: string }> = {
    not_found: { status: 404, code: 'NOT_FOUND', msg: 'Expense not found' },
    vendor_invalid: { status: 400, code: 'VENDOR_INVALID', msg: 'Invalid vendor' },
    validation: { status: 400, code: 'VALIDATION', msg: 'Invalid expense payload' },
  };
  return map[f] ?? { status: 400, code: 'VALIDATION', msg: 'Invalid expense' };
}

export function createExpensesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('expenses:view');
  const create = requirePermission('expenses:create');
  const edit = requirePermission('expenses:edit');
  const del = requirePermission('expenses:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('expenses')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('expense_date', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.vendor_id) query = query.where('vendor_id', '=', q.vendor_id);
      if (q.payment_status) query = query.where('payment_status', '=', q.payment_status);
      const rows = await query.execute();
      res.json({ data: rows, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const expense = await getExpense(db, { workspaceId, id: req.params.id! });
      if (!expense) return fail(res, 404, 'NOT_FOUND', 'Expense not found');
      res.json({ data: expense, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        createExpense(trx, { workspaceId, createdBy: userId, ...body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: result.expense, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = updateSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        updateExpense(trx, { workspaceId, id: req.params.id!, patch: body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: result.expense, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const result = await withUnitOfWork(db, async (trx) =>
        softDeleteExpense(trx, { workspaceId, id: req.params.id! }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: { deleted: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
