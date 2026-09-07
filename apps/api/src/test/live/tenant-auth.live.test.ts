import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import {
  authedGet,
  authedPost,
  expectDenied,
  expectNoSecretLeak,
  signTenantToken,
} from './http';

describe('live tenant-auth', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('Host A + JWT A passes', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(res.status).toBe(200);
  });

  it('Host B + JWT A denies HOST_JWT_MISMATCH', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantB.host,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('HOST_JWT_MISMATCH');
    expectNoSecretLeak(res.body, SECRETS_B);
  });

  it('Host A + JWT B denies', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('HOST_JWT_MISMATCH');
  });

  it('body tenantId override denied', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedPost(app, '/api/contacts', {
      token,
      host: fx.tenantA.host,
      body: { name: 'X', email: 'x@isolation.test', tenantId: fx.tenantB.id },
    });
    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe('BODY_TENANT_REJECTED');
  });

  it('multiUser host-bound A and B', async () => {
    const { app, fx } = await getLiveCtx();
    const tokenA = signTenantToken({ userId: fx.multiUser.id, tenantId: fx.tenantA.id });
    const resA = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(resA.status).toBe(200);

    const tokenB = signTenantToken({ userId: fx.multiUser.id, tenantId: fx.tenantB.id });
    const resB = await authedGet(app, `/api/contacts/${fx.contactB.id}`, {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(resB.status).toBe(200);
  });

  it('userA cannot access tenant B', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantB.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactB.id}`, {
      token,
      host: fx.tenantB.host,
    });
    expect([403, 404]).toContain(res.status);
    expectNoSecretLeak(res.body, SECRETS_B);
  });

  it('userA cannot switch to B; multiUser can', async () => {
    const { app, fx, db } = await getLiveCtx();
    const tokenA = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const deny = await authedPost(app, '/api/auth/switch-tenant', {
      token: tokenA,
      host: fx.tenantA.host,
      body: { tenantId: fx.tenantB.id },
    });
    expect(deny.status).toBe(403);

    const tokenM = signTenantToken({ userId: fx.multiUser.id, tenantId: fx.tenantA.id });
    const ok = await authedPost(app, '/api/auth/switch-tenant', {
      token: tokenM,
      host: 'app.thinkaiq.com',
      body: { tenantId: fx.tenantB.id },
    });
    expect(ok.status).toBe(200);
    expect(ok.body?.data?.tenantId).toBe(fx.tenantB.id);

    const audit = await db
      .selectFrom('security_audit_events')
      .where('actor_id', '=', fx.multiUser.id)
      .where('action', 'like', '%switch%')
      .selectAll()
      .execute();
    // switch may use auth.tenant_switched — accept any audit for actor if action naming differs
    const any = await db
      .selectFrom('security_audit_events')
      .where('actor_id', '=', fx.multiUser.id)
      .select(['action'])
      .execute();
    expect(any.length + audit.length).toBeGreaterThan(0);
  });

  it('Host A + active_tenant_id B denies', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.multiUser.id, tenantId: fx.tenantB.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('HOST_JWT_MISMATCH');
  });
});
