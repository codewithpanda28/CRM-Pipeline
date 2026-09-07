import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import {
  authedGet,
  authedDelete,
  expectDenied,
  expectNoId,
  expectNoSecretLeak,
  signTenantToken,
} from './http';

describe('live webhook-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('A cannot list/delete B subscription or see B secret', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const list = await authedGet(app, '/api/webhooks/subscriptions', {
      token,
      host: fx.tenantA.host,
    });
    expect(list.status).toBe(200);
    expectNoId(list.body, fx.webhookB.id);
    expectNoSecretLeak(list.body, SECRETS_B);

    expectDenied(
      await authedDelete(app, `/api/webhooks/subscriptions/${fx.webhookB.id}`, {
        token,
        host: fx.tenantA.host,
      }),
    );
  });

  it('A cannot list B deliveries (subscription gate)', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const deny = await authedGet(
      app,
      `/api/webhooks/deliveries?subscription_id=${fx.webhookB.id}`,
      { token, host: fx.tenantA.host },
    );
    expectDenied(deny);
    expectNoSecretLeak(deny.body, SECRETS_B);

    const ok = await authedGet(
      app,
      `/api/webhooks/deliveries?subscription_id=${fx.webhookA.id}`,
      { token, host: fx.tenantA.host },
    );
    expect(ok.status).toBe(200);
    expectNoId(ok.body, fx.deliveryB.id);
  });
});
