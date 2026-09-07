/**
 * Live Postgres tests: business mutation ↔ outbox SAME TRANSACTION (Task 6).
 * ALLOW_LIVE_QUEUE_TESTS=1 DATABASE_URL_TEST=... REDIS_URL_TEST optional for publisher.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Database } from '@vencore/db';
import type { Kysely } from 'kysely';
import { assertSafeQueueTestEnv } from './test-guards';
import {
  commitBusinessAndOutbox,
  forceOutboxInsertFailure,
  MemoryJobQueue,
  publishCommittedOutbox,
  withUnitOfWork,
} from './test-tx-helpers';

const enabled = process.env['ALLOW_LIVE_QUEUE_TESTS'] === '1';

describe.skipIf(!enabled)('transactional outbox atomicity', () => {
  let db: Kysely<Database>;
  let tenantId: string;
  let queue: MemoryJobQueue;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';
    const { databaseUrl } = assertSafeQueueTestEnv();
    db = createDb(databaseUrl);
    tenantId = randomUUID();
    queue = new MemoryJobQueue();

    await db
      .insertInto('tenants')
      .values({
        id: tenantId,
        display_name: 'TX Outbox Tenant',
        slug: `tx-${tenantId.slice(0, 8)}`,
        status: 'active',
      })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute()
      .catch(async () => {
        await db
          .insertInto('workspaces')
          .values({ id: tenantId, name: 'TX Outbox' })
          .execute()
          .catch(() => undefined);
        await db
          .insertInto('tenants')
          .values({
            id: tenantId,
            display_name: 'TX Outbox Tenant',
            slug: `tx-${tenantId.slice(0, 8)}`,
            status: 'active',
          })
          .onConflict((oc) => oc.column('id').doNothing())
          .execute()
          .catch(() => undefined);
      });
  });

  afterAll(async () => {
    if (!db) return;
    await db.deleteFrom('outbox_events').where('tenant_id', '=', tenantId).execute().catch(() => undefined);
    await db.deleteFrom('tenants').where('id', '=', tenantId).execute().catch(() => undefined);
    await db.destroy();
  });

  it('1. business mutation succeeds → outbox exists', async () => {
    const marker = `ok-${randomUUID()}`;
    const note = `note-${marker}`;

    await commitBusinessAndOutbox(db, {
      tenantId,
      marker,
      mutate: async (trx) => {
        // Use outbox_events as stand-in business row via a second pending insert
        // that is part of the same TX — simulate via tenant_job_controls upsert if present,
        // else a no-op update on tenants.
        await trx
          .updateTable('tenants')
          .set({ display_name: note })
          .where('id', '=', tenantId)
          .execute();
      },
    });

    const tenant = await db
      .selectFrom('tenants')
      .select(['display_name'])
      .where('id', '=', tenantId)
      .executeTakeFirstOrThrow();
    expect(tenant.display_name).toBe(note);

    const outbox = await db
      .selectFrom('outbox_events')
      .select(['id', 'status'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirst();
    expect(outbox).toBeTruthy();
    expect(outbox!.status).toBe('pending');
  });

  it('2. business mutation fails → no outbox', async () => {
    const marker = `fail-biz-${randomUUID()}`;
    const beforeName = (
      await db.selectFrom('tenants').select('display_name').where('id', '=', tenantId).executeTakeFirstOrThrow()
    ).display_name;

    await expect(
      withUnitOfWork(db, async (trx, recorder) => {
        await trx
          .updateTable('tenants')
          .set({ display_name: `should-rollback-${marker}` })
          .where('id', '=', tenantId)
          .execute();
        await recorder.append({
          tenantId,
          eventType: 'crm.pipeline.stage_changed',
          aggregateType: 'pipeline_item',
          aggregateId: randomUUID(),
          jobName: 'automation.pipeline.evaluate',
          dedupeKey: marker,
          payload: {},
        });
        throw new Error('force_business_fail');
      }),
    ).rejects.toThrow('force_business_fail');

    const tenant = await db
      .selectFrom('tenants')
      .select(['display_name'])
      .where('id', '=', tenantId)
      .executeTakeFirstOrThrow();
    expect(tenant.display_name).toBe(beforeName);

    const outbox = await db
      .selectFrom('outbox_events')
      .select(['id'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirst();
    expect(outbox).toBeUndefined();
  });

  it('3. outbox path fails → business mutation rolls back', async () => {
    const marker = `fail-outbox-${randomUUID()}`;
    const beforeName = (
      await db.selectFrom('tenants').select('display_name').where('id', '=', tenantId).executeTakeFirstOrThrow()
    ).display_name;

    await expect(
      withUnitOfWork(db, async (trx, recorder) => {
        await trx
          .updateTable('tenants')
          .set({ display_name: `should-rollback-outbox-${marker}` })
          .where('id', '=', tenantId)
          .execute();
        // Simulate mid-TX failure after mutate, before durable outbox commit
        // (covers outbox-append failure and any post-mutate TX error)
        await recorder.append({
          tenantId,
          eventType: 'crm.pipeline.stage_changed',
          aggregateType: 'pipeline_item',
          aggregateId: randomUUID(),
          jobName: 'automation.pipeline.evaluate',
          dedupeKey: marker,
          payload: {},
        });
        await forceOutboxInsertFailure(trx);
      }),
    ).rejects.toThrow();

    const tenant = await db
      .selectFrom('tenants')
      .select(['display_name'])
      .where('id', '=', tenantId)
      .executeTakeFirstOrThrow();
    expect(tenant.display_name).toBe(beforeName);

    const outbox = await db
      .selectFrom('outbox_events')
      .select(['id'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirst();
    expect(outbox).toBeUndefined();
  });

  it('4. transaction commits → publisher later dispatches job', async () => {
    const marker = `pub-${randomUUID()}`;
    await commitBusinessAndOutbox(db, {
      tenantId,
      marker,
      mutate: async (trx) => {
        await trx
          .updateTable('tenants')
          .set({ display_name: `pub-${marker.slice(0, 12)}` })
          .where('id', '=', tenantId)
          .execute();
      },
    });

    queue.failEnqueue = false;
    const before = queue.enqueueCalls;
    await publishCommittedOutbox(db, queue);
    expect(queue.enqueueCalls).toBeGreaterThan(before);

    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'job_handle'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('published');
    expect(row.job_handle).toBeTruthy();

    const job = queue.jobs.find((j) => j.definition.idempotencyKey === marker);
    expect(job?.definition.name).toBe('automation.pipeline.evaluate');
    expect(job?.definition.queue).toBe('automation');
  });

  it('5. publisher/Redis failure → committed outbox remains durable', async () => {
    const marker = `redis-${randomUUID()}`;
    await commitBusinessAndOutbox(db, {
      tenantId,
      marker,
      mutate: async (trx) => {
        await trx
          .updateTable('tenants')
          .set({ display_name: `redis-${marker.slice(0, 12)}` })
          .where('id', '=', tenantId)
          .execute();
      },
    });

    queue.failEnqueue = true;
    await publishCommittedOutbox(db, queue);
    queue.failEnqueue = false;

    const row = await db
      .selectFrom('outbox_events')
      .select(['status', 'attempts', 'last_error'])
      .where('dedupe_key', '=', marker)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('pending');
    expect(row.attempts).toBeGreaterThanOrEqual(1);
    expect(String(row.last_error)).toMatch(/REDIS/i);
  });

  it('duplicate append in same TX is safe (dedupe)', async () => {
    const marker = `dedupe-tx-${randomUUID()}`;
    await withUnitOfWork(db, async (trx, recorder) => {
      const a = await recorder.append({
        tenantId,
        eventType: 'crm.pipeline.stage_changed',
        aggregateType: 'pipeline_item',
        aggregateId: 'x',
        dedupeKey: marker,
        jobName: 'automation.pipeline.evaluate',
        payload: { n: 1 },
      });
      const b = await recorder.append({
        tenantId,
        eventType: 'crm.pipeline.stage_changed',
        aggregateType: 'pipeline_item',
        aggregateId: 'x',
        dedupeKey: marker,
        jobName: 'automation.pipeline.evaluate',
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
});
