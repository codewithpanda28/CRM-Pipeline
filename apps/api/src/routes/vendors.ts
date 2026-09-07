/**
 * Vendors session API (Phase 4 Finance).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import { createVendor, updateVendor, softDeleteVendor, getVendor } from '../lib/finance';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().optional(),
});

const createSchema = z.object({
  display_name: z.string().min(1),
  legal_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.record(z.unknown()).optional(),
  gstin: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  bank_details: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['active', 'inactive']).optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapFail(f: string): { status: number; code: string; msg: string } {
  const map: Record<string, { status: number; code: string; msg: string }> = {
    not_found: { status: 404, code: 'NOT_FOUND', msg: 'Vendor not found' },
    validation: { status: 400, code: 'VALIDATION', msg: 'Invalid vendor payload' },
  };
  return map[f] ?? { status: 400, code: 'VALIDATION', msg: 'Invalid vendor' };
}

export function createVendorsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('vendors:view');
  const create = requirePermission('vendors:create');
  const edit = requirePermission('vendors:edit');
  const del = requirePermission('vendors:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('vendors')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('display_name', 'asc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) => eb(eb.fn('lower', ['display_name']), 'like', term));
      }
      const rows = await query.execute();
      res.json({ data: rows, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const vendor = await getVendor(db, { workspaceId, id: req.params.id! });
      if (!vendor) return fail(res, 404, 'NOT_FOUND', 'Vendor not found');
      res.json({ data: vendor, error: null });
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
        createVendor(trx, { workspaceId, createdBy: userId, ...body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: result.vendor, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = updateSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        updateVendor(trx, { workspaceId, id: req.params.id!, patch: body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: result.vendor, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const result = await withUnitOfWork(db, async (trx) =>
        softDeleteVendor(trx, { workspaceId, id: req.params.id! }),
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
