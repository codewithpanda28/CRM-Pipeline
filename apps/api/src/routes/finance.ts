/**
 * Finance profile, reports, and recurring schedules.
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import {
  getFinanceProfile,
  upsertFinanceProfile,
  reportArAging,
  reportSalesRegister,
  reportPaymentsRegister,
  reportExpensesRegister,
  reportTaxSummary,
  reportApRegister,
  createRecurringSchedule,
  generateDueRecurringInvoices,
  getRecurringSchedule,
} from '../lib/finance';

const profileSchema = z.object({
  legal_name: z.string().nullable().optional(),
  trade_name: z.string().nullable().optional(),
  gstin: z.string().nullable().optional(),
  tax_id: z.string().nullable().optional(),
  address: z.record(z.unknown()).optional(),
  bank_details: z.record(z.unknown()).optional(),
  default_currency: z.string().optional(),
  default_tax_scheme: z.enum(['none', 'in_gst', 'vat', 'other']).optional(),
  default_payment_terms: z.string().nullable().optional(),
  place_of_supply_default: z.string().nullable().optional(),
  invoice_prefix: z.string().optional(),
  credit_note_prefix: z.string().optional(),
  debit_note_prefix: z.string().optional(),
  payment_prefix: z.string().optional(),
  expense_prefix: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const reportRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
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

const scheduleSchema = z.object({
  customer_party_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  cadence: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  next_run_at: z.string(),
  currency: z.string().optional(),
  place_of_supply: z.string().nullable().optional(),
  payment_terms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  terms: z.string().nullable().optional(),
  line_template: z.array(lineSchema).min(1),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createFinanceRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const settings = requirePermission('finance:settings');
  const reports = requirePermission('reports:view');
  const invoicesCreate = requirePermission('invoices:create');
  const invoicesView = requirePermission('invoices:view');

  router.get('/profile', settings, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const profile = await getFinanceProfile(db, workspaceId);
      res.json({ data: profile, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/profile', settings, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const workspaceId = auth.workspace.id;
      const body = profileSchema.parse(req.body);
      const profile = await withUnitOfWork(db, async (trx) => {
        const p = await upsertFinanceProfile(trx, { workspaceId, patch: body });
        const { recordSecurityAudit } = await import('../lib/security-audit');
        await recordSecurityAudit(trx as never, {
          tenant_id: workspaceId,
          actor_type: 'user',
          actor_id: auth.user?.id ?? null,
          action: 'finance.settings.update',
          entity_type: 'tenant_finance_profile',
          entity_id: workspaceId,
        });
        return p;
      });
      res.json({ data: profile, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/ar-aging', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const data = await reportArAging(db, workspaceId);
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/sales', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = reportRangeSchema.parse(req.query);
      const data = await reportSalesRegister(db, { workspaceId, ...q });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/payments', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = reportRangeSchema.parse(req.query);
      const data = await reportPaymentsRegister(db, { workspaceId, ...q });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/expenses', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = reportRangeSchema.parse(req.query);
      const data = await reportExpensesRegister(db, { workspaceId, ...q });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/tax', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = reportRangeSchema.parse(req.query);
      const data = await reportTaxSummary(db, { workspaceId, ...q });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/ap', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const data = await reportApRegister(db, workspaceId);
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/recurring', invoicesView, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const rows = await db
        .selectFrom('recurring_invoice_schedules')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('next_run_at', 'asc')
        .limit(100)
        .execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/recurring/:id', invoicesView, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const schedule = await getRecurringSchedule(db, { workspaceId, id: req.params.id! });
      if (!schedule) return fail(res, 404, 'NOT_FOUND', 'Schedule not found');
      res.json({ data: schedule, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/recurring', invoicesCreate, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = scheduleSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        createRecurringSchedule(trx, { workspaceId, createdBy: userId, ...body }),
      );
      if (!result.ok) {
        return fail(res, 400, result.fail.toUpperCase(), 'Could not create schedule');
      }
      res.status(201).json({ data: result.schedule, error: null });
    } catch (e) {
      if (e instanceof z.ZodError) {
        return fail(res, 400, 'VALIDATION', e.errors[0]?.message ?? 'Invalid schedule payload');
      }
      next(e);
    }
  });

  router.post('/recurring/generate', invoicesCreate, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const scheduleId = typeof req.body?.schedule_id === 'string' ? req.body.schedule_id : undefined;
      const result = await withUnitOfWork(db, async (trx) =>
        generateDueRecurringInvoices(trx, { workspaceId, scheduleId, createdBy: userId }),
      );
      res.json({ data: result, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
