import { describe, it, expect } from 'vitest';
import {
  classifyHost,
  normalizeHost,
  tenantCacheKey,
  moduleCacheKey,
  permissionCacheKey,
  brandingCacheKey,
  isTenantIsolatedCacheKey,
  tenantObjectKey,
  assertObjectKeyBelongsToTenant,
  canMutateTenant,
  canRunBusinessJobs,
  assertTenantAllowsRequest,
  TenantContextError,
  bodyTenantOverrideAttempt,
} from '../src/index';

describe('host resolution', () => {
  const cfg = {
    platformBaseDomain: 'thinkaiq.com',
    platformHosts: ['localhost', 'app.thinkaiq.com', 'admin.thinkaiq.com'],
    trustProxy: false,
  };

  it('normalizes host', () => {
    expect(normalizeHost('Acme.ThinkAIQ.com:443')).toBe('acme.thinkaiq.com');
  });

  it('classifies platform hosts', () => {
    expect(classifyHost('localhost', cfg).kind).toBe('platform');
    expect(classifyHost('app.thinkaiq.com', cfg).kind).toBe('platform');
  });

  it('classifies tenant subdomain', () => {
    const r = classifyHost('acme.thinkaiq.com', cfg);
    expect(r.kind).toBe('tenant_subdomain');
    if (r.kind === 'tenant_subdomain') expect(r.slug).toBe('acme');
  });

  it('classifies custom domain', () => {
    expect(classifyHost('crm.client.com', cfg).kind).toBe('custom_domain');
  });

  it('classifies Railway preview hosts as platform', () => {
    expect(classifyHost('crm-web-production-8ad6.up.railway.app', cfg).kind).toBe('platform');
    expect(classifyHost('crm-pipeline-production-8dea.up.railway.app', cfg).kind).toBe('platform');
  });
});

describe('cache isolation', () => {
  it('prefixes tenant identity', () => {
    expect(tenantCacheKey('t1', 'x')).toBe('t:t1:x');
    expect(moduleCacheKey('t1', 'crm')).toBe('t:t1:module:crm');
    expect(permissionCacheKey('t1', 'u1')).toBe('t:t1:perms:u1');
    expect(brandingCacheKey('t1', 2)).toBe('t:t1:brand:2');
    expect(isTenantIsolatedCacheKey(moduleCacheKey('a', 'm'))).toBe(true);
    expect(isTenantIsolatedCacheKey('global:branding')).toBe(false);
  });

  it('prevents cross-tenant key collision', () => {
    expect(moduleCacheKey('tenantA', 'crm')).not.toBe(moduleCacheKey('tenantB', 'crm'));
  });
});

describe('storage isolation', () => {
  it('builds tenant object keys', () => {
    expect(tenantObjectKey('aaa', 'messaging', 'f.png')).toBe('tenants/aaa/messaging/f.png');
  });

  it('denies cross-tenant keys', () => {
    expect(assertObjectKeyBelongsToTenant('tenants/a/x', 'a')).toBe(true);
    expect(assertObjectKeyBelongsToTenant('tenants/b/x', 'a')).toBe(false);
    expect(assertObjectKeyBelongsToTenant('messaging/a/x', 'a', 'a')).toBe(true);
  });
});

describe('lifecycle', () => {
  it('blocks mutations when suspended', () => {
    expect(canMutateTenant('suspended')).toBe(false);
    expect(() => assertTenantAllowsRequest('suspended', 'POST')).toThrow(TenantContextError);
  });

  it('blocks jobs when suspended or paused', () => {
    expect(canRunBusinessJobs('active', false)).toBe(true);
    expect(canRunBusinessJobs('suspended', false)).toBe(false);
    expect(canRunBusinessJobs('active', true)).toBe(false);
  });

  it('blocks provisioning business access', () => {
    expect(() => assertTenantAllowsRequest('provisioning', 'GET')).toThrow(TenantContextError);
  });
});

describe('body tenant override', () => {
  it('detects tenantId in body', () => {
    expect(bodyTenantOverrideAttempt({ tenantId: 'x' })).toBe(true);
    expect(bodyTenantOverrideAttempt({ name: 'ok' })).toBe(false);
  });
});
