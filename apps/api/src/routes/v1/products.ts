/**
 * Public API Products (/v1/products).
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';
import { withUnitOfWork } from '../../lib/domain-outbox';
import {
  createProduct,
  updateProduct,
  softDeleteProduct,
  getProduct,
  onProductCreated,
  onProductUpdated,
  onProductDeleted,
} from '../../lib/products';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  kind: z.enum(['product', 'service', 'package', 'plan']).optional(),
  q: z.string().optional(),
});

const createSchema = z.object({
  kind: z.enum(['product', 'service', 'package', 'plan']),
  sku: z.string().min(1).max(128),
  name: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  unit: z.string().optional(),
  list_price: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  cost: z.union([z.string(), z.number()]).nullable().optional(),
  billing_model: z.enum(['one_time', 'recurring', 'usage']).nullable().optional(),
  is_active: z.boolean().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createV1ProductsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('products')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.kind) query = query.where('kind', '=', q.kind);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb(eb.fn('lower', ['name']), 'like', term),
            eb(eb.fn('lower', ['sku']), 'like', term),
          ]),
        );
      }
      res.json({ data: await query.execute(), error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const row = await getProduct(db, { workspaceId: workspace.id, id: req.params.id! });
      if (!row) return fail(res, 404, 'NOT_FOUND', 'Product not found');
      res.json({ data: row, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) => {
        const created = await createProduct(trx, { workspaceId: workspace.id, ...body });
        if (!created.ok) return created;
        await onProductCreated(trx, {
          workspaceId: workspace.id,
          productId: created.product!.id,
          sku: created.product!.sku,
        });
        return created;
      });
      if (!result.ok) {
        return fail(
          res,
          result.fail === 'sku_conflict' ? 409 : 400,
          result.fail.toUpperCase(),
          result.fail,
        );
      }
      res.status(201).json({ data: result.product, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.partial().parse(req.body);
      const result = await withUnitOfWork(db, async (trx) => {
        const updated = await updateProduct(trx, {
          workspaceId: workspace.id,
          id: req.params.id!,
          patch: body,
        });
        if (!updated.ok) return updated;
        await onProductUpdated(trx, {
          workspaceId: workspace.id,
          productId: updated.product.id,
          changeKey: `v1:${Date.now()}`,
        });
        return updated;
      });
      if (!result.ok) return fail(res, 404, 'NOT_FOUND', 'Product not found');
      res.json({ data: result.product, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) => {
        const deleted = await softDeleteProduct(trx, {
          workspaceId: workspace.id,
          id: req.params.id!,
        });
        if (!deleted.ok) return deleted;
        await onProductDeleted(trx, { workspaceId: workspace.id, productId: req.params.id! });
        return deleted;
      });
      if (!result.ok) return fail(res, 404, 'NOT_FOUND', 'Product not found');
      res.json({ data: { deleted: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
