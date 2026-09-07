import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getLiveCtx, destroyLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import {
  authedGet,
  expectNoSecretLeak,
  signTenantToken,
  signPlatformToken,
} from './http';
import request from 'supertest';

describe('live platform-boundary', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  afterAll(async () => {
    await destroyLiveCtx();
  });

  it('tenant JWT cannot access platform tenant list / outbox / audit', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    for (const path of ['/api/platform/tenants', '/api/platform/outbox', '/api/platform/security-audit']) {
      const res = await authedGet(app, path, { token, host: fx.tenantA.host });
      expect([401, 403]).toContain(res.status);
      expectNoSecretLeak(res.body, SECRETS_B);
      expect(JSON.stringify(res.body ?? {})).not.toContain(fx.outboxB.id);
      expect(JSON.stringify(res.body ?? {})).not.toContain(fx.auditB.id);
    }
  });

  it('platform admin can list tenants and inspect outbox/audit', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signPlatformToken({ platformUserId: fx.platformUser.id });
    const tenants = await request(app)
      .get('/api/platform/tenants')
      .set('Authorization', `Bearer ${token}`);
    expect(tenants.status).toBe(200);
    const ids = (tenants.body.data as { id: string }[]).map((t) => t.id);
    expect(ids).toContain(fx.tenantA.id);
    expect(ids).toContain(fx.tenantB.id);

    const outbox = await request(app)
      .get('/api/platform/outbox')
      .set('Authorization', `Bearer ${token}`);
    expect(outbox.status).toBe(200);

    const audit = await request(app)
      .get('/api/platform/security-audit')
      .set('Authorization', `Bearer ${token}`);
    expect(audit.status).toBe(200);
  });

  it('tenant routes never return B outbox/audit payloads', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const brand = await authedGet(app, '/api/tenant/branding', { token, host: fx.tenantA.host });
    expectNoSecretLeak(brand.body, SECRETS_B);
    expect(JSON.stringify(brand.body)).not.toContain(fx.outboxB.id);
  });
});
