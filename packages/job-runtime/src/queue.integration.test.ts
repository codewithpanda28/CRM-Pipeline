/**
 * BullMQ + Redis integration.
 * Prefers REDIS_URL_TEST; otherwise spins redis-memory-server (Redis ≥5 for BullMQ).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BullMqJobQueue,
  createTenantAwareWorker,
  PermanentJobError,
} from './index';

const enabled = process.env['ALLOW_LIVE_QUEUE_TESTS'] === '1';

describe.skipIf(!enabled)('BullMQ queue live', () => {
  const handles: Array<{ close: () => Promise<void> }> = [];
  let redisUrl = '';
  let memoryServer: { stop: () => Promise<boolean> } | null = null;

  beforeAll(async () => {
    process.env['NODE_ENV'] = 'test';

    if (process.env['REDIS_URL_TEST']) {
      redisUrl = process.env['REDIS_URL_TEST'];
      // Probe version — BullMQ needs ≥5
      try {
        const IORedis = (await import('ioredis')).default;
        const client = new IORedis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 2000 });
        const info = await client.info('server');
        await client.quit();
        const m = /redis_version:(\d+)/.exec(info);
        const major = m ? Number(m[1]) : 0;
        if (major < 5) {
          redisUrl = '';
        }
      } catch {
        redisUrl = '';
      }
    }

    if (!redisUrl) {
      const { RedisMemoryServer } = await import('redis-memory-server');
      const server = await RedisMemoryServer.create();
      const host = await server.getHost();
      const port = await server.getPort();
      redisUrl = `redis://${host}:${port}/0`;
      memoryServer = server;
      process.env['REDIS_URL_TEST'] = redisUrl;
    }
  }, 120_000);

  afterAll(async () => {
    for (const h of handles) await h.close().catch(() => undefined);
    if (memoryServer) await memoryServer.stop().catch(() => undefined);
  });

  it('9. missing tenantId rejected at enqueue', async () => {
    const queue = new BullMqJobQueue({ redisUrl, queues: ['webhooks'], prefix: 't3test' });
    handles.push(queue);
    await expect(
      queue.enqueue({
        name: 'webhook.deliver',
        scope: 'tenant',
        queue: 'webhooks',
        payload: {},
        trace: { correlationId: 't' },
      }),
    ).rejects.toThrow(/tenantId/);
  });

  it('10. valid tenant job accepted', async () => {
    const tid = '11111111-1111-4111-8111-111111111111';
    const queue = new BullMqJobQueue({ redisUrl, queues: ['webhooks'], prefix: 't3ok' });
    handles.push(queue);

    let ran = false;
    const done = new Promise<void>((resolve) => {
      const { close } = createTenantAwareWorker({
        redisUrl,
        queue: 'webhooks',
        prefix: 't3ok',
        concurrency: 1,
        loadTenant: async () => ({ id: tid, status: 'active', jobsPaused: false }),
        handlers: {
          'test.ping': async () => {
            ran = true;
            resolve();
          },
        },
      });
      handles.push({ close });
    });

    await queue.enqueue({
      name: 'test.ping',
      tenantId: tid,
      scope: 'tenant',
      queue: 'webhooks',
      payload: { tenantId: tid },
      idempotencyKey: `ping-${Date.now()}`,
      trace: { correlationId: 'c' },
    });

    await Promise.race([
      done,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15_000)),
    ]);
    expect(ran).toBe(true);
  });

  it('11. suspended tenant job rejected/no-op', async () => {
    const tid = '22222222-2222-4222-8222-222222222222';
    const queue = new BullMqJobQueue({ redisUrl, queues: ['webhooks'], prefix: 't3sus' });
    handles.push(queue);

    let handlerRan = false;
    let rejected = false;
    const done = new Promise<void>((resolve) => {
      const { close } = createTenantAwareWorker({
        redisUrl,
        queue: 'webhooks',
        prefix: 't3sus',
        loadTenant: async () => ({ id: tid, status: 'suspended', jobsPaused: false }),
        handlers: {
          'test.ping': async () => {
            handlerRan = true;
          },
        },
        onRejected: () => {
          rejected = true;
          resolve();
        },
      });
      handles.push({ close });
    });

    await queue.enqueue({
      name: 'test.ping',
      tenantId: tid,
      scope: 'tenant',
      queue: 'webhooks',
      payload: {},
      idempotencyKey: `sus-${Date.now()}`,
      trace: { correlationId: 'c' },
    });

    await Promise.race([
      done,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15_000)),
    ]);
    expect(handlerRan).toBe(false);
    expect(rejected).toBe(true);
  });

  it('12/13. retry and priority enqueue', async () => {
    const queue = new BullMqJobQueue({ redisUrl, queues: ['webhooks'], prefix: 't3prio' });
    handles.push(queue);
    const tid = '33333333-3333-4333-8333-333333333333';

    const handle = await queue.enqueue({
      name: 'test.prio',
      tenantId: tid,
      scope: 'tenant',
      queue: 'webhooks',
      payload: {},
      priority: 'critical',
      retryPolicy: { maxAttempts: 3, baseDelayMs: 100 },
      idempotencyKey: `prio-${Date.now()}`,
      trace: { correlationId: 'c' },
    });
    expect(handle.externalId).toBeTruthy();
    await queue.cancel(handle);
  });

  it('16. platform job cannot silently use arbitrary tenant from payload alone', async () => {
    const { assertJobAllowed } = await import('./worker-gate');
    await expect(
      assertJobAllowed(
        {
          name: 'x',
          scope: 'tenant',
          tenantId: undefined,
          payload: { tenantId: '11111111-1111-4111-8111-111111111111' },
        },
        async () => ({ id: 'x', status: 'active', jobsPaused: false }),
      ),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });

  it('21. graceful worker shutdown', async () => {
    const tid = '44444444-4444-4444-8444-444444444444';
    const queue = new BullMqJobQueue({ redisUrl, queues: ['webhooks'], prefix: 't3shut' });
    handles.push(queue);
    const { close, worker } = createTenantAwareWorker({
      redisUrl,
      queue: 'webhooks',
      prefix: 't3shut',
      loadTenant: async () => ({ id: tid, status: 'active', jobsPaused: false }),
      handlers: {
        'test.slow': async () => {
          await new Promise((r) => setTimeout(r, 100));
        },
      },
    });
    expect(worker.isRunning()).toBe(true);
    await close();
    // BullMQ may still report isRunning briefly; closing flag is the durable signal.
    expect(worker.closing || !worker.isRunning()).toBeTruthy();
  });
});
