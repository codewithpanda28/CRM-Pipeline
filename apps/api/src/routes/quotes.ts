/**
 * Quotes session API (Phase 3A.4).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import {
  createQuote,
  updateDraftQuote,
  getQuote,
  getQuoteLines,
  transitionQuote,
  reviseQuote,
  softDeleteQuote,
} from '../lib/quotes';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z
    .enum(['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'])
    .optional(),
  customer_party_id: z.string().uuid().optional(),
  deal_id: z.string().uuid().optional(),
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
  customer_party_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  issue_date: z.string().optional(),
  expiry_date: z.string().nullable().optional(),
  currency: z.string().optional(),
  discount_total: z.union([z.string(), z.number()]).optional(),
  place_of_supply: z.string().nullable().optional(),
  place_of_supply_intra: z.boolean().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  lines: z.array(lineSchema).optional(),
});

const updateSchema = createSchema.partial().extend({
  // status deliberately omitted — lifecycle actions only
});

const reasonSchema = z.object({ reason: z.string().max(2000).optional() });

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapQuoteFail(f: string): { status: number; code: string; msg: string } {
  const map: Record<string, { status: number; code: string; msg: string }> = {
    not_found: { status: 404, code: 'NOT_FOUND', msg: 'Quote not found' },
    party_required: { status: 400, code: 'PARTY_REQUIRED', msg: 'CustomerParty or contact/company required' },
    party_invalid: { status: 400, code: 'PARTY_INVALID', msg: 'Invalid customer party' },
    party_mismatch: { status: 409, code: 'PARTY_MISMATCH', msg: 'Quote party does not match Deal party' },
    deal_invalid: { status: 400, code: 'DEAL_INVALID', msg: 'Invalid deal' },
    contact_invalid: { status: 400, code: 'CONTACT_INVALID', msg: 'Invalid contact' },
    company_invalid: { status: 400, code: 'COMPANY_INVALID', msg: 'Invalid company' },
    product_invalid: { status: 400, code: 'PRODUCT_INVALID', msg: 'Invalid product reference' },
    immutable: { status: 409, code: 'IMMUTABLE', msg: 'Quote cannot be modified' },
    invalid_transition: { status: 409, code: 'INVALID_TRANSITION', msg: 'Invalid status transition' },
    not_draft: { status: 409, code: 'NOT_DRAFT', msg: 'Only draft quotes can be edited' },
    validation: { status: 400, code: 'VALIDATION', msg: 'Invalid quote payload' },
  };
  return map[f] ?? { status: 400, code: 'VALIDATION', msg: 'Invalid quote' };
}

export function createQuotesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('quotes:view');
  const create = requirePermission('quotes:create');
  const edit = requirePermission('quotes:edit');
  const del = requirePermission('quotes:delete');
  const send = requirePermission('quotes:send');
  const accept = requirePermission('quotes:accept');
  const reject = requirePermission('quotes:reject');
  const cancel = requirePermission('quotes:cancel');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('quotes')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.status) query = query.where('status', '=', q.status);
      if (q.customer_party_id) query = query.where('customer_party_id', '=', q.customer_party_id);
      if (q.deal_id) query = query.where('deal_id', '=', q.deal_id);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) => eb(eb.fn('lower', ['quote_number']), 'like', term));
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
      const quote = await getQuote(db, { workspaceId, id: req.params.id! });
      if (!quote) return fail(res, 404, 'NOT_FOUND', 'Quote not found');
      const lines = await getQuoteLines(db, { workspaceId, quoteId: quote.id });
      res.json({ data: { ...quote, lines }, error: null });
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
        createQuote(trx, { workspaceId, createdBy: userId, ...body }),
      );
      if (!result.ok) {
        const m = mapQuoteFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: { ...result.quote, lines: result.lines }, error: null });
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
        updateDraftQuote(trx, { workspaceId, id: req.params.id!, patch: body }),
      );
      if (!result.ok) {
        const m = mapQuoteFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: { ...result.quote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const result = await withUnitOfWork(db, async (trx) =>
        softDeleteQuote(trx, { workspaceId, id: req.params.id! }),
      );
      if (!result.ok) {
        const m = mapQuoteFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: { deleted: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  async function lifecycle(
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
    action: 'send' | 'view' | 'accept' | 'reject' | 'cancel',
  ) {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = reasonSchema.parse(req.body ?? {});
      const result = await withUnitOfWork(db, async (trx) =>
        transitionQuote(trx, {
          workspaceId,
          id: req.params.id!,
          action,
          actorId: userId,
          reason: body.reason,
        }),
      );
      if (!result.ok) {
        const m = mapQuoteFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.json({ data: { ...result.quote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  }

  router.post('/:id/send', send, (req, res, next) => lifecycle(req, res, next, 'send'));
  router.post('/:id/view', edit, (req, res, next) => lifecycle(req, res, next, 'view'));
  router.post('/:id/accept', accept, (req, res, next) => lifecycle(req, res, next, 'accept'));
  router.post('/:id/reject', reject, (req, res, next) => lifecycle(req, res, next, 'reject'));
  router.post('/:id/cancel', cancel, (req, res, next) => lifecycle(req, res, next, 'cancel'));

  router.post('/:id/revise', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const result = await withUnitOfWork(db, async (trx) =>
        reviseQuote(trx, { workspaceId, id: req.params.id!, createdBy: userId }),
      );
      if (!result.ok) {
        const m = mapQuoteFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: { ...result.quote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
