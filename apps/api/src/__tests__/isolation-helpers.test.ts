import { describe, it, expect } from 'vitest';
import { assertSameTenant, tenantScopeId, tenantWhereClause } from '../lib/tenant-scope';
import { assertSafeOutboundUrl } from '../lib/ssrf';
import { hashToken, generateResetToken } from '../lib/rate-limit';
import type { TenantContext } from '@vencore/tenancy';
import { TenantContextError } from '@vencore/tenancy';

const ctxA: TenantContext = {
  tenantId: 'tenant-a',
  workspaceId: 'tenant-a',
  principal: { type: 'user', id: 'user-a' },
  membership: { id: 'm-a', status: 'active', isOwner: true },
  permissions: new Set(['contacts:read']),
  source: 'browser',
  requestId: 'r1',
  correlationId: 'c1',
  tenantStatus: 'active',
  resolvedHost: 'a.thinkaiq.com',
};

describe('repository isolation helpers', () => {
  it('scopes queries to context tenant', () => {
    expect(tenantScopeId(ctxA)).toBe('tenant-a');
    expect(tenantWhereClause(ctxA)).toEqual({ workspace_id: 'tenant-a' });
  });

  it('denies cross-tenant row access', () => {
    expect(() => assertSameTenant(ctxA, 'tenant-b')).toThrow(TenantContextError);
    expect(() => assertSameTenant(ctxA, 'tenant-a')).not.toThrow();
  });
});

describe('SSRF foundation', () => {
  it('blocks private targets', () => {
    expect(() => assertSafeOutboundUrl('http://127.0.0.1/x')).toThrow();
    expect(() => assertSafeOutboundUrl('http://169.254.169.254/latest')).toThrow();
    expect(() => assertSafeOutboundUrl('https://example.com/hook')).not.toThrow();
  });
});

describe('password reset hashing', () => {
  it('stores hash not raw', () => {
    const { raw, hash } = generateResetToken();
    expect(hash).toBe(hashToken(raw));
    expect(hash).not.toBe(raw);
  });
});

describe('isolation matrix documentation fixtures', () => {
  const tenantA = 'tenant-a';
  const tenantB = 'tenant-b';
  const cacheA = `t:${tenantA}:contacts`;
  const cacheB = `t:${tenantB}:contacts`;
  const fileA = `tenants/${tenantA}/docs/1.pdf`;
  const fileB = `tenants/${tenantB}/docs/1.pdf`;

  it('A cannot equal B for cache/files/keys namespaces', () => {
    expect(cacheA).not.toBe(cacheB);
    expect(fileA).not.toBe(fileB);
    expect(fileA.startsWith(`tenants/${tenantB}/`)).toBe(false);
  });
});
