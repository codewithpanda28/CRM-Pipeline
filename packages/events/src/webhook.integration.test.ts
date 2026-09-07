/**
 * Webhook delivery idempotency + isolation (live Postgres).
 * ALLOW_LIVE_QUEUE_TESTS=1 DATABASE_URL_TEST=...
 */
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Database } from '@vencore/db';
import type { Kysely } from 'kysely';
import { executeWebhookDelivery } from './workloads/webhook-delivery';
import { assertSafeQueueTestEnv } from './test-guards';

const enabled = process.env['ALLOW_LIVE_QUEUE_TESTS'] === '1';

describe.skipIf(!enabled)('webhook delivery live', () => {
  let db: Kysely<Database>;
  let tenantA: string;
  let tenantB: string;
  let hits = 0;
  let server: http.Server;
  let targetUrl: string;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['WEBHOOK_ALLOW_LOOPBACK'] = '1';
    const { databaseUrl } = assertSafeQueueTestEnv();
    db = createDb(databaseUrl);
    tenantA = randomUUID();
    tenantB = randomUUID();

    hits = 0;
    server = http.createServer((_req, res) => {
      hits += 1;
      res.writeHead(200);
      res.end('ok');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    targetUrl = `http://127.0.0.1:${addr.port}/hook`;

    for (const id of [tenantA, tenantB]) {
      await db
        .insertInto('workspaces')
        .values({
          id,
          name: `wh-${id.slice(0, 6)}`,
          domain: `wh-${id.slice(0, 8)}.test.local`,
        })
        .execute();
      await db
        .insertInto('tenants')
        .values({
          id,
          display_name: `WH ${id.slice(0, 6)}`,
          slug: `wh-${id.slice(0, 8)}`,
          status: 'active',
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
    }
  });

  afterAll(async () => {
    server?.close();
    if (!db) return;
    await db.destroy();
  });

  it('17. webhook delivery executes', async () => {
    const subId = randomUUID();
    const deliveryId = randomUUID();
    await db
      .insertInto('webhook_subscriptions')
      .values({
        id: subId,
        workspace_id: tenantA,
        event: 'contact.created',
        target_url: targetUrl,
        secret: 'test-secret',
      })
      .execute();
    await db
      .insertInto('webhook_deliveries')
      .values({
        id: deliveryId,
        subscription_id: subId,
        event: 'contact.created',
        payload: JSON.stringify({ hello: true }),
        status: 'pending',
        next_attempt_at: new Date(0).toISOString(),
      })
      .execute();

    const before = hits;
    const result = await executeWebhookDelivery(db, {
      deliveryId,
      expectedTenantId: tenantA,
    });
    expect(result.outcome).toBe('delivered');
    expect(hits).toBe(before + 1);

    const row = await db
      .selectFrom('webhook_deliveries')
      .select(['status'])
      .where('id', '=', deliveryId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('delivered');
  });

  it('19. duplicate webhook job produces one outcome', async () => {
    const subId = randomUUID();
    const deliveryId = randomUUID();
    await db
      .insertInto('webhook_subscriptions')
      .values({
        id: subId,
        workspace_id: tenantA,
        event: 'contact.created',
        target_url: targetUrl,
        secret: 'test-secret',
      })
      .execute();
    await db
      .insertInto('webhook_deliveries')
      .values({
        id: deliveryId,
        subscription_id: subId,
        event: 'contact.created',
        payload: JSON.stringify({ dup: true }),
        status: 'pending',
        next_attempt_at: new Date(0).toISOString(),
      })
      .execute();

    const before = hits;
    await executeWebhookDelivery(db, { deliveryId, expectedTenantId: tenantA });
    const second = await executeWebhookDelivery(db, {
      deliveryId,
      expectedTenantId: tenantA,
    });
    expect(second.outcome).toBe('skipped');
    expect(hits).toBe(before + 1);
  });

  it('20. cross-tenant webhook attempt denied', async () => {
    const subId = randomUUID();
    const deliveryId = randomUUID();
    await db
      .insertInto('webhook_subscriptions')
      .values({
        id: subId,
        workspace_id: tenantA,
        event: 'contact.created',
        target_url: targetUrl,
        secret: 'test-secret',
      })
      .execute();
    await db
      .insertInto('webhook_deliveries')
      .values({
        id: deliveryId,
        subscription_id: subId,
        event: 'contact.created',
        payload: JSON.stringify({ x: 1 }),
        status: 'pending',
        next_attempt_at: new Date(0).toISOString(),
      })
      .execute();

    await expect(
      executeWebhookDelivery(db, { deliveryId, expectedTenantId: tenantB }),
    ).rejects.toMatchObject({ code: 'CROSS_TENANT' });
  });
});
