import { describe, expect, it } from 'vitest';
import { resolveRetryPolicy, computeBackoffDelayMs, isRetryableError, PermanentJobError, RetryableJobError } from './retries';
import { toBullmqPriority } from './priorities';
import { assertJobAllowed } from './worker-gate';
import { assertJobDefinitionContract } from './contract';
import { resolveJobsRuntime } from './index';
import type { JobDefinition } from './types';

describe('retry policy', () => {
  it('clamps abusive maxAttempts', () => {
    const p = resolveRetryPolicy({ maxAttempts: 999 });
    expect(p.maxAttempts).toBe(10);
  });

  it('applies exponential backoff with jitter bound', () => {
    const p = resolveRetryPolicy({ baseDelayMs: 1000, maxDelayMs: 60_000, jitterRatio: 0.2 });
    const d = computeBackoffDelayMs(p, 3);
    expect(d).toBeGreaterThanOrEqual(4000);
    expect(d).toBeLessThanOrEqual(4000 * 1.2 + 1);
  });

  it('classifies permanent vs retryable', () => {
    expect(isRetryableError(new PermanentJobError('x'))).toBe(false);
    expect(isRetryableError(new RetryableJobError('x'))).toBe(true);
    expect(isRetryableError(new Error('boom'))).toBe(true);
  });
});

describe('priority', () => {
  it('orders critical ahead of bulk', () => {
    expect(toBullmqPriority('critical')).toBeLessThan(toBullmqPriority('bulk'));
  });
});

describe('worker gate', () => {
  it('rejects missing tenantId', async () => {
    await expect(
      assertJobAllowed(
        { name: 'webhook.deliver', tenantId: null, scope: 'tenant', payload: {} },
        async () => null,
      ),
    ).rejects.toMatchObject({ code: 'MISSING_TENANT' });
  });

  it('rejects invalid tenant uuid', async () => {
    await expect(
      assertJobAllowed(
        { name: 'webhook.deliver', tenantId: 'not-a-uuid', scope: 'tenant', payload: {} },
        async () => null,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TENANT' });
  });

  it('rejects suspended tenant', async () => {
    const tid = '11111111-1111-4111-8111-111111111111';
    await expect(
      assertJobAllowed(
        { name: 'webhook.deliver', tenantId: tid, scope: 'tenant', payload: {} },
        async () => ({ id: tid, status: 'suspended', jobsPaused: false }),
      ),
    ).rejects.toMatchObject({ code: 'TENANT_JOBS_BLOCKED' });
  });

  it('rejects archived tenant', async () => {
    const tid = '11111111-1111-4111-8111-111111111111';
    await expect(
      assertJobAllowed(
        { name: 'automation.pipeline.evaluate', tenantId: tid, scope: 'tenant', payload: {} },
        async () => ({ id: tid, status: 'archived', jobsPaused: false }),
      ),
    ).rejects.toMatchObject({ code: 'TENANT_JOBS_BLOCKED' });
  });

  it('accepts active tenant', async () => {
    const tid = '11111111-1111-4111-8111-111111111111';
    const snap = await assertJobAllowed(
      { name: 'webhook.deliver', tenantId: tid, scope: 'tenant', payload: { tenantId: tid } },
      async () => ({ id: tid, status: 'active', jobsPaused: false }),
    );
    expect(snap?.id).toBe(tid);
  });

  it('rejects payload tenant mismatch', async () => {
    const tid = '11111111-1111-4111-8111-111111111111';
    await expect(
      assertJobAllowed(
        {
          name: 'webhook.deliver',
          tenantId: tid,
          scope: 'tenant',
          payload: { tenantId: '22222222-2222-4222-8222-222222222222' },
        },
        async () => ({ id: tid, status: 'active', jobsPaused: false }),
      ),
    ).rejects.toMatchObject({ code: 'TENANT_PAYLOAD_MISMATCH' });
  });

  it('platform job without tenant ok', async () => {
    const r = await assertJobAllowed(
      { name: 'platform.reconcile', tenantId: null, scope: 'platform', payload: {} },
      async () => null,
    );
    expect(r).toBeNull();
  });
});

describe('job definition contract', () => {
  const base = (): JobDefinition => ({
    name: 'automation.pipeline.evaluate',
    tenantId: '11111111-1111-4111-8111-111111111111',
    scope: 'tenant',
    queue: 'automation',
    payload: {},
    idempotencyKey: 't:pipeline:1',
    retryPolicy: { maxAttempts: 5, baseDelayMs: 2000 },
    timeoutMs: 60_000,
    trace: { correlationId: 'corr-1' },
  });

  it('accepts well-formed tenant automation job', () => {
    expect(assertJobDefinitionContract(base(), { requireIdempotency: true })).toEqual([]);
  });

  it('requires tenantId for tenant scope', () => {
    const def = base();
    def.tenantId = null;
    expect(assertJobDefinitionContract(def).some((i) => i.code === 'TENANT_REQUIRED')).toBe(true);
  });

  it('requires idempotency when opted in', () => {
    const def = base();
    delete def.idempotencyKey;
    expect(
      assertJobDefinitionContract(def, { requireIdempotency: true }).some(
        (i) => i.code === 'IDEMPOTENCY_REQUIRED',
      ),
    ).toBe(true);
  });

  it('requires correlationId', () => {
    const def = base();
    def.trace = { correlationId: '' };
    expect(assertJobDefinitionContract(def).some((i) => i.code === 'TRACE_REQUIRED')).toBe(true);
  });

  it('platform scope is explicit', () => {
    const def: JobDefinition = {
      name: 'pipeline.reminder',
      scope: 'platform',
      tenantId: null,
      queue: 'automation',
      payload: { scheduled: true },
      retryPolicy: { maxAttempts: 3 },
      timeoutMs: 30_000,
      trace: { correlationId: 'sched:pipeline.reminder' },
    };
    expect(assertJobDefinitionContract(def)).toEqual([]);
  });
});

describe('jobs runtime', () => {
  it('defaults to bullmq', () => {
    expect(resolveJobsRuntime(undefined)).toBe('bullmq');
    expect(resolveJobsRuntime('legacy')).toBe('legacy');
  });
});
