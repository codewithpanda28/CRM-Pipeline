/**
 * Credit notes session API (Phase 4 Finance).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import { createCreditNote, getCreditNote, getCreditNoteLines } from '../lib/finance';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  customer_party_id: z.string().uuid().optional(),
  invoice_id: z.string().uuid().optional(),
});

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
  invoice_id: z.string().uuid().nullable().optional(),
  currency: z.string().optional(),
  place_of_supply: z.string().nullable().optional(),
  place_of_supply_intra: z.boolean().nullable().optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapFail(f: string): { status: number; code: string; msg: string } {
  const map: Record<string, { status: number; code: string; msg: string }> = {
    not_found: { status: 404, code: 'NOT_FOUND', msg: 'Credit note not found' },
    party_invalid: { status: 400, code: 'PARTY_INVALID', msg: 'Invalid customer party' },
    invoice_not_found: { status: 404, code: 'INVOICE_NOT_FOUND', msg: 'Invoice not found' },
    invoice_party_mismatch: { status: 409, code: 'PARTY_MISMATCH', msg: 'Invoice party mismatch' },
    validation: { status: 400, code: 'VALIDATION', msg: 'Invalid credit note payload' },
  };
  return map[f] ?? { status: 400, code: 'VALIDATION', msg: 'Invalid credit note' };
}

export function createCreditNotesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('credit_notes:view');
  const create = requirePermission('credit_notes:create');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('credit_notes')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.customer_party_id) query = query.where('customer_party_id', '=', q.customer_party_id);
      if (q.invoice_id) query = query.where('invoice_id', '=', q.invoice_id);
      const rows = await query.execute();
      res.json({ data: rows, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const cn = await getCreditNote(db, { workspaceId, id: req.params.id! });
      if (!cn) return fail(res, 404, 'NOT_FOUND', 'Credit note not found');
      const lines = await getCreditNoteLines(db, { workspaceId, creditNoteId: cn.id });
      res.json({ data: { ...cn, lines }, error: null });
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
        createCreditNote(trx, { workspaceId, createdBy: userId, ...body }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: { ...result.creditNote, lines: result.lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
