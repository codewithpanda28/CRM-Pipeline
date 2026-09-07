/**
 * Unified CRM record resolver + Round B timeline / communications.
 * ref forms: lead:{uuid} | party:{uuid} | deal:{uuid}
 */
import { Router, type Router as ExpressRouter, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database, CrmRecordEntityType } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { userHasPermission } from '../middleware/permission';
import { listCrmFields, listCrmSections } from '../lib/crm/customization';

const uuidSchema = z.string().uuid();

export type RecordMode = 'LeadRecord' | 'PartyRecord' | 'DealContext';

export function parseRecordRef(ref: string): { kind: 'lead' | 'party' | 'deal'; id: string } | null {
  const m = /^(lead|party|deal):([0-9a-f-]{36})$/i.exec(ref.trim());
  if (!m) return null;
  const kind = m[1]!.toLowerCase() as 'lead' | 'party' | 'deal';
  const id = m[2]!;
  if (!uuidSchema.safeParse(id).success) return null;
  return { kind, id };
}

function fail(res: Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

async function loadResolved(
  db: Kysely<Database>,
  auth: AuthenticatedRequest,
  ids: { leadId?: string; partyId?: string; dealId?: string },
) {
  const workspaceId = auth.workspace.id;
  let leadId = ids.leadId;
  let partyId = ids.partyId;
  let dealId = ids.dealId;

  if (!leadId && !partyId && !dealId) {
    return { error: { status: 400, code: 'MISSING_ID', message: 'Provide lead_id, party_id, deal_id, or ref' } as const };
  }

  const permissions = {
    leads_view: await userHasPermission(db, auth.user, workspaceId, 'leads:view'),
    customers_view: await userHasPermission(db, auth.user, workspaceId, 'customers:view'),
    deals_view: await userHasPermission(db, auth.user, workspaceId, 'deals:view'),
    tasks_view: await userHasPermission(db, auth.user, workspaceId, 'tasks:view'),
    activity_create: await userHasPermission(db, auth.user, workspaceId, 'activity:create'),
  };

  let lead: Record<string, unknown> | null = null;
  let party: Record<string, unknown> | null = null;
  let deal: Record<string, unknown> | null = null;
  let lineage: Array<{ entity_type: string; entity_id: string; action: string }> = [];

  if (dealId) {
    if (!permissions.deals_view) {
      return { error: { status: 403, code: 'FORBIDDEN', message: 'deals:view required' } as const };
    }
    deal = (await db
      .selectFrom('deals')
      .selectAll()
      .where('id', '=', dealId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    if (!deal) return { error: { status: 404, code: 'NOT_FOUND', message: 'Deal not found' } as const };
    if (deal['customer_party_id']) partyId = String(deal['customer_party_id']);
  }

  if (leadId) {
    if (!permissions.leads_view) {
      return { error: { status: 403, code: 'FORBIDDEN', message: 'leads:view required' } as const };
    }
    lead = (await db
      .selectFrom('leads')
      .selectAll()
      .where('id', '=', leadId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    if (!lead) return { error: { status: 404, code: 'NOT_FOUND', message: 'Lead not found' } as const };
    lineage = await db
      .selectFrom('lead_conversion_links')
      .select(['entity_type', 'entity_id', 'action'])
      .where('lead_id', '=', String(lead['id']))
      .where('workspace_id', '=', workspaceId)
      .execute();
    const partyLink = lineage.find((l) => l.entity_type === 'customer_party');
    if (partyLink && !partyId) partyId = partyLink.entity_id;
  }

  if (partyId) {
    if (!permissions.customers_view && !permissions.deals_view && !permissions.leads_view) {
      return { error: { status: 403, code: 'FORBIDDEN', message: 'Insufficient permissions' } as const };
    }
    party = (await db
      .selectFrom('customer_parties')
      .selectAll()
      .where('id', '=', partyId)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    if (!party) return { error: { status: 404, code: 'NOT_FOUND', message: 'Customer party not found' } as const };
  }

  let mode: RecordMode = 'LeadRecord';
  if (deal) mode = 'DealContext';
  else if (party) mode = 'PartyRecord';
  else if (lead) mode = 'LeadRecord';
  else return { error: { status: 404, code: 'NOT_FOUND', message: 'Record not found' } as const };

  if (lead && !party && !deal) mode = 'LeadRecord';
  if (lead && party && !deal) mode = 'PartyRecord';

  const ref =
    mode === 'DealContext' && deal
      ? `deal:${deal['id']}`
      : mode === 'PartyRecord' && party
        ? `party:${party['id']}`
        : lead
          ? `lead:${lead['id']}`
          : null;

  return {
    error: null,
    data: {
      mode,
      ref,
      lead,
      party,
      deal,
      lineage,
      permissions,
      workspaceId,
      leadId: lead ? String(lead['id']) : null,
      partyId: party ? String(party['id']) : null,
      dealId: deal ? String(deal['id']) : null,
    },
  };
}

async function resolveRecord(
  db: Kysely<Database>,
  auth: AuthenticatedRequest,
  ids: { leadId?: string; partyId?: string; dealId?: string },
  res: Response,
) {
  const loaded = await loadResolved(db, auth, ids);
  if (loaded.error) return fail(res, loaded.error.status, loaded.error.code, loaded.error.message);

  const { workspaceId, leadId, partyId, dealId, mode, ref, lead, party, deal, lineage, permissions } =
    loaded.data!;

  let tasks: unknown[] = [];
  if (permissions.tasks_view || permissions.deals_view || permissions.leads_view) {
    let tq = db.selectFrom('tasks').selectAll().where('workspace_id', '=', workspaceId);
    tq = tq.where((eb) => {
      const parts = [];
      if (dealId) parts.push(eb('related_deal_id', '=', dealId));
      if (leadId) parts.push(eb('related_lead_id', '=', leadId));
      if (partyId) parts.push(eb('related_customer_party_id', '=', partyId));
      if (parts.length === 0) return eb(sql`false`, '=', true);
      return eb.or(parts);
    });
    tasks = await tq.orderBy('created_at', 'desc').limit(50).execute();
  }

  const entityType: CrmRecordEntityType =
    mode === 'DealContext' ? 'deal' : mode === 'PartyRecord' ? 'customer_party' : 'lead';
  const entityId = dealId ?? partyId ?? leadId!;
  const [sections, fields, fieldValues] = await Promise.all([
    listCrmSections(db, workspaceId, entityType),
    listCrmFields(db, workspaceId, entityType),
    db
      .selectFrom('crm_field_values')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .execute(),
  ]);

  return res.json({
    data: {
      mode,
      ref,
      lead,
      party,
      deal,
      lineage,
      permissions,
      tasks,
      customization: { sections, fields, values: fieldValues },
    },
    error: null,
  });
}

export function createCrmRecordsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/resolve', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req as AuthenticatedRequest;
      const q = z
        .object({
          lead_id: z.string().uuid().optional(),
          party_id: z.string().uuid().optional(),
          deal_id: z.string().uuid().optional(),
          ref: z.string().optional(),
        })
        .parse(req.query);

      let leadId = q.lead_id;
      let partyId = q.party_id;
      let dealId = q.deal_id;
      if (q.ref) {
        const parsed = parseRecordRef(q.ref);
        if (!parsed) return fail(res, 400, 'INVALID_REF', 'ref must be lead:|party:|deal:{uuid}');
        if (parsed.kind === 'lead') leadId = parsed.id;
        if (parsed.kind === 'party') partyId = parsed.id;
        if (parsed.kind === 'deal') dealId = parsed.id;
      }

      await resolveRecord(db, auth, { leadId, partyId, dealId }, res);
    } catch (e) {
      next(e);
    }
  });

  router.get('/:ref/timeline', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req as AuthenticatedRequest;
      const parsed = parseRecordRef(req.params['ref'] ?? '');
      if (!parsed) return fail(res, 400, 'INVALID_REF', 'ref must be lead:|party:|deal:{uuid}');
      const loaded = await loadResolved(db, auth, {
        leadId: parsed.kind === 'lead' ? parsed.id : undefined,
        partyId: parsed.kind === 'party' ? parsed.id : undefined,
        dealId: parsed.kind === 'deal' ? parsed.id : undefined,
      });
      if (loaded.error) return fail(res, loaded.error.status, loaded.error.code, loaded.error.message);
      const { workspaceId, leadId, partyId, dealId } = loaded.data!;

      const activities = await db
        .selectFrom('activities')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where((eb) => {
          const parts = [];
          if (dealId) {
            parts.push(eb('record_id', '=', dealId));
            parts.push(sql<boolean>`meta->>'related_deal_id' = ${dealId}`);
          }
          if (leadId) parts.push(sql<boolean>`meta->>'related_lead_id' = ${leadId}`);
          if (partyId) parts.push(sql<boolean>`meta->>'related_customer_party_id' = ${partyId}`);
          if (parts.length === 0) return eb(sql`false`, '=', true);
          return eb.or(parts as any);
        })
        .orderBy(sql`coalesce(occurred_at, created_at)`, 'desc')
        .orderBy('id', 'desc')
        .limit(100)
        .execute();

      let pipelineEvents: unknown[] = [];
      if (dealId) {
        pipelineEvents = await db
          .selectFrom('pipeline_activity')
          .selectAll()
          .where('workspace_id', '=', workspaceId)
          .where('item_id', '=', dealId)
          .orderBy('created_at', 'desc')
          .limit(50)
          .execute();
      }

      const timeline = [
        ...activities.map((a) => ({
          id: a.id,
          source: 'activities' as const,
          type: a.type,
          heading: a.heading,
          body: a.body,
          occurred_at: a.occurred_at ?? a.created_at,
          created_at: a.created_at,
          user_id: a.user_id,
          meta: a.meta,
        })),
        ...(pipelineEvents as Array<Record<string, unknown>>).map((p) => ({
          id: String(p['id']),
          source: 'pipeline_activity' as const,
          type: String(p['event_type'] ?? 'deal_change'),
          heading: null,
          body: null,
          occurred_at: p['created_at'],
          created_at: p['created_at'],
          user_id: p['user_id'] ?? null,
          meta: p['payload'] ?? {},
        })),
      ].sort((a, b) => {
        const ta = new Date(a.occurred_at as string).getTime();
        const tb = new Date(b.occurred_at as string).getTime();
        if (tb !== ta) return tb - ta;
        return String(a.id).localeCompare(String(b.id));
      });

      res.json({ data: timeline, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:ref/communications', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req as AuthenticatedRequest;
      const parsed = parseRecordRef(req.params['ref'] ?? '');
      if (!parsed) return fail(res, 400, 'INVALID_REF', 'ref must be lead:|party:|deal:{uuid}');

      const canCreate = await userHasPermission(db, auth.user, auth.workspace.id, 'activity:create');
      if (!canCreate) return fail(res, 403, 'FORBIDDEN', 'activity:create required');

      const body = z
        .object({
          heading: z.string().max(200).optional(),
          body: z.string().min(1).max(20000),
          occurred_at: z.string().optional(),
          related_task_id: z.string().uuid().nullable().optional(),
        })
        .parse(req.body);

      const loaded = await loadResolved(db, auth, {
        leadId: parsed.kind === 'lead' ? parsed.id : undefined,
        partyId: parsed.kind === 'party' ? parsed.id : undefined,
        dealId: parsed.kind === 'deal' ? parsed.id : undefined,
      });
      if (loaded.error) return fail(res, loaded.error.status, loaded.error.code, loaded.error.message);
      const { workspaceId, leadId, partyId, dealId } = loaded.data!;

      if (body.related_task_id) {
        const task = await db
          .selectFrom('tasks')
          .select('id')
          .where('id', '=', body.related_task_id)
          .where('workspace_id', '=', workspaceId)
          .executeTakeFirst();
        if (!task) return fail(res, 400, 'INVALID_TASK', 'related_task_id not in tenant');
      }

      const occurred = body.occurred_at ? new Date(body.occurred_at) : new Date();
      const activity = await db
        .insertInto('activities')
        .values({
          workspace_id: workspaceId,
          user_id: auth.user.id,
          type: 'communication_added',
          heading: body.heading ?? null,
          body: body.body,
          record_id: dealId,
          occurred_at: occurred,
          meta: {
            kind: 'communication',
            related_lead_id: leadId,
            related_customer_party_id: partyId,
            related_deal_id: dealId,
            related_task_id: body.related_task_id ?? null,
          },
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      res.status(201).json({ data: activity, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:ref', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req as AuthenticatedRequest;
      const parsed = parseRecordRef(req.params['ref'] ?? '');
      if (!parsed) return fail(res, 400, 'INVALID_REF', 'ref must be lead:|party:|deal:{uuid}');
      await resolveRecord(
        db,
        auth,
        {
          leadId: parsed.kind === 'lead' ? parsed.id : undefined,
          partyId: parsed.kind === 'party' ? parsed.id : undefined,
          dealId: parsed.kind === 'deal' ? parsed.id : undefined,
        },
        res,
      );
    } catch (e) {
      next(e);
    }
  });

  return router;
}
