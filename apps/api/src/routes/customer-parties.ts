/**
 * CustomerParty session API — CRUD, 360, link, merge, backfill (Phase 3A.3).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import {
  ensureCustomerParty,
  getCustomerParty,
  buildCustomer360,
  mergeCustomerParties,
  backfillCustomerParties,
  onCustomerPartyUpdated,
  onCustomerPartyLinked,
} from '../lib/customer-parties';
import { assertCustomerPartyForDeal } from '../lib/deals/integrity';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['active', 'inactive', 'merged']).optional(),
  party_type: z.enum(['contact', 'company']).optional(),
  q: z.string().optional(),
});

const createSchema = z
  .object({
    contact_id: z.string().uuid().optional(),
    company_id: z.string().uuid().optional(),
    display_name: z.string().min(1).optional(),
    primary_owner_id: z.string().uuid().nullable().optional(),
    custom_fields: z.record(z.unknown()).optional(),
  })
  .refine((b) => Boolean(b.contact_id) !== Boolean(b.company_id), {
    message: 'Provide exactly one of contact_id or company_id',
  });

const updateSchema = z.object({
  display_name: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  primary_owner_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const linkSchema = z.object({
  deal_id: z.string().uuid(),
});

const mergeSchema = z.object({
  into_id: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

const backfillSchema = z.object({
  dry_run: z.boolean().optional().default(true),
  limit: z.number().int().positive().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createCustomerPartiesRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('customers:view');
  const create = requirePermission('customers:create');
  const edit = requirePermission('customers:edit');
  const del = requirePermission('customers:delete');
  const merge = requirePermission('customers:merge');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('customer_parties')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.status) query = query.where('status', '=', q.status);
      else query = query.where('status', '!=', 'merged');
      if (q.party_type) query = query.where('party_type', '=', q.party_type);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) => eb(eb.fn('lower', ['display_name']), 'like', term));
      }
      const rows = await query.execute();
      res.json({ data: rows, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = createSchema.parse(req.body);
      const partyType = body.company_id ? 'company' : 'contact';
      const partyId = body.company_id ?? body.contact_id!;

      const result = await withUnitOfWork(db, async (trx) =>
        ensureCustomerParty(trx, {
          workspaceId,
          partyType,
          partyId,
          displayName: body.display_name,
          primaryOwnerId: body.primary_owner_id,
          customFields: body.custom_fields,
        }),
      );
      if (!result.ok) {
        return fail(res, 400, 'INVALID_IDENTITY', `Identity validation failed: ${result.fail}`);
      }
      res.status(result.created ? 201 : 200).json({
        data: result.party,
        meta: { created: result.created, reused: result.reused },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  // Must be before /:id
  router.post('/backfill', merge, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = backfillSchema.parse(req.body ?? {});
      const report = await backfillCustomerParties(db, {
        workspaceId,
        dryRun: body.dry_run !== false,
        limit: body.limit,
      });
      res.json({ data: report, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id/360', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const result = await buildCustomer360(db, {
        workspaceId,
        partyId: req.params['id']!,
      });
      if (!result.ok) {
        return fail(
          res,
          result.fail === 'not_found' ? 404 : 410,
          result.fail.toUpperCase(),
          result.fail === 'deleted' ? 'Customer party soft-deleted' : 'Customer party not found',
        );
      }
      if (result.redirected) {
        return res.status(200).json({
          data: {
            redirected: true,
            from_party_id: result.from_party_id,
            into_party_id: result.into_party_id,
          },
          error: null,
        });
      }
      res.json({ data: result, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const party = await getCustomerParty(db, {
        workspaceId,
        id: req.params['id']!,
        includeDeleted: false,
      });
      if (!party) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      if (party.status === 'merged' && party.merged_into_id) {
        return res.json({
          data: party,
          meta: { redirected_to: party.merged_into_id },
          error: null,
        });
      }
      res.json({ data: party, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = updateSchema.parse(req.body);
      const current = await getCustomerParty(db, {
        workspaceId,
        id: req.params['id']!,
      });
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      if (current.status === 'merged') {
        return fail(res, 409, 'MERGED', 'Cannot edit a merged party');
      }

      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('customer_parties')
          .set({
            ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            ...(body.primary_owner_id !== undefined
              ? { primary_owner_id: body.primary_owner_id }
              : {}),
            ...(body.custom_fields !== undefined
              ? { custom_fields: body.custom_fields as never }
              : {}),
            updated_at: new Date(),
          })
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();
        await onCustomerPartyUpdated(trx, {
          workspaceId,
          partyId: current.id,
          changeKey: `patch:${Date.now()}`,
        });
        return row;
      });
      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('customer_parties')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspaceId)
          .where('deleted_at', 'is', null)
          .where('status', '!=', 'merged')
          .returningAll()
          .executeTakeFirst();
        if (!row) return null;
        await onCustomerPartyUpdated(trx, {
          workspaceId,
          partyId: row.id,
          changeKey: `delete:${row.id}`,
        });
        return row;
      });
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      res.json({ data: { id: updated.id }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/link', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = linkSchema.parse(req.body);
      const party = await getCustomerParty(db, {
        workspaceId,
        id: req.params['id']!,
      });
      if (!party) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      if (party.status === 'merged') {
        return fail(res, 409, 'MERGED', 'Cannot link to a merged party');
      }

      const partyOk = await assertCustomerPartyForDeal(db, {
        workspaceId,
        customerPartyId: party.id,
      });
      if (partyOk !== 'ok') {
        return fail(res, 400, 'INVALID_CUSTOMER_PARTY', 'Party identity invalid');
      }

      const deal = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', body.deal_id)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'Deal not found in tenant');

      if (deal.customer_party_id && deal.customer_party_id !== party.id) {
        return fail(
          res,
          409,
          'CONFLICT',
          'Deal already linked to a different customer party',
        );
      }

      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('deals')
          .set({ customer_party_id: party.id, updated_at: new Date() })
          .where('id', '=', deal.id)
          .where('workspace_id', '=', workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();
        await onCustomerPartyLinked(trx, {
          workspaceId,
          partyId: party.id,
          linkType: 'deal',
          linkId: deal.id,
        });
        return row;
      });

      res.json({ data: { party_id: party.id, deal: updated }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/merge', merge, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = mergeSchema.parse(req.body);

      const result = await withUnitOfWork(db, async (trx) =>
        mergeCustomerParties(trx, {
          workspaceId,
          sourcePartyId: req.params['id']!,
          targetPartyId: body.into_id,
          reason: body.reason,
          actorUserId: userId,
        }),
      );

      if (!result.ok) {
        const status =
          result.fail === 'not_found' ? 404 : result.fail === 'same_party' ? 400 : 409;
        return fail(res, status, result.fail.toUpperCase(), `Merge failed: ${result.fail}`);
      }
      res.json({
        data: {
          source_id: result.sourceId,
          survivor_id: result.survivorId,
        },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
