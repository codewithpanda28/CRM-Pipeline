// Legacy interval poller for JOBS_RUNTIME=legacy only.
// Target runtime: outbox → JobQueue → BullMQ webhooks worker.
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { executeWebhookDelivery } from '@vencore/events/webhook';
import { logger } from '../lib/logger';
import { shouldRunBusinessJobForTenant } from '../lib/tenant-job-gate';

const INTERVAL_MS = 10_000;
const BATCH_SIZE = 20;

async function runDeliveries(db: Kysely<Database>): Promise<void> {
  const result = await sql<{ id: string; workspace_id: string }>`
    SELECT wd.id, ws.workspace_id
    FROM webhook_deliveries wd
    JOIN webhook_subscriptions ws ON ws.id = wd.subscription_id
    WHERE wd.status = 'pending'
      AND wd.next_attempt_at <= NOW()
    ORDER BY wd.next_attempt_at ASC
    LIMIT ${sql.lit(BATCH_SIZE)}
    FOR UPDATE OF wd SKIP LOCKED
  `.execute(db);

  if (result.rows.length === 0) return;

  await Promise.allSettled(
    result.rows.map(async (row) => {
      const allowed = await shouldRunBusinessJobForTenant(db, row.workspace_id);
      if (!allowed) {
        logger.info(
          { delivery_id: row.id, workspace_id: row.workspace_id },
          '[webhook-delivery] skipped — tenant suspended/paused',
        );
        return;
      }
      return executeWebhookDelivery(db, {
        deliveryId: row.id,
        expectedTenantId: row.workspace_id,
      }).catch((err) =>
        logger.error({ err, delivery_id: row.id }, '[webhook-delivery] deliver failed'),
      );
    }),
  );
}

let isRunning = false;

export function startWebhookDelivery(db: Kysely<Database>): void {
  const tick = () => {
    if (isRunning) return;
    isRunning = true;
    runDeliveries(db)
      .catch((err) => logger.error({ err }, '[webhook-delivery] run failed'))
      .finally(() => {
        isRunning = false;
      });
  };

  tick();
  setInterval(tick, INTERVAL_MS);
  logger.info('webhook delivery worker started (10-s polling, JOBS_RUNTIME=legacy)');
}
