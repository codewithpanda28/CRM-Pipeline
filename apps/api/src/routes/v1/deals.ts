// apps/api/src/routes/v1/deals.ts
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { ApiKeyRequest } from '../../middleware/api-key-auth';
import { requireScope } from '../../middleware/api-key-auth';
import {
  withUnitOfWork,
  onPipelineItemCreated,
  onPipelineStageChanged,
} from '../../lib/domain-outbox';
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
} from '../../lib/deals';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(['open', 'won', 'lost', 'abandoned']).optional(),
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
  custom_fields: z.record(z.unknown()).optional(),
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
  custom_fields: z.record(z.unknown()).optional(),
  stage_id: z.string().uuid().optional(),
  lost_reason: z.string().nullable().optional(),
});

const moveSchema = z.object({
  stage_id: z.string().uuid(),
  lost_reason: z.string().nullable().optional(),
});

export function createV1DealsRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const q = parsed.data;
      let query = db
        .selectFrom('deals')
        .selectAll()
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .orderBy('updated_at', 'desc')
        .limit(q.per_page)
        .offset((q.page - 1) * q.per_page);
      if (q.pipeline_id) query = query.where('pipeline_id', '=', q.pipeline_id);
      if (q.stage_id) query = query.where('stage_id', '=', q.stage_id);
      if (q.status) query = query.where('status', '=', q.status);
      const deals = await query.execute();
      const { count } = await db
        .selectFrom('deals')
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow();
      res.json({ data: deals, total: Number(count), page: q.page, per_page: q.per_page, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const deal = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!deal) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      res.json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const body = parsed.data;
      const rel = await assertDealRelations(db, {
        workspaceId: workspace.id,
        pipelineId: body.pipeline_id,
        stageId: body.stage_id,
        ownerId: body.owner_id,
        primaryContactId: body.primary_contact_id,
        companyId: body.company_id,
      });
      if (rel !== 'ok') {
        res.status(400).json({
          data: null,
          error: { code: `INVALID_${rel.toUpperCase()}`, message: `Invalid ${rel}` },
        });
        return;
      }

      const flags = await loadStageFlags(db, { workspaceId: workspace.id, stageId: body.stage_id });
      const status = statusFromStageFlags(Boolean(flags?.is_won), Boolean(flags?.is_lost));
      const id = randomUUID();
      const now = new Date();

      const deal = await withUnitOfWork(db, async (trx) => {
        const attached = await attachCustomerPartyToDeal(trx, {
          workspaceId: workspace.id,
          dealId: id,
          companyId: body.company_id,
          primaryContactId: body.primary_contact_id,
        });
        if (!attached.ok) {
          throw Object.assign(new Error(attached.fail), { integrityFail: attached.fail });
        }

        const created = await trx
          .insertInto('deals')
          .values({
            id,
            workspace_id: workspace.id,
            pipeline_id: body.pipeline_id,
            stage_id: body.stage_id,
            name: body.name,
            owner_id: body.owner_id,
            amount: parseMoneyAmount(body.amount ?? 0),
            currency: normalizeCurrency(body.currency ?? DEFAULT_DEAL_CURRENCY),
            probability: body.probability ?? 0,
            expected_close_at: body.expected_close_at ? new Date(body.expected_close_at) : null,
            source: body.source ?? null,
            primary_contact_id: body.primary_contact_id ?? null,
            company_id: body.company_id ?? null,
            customer_party_id: attached.customerPartyId,
            status,
            won_at: status === 'won' ? now : null,
            lost_at: status === 'lost' ? now : null,
            custom_fields: (body.custom_fields ?? {}) as never,
            source_pipeline_item_id: id,
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        await upsertPipelineItemFromDeal(trx, created);
        await onPipelineItemCreated(trx, {
          workspaceId: workspace.id,
          itemId: created.id,
          pipelineId: created.pipeline_id,
          stageId: created.stage_id,
        });
        await onDealCreated(trx, {
          workspaceId: workspace.id,
          dealId: created.id,
          pipelineId: created.pipeline_id,
          stageId: created.stage_id,
        });
        return created;
      });

      res.status(201).json({ data: deal, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      const body = parsed.data;
      const current = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }

      const nextStage = body.stage_id ?? current.stage_id;
      const rel = await assertDealRelations(db, {
        workspaceId: workspace.id,
        pipelineId: current.pipeline_id,
        stageId: nextStage,
        ownerId: body.owner_id ?? current.owner_id,
        primaryContactId:
          body.primary_contact_id !== undefined ? body.primary_contact_id : current.primary_contact_id,
        companyId: body.company_id !== undefined ? body.company_id : current.company_id,
      });
      if (rel !== 'ok') {
        res.status(400).json({
          data: null,
          error: { code: `INVALID_${rel.toUpperCase()}`, message: `Invalid ${rel}` },
        });
        return;
      }

      const stageChanged = Boolean(body.stage_id && body.stage_id !== current.stage_id);
      const flags = stageChanged
        ? await loadStageFlags(db, { workspaceId: workspace.id, stageId: nextStage })
        : null;

      const updated = await withUnitOfWork(db, async (trx) => {
        const patch = normalizeDealPatch(body);
        if (stageChanged && flags) {
          const status = statusFromStageFlags(flags.is_won, flags.is_lost);
          patch.stage_id = nextStage;
          patch.status = status;
          patch.won_at = status === 'won' ? new Date() : null;
          patch.lost_at = status === 'lost' ? new Date() : null;
        }
        let row = await trx
          .updateTable('deals')
          .set(patch)
          .where('id', '=', current.id)
          .where('workspace_id', '=', workspace.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        const wonParty = await ensureCustomerPartyOnDealWon(trx, row);
        row = wonParty.deal as typeof row;
        await upsertPipelineItemFromDeal(trx, row);
        if (stageChanged && body.stage_id) {
          await onPipelineStageChanged(trx, {
            workspaceId: workspace.id,
            itemId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: body.stage_id,
            isWon: Boolean(flags?.is_won),
          });
          if (flags?.is_lost) {
            await queueDealLostWebhook(trx, {
              workspaceId: workspace.id,
              dealId: current.id,
              pipelineId: current.pipeline_id,
              stageId: body.stage_id,
            });
          }
          await onDealStageChanged(trx, {
            workspaceId: workspace.id,
            dealId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: body.stage_id,
            isWon: Boolean(flags?.is_won),
            isLost: Boolean(flags?.is_lost),
          });
        } else {
          await onDealUpdated(trx, {
            workspaceId: workspace.id,
            dealId: current.id,
            changeKey: `v1-patch:${Date.now()}`,
          });
        }
        return row;
      });

      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/move', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const parsed = moveSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ data: null, error: { code: 'INVALID_INPUT', message: parsed.error.message } });
        return;
      }
      req.body = { ...req.body, stage_id: parsed.data.stage_id, lost_reason: parsed.data.lost_reason };
      // Reuse PATCH semantics via internal call pattern — inline move
      const body = parsed.data;
      const current = await db
        .selectFrom('deals')
        .selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      if (body.stage_id === current.stage_id) {
        res.json({ data: current, error: null });
        return;
      }
      const rel = await assertDealRelations(db, {
        workspaceId: workspace.id,
        pipelineId: current.pipeline_id,
        stageId: body.stage_id,
        ownerId: current.owner_id,
      });
      if (rel !== 'ok') {
        res.status(400).json({
          data: null,
          error: { code: `INVALID_${rel.toUpperCase()}`, message: `Invalid ${rel}` },
        });
        return;
      }
      const flags = await loadStageFlags(db, { workspaceId: workspace.id, stageId: body.stage_id });
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
          .returningAll()
          .executeTakeFirstOrThrow();
        const wonParty = await ensureCustomerPartyOnDealWon(trx, row);
        row = wonParty.deal as typeof row;
        await upsertPipelineItemFromDeal(trx, row);
        await onPipelineStageChanged(trx, {
          workspaceId: workspace.id,
          itemId: current.id,
          pipelineId: current.pipeline_id,
          fromStageId: current.stage_id,
          toStageId: body.stage_id,
          isWon: Boolean(flags?.is_won),
        });
        if (flags?.is_lost) {
          await queueDealLostWebhook(trx, {
            workspaceId: workspace.id,
            dealId: current.id,
            pipelineId: current.pipeline_id,
            stageId: body.stage_id,
          });
        }
        await onDealStageChanged(trx, {
          workspaceId: workspace.id,
          dealId: current.id,
          pipelineId: current.pipeline_id,
          fromStageId: current.stage_id,
          toStageId: body.stage_id,
          isWon: Boolean(flags?.is_won),
          isLost: Boolean(flags?.is_lost),
        });
        return row;
      });
      res.json({ data: updated, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', requireScope('read_write'), async (req, res, next) => {
    try {
      const { workspace } = req as unknown as ApiKeyRequest;
      const updated = await withUnitOfWork(db, async (trx) => {
        const deal = await trx
          .updateTable('deals')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspace.id)
          .where('deleted_at', 'is', null)
          .returningAll()
          .executeTakeFirst();
        if (!deal) return null;
        await trx
          .updateTable('pipeline_items')
          .set({ deleted_at: new Date(), updated_at: new Date() })
          .where('id', '=', deal.id)
          .where('workspace_id', '=', workspace.id)
          .execute();
        return deal;
      });
      if (!updated) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Deal not found' } });
        return;
      }
      res.json({ data: { id: updated.id }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
