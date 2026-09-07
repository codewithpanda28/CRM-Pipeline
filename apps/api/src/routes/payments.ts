/**
 * Payments session API (Phase 4 Finance).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import { createPayment, refundPayment, getPayment } from '../lib/finance';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  invoice_id: z.string().uuid().optional(),
  customer_party_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().optional(),
  payment_date: z.string().optional(),
  method: z.enum(['cash', 'bank', 'upi', 'card', 'gateway', 'other']).optional(),
  reference: z.string().nullable().optional(),
  gateway_provider: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const refundSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  reason: z.string().nullable().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function mapFail(f: string): { status: number; code: string; msg: string } {
  const map: Record<string, { status: number; code: string; msg: string }> = {
    not_found: { status: 404, code: 'NOT_FOUND', msg: 'Payment not found' },
    invoice_not_found: { status: 404, code: 'INVOICE_NOT_FOUND', msg: 'Invoice not found' },
    currency_mismatch: { status: 400, code: 'CURRENCY_MISMATCH', msg: 'Payment currency must match invoice' },
    amount_exceeds_due: { status: 409, code: 'AMOUNT_EXCEEDS_DUE', msg: 'Amount exceeds remaining due' },
    invoice_not_open: { status: 409, code: 'INVOICE_NOT_OPEN', msg: 'Invoice is not open for payment' },
    refund_exceeds: { status: 409, code: 'REFUND_EXCEEDS', msg: 'Refund exceeds remaining payment amount' },
    validation: { status: 400, code: 'VALIDATION', msg: 'Invalid payment payload' },
  };
  return map[f] ?? { status: 400, code: 'VALIDATION', msg: 'Invalid payment' };
}

export function createPaymentsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('payments:view');
  const create = requirePermission('payments:create');
  const refund = requirePermission('payments:refund');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('payments')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('payment_date', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.invoice_id) query = query.where('invoice_id', '=', q.invoice_id);
      if (q.customer_party_id) query = query.where('customer_party_id', '=', q.customer_party_id);
      const rows = await query.execute();
      res.json({ data: rows, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const payment = await getPayment(db, { workspaceId, id: req.params.id! });
      if (!payment) return fail(res, 404, 'NOT_FOUND', 'Payment not found');
      res.json({ data: payment, error: null });
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
        createPayment(trx, {
          workspaceId,
          invoiceId: body.invoice_id,
          amount: body.amount,
          currency: body.currency,
          payment_date: body.payment_date,
          method: body.method,
          reference: body.reference,
          gateway_provider: body.gateway_provider,
          notes: body.notes,
          receivedBy: userId,
        }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: { ...result.payment, invoice: result.invoice }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/refund', refund, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = refundSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        refundPayment(trx, {
          workspaceId,
          paymentId: req.params.id!,
          amount: body.amount,
          reason: body.reason,
          createdBy: userId,
        }),
      );
      if (!result.ok) {
        const m = mapFail(result.fail);
        return fail(res, m.status, m.code, m.msg);
      }
      res.status(201).json({ data: { refund: result.refund, payment: result.payment }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
