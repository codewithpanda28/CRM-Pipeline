import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import {
  apiKeyGet,
  apiKeyPost,
  authedGet,
  authedDelete,
  expectDenied,
  expectNoId,
  expectNoSecretLeak,
  signTenantToken,
} from './http';

describe('live api-key-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('Key A → A contact PASS; Key A → B contact DENY', async () => {
    const { app, fx } = await getLiveCtx();
    const ok = await apiKeyGet(app, `/v1/contacts/${fx.contactA.id}`, fx.apiKeyA.raw);
    expect(ok.status).toBe(200);
    expect(ok.body.data.id).toBe(fx.contactA.id);

    const deny = await apiKeyGet(app, `/v1/contacts/${fx.contactB.id}`, fx.apiKeyA.raw);
    expectDenied(deny);
    expectNoSecretLeak(deny.body, SECRETS_B);
  });

  it('Key B → B contact PASS', async () => {
    const { app, fx } = await getLiveCtx();
    const ok = await apiKeyGet(app, `/v1/contacts/${fx.contactB.id}`, fx.apiKeyB.raw);
    expect(ok.status).toBe(200);
  });

  it('list via Key A excludes B; body tenantId ignored/rejected', async () => {
    const { app, fx } = await getLiveCtx();
    const list = await apiKeyGet(app, '/v1/contacts', fx.apiKeyA.raw);
    expect(list.status).toBe(200);
    expectNoId(list.body, fx.contactB.id);

    const create = await apiKeyPost(app, '/v1/contacts', fx.apiKeyA.raw, {
      name: 'API Cross',
      email: 'api-cross@isolation.test',
      tenantId: fx.tenantB.id,
      company_id: fx.companyB.id,
    });
    // API key path may not run bodyTenantOverrideAttempt — company scope still blocks
    expect([400, 403, 404]).toContain(create.status);
  });

  it('management list/get/revoke scoped', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const list = await authedGet(app, '/api/api-keys', { token, host: fx.tenantA.host });
    expect(list.status).toBe(200);
    expectNoId(list.body, fx.apiKeyB.id);
    expectNoSecretLeak(list.body, [fx.apiKeyB.raw, 'Key B Secret']);

    expectDenied(
      await authedDelete(app, `/api/api-keys/${fx.apiKeyB.id}`, { token, host: fx.tenantA.host }),
    );
  });
});
