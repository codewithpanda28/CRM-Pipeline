import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database, LeadStatus } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';
import { withUnitOfWork } from '../../lib/domain-outbox';
import {
  assertLeadOwner,
  assertLeadOptionalRefs,
  assertLeadStatusTransition,
  canTransitionLeadStatus,
  convertLead,
  displayLeadName,
  findLeadDuplicates,
  normalizeEmail,
  onLeadCreated,
  onLeadStatusChanged,
  onLeadUpdated,
} from '../../lib/leads';

const leadStatuses = [
  'new',
  'contacted',
  'qualified',
  'converted',
  'unqualified',
  'lost',
  'abandoned',
] as const;

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(leadStatuses).optional(),
});

const createSchema = z.object({
  name: z.string().min(1).optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned']).optional(),
  rating: z.enum(['hot', 'warm', 'cold']).nullable().optional(),
  owner_id: z.string().uuid(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned']).optional(),
  rating: z.enum(['hot', 'warm', 'cold']).nullable().optional(),
  owner_id: z.string().uuid().optional(),
  notes: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

const convertSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  create_company: z.boolean().optional(),
  create_deal: z.boolean().optional(),
  deal: z
    .object({
      pipeline_id: z.string().uuid(),
      stage_id: z.string().uuid(),
      name: z.string().optional(),
      amount: z.union([z.string(), z.number()]).optional(),
      currency: z.string().length(3).optional(),
      owner_id: z.string().uuid().optional(),
    })
    .nullable()
    .optional(),
  create_customer_party: z.boolean().optional(),
  customer_party_id: z.string().uuid().nullable().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createV1LeadsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('leads')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc');
      if (q.status) query = query.where('status', '=', q.status);
      const offset = (q.page - 1) * q.per_page;
      const rows = await query.limit(q.per_page).offset(offset).execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const lead = await db
        .selectFrom('leads')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!lead) return fail(res, 404, 'NOT_FOUND', 'Lead not found');
      res.json({ data: lead, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = createSchema.parse(req.body);
      if ((await assertLeadOwner(db, workspace.id, body.owner_id)) !== 'ok') {
        return fail(res, 400, 'INVALID_OWNER', 'owner_id not found in tenant');
      }
      const duplicates = await findLeadDuplicates(db, {
        workspaceId: workspace.id,
        email: body.email,
        phone: body.phone,
        companyName: body.company_name,
        website: body.website,
      });
      const status = (body.status ?? 'new') as LeadStatus;
      const lead = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .insertInto('leads')
          .values({
            id: randomUUID(),
            workspace_id: workspace.id,
            name: displayLeadName(body),
            first_name: body.first_name ?? null,
            last_name: body.last_name ?? null,
            email: normalizeEmail(body.email ?? null),
            phone: body.phone ?? null,
            company_name: body.company_name ?? null,
            website: body.website ?? null,
            source: body.source ?? null,
            status,
            rating: body.rating ?? null,
            owner_id: body.owner_id,
            notes: body.notes ?? null,
            custom_fields: (body.custom_fields ?? {}) as never,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await onLeadCreated(trx, { workspaceId: workspace.id, leadId: row.id, status: row.status });
        return row;
      });
      res.status(201).json({ data: lead, error: null, meta: { duplicates } });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = updateSchema.parse(req.body);
      const current = await db
        .selectFrom('leads')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Lead not found');
      if (current.status === 'converted') {
        return fail(res, 409, 'ALREADY_CONVERTED', 'Converted leads cannot be edited');
      }
      if (body.owner_id && (await assertLeadOwner(db, workspace.id, body.owner_id)) !== 'ok') {
        return fail(res, 400, 'INVALID_OWNER', 'owner_id not found in tenant');
      }
      if (body.status && body.status !== current.status) {
        if (!canTransitionLeadStatus(current.status, body.status)) {
          return fail(res, 400, 'INVALID_STATUS_TRANSITION', 'Invalid status transition');
        }
      }
      const updated = await withUnitOfWork(db, async (trx) => {
        const patch: Record<string, unknown> = { updated_at: new Date() };
        for (const k of [
          'name',
          'phone',
          'company_name',
          'website',
          'source',
          'rating',
          'owner_id',
          'notes',
          'lost_reason',
          'custom_fields',
        ] as const) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        if (body.email !== undefined) patch.email = normalizeEmail(body.email);
        if (body.status !== undefined) {
          assertLeadStatusTransition(current.status, body.status);
          patch.status = body.status;
        }
        const row = await trx
          .updateTable('leads')
          .set(patch)
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspace.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        if (body.status && body.status !== current.status) {
          await onLeadStatusChanged(trx, {
            workspaceId: workspace.id,
            leadId: current.id,
            fromStatus: current.status,
            toStatus: body.status,
          });
        } else {
          await onLeadUpdated(trx, {
            workspaceId: workspace.id,
            leadId: current.id,
            changeKey: `patch:${Date.now()}`,
          });
        }
        return row;
      });
      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/convert', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const body = convertSchema.parse(req.body);
      if (body.create_deal && !body.deal) {
        return fail(res, 400, 'DEAL_REQUIRED', 'deal payload required when create_deal is true');
      }
      const refOk = await assertLeadOptionalRefs(db, {
        workspaceId: workspace.id,
        contactId: body.contact_id,
        companyId: body.company_id,
      });
      if (refOk === 'contact') return fail(res, 400, 'INVALID_CONTACT', 'contact_id not found in tenant');
      if (refOk === 'company') return fail(res, 400, 'INVALID_COMPANY', 'company_id not found in tenant');

      const existing = await db
        .selectFrom('leads')
        .select(['owner_id'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .executeTakeFirst();
      if (!existing) return fail(res, 404, 'NOT_FOUND', 'Lead not found');

      const result = await withUnitOfWork(db, async (trx) =>
        convertLead(trx, {
          workspaceId: workspace.id,
          userId: existing.owner_id,
          leadId: req.params['id']!,
          contactId: body.contact_id,
          companyId: body.company_id,
          createCompany: body.create_company,
          createDeal: Boolean(body.create_deal),
          deal: body.deal,
          createCustomerParty: Boolean(body.create_customer_party),
          customerPartyId: body.customer_party_id,
        }),
      );
      res.status(result.idempotent ? 200 : 201).json({
        data: {
          lead: result.lead,
          links: result.links,
          party_action: result.partyAction,
          idempotent: result.idempotent,
        },
        error: null,
      });
    } catch (e) {
      const err = e as { code?: string; status?: number; message?: string };
      if (err.code && err.status) {
        return fail(res, err.status, err.code, err.message ?? 'Conversion failed');
      }
      next(e);
    }
  });

  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const updated = await db
        .updateTable('leads')
        .set({ deleted_at: new Date(), updated_at: new Date() })
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .returning(['id'])
        .executeTakeFirst();
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Lead not found');
      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
