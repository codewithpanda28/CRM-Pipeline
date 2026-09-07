/**
 * Public API Invoices (/v1/invoices).
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { withUnitOfWork } from '../../lib/domain-outbox';
import {
  createInvoice,
  updateDraftInvoice,
  createInvoiceFromQuote,
  getInvoice,
  getInvoiceLines,
  issueInvoice,
  cancelInvoice,
  voidInvoice,
  softDeleteDraftInvoice,
} from '../../lib/finance';

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
  customer_party_id: z.string().uuid(),
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

export function createV1InvoicesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const rows = await db
        .selectFrom('invoices')
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

  router.post('/from-quote/:quoteId', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        createInvoiceFromQuote(trx, {
          workspaceId: workspace.id,
          quoteId: req.params.quoteId!,
          createdBy: null,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'from-quote failed');
      res.status(result.idempotent ? 200 : 201).json({
        data: { ...result.invoice, lines: result.lines, idempotent: result.idempotent },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const invoice = await getInvoice(db, { workspaceId: workspace.id, id: req.params.id! });
      if (!invoice) return fail(res, 404, 'NOT_FOUND', 'Invoice not found');
      const lines = await getInvoiceLines(db, { workspaceId: workspace.id, invoiceId: invoice.id });
      res.json({ data: { ...invoice, lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        createInvoice(trx, {
          workspaceId: workspace.id,
          createdBy: null,
          ...body,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'create failed');
      res.status(201).json({ data: { ...result.invoice, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.partial().omit({ customer_party_id: true }).parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        updateDraftInvoice(trx, { workspaceId: workspace.id, id: req.params.id!, patch: body }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'update failed');
      res.json({ data: { ...result.invoice, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        softDeleteDraftInvoice(trx, { workspaceId: workspace.id, id: req.params.id! }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'delete failed');
      res.json({ data: { deleted: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/issue', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        issueInvoice(trx, {
          workspaceId: workspace.id,
          id: req.params.id!,
          actorId: null,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'issue failed');
      res.json({ data: { ...result.invoice, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        cancelInvoice(trx, {
          workspaceId: workspace.id,
          id: req.params.id!,
          actorId: null,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'cancel failed');
      res.json({ data: result.invoice, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/void', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await withUnitOfWork(db, async (trx) =>
        voidInvoice(trx, {
          workspaceId: workspace.id,
          id: req.params.id!,
          actorId: null,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'void failed');
      res.json({ data: result.invoice, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
