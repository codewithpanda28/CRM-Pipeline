import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logItemCreated, logStageChanged, logFieldChanged } from '../lib/pipeline-activity';
import { resolveHook } from '../lib/hooks-runtime';
import { emitCrmEvent } from '../lib/crm-events';
import { maybeSpawnProjectOnDealWon } from '../lib/deal-close-hooks';
import {
  onPipelineFieldChanged,
  onPipelineItemCreated,
  onPipelineStageChanged,
  withUnitOfWork,
} from '../lib/domain-outbox';
import {
  upsertDealFromPipelineItem,
  softDeleteDealProjection,
  onDealCreated,
  onDealStageChanged,
  onDealUpdated,
  queueDealLostWebhook,
  loadStageFlags,
} from '../lib/deals';
import { applyPipelineItemMove } from '../lib/pipeline/item-move';

async function seedDefaultStatuses(db: Kysely<Database>, projectId: string) {
  const statuses = [
    { name: 'Backlog',     color: '#9e998f', position: 0, is_done: false },
    { name: 'In Progress', color: '#1e3a8a', position: 1, is_done: false },
    { name: 'In Review',   color: '#92400e', position: 2, is_done: false },
    { name: 'Done',        color: '#2d6a4f', position: 3, is_done: true  },
  ]
  await db.insertInto('project_task_statuses')
    .values(statuses.map(s => ({ ...s, project_id: projectId })))
    .execute()
}

async function maybeAutoCreateProject(
  db: Kysely<Database>,
  workspaceId: string,
  itemId: string,
  newStageId: string,
  createdByUserId: string,
) {
  const hook = await resolveHook(db, workspaceId, 'projects', 'auto_project_from_deal')
  if (!hook) return

  const stage = await db.selectFrom('pipeline_stages')
    .innerJoin('pipelines', 'pipelines.id', 'pipeline_stages.pipeline_id')
    .select(['pipeline_stages.is_won'])
    .where('pipeline_stages.id', '=', newStageId)
    .where('pipelines.workspace_id', '=', workspaceId)
    .executeTakeFirst()
  if (!stage?.is_won) return

  // idempotent — only create once per item
  const existing = await db.selectFrom('projects')
    .select('id')
    .where('source_item_id', '=', itemId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst()
  if (existing) return

  const item = await db.selectFrom('pipeline_items')
    .select(['field_values'])
    .where('id', '=', itemId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst()
  if (!item) return

  const fieldValues = item.field_values as Record<string, unknown>
  const projectName = (fieldValues['name'] as string | undefined)
    ?? (fieldValues['title'] as string | undefined)
    ?? 'New Project'

  const project = await db.insertInto('projects')
    .values({
      workspace_id: workspaceId,
      created_by: createdByUserId,
      name: String(projectName),
      source_item_id: itemId,
    })
    .returningAll()
    .executeTakeFirstOrThrow()

  await seedDefaultStatuses(db, project.id)
}

const createItemSchema = z.object({
  stage_id: z.string().uuid(),
  field_values: z.record(z.unknown()).default({}),
  position: z.number().int().default(0),
});

const updateItemSchema = z.object({
  stage_id: z.string().uuid().optional(),
  field_values: z.record(z.unknown()).optional(),
});

const moveItemSchema = z.object({
  stage_id: z.string().uuid(),
  position: z.number().int(),
});

const listSchema = z.object({
  stage_id: z.string().uuid().optional(),
  page: z.coerce.number().int().default(1),
  limit: z.coerce.number().int().max(200).default(100),
});

function ws(req: AuthenticatedRequest) { return req.workspace.id; }
function uid(req: AuthenticatedRequest) { return req.user.id; }
function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

/** Prove pipeline ∈ workspace and stage ∈ that pipeline (blocks cross-tenant stage IDOR). */
async function assertStageOwnedByPipeline(
  db: Kysely<Database>,
  opts: { workspaceId: string; pipelineId: string; stageId: string },
): Promise<'ok' | 'pipeline' | 'stage'> {
  const pipeline = await db
    .selectFrom('pipelines')
    .select('id')
    .where('id', '=', opts.pipelineId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!pipeline) return 'pipeline';

  const stage = await db
    .selectFrom('pipeline_stages')
    .select(['id', 'archived_at'])
    .where('id', '=', opts.stageId)
    .where('pipeline_id', '=', opts.pipelineId)
    .executeTakeFirst();
  if (!stage || stage.archived_at) return 'stage';
  return 'ok';
}

export function createPipelineItemsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router({ mergeParams: true });
  const view   = requirePermission('pipelines:view');
  const create = requirePermission('pipelines:create');

  // List items for a pipeline
  router.get('/', view, async (req, res, next) => {
    try {
      const q = listSchema.parse(req.query);
      const workspaceId = ws(req as AuthenticatedRequest);
      const pipelineId = req.params['pipelineId']!;
      const pipeline = await db.selectFrom('pipelines').select('id')
        .where('id', '=', pipelineId)
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirst();
      if (!pipeline) return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');

      let query = db.selectFrom('pipeline_items').selectAll()
        .where('pipeline_id', '=', pipelineId)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .orderBy('position', 'asc');

      if (q.stage_id) query = query.where('stage_id', '=', q.stage_id);

      const offset = (q.page - 1) * q.limit;
      const items = await query.limit(q.limit).offset(offset).execute();
      const { enrichPipelineItemsWithDisplay } = await import('../lib/pipelines/item-display');
      const displayById = await enrichPipelineItemsWithDisplay(db, {
        workspaceId,
        items: items.map((i) => ({ id: i.id, field_values: i.field_values })),
      });
      res.json({
        data: items.map((i) => ({
          ...i,
          display: displayById.get(i.id) ?? null,
        })),
        error: null,
      });
    } catch (e) { next(e); }
  });

  // Create item
  router.post('/', create, async (req, res, next) => {
    try {
      const body = createItemSchema.parse(req.body);
      const workspaceId = ws(req as AuthenticatedRequest);
      const pipelineId = req.params['pipelineId']!;
      const owned = await assertStageOwnedByPipeline(db, {
        workspaceId,
        pipelineId,
        stageId: body.stage_id,
      });
      if (owned === 'pipeline') return fail(res, 404, 'NOT_FOUND', 'Pipeline not found');
      if (owned === 'stage') return fail(res, 400, 'INVALID_STAGE', 'stage_id not found in pipeline');

      const userId = uid(req as AuthenticatedRequest);
      const item = await withUnitOfWork(db, async (trx) => {
        const created = await trx.insertInto('pipeline_items').values({
          pipeline_id: pipelineId,
          workspace_id: workspaceId,
          stage_id: body.stage_id,
          field_values: body.field_values as any,
          position: body.position,
        }).returningAll().executeTakeFirstOrThrow();

        await logItemCreated({
          db: trx, itemId: created.id,
          pipelineId: created.pipeline_id,
          workspaceId: created.workspace_id,
          userId,
        });

        await onPipelineItemCreated(trx, {
          workspaceId: created.workspace_id,
          itemId: created.id,
          pipelineId: created.pipeline_id,
          stageId: created.stage_id,
        });

        await upsertDealFromPipelineItem(trx, {
          item: {
            id: created.id,
            workspace_id: created.workspace_id,
            pipeline_id: created.pipeline_id,
            stage_id: created.stage_id,
            field_values: created.field_values as Record<string, unknown>,
            deleted_at: created.deleted_at,
          },
          actorUserId: userId,
        });
        await onDealCreated(trx, {
          workspaceId: created.workspace_id,
          dealId: created.id,
          pipelineId: created.pipeline_id,
          stageId: created.stage_id,
        });

        return created;
      });

      emitCrmEvent(db, item.workspace_id, 'crm.deal@v1', 'created', item.id);

      res.status(201).json({ data: item, error: null });
    } catch (e) { next(e); }
  });

  return router;
}

const activityQuerySchema = z.object({
  page: z.coerce.number().int().default(1),
  limit: z.coerce.number().int().max(100).default(50),
});

export function createItemRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('pipelines:view');
  const edit = requirePermission('pipelines:edit');
  const del  = requirePermission('pipelines:delete');

  // Search items across all pipelines — used by CRM link combobox
  router.get('/', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const search = (req.query['search'] as string | undefined)?.trim();
      const limit = Math.min(20, Math.max(1, Number(req.query['limit'] ?? 10)));
      if (!search) return res.json({ data: [], error: null });

      const pattern = `%${search}%`;
      const items = await db.selectFrom('pipeline_items as i')
        .innerJoin('pipeline_stages as s', 's.id', 'i.stage_id')
        .innerJoin('pipelines as p', 'p.id', 'i.pipeline_id')
        .select(['i.id', 'i.field_values', 'i.stage_id', 'i.pipeline_id', 'p.name as pipeline_name', 's.name as stage_name'])
        .where('i.workspace_id', '=', workspaceId)
        .where('i.deleted_at', 'is', null)
        .where(sql<boolean>`i.field_values->>'name' ilike ${pattern}`)
        .limit(limit)
        .execute();

      res.json({ data: items, error: null });
    } catch (e) { next(e); }
  });

  // Get single item
  router.get('/:id', view, async (req, res, next) => {
    try {
      const item = await db.selectFrom('pipeline_items').selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!item) return fail(res, 404, 'NOT_FOUND', 'Item not found');
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const { enrichPipelineItemsWithDisplay } = await import('../lib/pipelines/item-display');
      const displayById = await enrichPipelineItemsWithDisplay(db, {
        workspaceId,
        items: [{ id: item.id, field_values: item.field_values }],
      });
      res.json({ data: { ...item, display: displayById.get(item.id) ?? null }, error: null });
    } catch (e) { next(e); }
  });

  // Update item (stage + field_values)
  router.patch('/:id', edit, async (req, res, next) => {
    try {
      const body = updateItemSchema.parse(req.body);
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;

      const current = await db.selectFrom('pipeline_items').selectAll()
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Item not found');

      if (body.stage_id) {
        const owned = await assertStageOwnedByPipeline(db, {
          workspaceId,
          pipelineId: current.pipeline_id,
          stageId: body.stage_id,
        });
        if (owned !== 'ok') return fail(res, 400, 'INVALID_STAGE', 'stage_id not found in pipeline');
      }

      const stageChanged = Boolean(body.stage_id && body.stage_id !== current.stage_id);
      let isWon = false;
      let isLost = false;
      if (stageChanged && body.stage_id) {
        const flags = await loadStageFlags(db, { workspaceId, stageId: body.stage_id });
        isWon = Boolean(flags?.is_won);
        isLost = Boolean(flags?.is_lost);
      }

      const updated = await withUnitOfWork(db, async (trx) => {
        const row = await trx.updateTable('pipeline_items')
          .set({
            ...(body.stage_id ? { stage_id: body.stage_id } : {}),
            ...(body.field_values ? { field_values: body.field_values as any } : {}),
            updated_at: new Date(),
          })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspaceId)
          .where('deleted_at', 'is', null)
          .returningAll().executeTakeFirstOrThrow();

        if (stageChanged && body.stage_id) {
          await logStageChanged({
            db: trx, itemId: current.id, pipelineId: current.pipeline_id,
            workspaceId, userId,
            fromStageId: current.stage_id, toStageId: body.stage_id,
          });
          await onPipelineStageChanged(trx, {
            workspaceId,
            itemId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: body.stage_id,
            isWon,
          });
          if (isLost) {
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
            isWon,
            isLost,
          });
        }

        if (body.field_values) {
          const oldVals = current.field_values as Record<string, unknown>;
          for (const [key, newValue] of Object.entries(body.field_values)) {
            const oldValue = oldVals[key];
            if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
              await logFieldChanged({
                db: trx, itemId: current.id, pipelineId: current.pipeline_id,
                workspaceId, userId, fieldKey: key, oldValue, newValue,
              });
              await onPipelineFieldChanged(trx, {
                workspaceId,
                itemId: current.id,
                pipelineId: current.pipeline_id,
                fieldKey: key,
              });
            }
          }
        }

        await upsertDealFromPipelineItem(trx, {
          item: {
            id: row.id,
            workspace_id: row.workspace_id,
            pipeline_id: row.pipeline_id,
            stage_id: row.stage_id,
            field_values: row.field_values as Record<string, unknown>,
            deleted_at: row.deleted_at,
          },
          actorUserId: userId,
        });
        if (!stageChanged) {
          await onDealUpdated(trx, {
            workspaceId,
            dealId: current.id,
            changeKey: `item-patch:${Date.now()}`,
          });
        }

        return row;
      });

      if (stageChanged && body.stage_id) {
        await maybeAutoCreateProject(db, workspaceId, current.id, body.stage_id, userId);
        emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'stage_changed', current.id, { stage_id: body.stage_id });
        if (isWon) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        }
      }
      emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'updated', current.id);

      res.json({ data: updated, error: null });
    } catch (e) { next(e); }
  });

  // Move item (stage + position)
  router.patch('/:id/move', edit, async (req, res, next) => {
    try {
      const { stage_id, position } = moveItemSchema.parse(req.body);
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const userId = (req as AuthenticatedRequest).user.id;

      const current = await db.selectFrom('pipeline_items').select(['id', 'stage_id', 'pipeline_id', 'field_values'])
        .where('id', '=', req.params['id']!)
        .where('workspace_id', '=', workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!current) return fail(res, 404, 'NOT_FOUND', 'Item not found');

      const owned = await assertStageOwnedByPipeline(db, {
        workspaceId,
        pipelineId: current.pipeline_id,
        stageId: stage_id,
      });
      if (owned !== 'ok') return fail(res, 400, 'INVALID_STAGE', 'stage_id not found in pipeline');

      const stageChanged = stage_id !== current.stage_id;
      let isWon = false;
      let isLost = false;
      if (stageChanged) {
        const flags = await loadStageFlags(db, { workspaceId, stageId: stage_id });
        isWon = Boolean(flags?.is_won);
        isLost = Boolean(flags?.is_lost);
      }

      const moved = await withUnitOfWork(db, async (trx) => {
        const result = await applyPipelineItemMove(trx, {
          workspaceId,
          itemId: current.id,
          pipelineId: current.pipeline_id,
          stageId: stage_id,
          position,
        });

        if (stageChanged) {
          await logStageChanged({
            db: trx, itemId: current.id, pipelineId: current.pipeline_id,
            workspaceId, userId,
            fromStageId: current.stage_id, toStageId: stage_id,
          });
          await onPipelineStageChanged(trx, {
            workspaceId,
            itemId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: stage_id,
            isWon,
          });
          if (isLost) {
            await queueDealLostWebhook(trx, {
              workspaceId,
              dealId: current.id,
              pipelineId: current.pipeline_id,
              stageId: stage_id,
            });
          }
          await onDealStageChanged(trx, {
            workspaceId,
            dealId: current.id,
            pipelineId: current.pipeline_id,
            fromStageId: current.stage_id,
            toStageId: stage_id,
            isWon,
            isLost,
          });

          const stageRow = await trx
            .selectFrom('pipeline_stages')
            .select(['default_probability'])
            .where('id', '=', stage_id)
            .executeTakeFirst();
          if (stageRow?.default_probability != null) {
            await trx
              .updateTable('deals')
              .set({ probability: stageRow.default_probability, updated_at: new Date() })
              .where('id', '=', current.id)
              .where('workspace_id', '=', workspaceId)
              .execute();
          }
        }

        const item = await trx.selectFrom('pipeline_items').selectAll()
          .where('id', '=', current.id)
          .executeTakeFirstOrThrow();
        await upsertDealFromPipelineItem(trx, {
          item: {
            id: item.id,
            workspace_id: item.workspace_id,
            pipeline_id: item.pipeline_id,
            stage_id: item.stage_id,
            field_values: item.field_values as Record<string, unknown>,
            deleted_at: item.deleted_at,
          },
          actorUserId: userId,
        });

        return result;
      });

      if (stageChanged) {
        await maybeAutoCreateProject(db, workspaceId, current.id, stage_id, userId);
        emitCrmEvent(db, workspaceId, 'crm.deal@v1', 'stage_changed', current.id, { stage_id });
        if (isWon) {
          void maybeSpawnProjectOnDealWon({ db, workspaceId, userId, dealId: current.id });
        }
      }
      res.json({ data: { id: current.id, stage_id: moved.stage_id, position: moved.position }, error: null });
    } catch (e) { next(e); }
  });

  // Soft delete
  router.delete('/:id', del, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const item = await withUnitOfWork(db, async (trx) => {
        const row = await trx.updateTable('pipeline_items')
          .set({ deleted_at: new Date() })
          .where('id', '=', req.params['id']!)
          .where('workspace_id', '=', workspaceId)
          .where('deleted_at', 'is', null)
          .returningAll().executeTakeFirst();
        if (!row) return null;
        await softDeleteDealProjection(trx, { workspaceId, dealId: row.id });
        return row;
      });
      if (!item) return fail(res, 404, 'NOT_FOUND', 'Item not found');
      res.json({ data: { id: item.id }, error: null });
    } catch (e) { next(e); }
  });

  // Activity feed for item
  router.get('/:id/activity', view, async (req, res, next) => {
    try {
      const q = activityQuerySchema.parse(req.query);
      const activity = await db.selectFrom('pipeline_activity').selectAll()
        .where('item_id', '=', req.params['id']!)
        .where('workspace_id', '=', (req as AuthenticatedRequest).workspace.id)
        .orderBy('created_at', 'desc')
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .execute();
      res.json({ data: activity, error: null });
    } catch (e) { next(e); }
  });

  return router;
}
