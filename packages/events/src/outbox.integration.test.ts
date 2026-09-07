/**
 * Live Postgres + optional Redis tests for outbox/publisher/webhook path.
 * Requires: NODE_ENV=test ALLOW_LIVE_QUEUE_TESTS=1 DATABASE_URL_TEST=... REDIS_URL_TEST=redis://127.0.0.1:6379/15
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Database } from '@vencore/db';
import type { Kysely } from 'kysely';
import { MemoryJobQueue } from '@vencore/job-runtime';
import { EventRecorder } from './recorder';
import { OutboxPublisher } from './publisher';
import { OutboxReconciler } from './reconciler';
import { assertSafeQueueTestEnv } from './test-guards';

const enabled = process.env['ALLOW_LIVE_QUEUE_TESTS'] === '1';

describe.skipIf(!enabled)('outbox live integration', () => {
  let db: Kysely<Database>;
  let tenantId: string;
  let queue: MemoryJobQueue;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    const { databaseUrl } = assertSafeQueueTestEnv();
    db = createDb(databaseUrl);
    tenantId = randomUUID();
    queue = new MemoryJobQueue();

    // Minimal tenant row (ignore if tenants missing — migration required)
    try {
      await db
        .insertInto('tenants')
        .values({
          id: tenantId,
          display_name: 'Queue Test Tenant',
          slug: `queue-test-${tenantId.slice(0, 8)}`,
          status: 'active',
        })
        .execute();
    } catch {
      // workspace dual-read: insert workspace instead
      await db
        .insertInto('workspaces')
        .values({ id: tenantId, name: 'Queue Test' })
        .execute()
        .catch(() => undefined);
      await db
        .insertInto('tenants')
        .values({
          id: tenantId,
          display_name: 'Queue Test Tenant',
          slug: `qt-${tenantId.slice(0, 8)}`,
          status: 'active',
        })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute()
        .catch(() => undefined);
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.deleteFrom('outbox_events').where('tenant_id', '=', tenantId).execute().catch(() => undefined);
    await db.deleteFrom('tenants').where('id', '=', tenantId).execute().catch(() => undefined);
    await db.destroy();
  });

  it('1. transaction rollback → no outbox', async () => {
    const marker = `rollback-${randomUUID()}`;
    try {
      await db.transaction().execute(async (trx) => {
        const recorder = EventRecorder.forTransaction(trx);
        await recorder.append({
          tenantId,
          eventType: 'crm.contact.created',
          aggregateType: 'contact',
          aggregateId: randomUUID(),
          jobName: 'webhook.deliver',
          dedupeKey: marker,
          payload: { deliveryId: randomUUID(), marker },
        });
        throw new Error('force_rollback');
      });
    } catch (e) {
      expect((e as Error).message).toBe('force_rollback');
    }
    const row = await db
      .selectFrom('outbox_events')
      .select(['id'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });

  it('2. transaction commit → outbox exists', async () => {
    const marker = `commit-${randomUUID()}`;
    let outboxId = '';
    await db.transaction().execute(async (trx) => {
      const recorder = EventRecorder.forTransaction(trx);
      const r = await recorder.append({
        tenantId,
        eventType: 'integration.webhook.queued',
        aggregateType: 'webhook_delivery',
        aggregateId: randomUUID(),
        jobName: 'webhook.deliver',
        dedupeKey: marker,
        payload: { deliveryId: randomUUID(), marker },
      });
      outboxId = r.id;
    });
    const row = await db
      .selectFrom('outbox_events')
      .select(['id', 'status'])
      .where('id', '=', outboxId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('pending');
  });

  it('3. publisher publishes', async () => {
    queue.failEnqueue = false;
    const before = queue.enqueueCalls;
    const marker = `pub-${randomUUID()}`;
    await db
      .insertInto('outbox_events')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        event_type: 'integration.webhook.queued',
        aggregate_type: 'webhook_delivery',
        aggregate_id: randomUUID(),
        payload: { deliveryId: randomUUID() },
        status: 'pending',
        job_name: 'webhook.deliver',
        dedupe_key: marker,
        correlation_id: marker,
      })
      .execute();

    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    const result = await publisher.tick();
    expect(result.published).toBeGreaterThanOrEqual(1);
    expect(queue.enqueueCalls).toBeGreaterThan(before);

    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'job_handle'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('published');
    expect(row.job_handle).toBeTruthy();
  });

  it('4. Redis failure retains outbox as pending (retry)', async () => {
    const marker = `redis-fail-${randomUUID()}`;
    await db
      .insertInto('outbox_events')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        event_type: 'integration.webhook.queued',
        payload: { deliveryId: randomUUID() },
        status: 'pending',
        job_name: 'webhook.deliver',
        dedupe_key: marker,
      })
      .execute();

    queue.failEnqueue = true;
    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    await publisher.tick();
    queue.failEnqueue = false;

    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'attempts', 'last_error'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('pending');
    expect(row.attempts).toBeGreaterThanOrEqual(1);
    expect(row.last_error).toMatch(/REDIS/i);
  });

  it('5. retry works after Redis recovers', async () => {
    const marker = `redis-recover-${randomUUID()}`;
    await db
      .insertInto('outbox_events')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        event_type: 'integration.webhook.queued',
        payload: { deliveryId: randomUUID() },
        status: 'pending',
        job_name: 'webhook.deliver',
        dedupe_key: marker,
        available_at: new Date(0),
      })
      .execute();

    queue.failEnqueue = true;
    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    await publisher.tick();
    queue.failEnqueue = false;

    // Force available
    await db
      .updateTable('outbox_events')
      .set({ available_at: new Date(0) })
      .where('dedupe_key', '=', marker)
      .execute();

    await publisher.tick();
    const row = await db
      .selectFrom('outbox_events')
      .select(['status'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('published');
  });

  it('6. lease expiry recovery', async () => {
    const id = randomUUID();
    await db
      .insertInto('outbox_events')
      .values({
        id,
        tenant_id: tenantId,
        event_type: 'integration.webhook.queued',
        payload: {},
        status: 'publishing',
        locked_by: 'dead-publisher',
        locked_until: new Date(Date.now() - 60_000),
        job_name: 'webhook.deliver',
        dedupe_key: `lease-${id}`,
      })
      .execute();

    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    const n = await publisher.reclaimExpiredLeases();
    expect(n).toBeGreaterThanOrEqual(1);

    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'locked_by'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('pending');
    expect(row.locked_by).toBeNull();
  });

  it('7. duplicate publish safe (dedupe)', async () => {
    const marker = `dedupe-${randomUUID()}`;
    await db.transaction().execute(async (trx) => {
      const recorder = EventRecorder.forTransaction(trx);
      const a = await recorder.append({
        tenantId,
        eventType: 'integration.webhook.queued',
        aggregateType: 'webhook_delivery',
        aggregateId: 'x',
        dedupeKey: marker,
        jobName: 'webhook.deliver',
        payload: { n: 1 },
      });
      const b = await recorder.append({
        tenantId,
        eventType: 'integration.webhook.queued',
        aggregateType: 'webhook_delivery',
        aggregateId: 'x',
        dedupeKey: marker,
        jobName: 'webhook.deliver',
        payload: { n: 2 },
      });
      expect(b.deduped).toBe(true);
      expect(b.id).toBe(a.id);
    });
    const rows = await db
      .selectFrom('outbox_events')
      .select(['id'])
      .where('dedupe_key', '=', marker)
      .execute();
    expect(rows).toHaveLength(1);
  });

  it('8. dead event handling', async () => {
    const id = randomUUID();
    await db
      .insertInto('outbox_events')
      .values({
        id,
        tenant_id: tenantId,
        event_type: 'integration.webhook.queued',
        payload: {},
        status: 'pending',
        attempts: 7,
        job_name: 'webhook.deliver',
        dedupe_key: `dead-${id}`,
        available_at: new Date(0),
      })
      .execute();

    queue.failEnqueue = true;
    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    await publisher.tick();
    queue.failEnqueue = false;

    const row = await db
      .selectFrom('outbox_events')
      .select(['status'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('dead');
  });

  it('reconciler reports pending/dead', async () => {
    const reconciler = new OutboxReconciler(db);
    const report = await reconciler.collect();
    expect(report.at).toBeTruthy();
    expect(typeof report.pending).toBe('number');
  });

  it('9. automation.pipeline.evaluate maps to automation queue', async () => {
    const marker = `auto-pipe-${randomUUID()}`;
    await db
      .insertInto('outbox_events')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        event_type: 'crm.pipeline.stage_changed',
        aggregate_type: 'pipeline_item',
        aggregate_id: randomUUID(),
        payload: {
          data: {
            event_type: 'stage_changed',
            item_id: randomUUID(),
            pipeline_id: randomUUID(),
            workspace_id: tenantId,
            payload: { to_stage_id: randomUUID() },
            idempotency_key: marker,
          },
        },
        status: 'pending',
        job_name: 'automation.pipeline.evaluate',
        dedupe_key: marker,
        available_at: new Date(0),
      })
      .execute();

    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    await publisher.tick();
    const enqueued = queue.jobs.find((j) => j.definition.idempotencyKey === marker);
    expect(enqueued).toBeTruthy();
    expect(enqueued!.definition.name).toBe('automation.pipeline.evaluate');
    expect(enqueued!.definition.queue).toBe('automation');
    expect(enqueued!.definition.tenantId).toBe(tenantId);
    expect(enqueued!.definition.scope).toBe('tenant');
  });

  it('10. publisher crash mid-lease → reclaim → republish', async () => {
    const id = randomUUID();
    const marker = `crash-${id}`;
    await db
      .insertInto('outbox_events')
      .values({
        id,
        tenant_id: tenantId,
        event_type: 'crm.pipeline.stage_changed',
        payload: { data: { event_type: 'stage_changed' } },
        status: 'publishing',
        locked_by: 'crashed-publisher',
        locked_until: new Date(Date.now() - 5_000),
        attempts: 1,
        job_name: 'automation.pipeline.evaluate',
        dedupe_key: marker,
        available_at: new Date(0),
      })
      .execute();

    const publisher = new OutboxPublisher({ db, jobQueue: queue });
    const reclaimed = await publisher.reclaimExpiredLeases();
    expect(reclaimed).toBeGreaterThanOrEqual(1);

    await publisher.tick();
    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'job_handle'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('published');
    expect(row.job_handle).toBeTruthy();
  });
});
