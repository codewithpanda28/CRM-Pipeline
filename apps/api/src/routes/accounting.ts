/**
 * Accounting API — COA, periods, journals, GL statements.
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import { recordSecurityAudit } from '../lib/security-audit';
import {
  listAccounts,
  createAccount,
  updateAccount,
  listPeriods,
  setPeriodStatus,
  listJournalEntries,
  getJournalEntry,
  getJournalLines,
  reverseJournal,
  postJournal,
  reportTrialBalance,
  reportProfitAndLoss,
  reportBalanceSheet,
  reportCashFlow,
  reportAccountLedger,
} from '../lib/accounting';

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createAccountingRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('accounting:view');
  const manage = requirePermission('accounting:manage');
  const reports = requirePermission('reports:view');

  router.get('/accounts', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const data = await listAccounts(db, workspaceId, {
        includeInactive: req.query['include_inactive'] === '1',
      });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/accounts', manage, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          account_type: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
          description: z.string().nullable().optional(),
          parent_id: z.string().uuid().nullable().optional(),
        })
        .parse(req.body);
      const data = await withUnitOfWork(db, async (trx) =>
        createAccount(trx, { workspaceId, ...body }),
      );
      res.status(201).json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/accounts/:id', manage, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          is_active: z.boolean().optional(),
        })
        .parse(req.body);
      const data = await updateAccount(db, {
        workspaceId,
        id: req.params['id']!,
        patch: body,
      });
      if (!data) return fail(res, 404, 'NOT_FOUND', 'Account not found');
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/periods', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const data = await listPeriods(db, workspaceId);
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/periods/:id/status', manage, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z.object({ status: z.enum(['open', 'soft_closed', 'locked']) }).parse(req.body);
      const data = await withUnitOfWork(db, async (trx) => {
        const period = await setPeriodStatus(trx, {
          workspaceId: auth.workspace.id,
          id: req.params['id']!,
          status: body.status,
          actorId: auth.user?.id,
        });
        if (period) {
          await recordSecurityAudit(trx as never, {
            tenant_id: auth.workspace.id,
            actor_type: 'user',
            actor_id: auth.user?.id ?? null,
            action: 'accounting.period.status',
            entity_type: 'accounting_period',
            entity_id: period.id,
            meta: { status: body.status },
          });
        }
        return period;
      });
      if (!data) return fail(res, 404, 'NOT_FOUND', 'Period not found');
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/journals', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const data = await listJournalEntries(db, {
        workspaceId,
        limit: Number(req.query['limit'] ?? 50),
        offset: Number(req.query['offset'] ?? 0),
      });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/journals/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const entry = await getJournalEntry(db, { workspaceId, id: req.params['id']! });
      if (!entry) return fail(res, 404, 'NOT_FOUND', 'Journal not found');
      const lines = await getJournalLines(db, { workspaceId, entryId: entry.id });
      res.json({ data: { ...entry, lines }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals', manage, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          entry_date: z.string(),
          memo: z.string().nullable().optional(),
          currency: z.string().optional(),
          lines: z
            .array(
              z.object({
                account_id: z.string().uuid(),
                debit: z.union([z.string(), z.number()]).optional(),
                credit: z.union([z.string(), z.number()]).optional(),
                description: z.string().nullable().optional(),
              }),
            )
            .min(2),
        })
        .parse(req.body);
      const postingKey = `manual:${auth.workspace.id}:${body.entry_date}:${Date.now()}`;
      const result = await withUnitOfWork(db, async (trx) => {
        const posted = await postJournal(trx, {
          workspaceId: auth.workspace.id,
          entryDate: body.entry_date,
          memo: body.memo,
          sourceType: 'manual',
          sourceId: null,
          postingKey,
          currency: body.currency,
          actorId: auth.user?.id,
          lines: body.lines.map((l) => ({
            account_id: l.account_id,
            debit: l.debit != null ? String(l.debit) : '0',
            credit: l.credit != null ? String(l.credit) : '0',
            description: l.description,
          })),
        });
        if (posted.ok) {
          await recordSecurityAudit(trx as never, {
            tenant_id: auth.workspace.id,
            actor_type: 'user',
            actor_id: auth.user?.id ?? null,
            action: 'accounting.journal.post',
            entity_type: 'journal_entry',
            entity_id: posted.entry?.id ?? null,
          });
        }
        return posted;
      });
      if (!result.ok) {
        const map: Record<string, number> = {
          unbalanced: 422,
          period_locked: 409,
          period_closed: 409,
          no_period: 409,
          empty_lines: 422,
          invalid_line: 422,
        };
        return fail(res, map[result.fail] ?? 400, result.fail.toUpperCase(), result.message ?? result.fail);
      }
      res.status(201).json({
        data: { ...result.entry, lines: result.lines, idempotent: result.idempotent },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/journals/:id/reverse', manage, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const result = await withUnitOfWork(db, async (trx) => {
        const rev = await reverseJournal(trx, {
          workspaceId: auth.workspace.id,
          entryId: req.params['id']!,
          actorId: auth.user?.id,
        });
        if (rev.ok) {
          await recordSecurityAudit(trx as never, {
            tenant_id: auth.workspace.id,
            actor_type: 'user',
            actor_id: auth.user?.id ?? null,
            action: 'accounting.journal.reverse',
            entity_type: 'journal_entry',
            entity_id: rev.original.id,
          });
        }
        return rev;
      });
      if (!result.ok) return fail(res, 409, result.fail.toUpperCase(), result.fail);
      res.json({ data: result, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/trial-balance', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const asOf = typeof req.query['as_of'] === 'string' ? req.query['as_of'] : undefined;
      const data = await reportTrialBalance(db, { workspaceId, asOf });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/profit-and-loss', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
      const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
      const data = await reportProfitAndLoss(db, { workspaceId, from, to });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/balance-sheet', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const asOf = typeof req.query['as_of'] === 'string' ? req.query['as_of'] : undefined;
      const data = await reportBalanceSheet(db, { workspaceId, asOf });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/cash-flow', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
      const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
      const data = await reportCashFlow(db, { workspaceId, from, to });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/reports/ledger/:accountId', reports, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const from = typeof req.query['from'] === 'string' ? req.query['from'] : undefined;
      const to = typeof req.query['to'] === 'string' ? req.query['to'] : undefined;
      const data = await reportAccountLedger(db, {
        workspaceId,
        accountId: req.params['accountId']!,
        from,
        to,
      });
      if (!data) return fail(res, 404, 'NOT_FOUND', 'Account not found');
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
