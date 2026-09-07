import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import {
  authedGet,
  authedPatch,
  expectNoSecretLeak,
  signTenantToken,
} from './http';
import { __clearModuleCacheForTesting } from '../../middleware/module';
import { __clearPermCacheForTesting } from '../../middleware/permission';
import { brandingCacheKey, moduleCacheKey, permissionCacheKey } from '@vencore/tenancy';

describe('live settings-branding + cache', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('A branding/settings GET returns A only', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const brand = await authedGet(app, '/api/tenant/branding', { token, host: fx.tenantA.host });
    expect(brand.status).toBe(200);
    expect(brand.body.data.tenant_id).toBe(fx.tenantA.id);
    expect(brand.body.data.brand_name).toBe('Tenant A');
    expectNoSecretLeak(brand.body, SECRETS_B);

    const settings = await authedGet(app, '/api/tenant/settings', { token, host: fx.tenantA.host });
    expect(settings.status).toBe(200);
    expect(settings.body.data.tenant_id).toBe(fx.tenantA.id);
    expect(settings.body.data.locale).toBe('en-IN');
  });

  it('Host B returns B branding — never A brand secret', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });
    const brand = await authedGet(app, '/api/tenant/branding', { token, host: fx.tenantB.host });
    expect(brand.status).toBe(200);
    expect(brand.body.data.tenant_id).toBe(fx.tenantB.id);
    expect(JSON.stringify(brand.body)).toContain('brand-b-secret');
    expect(JSON.stringify(brand.body)).not.toContain('brand-a-secret');
  });

  it('A cannot PATCH B branding via context (host-bound)', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    // Even if body includes tenantId — rejected earlier; patch only touches context tenant
    const patch = await authedPatch(app, '/api/tenant/branding', {
      token,
      host: fx.tenantA.host,
      body: { brand_name: 'Hacked A', tenantId: fx.tenantB.id },
    });
    // body tenantId → BODY_TENANT_REJECTED
    expect(patch.status).toBe(400);
    expect(patch.body?.error?.code).toBe('BODY_TENANT_REJECTED');

    const ok = await authedPatch(app, '/api/tenant/branding', {
      token,
      host: fx.tenantA.host,
      body: { brand_name: 'Tenant A Updated' },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.tenant_id).toBe(fx.tenantA.id);

    const b = await db
      .selectFrom('tenant_branding')
      .where('tenant_id', '=', fx.tenantB.id)
      .select('brand_name')
      .executeTakeFirstOrThrow();
    expect(b.brand_name).toBe('Tenant B');
  });

  it('permission/module cache keys are tenant-prefixed; warm A then B is clean', async () => {
    expect(permissionCacheKey('ta', 'u1')).toBe('t:ta:perms:u1');
    expect(moduleCacheKey('ta', 'crm')).toBe('t:ta:module:crm');
    expect(brandingCacheKey('ta', 3)).toBe('t:ta:brand:3');

    const { app, fx } = await getLiveCtx();
    __clearPermCacheForTesting();
    __clearModuleCacheForTesting();

    const tokenA = signTenantToken({ userId: fx.multiUser.id, tenantId: fx.tenantA.id });
    const warmA = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(warmA.status).toBe(200);

    const tokenB = signTenantToken({ userId: fx.multiUser.id, tenantId: fx.tenantB.id });
    const brandB = await authedGet(app, '/api/tenant/branding', {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(brandB.status).toBe(200);
    expect(brandB.body.data.tenant_id).toBe(fx.tenantB.id);
    expectNoSecretLeak(brandB.body, ['brand-a-secret', 'Tenant A']);

    const contactB = await authedGet(app, `/api/contacts/${fx.contactB.id}`, {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(contactB.status).toBe(200);
    expect(contactB.body.data.id).toBe(fx.contactB.id);
  });
});
