/**
 * Public API Quotes (/v1/quotes).
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';
import { withUnitOfWork } from '../../lib/domain-outbox';
import {
  createQuote,
  updateDraftQuote,
  getQuote,
  getQuoteLines,
  transitionQuote,
  reviseQuote,
  softDeleteQuote,
} from '../../lib/quotes';

const lineSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  name_snapshot: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_price: z.union([z.string(), z.number()]).optional(),
  discount_amount: z.union([z.string(), z.number()]).optional(),
  tax_rate: z.union([z.string(), z.number()]).nullable().optional(),
  tax_type: z.string().nullable().optional(),
  hsn_sac: z.string().nullable().optional(),
});

const createSchema = z.object({
  customer_party_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  currency: z.string().optional(),
  discount_total: z.union([z.string(), z.number()]).optional(),
  place_of_supply: z.string().nullable().optional(),
  place_of_supply_intra: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  lines: z.array(lineSchema).optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createV1QuotesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const rows = await db
        .selectFrom('quotes')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(50)
        .execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const quote = await getQuote(db, { workspaceId: workspace.id, id: req.params.id! });
      if (!quote) return fail(res, 404, 'NOT_FOUND', 'Quote not found');
      const lines = await getQuoteLines(db, { workspaceId: workspace.id, quoteId: quote.id });
      res.json({ data: { ...quote, lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        createQuote(trx, { workspaceId: workspace.id, createdBy: null, ...body }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), result.fail);
      res.status(201).json({ data: { ...result.quote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      if ('status' in (req.body ?? {})) {
        return fail(res, 400, 'STATUS_LOCKED', 'Use lifecycle actions');
      }
      const body = createSchema.partial().parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        updateDraftQuote(trx, { workspaceId: workspace.id, id: req.params.id!, patch: body }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), result.fail);
      res.json({ data: { ...result.quote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        softDeleteQuote(trx, { workspaceId: workspace.id, id: req.params.id! }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), result.fail);
      res.json({ data: { deleted: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  for (const action of ['send', 'accept', 'reject', 'cancel'] as const) {
    router.post(`/:id/${action}`, requireScope('read_write'), async (req, res, next) => {
      try {
        const { workspace } = req as unknown as ApiKeyRequest;
        const result = await withUnitOfWork(db, async (trx) =>
          transitionQuote(trx, {
            workspaceId: workspace.id,
            id: req.params.id!,
            action,
            actorId: null,
            reason: typeof req.body?.reason === 'string' ? req.body.reason : null,
          }),
        );
        if (!result.ok) return fail(res, 409, result.fail.toUpperCase(), result.fail);
        res.json({ data: { ...result.quote, lines: result.lines }, error: null });
      } catch (e) {
        next(e);
      }
    });
  }

  router.post('/:id/revise', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        reviseQuote(trx, {
          workspaceId: workspace.id,
          id: req.params.id!,
          createdBy: null,
        }),
      );
      if (!result.ok) return fail(res, 409, result.fail.toUpperCase(), result.fail);
      res.status(201).json({ data: { ...result.quote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
