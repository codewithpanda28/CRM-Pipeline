import { createHmac } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { assertSafeUrl, PermanentJobError, RetryableJobError, SsrfError } from '@vencore/job-runtime';

const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [30, 300, 1800, 7200] as const;

export interface WebhookDeliveryRow {
  id: string;
  attempts: number;
  payload: string;
  event: string;
  target_url: string;
  secret: string;
  workspace_id: string;
  status: string;
  subscription_id: string;
}

function nextAttemptAt(attemptCount: number): string {
  const delaySecs = BACKOFF_SECONDS[attemptCount - 1] ?? 7200;
  return new Date(Date.now() + delaySecs * 1000).toISOString();
}

function payloadBody(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  return JSON.stringify(payload ?? {});
}

/**
 * Idempotent webhook delivery.
 *
 * Guarantee: at-least-once job delivery + DB claim so duplicate jobs cannot
 * produce duplicate successful HTTP outcomes for the same delivery id.
 *
 * Key: tenantId + subscriptionId + deliveryId (via claim on delivery row).
 *
 * Concurrency: first claim wins (`pending` → `in_progress`). Losers no-op.
 * If already `delivered`, no-op. Crash mid-flight: reclaim stale `in_progress`.
 */
export async function executeWebhookDelivery(
  db: Kysely<Database>,
  opts: {
    deliveryId: string;
    expectedTenantId: string;
  },
): Promise<{ outcome: 'delivered' | 'failed' | 'skipped' | 'retry'; reason?: string }> {
  // Reclaim stale in_progress (lease via next_attempt_at)
  await db
    .updateTable('webhook_deliveries')
    .set({ status: 'pending' })
    .where('id', '=', opts.deliveryId)
    .where('status', '=', 'in_progress')
    .where('next_attempt_at', '<', new Date().toISOString())
    .execute();

  const claimed = await db
    .updateTable('webhook_deliveries')
    .set({
      status: 'in_progress',
      next_attempt_at: new Date(Date.now() + 120_000).toISOString(),
    })
    .where('id', '=', opts.deliveryId)
    .where('status', '=', 'pending')
    .returning(['id'])
    .executeTakeFirst();

  if (!claimed) {
    const existing = await db
      .selectFrom('webhook_deliveries as wd')
      .innerJoin('webhook_subscriptions as ws', 'ws.id', 'wd.subscription_id')
      .select(['wd.status', 'ws.workspace_id'])
      .where('wd.id', '=', opts.deliveryId)
      .executeTakeFirst();

    if (!existing) {
      throw new PermanentJobError('Webhook delivery not found', 'DELIVERY_NOT_FOUND');
    }
    if (existing.workspace_id !== opts.expectedTenantId) {
      throw new PermanentJobError('Cross-tenant webhook denied', 'CROSS_TENANT');
    }
    if (existing.status === 'delivered') {
      return { outcome: 'skipped', reason: 'already_delivered' };
    }
    if (existing.status === 'failed') {
      return { outcome: 'skipped', reason: 'already_failed' };
    }
    if (existing.status === 'in_progress') {
      return { outcome: 'skipped', reason: 'in_progress' };
    }
    return { outcome: 'skipped', reason: `status_${existing.status}` };
  }

  const row = await db
    .selectFrom('webhook_deliveries as wd')
    .innerJoin('webhook_subscriptions as ws', 'ws.id', 'wd.subscription_id')
    .select([
      'wd.id',
      'wd.attempts',
      'wd.payload',
      'wd.event',
      'wd.subscription_id',
      'wd.status',
      'ws.target_url',
      'ws.secret',
      'ws.workspace_id',
    ])
    .where('wd.id', '=', opts.deliveryId)
    .executeTakeFirstOrThrow();

  if (row.workspace_id !== opts.expectedTenantId) {
    await db
      .updateTable('webhook_deliveries')
      .set({ status: 'failed', last_error: 'cross_tenant_denied' })
      .where('id', '=', opts.deliveryId)
      .execute();
    throw new PermanentJobError('Cross-tenant webhook denied', 'CROSS_TENANT');
  }

  const body = payloadBody(row.payload);

  try {
    await assertSafeUrl(row.target_url);
  } catch (err) {
    const msg = err instanceof SsrfError ? err.message : 'SSRF blocked';
    await db
      .updateTable('webhook_deliveries')
      .set({ status: 'failed', attempts: row.attempts + 1, last_error: msg })
      .where('id', '=', opts.deliveryId)
      .execute();
    throw new PermanentJobError(msg, 'SSRF_BLOCKED');
  }

  const signature = 'sha256=' + createHmac('sha256', row.secret).update(body).digest('hex');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let success = false;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(row.target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vencore-Signature': signature,
        'X-Vencore-Event': row.event,
        'X-Vencore-Delivery': row.id,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      success = true;
    } else {
      errorMsg = `HTTP ${res.status}`;
    }
  } catch (err) {
    clearTimeout(timer);
    errorMsg = err instanceof Error ? err.message : 'Unknown error';
  }

  const newAttempts = row.attempts + 1;

  if (success) {
    await db
      .updateTable('webhook_deliveries')
      .set({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        attempts: newAttempts,
        last_error: null,
      })
      .where('id', '=', opts.deliveryId)
      .where('status', '=', 'in_progress')
      .execute();
    return { outcome: 'delivered' };
  }

  if (newAttempts >= MAX_ATTEMPTS) {
    await db
      .updateTable('webhook_deliveries')
      .set({ status: 'failed', attempts: newAttempts, last_error: errorMsg })
      .where('id', '=', opts.deliveryId)
      .execute();
    throw new PermanentJobError(errorMsg ?? 'webhook failed', 'WEBHOOK_EXHAUSTED');
  }

  await db
    .updateTable('webhook_deliveries')
    .set({
      status: 'pending',
      attempts: newAttempts,
      next_attempt_at: nextAttemptAt(newAttempts),
      last_error: errorMsg,
    })
    .where('id', '=', opts.deliveryId)
    .execute();

  throw new RetryableJobError(errorMsg ?? 'webhook delivery failed', 'WEBHOOK_RETRY');
}
