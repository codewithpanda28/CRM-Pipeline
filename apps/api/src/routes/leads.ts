import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database, LeadStatus } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import { toCSV } from '../lib/csv';
import { recordSecurityAudit } from '../lib/security-audit';
import {
  assertLeadOwner,
  assertLeadOptionalRefs,
  assertLeadStatusTransition,
  canTransitionLeadStatus,
  convertLead,
  displayLeadName,
  enrichLeadsList,
  findLeadDuplicates,
  isLeadStatus,
  normalizeEmail,
  onLeadCreated,
  onLeadStatusChanged,
  onLeadUpdated,
} from '../lib/leads';
import {
  LEAD_BULK_MAX_IDS,
  LEAD_CSV_HEADERS,
  LEAD_EXPORT_MAX_ROWS,
  LEAD_IMPORT_MAX_ROWS,
  commitLeadImport,
  previewLeadImport,
} from '../lib/leads/import';

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
  owner_id: z.string().uuid().optional(),
  q: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  alternate_phone: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned']).optional(),
  rating: z.enum(['hot', 'warm', 'cold']).nullable().optional(),
  owner_id: z.string().uuid(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  check_duplicates: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  alternate_phone: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned']).optional(),
  rating: z.enum(['hot', 'warm', 'cold']).nullable().optional(),
  owner_id: z.string().uuid().optional(),
  notes: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  check_duplicates: z.boolean().optional(),
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
  idempotency_key: z.string().max(128).optional(),
  create_customer_party: z.boolean().optional(),
  customer_party_id: z.string().uuid().nullable().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

export function createLeadsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('leads:view');
  const create = requirePermission('leads:create');
  const edit = requirePermission('leads:edit');
  const del = requirePermission('leads:delete');
  const convert = requirePermission('leads:convert');

  const exportSchema = z.object({
    status: z.enum(leadStatuses).optional(),
    owner_id: z.string().uuid().optional(),
    q: z.string().optional(),
  });

  const importBodySchema = z.object({
    rows: z.array(z.record(z.unknown())).min(1).max(LEAD_IMPORT_MAX_ROWS),
    options: z
      .object({
        skip_email_duplicates: z.boolean().optional(),
      })
      .optional(),
  });

  const bulkSchema = z.object({
    action: z.enum(['assign', 'status', 'delete']),
    ids: z.array(z.string().uuid()).min(1).max(LEAD_BULK_MAX_IDS),
    owner_id: z.string().uuid().optional(),
    status: z.enum(['new', 'contacted', 'qualified', 'unqualified', 'lost', 'abandoned']).optional(),
  });

  router.get('/export', view, async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const filters = exportSchema.parse(req.query);
      let query = db
        .selectFrom('leads')
        .select([
          'name',
          'first_name',
          'last_name',
          'email',
          'phone',
          'alternate_phone',
          'company_name',
          'website',
          'source',
          'status',
          'rating',
          'owner_id',
          'notes',
        ])
        .where('workspace_id', '=', auth.workspace.id)
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc');
      if (filters.status) query = query.where('status', '=', filters.status);
      if (filters.owner_id) query = query.where('owner_id', '=', filters.owner_id);
      if (filters.q?.trim()) {
        const term = `%${filters.q.trim().toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb('name', 'ilike', term),
            eb('email', 'ilike', term),
            eb('company_name', 'ilike', term),
            eb('phone', 'ilike', term),
          ]),
        );
      }

      const countRow = await db
        .selectFrom('leads')
        .select((eb) => eb.fn.countAll<string>().as('c'))
        .where('workspace_id', '=', auth.workspace.id)
        .where('deleted_at', 'is', null)
        .$if(Boolean(filters.status), (qb) => qb.where('status', '=', filters.status!))
        .$if(Boolean(filters.owner_id), (qb) => qb.where('owner_id', '=', filters.owner_id!))
        .$if(Boolean(filters.q?.trim()), (qb) => {
          const term = `%${filters.q!.trim().toLowerCase()}%`;
          return qb.where((eb) =>
            eb.or([
              eb('name', 'ilike', term),
              eb('email', 'ilike', term),
              eb('company_name', 'ilike', term),
              eb('phone', 'ilike', term),
            ]),
          );
        })
        .executeTakeFirst();

      const total = Number(countRow?.c ?? 0);
      if (total > LEAD_EXPORT_MAX_ROWS) {
        return fail(
          res,
          413,
          'EXPORT_TOO_LARGE',
          `Export exceeds ${LEAD_EXPORT_MAX_ROWS} rows (${total}). Narrow filters or use ops tenant export.`,
        );
      }

      const rows = await query.limit(LEAD_EXPORT_MAX_ROWS).execute();
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'crm.leads.export',
        entity_type: 'lead',
        meta: { row_count: rows.length, filters },
        ip: req.ip,
        user_agent: req.get('user-agent'),
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
      res.send(toCSV([...LEAD_CSV_HEADERS], rows as Record<string, unknown>[]));
    } catch (e) {
      next(e);
    }
  });

  router.post('/import/preview', create, async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const body = importBodySchema.parse(req.body);
      const preview = await previewLeadImport(db, {
        workspaceId: auth.workspace.id,
        actorUserId: auth.user.id,
        rows: body.rows,
      });
      res.json({ data: preview, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/import/commit', create, async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const body = importBodySchema.parse(req.body);
      const summary = await commitLeadImport(db, {
        workspaceId: auth.workspace.id,
        actorUserId: auth.user.id,
        rows: body.rows,
        skipEmailDuplicates: body.options?.skip_email_duplicates,
      });
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'crm.leads.import',
        entity_type: 'lead',
        meta: {
          created: summary.created,
          skipped: summary.skipped,
          duplicate: summary.duplicate,
          failed: summary.failed,
          row_count: body.rows.length,
        },
        ip: req.ip,
        user_agent: req.get('user-agent'),
      });
      res.json({ data: summary, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/bulk', async (req, res, next) => {
    try {
      const auth = req as unknown as AuthenticatedRequest;
      const body = bulkSchema.parse(req.body);

      const neededPerm = body.action === 'delete' ? 'leads:delete' : 'leads:edit';
      const { userHasPermission } = await import('../middleware/permission');
      const allowed = await userHasPermission(db, auth.user, auth.workspace.id, neededPerm);
      if (!allowed) {
        return fail(res, 403, 'FORBIDDEN', 'Insufficient permissions.');
      }

      let updated = 0;
      const errors: string[] = [];
      let failed = 0;

      if (body.action === 'assign') {
        if (!body.owner_id) return fail(res, 400, 'INVALID_INPUT', 'owner_id required for assign');
        const ownerOk = await assertLeadOwner(db, auth.workspace.id, body.owner_id);
        if (ownerOk !== 'ok') return fail(res, 400, 'INVALID_OWNER', 'owner_id not found in tenant');

        for (const id of body.ids) {
          const current = await db
            .selectFrom('leads')
            .selectAll()
            .where('id', '=', id)
            .where('workspace_id', '=', auth.workspace.id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();
          if (!current) {
            failed += 1;
            errors.push(`${id}: not found`);
            continue;
          }
          if (current.status === 'converted') {
            failed += 1;
            errors.push(`${id}: converted leads cannot be reassigned`);
            continue;
          }
          await withUnitOfWork(db, async (trx) => {
            await trx
              .updateTable('leads')
              .set({ owner_id: body.owner_id!, updated_at: new Date() })
              .where('id', '=', id)
              .where('workspace_id', '=', auth.workspace.id)
              .execute();
            await onLeadUpdated(trx, {
              workspaceId: auth.workspace.id,
              leadId: id,
              changeKey: `bulk-assign:${id}`,
            });
          });
          updated += 1;
        }
      } else if (body.action === 'status') {
        if (!body.status) return fail(res, 400, 'INVALID_INPUT', 'status required for status action');
        for (const id of body.ids) {
          const current = await db
            .selectFrom('leads')
            .selectAll()
            .where('id', '=', id)
            .where('workspace_id', '=', auth.workspace.id)
            .where('deleted_at', 'is', null)
            .executeTakeFirst();
          if (!current) {
            failed += 1;
            errors.push(`${id}: not found`);
            continue;
          }
          if (current.status === 'converted') {
            failed += 1;
            errors.push(`${id}: converted leads cannot change status via bulk`);
            continue;
          }
          if (!canTransitionLeadStatus(current.status, body.status)) {
            failed += 1;
            errors.push(`${id}: cannot transition ${current.status} → ${body.status}`);
            continue;
          }
          await withUnitOfWork(db, async (trx) => {
            await trx
              .updateTable('leads')
              .set({ status: body.status!, updated_at: new Date() })
              .where('id', '=', id)
              .where('workspace_id', '=', auth.workspace.id)
              .execute();
            await onLeadStatusChanged(trx, {
              workspaceId: auth.workspace.id,
              leadId: id,
              fromStatus: current.status,
              toStatus: body.status!,
            });
          });
          updated += 1;
        }
      } else {
        for (const id of body.ids) {
          const row = await withUnitOfWork(db, async (trx) => {
            const updatedRow = await trx
              .updateTable('leads')
              .set({ deleted_at: new Date(), updated_at: new Date() })
              .where('id', '=', id)
              .where('workspace_id', '=', auth.workspace.id)
              .where('deleted_at', 'is', null)
              .returningAll()
              .executeTakeFirst();
            if (!updatedRow) return null;
            await onLeadUpdated(trx, {
              workspaceId: auth.workspace.id,
              leadId: id,
              changeKey: `bulk-delete:${id}`,
            });
            return updatedRow;
          });
          if (!row) {
            failed += 1;
            errors.push(`${id}: not found`);
            continue;
          }
          updated += 1;
        }
      }

      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'crm.leads.bulk',
        entity_type: 'lead',
        meta: {
          action: body.action,
          updated,
          failed,
          id_count: body.ids.length,
        },
        ip: req.ip,
        user_agent: req.get('user-agent'),
      });

      res.json({ data: { updated, failed, errors }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('leads')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('created_at', 'desc');
      if (q.status) query = query.where('status', '=', q.status);
      if (q.owner_id) query = query.where('owner_id', '=', q.owner_id);
      if (q.q?.trim()) {
        const term = `%${q.q.trim().toLowerCase()}%`;
        query = query.where((eb) =>
          eb.or([
            eb('name', 'ilike', term),
            eb('email', 'ilike', term),
            eb('company_name', 'ilike', term),
            eb('phone', 'ilike', term),
          ]),
        );
      }
      const offset = (q.page - 1) * q.per_page;
      const rows = await query.limit(q.per_page).offset(offset).execute();
      const data = await enrichLeadsList(db, workspaceId, rows);
      res.json({ data, error: null, meta: { page: q.page, per_page: q.per_page } });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const lead = await db
        .selectFrom('leads')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!lead) return fail(res, 404, 'NOT_FOUND', 'Lead not found');
      const links = await db
        .selectFrom('lead_conversion_links')
        .selectAll()
        .where('lead_id', '=', lead.id)
        .where('workspace_id', '=', workspaceId)
        .execute();
      const duplicates = await findLeadDuplicates(db, {
        workspaceId,
        email: lead.email,
        phone: lead.phone,
        alternatePhone: lead.alternate_phone,
        companyName: lead.company_name,
        website: lead.website,
        excludeLeadId: lead.id,
      });
      res.json({ data: { ...lead, conversion_links: links, duplicates }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = createSchema.parse(req.body);
      const ownerOk = await assertLeadOwner(db, workspaceId, body.owner_id);
      if (ownerOk !== 'ok') return fail(res, 400, 'INVALID_OWNER', 'owner_id not found in tenant');

      const name = displayLeadName(body);
      const status = (body.status ?? 'new') as LeadStatus;
      const duplicates =
        body.check_duplicates === false
          ? []
          : await findLeadDuplicates(db, {
              workspaceId,
              email: body.email,
              phone: body.phone,
              alternatePhone: body.alternate_phone,
              companyName: body.company_name,
              website: body.website,
            });

      const id = randomUUID();
      const lead = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .insertInto('leads')
          .values({
            id,
            workspace_id: workspaceId,
            name,
            first_name: body.first_name ?? null,
            last_name: body.last_name ?? null,
            email: normalizeEmail(body.email ?? null),
            phone: body.phone ?? null,
            alternate_phone: body.alternate_phone ?? null,
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
        await onLeadCreated(trx, { workspaceId, leadId: row.id, status: row.status });
        return row;
      });

      res.status(201).json({ data: lead, error: null, meta: { duplicates } });
    } catch (e) {
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const body = updateSchema.parse(req.body);
      const current = await db
        .selectFrom('leads')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Lead not found');
      if (current.status === 'converted') {
        return fail(res, 409, 'ALREADY_CONVERTED', 'Converted leads cannot be edited');
      }

      if (body.owner_id) {
        const ownerOk = await assertLeadOwner(db, workspaceId, body.owner_id);
        if (ownerOk !== 'ok') return fail(res, 400, 'INVALID_OWNER', 'owner_id not found in tenant');
      }

      if (body.status && body.status !== current.status) {
        if (!isLeadStatus(body.status) || !canTransitionLeadStatus(current.status, body.status)) {
          return fail(
            res,
            400,
            'INVALID_STATUS_TRANSITION',
            `Cannot transition from ${current.status} to ${body.status}`,
          );
        }
      }

      const duplicates =
        body.check_duplicates === false
          ? []
          : await findLeadDuplicates(db, {
              workspaceId,
              email: body.email !== undefined ? body.email : current.email,
              phone: body.phone !== undefined ? body.phone : current.phone,
              alternatePhone:
                body.alternate_phone !== undefined ? body.alternate_phone : current.alternate_phone,
              companyName:
                body.company_name !== undefined ? body.company_name : current.company_name,
              website: body.website !== undefined ? body.website : current.website,
              excludeLeadId: current.id,
            });

      const updated = await withUnitOfWork(db, async (trx) => {
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (body.name !== undefined) patch.name = body.name;
        if (body.first_name !== undefined) patch.first_name = body.first_name;
        if (body.last_name !== undefined) patch.last_name = body.last_name;
        if (body.email !== undefined) patch.email = normalizeEmail(body.email);
        if (body.phone !== undefined) patch.phone = body.phone;
        if (body.alternate_phone !== undefined) patch.alternate_phone = body.alternate_phone;
        if (body.company_name !== undefined) patch.company_name = body.company_name;
        if (body.website !== undefined) patch.website = body.website;
        if (body.source !== undefined) patch.source = body.source;
        if (body.rating !== undefined) patch.rating = body.rating;
        if (body.owner_id !== undefined) patch.owner_id = body.owner_id;
        if (body.notes !== undefined) patch.notes = body.notes;
        if (body.lost_reason !== undefined) patch.lost_reason = body.lost_reason;
        if (body.custom_fields !== undefined) patch.custom_fields = body.custom_fields;
        if (body.status !== undefined) {
          assertLeadStatusTransition(current.status, body.status);
          patch.status = body.status;
        }
        if (!patch.name && (body.first_name !== undefined || body.last_name !== undefined)) {
          patch.name = displayLeadName({
            name: body.name ?? current.name,
            first_name: body.first_name !== undefined ? body.first_name : current.first_name,
            last_name: body.last_name !== undefined ? body.last_name : current.last_name,
          });
        }

        const row = await trx
          .updateTable('leads')
          .set(patch)
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();

        if (body.status && body.status !== current.status) {
          await onLeadStatusChanged(trx, {
            workspaceId,
            leadId: current.id,
            fromStatus: current.status,
            toStatus: body.status,
          });
        } else {
          await onLeadUpdated(trx, {
            workspaceId,
            leadId: current.id,
            changeKey: `patch:${Date.now()}`,
          });
        }
        return row;
      });

      res.json({ data: updated, error: null, meta: { duplicates } });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/convert', convert, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = convertSchema.parse(req.body);

      if (body.create_deal && !body.deal) {
        return fail(res, 400, 'DEAL_REQUIRED', 'deal payload required when create_deal is true');
      }

      const refOk = await assertLeadOptionalRefs(db, {
        workspaceId,
        contactId: body.contact_id,
        companyId: body.company_id,
      });
      if (refOk === 'contact') return fail(res, 400, 'INVALID_CONTACT', 'contact_id not found in tenant');
      if (refOk === 'company') return fail(res, 400, 'INVALID_COMPANY', 'company_id not found in tenant');

      const result = await withUnitOfWork(db, async (trx) =>
        convertLead(trx, {
          workspaceId,
          userId,
          leadId: req.params['id']!,
          contactId: body.contact_id,
          companyId: body.company_id,
          createCompany: body.create_company,
          createDeal: Boolean(body.create_deal),
          deal: body.deal,
          idempotencyKey: body.idempotency_key,
          createCustomerParty: Boolean(body.create_customer_party),
          customerPartyId: body.customer_party_id,
        }),
      );

      res.status(result.idempotent ? 200 : 201).json({
        data: {
          lead: result.lead,
          links: result.links,
          contact_action: result.contactAction,
          company_action: result.companyAction,
          deal_action: result.dealAction,
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

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx
          .updateTable('leads')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspaceId)
          .where('deleted_at', 'is', null)
          .returningAll()
          .executeTakeFirst();
        if (!row) return null;
        await onLeadUpdated(trx, {
          workspaceId,
          leadId: row.id,
          changeKey: `delete:${row.id}`,
        });
        return row;
      });
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Lead not found');
      res.json({ data: { id: updated.id }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
