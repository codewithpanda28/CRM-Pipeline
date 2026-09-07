/**
 * Public API Payments (/v1/payments).
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { withUnitOfWork } from '../../lib/domain-outbox';
import { createPayment, refundPayment, getPayment } from '../../lib/finance';

const createSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().optional(),
  method: z.enum(['cash', 'bank', 'upi', 'card', 'gateway', 'other']).optional(),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createV1PaymentsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const rows = await db
        .selectFrom('payments')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .orderBy('payment_date', 'desc')
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
      const payment = await getPayment(db, { workspaceId: workspace.id, id: req.params.id! });
      if (!payment) return fail(res, 404, 'NOT_FOUND', 'Payment not found');
      res.json({ data: payment, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        createPayment(trx, {
          workspaceId: workspace.id,
          invoiceId: body.invoice_id,
          amount: body.amount,
          currency: body.currency,
          method: body.method,
          reference: body.reference,
          notes: body.notes,
          receivedBy: null,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'payment failed');
      res.status(201).json({ data: { ...result.payment, invoice: result.invoice }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/refund', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = z.object({ amount: z.union([z.string(), z.number()]), reason: z.string().optional() }).parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        refundPayment(trx, {
          workspaceId: workspace.id,
          paymentId: req.params.id!,
          amount: body.amount,
          reason: body.reason,
          createdBy: null,
        }),
      );
      if (!result.ok) return fail(res, 400, result.fail.toUpperCase(), 'refund failed');
      res.status(201).json({ data: { refund: result.refund, payment: result.payment }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
