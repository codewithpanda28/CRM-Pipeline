import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { userHasPermission } from '../middleware/permission';
import {
  withUnitOfWork,
  onPipelineItemCreated,
  onPipelineStageChanged,
} from '../lib/domain-outbox';
import { logItemCreated, logStageChanged } from '../lib/pipeline-activity';
import { emitCrmEvent } from '../lib/crm-events';
import { maybeSpawnProjectOnDealWon } from '../lib/deal-close-hooks';
import { recordCommissionHookBestEffort } from '../lib/business-ops/commission-hooks';
import {
  assertDealRelations,
  loadStageFlags,
  normalizeDealPatch,
  onDealCreated,
  onDealStageChanged,
  onDealUpdated,
  parseMoneyAmount,
  normalizeCurrency,
  DEFAULT_DEAL_CURRENCY,
  queueDealLostWebhook,
  statusFromStageFlags,
  upsertPipelineItemFromDeal,
  attachCustomerPartyToDeal,
  ensureCustomerPartyOnDealWon,
} from '../lib/deals';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).optional(),
  owner_id: z.string().uuid().optional(),
});

const createSchema = z.object({
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  name: z.string().min(1),
  owner_id: z.string().uuid(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_at: z.string().datetime().nullable().optional(),
  source: z.string().nullable().optional(),
  primary_contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  customer_party_id: z.string().uuid().nullable().optional(),
  /** Optional lead lineage — validated tenant-side; stored in custom_fields.lead_id */
  lead_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  position: z.number().int().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  owner_id: z.string().uuid().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().length(3).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_at: z.string().datetime().nullable().optional(),
  source: z.string().nullable().optional(),
  primary_contact_id: z.string().uuid().nullable().optional(),
  company_id: z.string().uuid().nullable().optional(),
  customer_party_id: z.string().uuid().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  lost_reason: z.string().nullable().optional(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).optional(),
});

const moveSchema = z.object({
  stage_id: z.string().uuid(),
  lost_reason: z.string().nullable().optional(),
});

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

function integrityStatus(code: string): number {
  return code === 'pipeline' ? 404 : 400;
}

function integrityMessage(code: string): string {
  switch (code) {
    case 'pipeline':
      return 'pipeline_id not found in tenant';
    case 'stage':
      return 'stage_id not found in pipeline / tenant';
    case 'owner':
      return 'owner_id not found in tenant';
    case 'contact':
      return 'primary_contact_id not found in tenant';
    case 'company':
      return 'company_id not found in tenant';
    case 'customer_party':
      return 'customer_party_id must reference an active, non-merged party in this workspace';
    default:
      return 'invalid relation';
  }
}

export function createDealsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('deals:view');
  const create = requirePermission('deals:create');
  const edit = requirePermission('deals:edit');
  const del = requirePermission('deals:delete');
  const moveStage = requirePermission('deals:move_stage');

  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const q = listSchema.parse(req.query);
      let query = db
        .selectFrom('deals')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.pipeline_id) query = query.where('pipeline_id', '=', q.pipeline_id);
      if (q.stage_id) query = query.where('stage_id', '=', q.stage_id);
      if (q.status) query = query.where('status', '=', q.status);
      if (q.owner_id) query = query.where('owner_id', '=', q.owner_id);
      const deals = await query.execute();
      res.json({ data: deals, page: q.page, per_page: q.per_page, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const deal = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!deal) return fail(res, 404, 'NOT_FOUND', 'Deal not found');

      const [owner, company, party, contact, pipeline, stage] = await Promise.all([
        deal.owner_id
          ? db
              .selectFrom('users')
              .select(['id', 'name'])
              .where('id', '=', deal.owner_id)
              .where('workspace_id', '=', workspaceId)
              .executeTakeFirst()
          : null,
        deal.company_id
          ? db
              .selectFrom('companies')
              .select(['id', 'name'])
              .where('id', '=', deal.company_id)
              .where('workspace_id', '=', workspaceId)
              .executeTakeFirst()
          : null,
        deal.customer_party_id
          ? db
              .selectFrom('customer_parties')
              .select(['id', 'display_name'])
              .where('id', '=', deal.customer_party_id)
              .where('workspace_id', '=', workspaceId)
              .executeTakeFirst()
          : null,
        deal.primary_contact_id
          ? db
              .selectFrom('contacts')
              .select(['id', 'name', 'email', 'phone'])
              .where('id', '=', deal.primary_contact_id)
              .where('workspace_id', '=', workspaceId)
              .executeTakeFirst()
          : null,
        db
          .selectFrom('pipelines')
          .select(['id', 'name'])
          .where('id', '=', deal.pipeline_id)
          .where('workspace_id', '=', workspaceId)
          .executeTakeFirst(),
        db
          .selectFrom('pipeline_stages')
          .select(['id', 'name', 'is_won', 'is_lost', 'color'])
          .where('id', '=', deal.stage_id)
          .executeTakeFirst(),
      ]);

      res.json({
        data: {
          ...deal,
          display: {
            owner_name: owner?.name ?? null,
            company_name: company?.name ?? null,
            customer_name: party?.display_name ?? null,
            contact_name: contact?.name ?? null,
            contact_email: contact?.email ?? null,
            contact_phone: contact?.phone ?? null,
            pipeline_name: pipeline?.name ?? null,
            stage_name: stage?.name ?? null,
            stage_color: stage?.color ?? null,
            stage_is_won: stage?.is_won ?? false,
            stage_is_lost: stage?.is_lost ?? false,
          },
        },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/', create, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = createSchema.parse(req.body);

      if (!body.customer_party_id && !body.company_id && !body.primary_contact_id) {
        return fail(
          res,
          400,
          'CUSTOMER_REQUIRED',
          'customer_party_id (or company_id / primary_contact_id) is required',
        );
      }

      let leadSource: string | null = null;
      const customFields: Record<string, unknown> = { ...(body.custom_fields ?? {}) };
      if (body.lead_id) {
        const lead = await db
          .selectFrom('leads')
          .select(['id', 'source', 'status', 'contact_id', 'company_id'])
          .where('id', '=', body.lead_id)
          .where('workspace_id', '=', workspaceId)
          .executeTakeFirst();
        if (!lead) {
          return fail(res, 400, 'INVALID_LEAD', 'lead_id not found in tenant');
        }
        customFields['lead_id'] = lead.id;
        leadSource = lead.source ? `lead:${lead.source}` : 'lead_conversion';
      }

      const rel = await assertDealRelations(db, {
        workspaceId,
        pipelineId: body.pipeline_id,
        stageId: body.stage_id,
        ownerId: body.owner_id,
        primaryContactId: body.primary_contact_id,
        companyId: body.company_id,
        customerPartyId: body.customer_party_id,
      });
      if (rel !== 'ok') {
        return fail(res, integrityStatus(rel), `INVALID_${rel.toUpperCase()}`, integrityMessage(rel));
      }

      const flags = await loadStageFlags(db, { workspaceId, stageId: body.stage_id });
      const status = statusFromStageFlags(Boolean(flags?.is_won), Boolean(flags?.is_lost));
      const deal = await withUnitOfWork(db, async (trx) => {
        const id = randomUUID();
        const now = new Date();

        const attached = await attachCustomerPartyToDeal(trx, {
          workspaceId,
          dealId: id,
          companyId: body.company_id,
          primaryContactId: body.primary_contact_id,
          preferredPartyId: body.customer_party_id ?? null,
        });
        if (!attached.ok) {
          throw Object.assign(new Error(attached.fail), { integrityFail: attached.fail });
        }
        const customerPartyId = attached.customerPartyId;

        const created = await trx
          .insertInto('deals')
          .values({
            id,
            workspace_id: workspaceId,
            pipeline_id: body.pipeline_id,
            stage_id: body.stage_id,
            name: body.name,
            owner_id: body.owner_id,
            amount: parseMoneyAmount(body.amount ?? 0),
            currency: normalizeCurrency(body.currency ?? DEFAULT_DEAL_CURRENCY),
            probability: body.probability ?? 0,
            expected_close_at: body.expected_close_at ? new Date(body.expected_close_at) : null,
            source: body.source ?? leadSource,
            primary_contact_id: body.primary_contact_id ?? null,
            company_id: body.company_id ?? null,
            customer_party_id: customerPartyId,
            status,
            won_at: status === 'won' ? now : null,
            lost_at: status === 'lost' ? now : null,
            custom_fields: customFields as never,
            source_pipeline_item_id: id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await upsertPipelineItemFromDeal(trx, created, { position: body.position ?? 0 });
        await logItemCreated({
          db: trx,
          itemId: created.id,
          pipelineId: created.pipeline_id,
          workspaceId,
          userId,
        });
        await onPipelineItemCreated(trx, {
          workspaceId,
          itemId: created.id,
          pipelineId: created.pipeline_id,
          stageId: created.stage_id,
        });
        await onDealCreated(trx, {
          workspaceId,
          dealId: created.id,
          pipelineId: created.pipeline_id,
          stageId: created.stage_id,
        });

        // Thin lineage: attach deal to converted lead when deal_id is still null
        // (create-from-lead path). Does not invent a new link column.
        if (body.lead_id) {
          await trx
            .updateTable('leads')
            .set({ deal_id: created.id, updated_at: now })
            .where('id', '=', body.lead_id)
            .where('workspace_id', '=', workspaceId)
            .where('deleted_at', 'is', null)
            .where('deal_id', 'is', null)
            .execute();
          await trx
            .insertInto('lead_conversion_links')
            .values({
              id: randomUUID(),
              workspace_id: workspaceId,
              lead_id: body.lead_id,
              entity_type: 'deal',
              entity_id: created.id,
              action: 'created',
            })
            .onConflict((oc) => oc.columns(['lead_id', 'entity_type']).doNothing())
            .execute();
        }

        return created;
      });

      emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'created', deal.id);
      res.status(201).json({ data: deal, error: null });
    } catch (e) {
      const failCode = (e as { integrityFail?: string }).integrityFail;
      if (failCode === 'identity_not_found' || failCode === 'identity_deleted' || failCode === 'invalid_party_type') {
        return fail(res, 400, 'INVALID_CUSTOMER_PARTY', integrityMessage('customer_party'));
      }
      next(e);
    }
  });

  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = updateSchema.parse(req.body);
      const current = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Deal not found');

      const nextPipeline = current.pipeline_id;
      const nextStage = body.stage_id ?? current.stage_id;
      const nextOwner = body.owner_id ?? current.owner_id;
      const rel = await assertDealRelations(db, {
        workspaceId,
        pipelineId: nextPipeline,
        stageId: nextStage,
        ownerId: nextOwner,
        primaryContactId:
          body.primary_contact_id !== undefined ? body.primary_contact_id : current.primary_contact_id,
        companyId: body.company_id !== undefined ? body.company_id : current.company_id,
        customerPartyId:
          body.customer_party_id !== undefined ? body.customer_party_id : current.customer_party_id,
      });
      if (rel !== 'ok') {
        return fail(res, integrityStatus(rel), `INVALID_${rel.toUpperCase()}`, integrityMessage(rel));
      }

      const stageChanged = Boolean(body.stage_id && body.stage_id !== current.stage_id);
      const flags = stageChanged
        ? await loadStageFlags(db, { workspaceId, stageId: nextStage })
        : null;

      if (stageChanged && flags && (flags.is_won || flags.is_lost)) {
        const canWinLose = await userHasPermission(db, { id: userId }, workspaceId, 'deals:win_lose');
        if (!canWinLose) {
          return fail(res, 403, 'FORBIDDEN', 'Insufficient permissions.');
        }
      }

      const updated = await withUnitOfWork(db, async (trx) => {
        const patch = normalizeDealPatch(body);
        if (stageChanged && flags) {
          const status = statusFromStageFlags(flags.is_won, flags.is_lost);
          patch.stage_id = nextStage;
          patch.status = status;
          patch.won_at = status === 'won' ? new Date() : null;
          patch.lost_at = status === 'lost' ? new Date() : null;
        } else if (body.status) {
          patch.status = body.status;
        }

        let row = await trx
          .updateTable('deals')
          .set(patch)
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();

        const wonParty = await ensureCustomerPartyOnDealWon(trx, row);
        row = wonParty.deal as typeof row;
        await upsertPipelineItemFromDeal(trx, row);

        if (stageChanged && body.stage_id) {
          await logStageChanged({
            db: trx,
            itemId: current.id,
            pipelineId: current.pipeline_id,
            workspaceId,
            userId,
            fromStageId: current.stage_id,
            toStageId: body.stage_id,
          });
          await onPipelineStageChanged(trx, {
            workspaceId,
            itemId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: body.stage_id,
            isWon: Boolean(flags?.is_won),
          });
          if (flags?.is_lost) {
            await queueDealLostWebhook(trx, {
              workspaceId,
              dealId: current.id,
              pipelineId: current.pipeline_id,
              stageId: body.stage_id,
            });
          }
          await onDealStageChanged(trx, {
            workspaceId,
            dealId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: body.stage_id,
            isWon: Boolean(flags?.is_won),
            isLost: Boolean(flags?.is_lost),
          });
        } else {
          await onDealUpdated(trx, {
            workspaceId,
            dealId: current.id,
            changeKey: `patch:${Date.now()}`,
          });
        }
        return row;
      });

      if (stageChanged && body.stage_id) {
        emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'stage_changed', current.id, {
          stage_id: body.stage_id,
        });
        if (flags?.is_won) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
          recordCommissionHookBestEffort(db, {
            workspaceId,
            eventType: 'deal.won',
            sourceType: 'deal',
            sourceId: current.id,
            ownerUserId: updated.owner_id,
            meta: { deal_name: updated.name },
          });
        }
      }
      emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'updated', current.id);
      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/:id/move', moveStage, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;
      const body = moveSchema.parse(req.body);
      const current = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Deal not found');

      const rel = await assertDealRelations(db, {
        workspaceId,
        pipelineId: current.pipeline_id,
        stageId: body.stage_id,
        ownerId: current.owner_id,
        primaryContactId: current.primary_contact_id,
        companyId: current.company_id,
      });
      if (rel !== 'ok') {
        return fail(res, integrityStatus(rel), `INVALID_${rel.toUpperCase()}`, integrityMessage(rel));
      }

      if (body.stage_id === current.stage_id) {
        return res.json({ data: current, error: null });
      }

      const flags = await loadStageFlags(db, { workspaceId, stageId: body.stage_id });
      if (flags && (flags.is_won || flags.is_lost)) {
        const canWinLose = await userHasPermission(db, { id: userId }, workspaceId, 'deals:win_lose');
        if (!canWinLose) {
          return fail(res, 403, 'FORBIDDEN', 'Insufficient permissions.');
        }
      }
      const status = statusFromStageFlags(Boolean(flags?.is_won), Boolean(flags?.is_lost));

      const updated = await withUnitOfWork(db, async (trx) => {
        let row = await trx
          .updateTable('deals')
          .set({
            stage_id: body.stage_id,
            status,
            won_at: status === 'won' ? new Date() : null,
            lost_at: status === 'lost' ? new Date() : null,
            lost_reason: body.lost_reason ?? current.lost_reason,
            updated_at: new Date(),
          })
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspaceId)
          .returningAll()
          .executeTakeFirstOrThrow();

        const wonParty = await ensureCustomerPartyOnDealWon(trx, row);
        row = wonParty.deal as typeof row;
        await upsertPipelineItemFromDeal(trx, row);
        await logStageChanged({
          db: trx,
          itemId: current.id,
          pipelineId: current.pipeline_id,
          workspaceId,
          userId,
          fromStageId: current.stage_id,
          toStageId: body.stage_id,
        });
        await onPipelineStageChanged(trx, {
          workspaceId,
          itemId: current.id,
          pipelineId: current.pipeline_id,
          fromStageId: current.stage_id,
          toStageId: body.stage_id,
          isWon: Boolean(flags?.is_won),
        });
        if (flags?.is_lost) {
          await queueDealLostWebhook(trx, {
            workspaceId,
            dealId: current.id,
            pipelineId: current.pipeline_id,
            stageId: body.stage_id,
          });
        }
        await onDealStageChanged(trx, {
          workspaceId,
          dealId: current.id,
          pipelineId: current.pipeline_id,
          fromStageId: current.stage_id,
          toStageId: body.stage_id,
          isWon: Boolean(flags?.is_won),
          isLost: Boolean(flags?.is_lost),
        });
        return row;
      });

      emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'stage_changed', current.id, {
        stage_id: body.stage_id,
      });
      if (flags?.is_won) {
        void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        recordCommissionHookBestEffort(db, {
          workspaceId,
          eventType: 'deal.won',
          sourceType: 'deal',
          sourceId: current.id,
          ownerUserId: updated.owner_id,
          meta: { deal_name: updated.name },
        });
      }
      res.json({ data: updated, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const updated = await withUnitOfWork(db, async (trx) => {
        const deal = await trx
          .updateTable('deals')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspaceId)
          .where('deleted_at', 'is', null)
          .returningAll()
          .executeTakeFirst();
        if (!deal) return null;
        await trx
          .updateTable('pipeline_items')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', deal.id)
          .where('workspace_id', '=', workspaceId)
          .where('deleted_at', 'is', null)
          .execute();
        await onDealUpdated(trx, {
          workspaceId,
          dealId: deal.id,
          changeKey: `delete:${deal.id}`,
        });
        return deal;
      });
      if (!updated) return fail(res, 404, 'NOT_FOUND', 'Deal not found');
      res.json({ data: { id: updated.id }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
