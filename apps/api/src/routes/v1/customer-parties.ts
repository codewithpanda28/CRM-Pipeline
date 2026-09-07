/**
 * Public API CustomerParty routes (/v1/customer-parties).
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';
import { withUnitOfWork } from '../../lib/domain-outbox';
import {
  ensureCustomerParty,
  getCustomerParty,
  buildCustomer360,
  mergeCustomerParties,
  onCustomerPartyUpdated,
  onCustomerPartyLinked,
} from '../../lib/customer-parties';
import { assertCustomerPartyForDeal } from '../../lib/deals/integrity';

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
  })
  .refine((b) => Boolean(b.contact_id) !== Boolean(b.company_id), {
    message: 'Provide exactly one of contact_id or company_id',
  });

const updateSchema = z.object({
  display_name: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const linkSchema = z.object({ deal_id: z.string().uuid() });
const mergeSchema = z.object({
  into_id: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createV1CustomerPartiesRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('customer_parties')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
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
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id/360', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const result = await buildCustomer360(db, {
        workspaceId: workspace.id,
        partyId: req.params['id']!,
      });
      if (!result.ok) {
        return fail(res, result.fail === 'not_found' ? 404 : 410, result.fail.toUpperCase(), result.fail);
      }
      if (result.redirected) {
        return res.json({
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

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const party = await getCustomerParty(db, {
        workspaceId: workspace.id,
        id: req.params['id']!,
      });
      if (!party) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      res.json({ data: party, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        ensureCustomerParty(trx, {
          workspaceId: workspace.id,
          partyType: body.company_id ? 'company' : 'contact',
          partyId: (body.company_id ?? body.contact_id)!,
          displayName: body.display_name,
        }),
      );
      if (!result.ok) return fail(res, 400, 'INVALID_IDENTITY', result.fail);
      res.status(result.created ? 201 : 200).json({ data: result.party, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = updateSchema.parse(req.body);
      const current = await getCustomerParty(db, {
        workspaceId: workspace.id,
        id: req.params['id']!,
      });
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      if (current.status === 'merged') return fail(res, 409, 'MERGED', 'Cannot edit merged party');

      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('customer_parties')
          .set({
            ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
            updated_at: new Date(),
          })
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspace.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        await onCustomerPartyUpdated(trx, {
          workspaceId: workspace.id,
          partyId: current.id,
          changeKey: `v1-patch:${Date.now()}`,
        });
        return row;
      });
      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('customer_parties')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .where('status', '!=', 'merged')
          .returningAll()
          .executeTakeFirst();
        if (row) {
          await onCustomerPartyUpdated(trx, {
            workspaceId: workspace.id,
            partyId: row.id,
            changeKey: `v1-delete:${row.id}`,
          });
        }
        return row;
      });
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Customer party not found');
      res.json({ data: { id: updated.id }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/link', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = linkSchema.parse(req.body);
      const party = await getCustomerParty(db, {
        workspaceId: workspace.id,
        id: req.params['id']!,
      });
      if (!party || party.status === 'merged') {
        return fail(res, party ? 409 : 404, party ? 'MERGED' : 'NOT_FOUND', 'Invalid party');
      }
      const partyOk = await assertCustomerPartyForDeal(db, {
        workspaceId: workspace.id,
        customerPartyId: party.id,
      });
      if (partyOk !== 'ok') return fail(res, 400, 'INVALID_CUSTOMER_PARTY', 'Invalid party');

      const deal = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', body.deal_id)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!deal) return fail(res, 404, 'DEAL_NOT_FOUND', 'Deal not found');
      if (deal.customer_party_id && deal.customer_party_id !== party.id) {
        return fail(res, 409, 'CONFLICT', 'Deal already linked to another party');
      }

      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('deals')
          .set({ customer_party_id: party.id, updated_at: new Date() })
          .where('id', '=', deal.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        await onCustomerPartyLinked(trx, {
          workspaceId: workspace.id,
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

  router.post('/:id/merge', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = mergeSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        mergeCustomerParties(trx, {
          workspaceId: workspace.id,
          sourcePartyId: req.params['id']!,
          targetPartyId: body.into_id,
          reason: body.reason,
          actorUserId: null,
        }),
      );
      if (!result.ok) {
        return fail(res, 400, result.fail.toUpperCase(), `Merge failed: ${result.fail}`);
      }
      res.json({
        data: { source_id: result.sourceId, survivor_id: result.survivorId },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
