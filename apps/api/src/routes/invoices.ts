/**
 * Invoices session API (Phase 4 Finance).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
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
} from '../lib/finance';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled'])
    .optional(),
  customer_party_id: z.string().uuid().optional(),
  q: z.string().optional(),
});

const lineSchema = z.object({
  product_id: z.string().uuid().nullable().optional(),
  sku_snapshot: z.string().nullable().optional(),
  name_snapshot: z.string().optional(),
  description_snapshot: z.string().nullable().optional(),
  unit_snapshot: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_price: z.union([z.string(), z.number()]).optional(),
  discount_amount: z.union([z.string(), z.number()]).optional(),
  discount_percent: z.union([z.string(), z.number()]).nullable().optional(),
  tax_rate: z.union([z.string(), z.number()]).nullable().optional(),
  tax_type: z.string().nullable().optional(),
  tax_breakup: z.record(z.unknown()).optional(),
  hsn_sac: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const createSchema = z.object({
  customer_party_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  issue_date: z.string().optional(),
  due_date: z.string().nullable().optional(),
  currency: z.string().optional(),
  discount_total: z.union([z.string(), z.number()]).optional(),
  place_of_supply: z.string().nullable().optional(),
  place_of_supply_intra: z.boolean().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  lines: z.array(lineSchema).optional(),
});

const updateSchema = createSchema.partial().omit({ customer_party_id: true });
const reasonSchema = z.object({ reason: z.string().max(2000).optional() });

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapFail(f: string): { status: number; code: string; msg: string } {
  const map: Record<string, { status: number; code: string; msg: string }> = {
    not_found: { status: 404, code: 'NOT_FOUND', msg: 'Invoice not found' },
    party_invalid: { status: 400, code: 'PARTY_INVALID', msg: 'Invalid customer party' },
    product_invalid: { status: 400, code: 'PRODUCT_INVALID', msg: 'Invalid product reference' },
    not_draft: { status: 409, code: 'NOT_DRAFT', msg: 'Only draft invoices can be edited or deleted' },
    immutable: { status: 409, code: 'IMMUTABLE', msg: 'Invoice cannot be modified' },
    invalid_transition: { status: 409, code: 'INVALID_TRANSITION', msg: 'Invalid status transition' },
    quote_not_found: { status: 404, code: 'QUOTE_NOT_FOUND', msg: 'Quote not found' },
    quote_not_accepted: { status: 409, code: 'QUOTE_NOT_ACCEPTED', msg: 'Quote must be accepted' },
    quote_invalid: { status: 400, code: 'QUOTE_INVALID', msg: 'Invalid quote' },
    validation: { status: 400, code: 'VALIDATION', msg: 'Invalid invoice payload' },
    accounting_failed: {
      status: 409,
      code: 'ACCOUNTING_FAILED',
      msg: 'Accounting period blocks this finance mutation',
    },
  };
  return map[f] ?? { status: 400, code: 'VALIDATION', msg: 'Invalid invoice' };
}

export function createInvoicesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('invoices:view');
  const create = requirePermission('invoices:create');
  const edit = requirePermission('invoices:edit');
  const del = requirePermission('invoices:delete');
  const issue = requirePermission('invoices:issue');
  const voidPerm = requirePermission('invoices:void');
  const cancel = requirePermission('invoices:cancel');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('invoices')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.status) query = query.where('status', '=', q.status);
      if (q.customer_party_id) query = query.where('customer_party_id', '=', q.customer_party_id);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) => eb(eb.fn('lower', ['invoice_number']), 'like', term));
      }
      const rows = await query.execute();
      res.json({ data: rows, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  // from-quote before /:id
  router.post('/from-quote/:quoteId', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const result = await withUnitOfWork(db, async (trx) =>
        createInvoiceFromQuote(trx, {
          workspaceId,
          quoteId: req.params.quoteId!,
          createdBy: userId,
        }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(result.idempotent ? 200 : 201).json({
        data: { ...result.invoice, lines: result.lines, idempotent: result.idempotent },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const invoice = await getInvoice(db, { workspaceId, id: req.params.id! });
      if (!invoice) return fail(res, 404, 'NOT_FOUND', 'Invoice not found');
      const lines = await getInvoiceLines(db, { workspaceId, invoiceId: invoice.id });
      res.json({ data: { ...invoice, lines }, error: null });
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
        createInvoice(trx, { workspaceId, createdBy: userId, ...body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: { ...result.invoice, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      if ('status' in (req.body ?? {})) {
        return fail(res, 400, 'STATUS_LOCKED', 'Use lifecycle actions to change status');
      }
      const body = updateSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        updateDraftInvoice(trx, { workspaceId, id: req.params.id!, patch: body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: { ...result.invoice, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const result = await withUnitOfWork(db, async (trx) =>
        softDeleteDraftInvoice(trx, { workspaceId, id: req.params.id! }),
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

  router.post('/:id/issue', issue, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const result = await withUnitOfWork(db, async (trx) =>
        issueInvoice(trx, { workspaceId, id: req.params.id!, actorId: userId }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: { ...result.invoice, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/cancel', cancel, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = reasonSchema.parse(req.body ?? {});
      const result = await withUnitOfWork(db, async (trx) =>
        cancelInvoice(trx, {
          workspaceId,
          id: req.params.id!,
          actorId: userId,
          reason: body.reason,
        }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: result.invoice, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/void', voidPerm, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = reasonSchema.parse(req.body ?? {});
      const result = await withUnitOfWork(db, async (trx) =>
        voidInvoice(trx, {
          workspaceId,
          id: req.params.id!,
          actorId: userId,
          reason: body.reason,
        }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: result.invoice, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
