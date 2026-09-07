import { describe, it, expect, vi, beforeEach } from 'vitest';

const FAKE_SECRET = 'testsecret';
const FAKE_PAYLOAD = JSON.stringify({ deal_id: 'd1', event: 'deal.stage_changed' });
const DELIVERY_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const SUB_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('@vencore/job-runtime', async () => {
  const actual = await vi.importActual<typeof import('@vencore/job-runtime')>('@vencore/job-runtime');
  return {
    ...actual,
    assertSafeUrl: vi.fn().mockResolvedValue(undefined),
  };
});

function buildFakeDb(opts: { attempts?: number; status?: string } = {}) {
  let status = opts.status ?? 'pending';
  const attempts = opts.attempts ?? 0;
  const sets: unknown[] = [];

  const updateTable = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain['set'] = vi.fn((vals: Record<string, unknown>) => {
      sets.push(vals);
      const whereChain: Record<string, unknown> = {};
      whereChain['where'] = vi.fn().mockReturnValue(whereChain);
      whereChain['returning'] = vi.fn().mockReturnValue({
        executeTakeFirst: vi.fn(async () => {
          if (status === 'pending' && vals['status'] === 'in_progress') {
            status = 'in_progress';
            return { id: DELIVERY_ID };
          }
          return undefined;
        }),
      });
      whereChain['execute'] = vi.fn(async () => {
        if (typeof vals['status'] === 'string') status = vals['status'] as string;
      });
      return whereChain;
    });
    return chain;
  });

  const selectFrom = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain['innerJoin'] = vi.fn().mockReturnValue(chain);
    chain['select'] = vi.fn().mockReturnValue(chain);
    chain['where'] = vi.fn().mockReturnValue(chain);
    chain['executeTakeFirst'] = vi.fn(async () => ({
      status,
      workspace_id: TENANT_ID,
    }));
    chain['executeTakeFirstOrThrow'] = vi.fn(async () => ({
      id: DELIVERY_ID,
      attempts,
      payload: FAKE_PAYLOAD,
      event: 'deal.stage_changed',
      subscription_id: SUB_ID,
      status,
      target_url: 'https://example.com/webhook',
      secret: FAKE_SECRET,
      workspace_id: TENANT_ID,
    }));
    return chain;
  });

  return { updateTable, selectFrom, sets, getStatus: () => status };
}

describe('webhook delivery — executeWebhookDelivery', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('sends correct headers on successful delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const { createHmac } = await import('node:crypto');
    const expectedSig =
      'sha256=' + createHmac('sha256', FAKE_SECRET).update(FAKE_PAYLOAD).digest('hex');

    const { executeWebhookDelivery } = await import('@vencore/events/webhook');
    const fakeDb = buildFakeDb();
    const result = await executeWebhookDelivery(fakeDb as never, {
      deliveryId: DELIVERY_ID,
      expectedTenantId: TENANT_ID,
    });

    expect(result.outcome).toBe('delivered');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Vencore-Signature': expectedSig,
          'X-Vencore-Event': 'deal.stage_changed',
          'X-Vencore-Delivery': DELIVERY_ID,
        }),
        body: FAKE_PAYLOAD,
      }),
    );
  });

  it('marks delivery as delivered on 2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    const { executeWebhookDelivery } = await import('@vencore/events/webhook');
    const fakeDb = buildFakeDb();
    await executeWebhookDelivery(fakeDb as never, {
      deliveryId: DELIVERY_ID,
      expectedTenantId: TENANT_ID,
    });
    expect(fakeDb.sets.some((s) => (s as { status?: string }).status === 'delivered')).toBe(true);
  });

  it('increments attempts and retries on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const { executeWebhookDelivery } = await import('@vencore/events/webhook');
    const { RetryableJobError } = await import('@vencore/job-runtime');
    const fakeDb = buildFakeDb({ attempts: 0 });
    await expect(
      executeWebhookDelivery(fakeDb as never, {
        deliveryId: DELIVERY_ID,
        expectedTenantId: TENANT_ID,
      }),
    ).rejects.toBeInstanceOf(RetryableJobError);
    expect(
      fakeDb.sets.some(
        (s) =>
          (s as { attempts?: number; last_error?: string }).attempts === 1 &&
          (s as { last_error?: string }).last_error === 'HTTP 500',
      ),
    ).toBe(true);
  });

  it('marks failed when attempts reaches 5', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { executeWebhookDelivery } = await import('@vencore/events/webhook');
    const { PermanentJobError } = await import('@vencore/job-runtime');
    const fakeDb = buildFakeDb({ attempts: 4 });
    await expect(
      executeWebhookDelivery(fakeDb as never, {
        deliveryId: DELIVERY_ID,
        expectedTenantId: TENANT_ID,
      }),
    ).rejects.toBeInstanceOf(PermanentJobError);
    expect(
      fakeDb.sets.some(
        (s) =>
          (s as { status?: string; attempts?: number }).status === 'failed' &&
          (s as { attempts?: number }).attempts === 5,
      ),
    ).toBe(true);
  });
});
