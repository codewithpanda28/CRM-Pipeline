import type { Kysely } from 'kysely'
import type { Database } from '@vencore/db'
import { logger } from '../lib/logger'

export interface AutomationEvent {
  event_type: 'stage_changed' | 'field_changed' | 'item_created'
  item_id: string
  pipeline_id: string
  workspace_id: string
  payload: Record<string, unknown>
  /** Outbox / job idempotency key — used to skip duplicate business outcomes. */
  idempotency_key?: string
}

/**
 * Phase 3A.1 closeout: automation must not leave deals ↔ pipeline_items divergent.
 * Same connection — caller should wrap in a transaction when available.
 */
async function syncDealProjectionFromItem(
  db: Kysely<Database>,
  item: {
    id: string
    workspace_id: string
    pipeline_id: string
    stage_id: string
    field_values: Record<string, unknown>
  },
): Promise<void> {
  const stage = await db
    .selectFrom('pipeline_stages')
    .select(['is_won', 'is_lost'])
    .where('id', '=', item.stage_id)
    .executeTakeFirst()

  const status = stage?.is_won ? 'won' : stage?.is_lost ? 'lost' : 'open'
  const now = new Date()
  const fv = item.field_values
  const name =
    (typeof fv['name'] === 'string' && fv['name'].trim()) ||
    (typeof fv['title'] === 'string' && fv['title'].trim()) ||
    undefined
  const ownerRaw = fv['owner_id']
  const ownerId =
    typeof ownerRaw === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerRaw)
      ? ownerRaw
      : undefined

  await db
    .updateTable('deals')
    .set({
      pipeline_id: item.pipeline_id,
      stage_id: item.stage_id,
      status,
      ...(name ? { name } : {}),
      ...(ownerId ? { owner_id: ownerId } : {}),
      won_at: status === 'won' ? now : null,
      lost_at: status === 'lost' ? now : null,
      updated_at: now,
    })
    .where('id', '=', item.id)
    .where('workspace_id', '=', item.workspace_id)
    .where('deleted_at', 'is', null)
    .execute()
}

async function executeAction(
  db: Kysely<Database>,
  automationId: string,
  actionType: string,
  actionParams: Record<string, unknown>,
  item: { id: string; pipeline_id: string; workspace_id: string; field_values: Record<string, unknown>; stage_id: string },
): Promise<'applied' | 'noop'> {
  switch (actionType) {
    case 'move_stage': {
      const { stage_id } = actionParams as { stage_id: string }
      if (item.stage_id === stage_id) return 'noop'
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('pipeline_items')
          .set({ stage_id, updated_at: new Date() })
          .where('id', '=', item.id)
          .where('workspace_id', '=', item.workspace_id)
          .execute()
        await syncDealProjectionFromItem(trx as unknown as Kysely<Database>, {
          ...item,
          stage_id,
        })
      })
      item.stage_id = stage_id
      return 'applied'
    }
    case 'assign_user': {
      const { field_key, user_id } = actionParams as { field_key: string; user_id: string }
      if (item.field_values[field_key] === user_id) return 'noop'
      const newValues = { ...item.field_values, [field_key]: user_id }
      await db.transaction().execute(async (trx) => {
        await trx.updateTable('pipeline_items')
          .set({ field_values: newValues as never, updated_at: new Date() })
          .where('id', '=', item.id)
          .where('workspace_id', '=', item.workspace_id)
          .execute()
        await syncDealProjectionFromItem(trx as unknown as Kysely<Database>, {
          ...item,
          field_values: newValues,
        })
      })
      item.field_values = newValues
      return 'applied'
    }
    case 'notify_assignee': {
      // Notification delivery is out of scope for v1 — log only (duplicate logs are harmless)
      logger.info({ automationId, item_id: item.id }, 'notify_assignee automation triggered')
      return 'applied'
    }
    default:
      logger.warn({ automationId, actionType }, 'Unknown automation action type')
      return 'noop'
  }
}

function matchesTrigger(
  automation: { trigger_type: string; trigger_conditions: Record<string, unknown> },
  event: AutomationEvent,
): boolean {
  if (automation.trigger_type !== event.event_type) return false
  const cond = automation.trigger_conditions
  if (event.event_type === 'stage_changed' && cond['stage_id']) {
    return event.payload['to_stage_id'] === cond['stage_id']
  }
  if (event.event_type === 'field_changed' && cond['field_key']) {
    return event.payload['field_key'] === cond['field_key']
  }
  return true
}

/**
 * Pipeline automation evaluator — invoked by BullMQ job `automation.pipeline.evaluate`.
 * At-least-once: actions are idempotent (noop if already applied); last_fired_at may update twice.
 */
export async function processAutomationEvent(db: Kysely<Database>, event: AutomationEvent): Promise<void> {
  const automations = await db
    .selectFrom('pipeline_automations')
    .selectAll()
    .where('pipeline_id', '=', event.pipeline_id)
    .where('enabled', '=', true)
    .execute()

  const item = await db
    .selectFrom('pipeline_items')
    .selectAll()
    .where('id', '=', event.item_id)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()

  if (!item) {
    logger.info({ itemId: event.item_id }, 'pipeline automation: item missing — skip')
    return
  }

  logger.info(
    {
      tenantId: event.workspace_id,
      pipelineId: event.pipeline_id,
      itemId: event.item_id,
      eventType: event.event_type,
      idempotencyKey: event.idempotency_key,
      ruleCount: automations.length,
    },
    'pipeline automation trigger',
  )

  for (const automation of automations) {
    if (!matchesTrigger(automation, event)) continue

    let attempts = 0
    while (attempts < 3) {
      try {
        const outcome = await executeAction(
          db,
          automation.id,
          automation.action_type,
          automation.action_params as Record<string, unknown>,
          {
            ...item,
            field_values: item.field_values as Record<string, unknown>,
            stage_id: item.stage_id,
          },
        )
        await db.updateTable('pipeline_automations')
          .set({ last_fired_at: new Date() })
          .where('id', '=', automation.id)
          .execute()
        logger.info(
          {
            automationId: automation.id,
            outcome,
            idempotencyKey: event.idempotency_key,
          },
          outcome === 'noop' ? 'pipeline automation duplicate/noop' : 'pipeline automation execution',
        )
        break
      } catch (err) {
        attempts++
        logger.error({ automationId: automation.id, attempt: attempts, err }, 'Automation action failed')
        if (attempts >= 3) {
          await db.updateTable('pipeline_automations')
            .set({ enabled: false })
            .where('id', '=', automation.id)
            .execute()
          logger.error({ automationId: automation.id }, 'Automation disabled after 3 failures')
        }
      }
    }
  }
}
