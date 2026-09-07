/**
 * Product catalog session API (Phase 3A.4).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import {
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProduct,
  onProductCreated,
  onProductUpdated,
  onProductDeleted,
} from '../lib/products';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  kind: z.enum(['product', 'service', 'package', 'plan']).optional(),
  is_active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().optional(),
});

const createSchema = z.object({
  kind: z.enum(['product', 'service', 'package', 'plan']),
  sku: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit: z.string().min(1).max(64).optional(),
  list_price: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  cost: z.union([z.string(), z.number()]).nullable().optional(),
  tax_category_code: z.string().nullable().optional(),
  tax_metadata: z.record(z.unknown()).optional(),
  billing_model: z.enum(['one_time', 'recurring', 'usage']).nullable().optional(),
  is_active: z.boolean().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const updateSchema = createSchema.partial();

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapFail(failCode: string): { status: number; code: string; msg: string } {
  switch (failCode) {
    case 'sku_conflict':
      return { status: 409, code: 'SKU_CONFLICT', msg: 'SKU already exists in this workspace' };
    case 'not_found':
      return { status: 404, code: 'NOT_FOUND', msg: 'Product not found' };
    default:
      return { status: 400, code: 'VALIDATION', msg: 'Invalid product' };
  }
}

export function createProductsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('products:view');
  const create = requirePermission('products:create');
  const edit = requirePermission('products:edit');
  const del = requirePermission('products:delete');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('products')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.kind) query = query.where('kind', '=', q.kind);
      if (q.is_active !== undefined) query = query.where('is_active', '=', q.is_active);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb(eb.fn('lower', ['name']), 'like', term),
            eb(eb.fn('lower', ['sku']), 'like', term),
          ]),
        );
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
      const row = await getProduct(db, { workspaceId, id: req.params.id! });
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Product not found');
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) => {
        const created = await createProduct(trx, {
          workspaceId,
          created_by: userId,
          ...body,
        });
        if (!created.ok) return created;
        await onProductCreated(trx, {
          workspaceId,
          productId: created.product!.id,
          sku: created.product!.sku,
        });
        return created;
      });
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: result.product, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = updateSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) => {
        const updated = await updateProduct(trx, {
          workspaceId,
          id: req.params.id!,
          patch: body,
        });
        if (!updated.ok) return updated;
        await onProductUpdated(trx, {
          workspaceId,
          productId: updated.product.id,
          changeKey: `patch:${Date.now()}`,
        });
        return updated;
      });
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: result.product, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const result = await withUnitOfWork(db, async (trx) => {
        const deleted = await softDeleteProduct(trx, { workspaceId, id: req.params.id! });
        if (!deleted.ok) return deleted;
        await onProductDeleted(trx, { workspaceId, productId: req.params.id! });
        return deleted;
      });
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
