import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { EventRecorder, isTransaction, type DbOrTx } from '@vencore/events';

export const WEBHOOK_EVENTS = [
  'contact.created',
  'contact.updated',
  'deal.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'task.created',
  'task.completed',
  'alert.created',
  'alert.resolved',
  'item.moved',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Insert webhook_deliveries + outbox_events on the SAME connection/transaction.
 * Does NOT enqueue BullMQ — publisher does that after commit.
 *
 * When called with a Transaction, joins the caller's unit-of-work (critical for deal events).
 * When called with root Kysely, opens its own short transaction (legacy contact/task paths).
 */
export async function queueWebhook(
  db: DbOrTx,
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const subscriptions = await db
    .selectFrom('webhook_subscriptions')
    .select(['id'])
    .where('workspace_id', '=', workspaceId)
    .where('event', '=', event)
    .execute();

  if (subscriptions.length === 0) return;

  const now = new Date().toISOString();
  const body = JSON.stringify(payload);

  const write = async (trx: Transaction<Database>) => {
    const deliveries = await trx
      .insertInto('webhook_deliveries')
      .values(
        subscriptions.map((sub) => ({
          subscription_id: sub.id,
          event,
          payload: body,
          next_attempt_at: now,
        })),
      )
      .returning(['id', 'subscription_id'])
      .execute();

    const recorder = EventRecorder.forTransaction(trx);
    for (const d of deliveries) {
      const dedupeKey = `webhook.deliver:${workspaceId}:${d.subscription_id}:${d.id}`;
      await recorder.append({
        tenantId: workspaceId,
        eventType: 'integration.webhook.queued',
        aggregateType: 'webhook_delivery',
        aggregateId: d.id,
        jobName: 'webhook.deliver',
        dedupeKey,
        correlationId: d.id,
        payload: {
          id: d.id,
          type: 'integration.webhook.queued',
          spec_version: '1',
          occurred_at: now,
          tenant_id: workspaceId,
          deliveryId: d.id,
          subscriptionId: d.subscription_id,
          actor: { type: 'system', id: 'queueWebhook' },
          aggregate: { type: 'webhook_delivery', id: d.id },
          data: {
            deliveryId: d.id,
            subscriptionId: d.subscription_id,
            event,
          },
          metadata: {
            correlation_id: d.id,
            idempotency_key: dedupeKey,
          },
        },
      });
    }
  };

  if (isTransaction(db)) {
    await write(db);
    return;
  }

  await (db as Kysely<Database>).transaction().execute(write);
}
