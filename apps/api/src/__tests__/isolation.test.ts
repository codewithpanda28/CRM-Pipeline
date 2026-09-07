import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-secret';

function mockDbSequence(results: unknown[]) {
  let i = 0;
  const selectFrom = vi.fn().mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.where = vi.fn(self);
    chain.selectAll = vi.fn(self);
    chain.select = vi.fn(self);
    chain.executeTakeFirst = vi.fn(async () => results[i++]);
    chain.execute = vi.fn(async () => {
      const v = results[i++];
      return Array.isArray(v) ? v : [];
    });
    return chain;
  });
  return { selectFrom };
}

describe('createRequireAuth tenancy', () => {
  let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: NextFunction;

  beforeEach(() => {
    vi.resetModules();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    mockRes = { status, json };
    next = vi.fn() as unknown as NextFunction;

    vi.doMock('../middleware/permission', () => ({
      getEnabledModuleIds: vi.fn().mockResolvedValue(['crm']),
      resolveUserPermissions: vi.fn().mockResolvedValue({
        superuser: true,
        permissions: new Set(['contacts:read']),
      }),
    }));
  });

  it('returns 401 if no cookie', async () => {
    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDbSequence([]) as never, JWT_SECRET);
    const req = { cookies: {}, headers: {}, body: {}, method: 'GET', path: '/api/contacts' } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });

  it('rejects body tenantId override', async () => {
    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(mockDbSequence([]) as never, JWT_SECRET);
    const token = jwt.sign({ sub: 'u1', active_tenant_id: 't1', workspaceId: 't1' }, JWT_SECRET);
    const req = {
      cookies: { vencore_token: token },
      headers: { host: 'localhost' },
      body: { tenantId: 'evil' },
      method: 'GET',
      path: '/api/contacts',
    } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json.mock.calls[0][0].error.code).toBe('BODY_TENANT_REJECTED');
  });

  it('rejects Host/JWT tenant mismatch', async () => {
    const token = jwt.sign(
      { sub: 'u1', active_tenant_id: 'tenant-a', workspaceId: 'tenant-a' },
      JWT_SECRET,
    );
    // host resolves via tenant_domains to tenant-b
    const db = mockDbSequence([
      { id: 'u1', workspace_id: 'tenant-a', is_active: true, session_version: 1, created_at: new Date() },
      { tenant_id: 'tenant-b' }, // domain lookup
    ]);
    process.env['PLATFORM_BASE_DOMAIN'] = 'thinkaiq.com';
    process.env['PLATFORM_HOSTS'] = 'localhost,app.thinkaiq.com';
    process.env['TRUST_PROXY'] = 'false';

    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(db as never, JWT_SECRET);
    const req = {
      cookies: { vencore_token: token },
      headers: { host: 'crm.other.com' },
      body: {},
      method: 'GET',
      path: '/api/contacts',
    } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json.mock.calls[0][0].error.code).toBe('HOST_JWT_MISMATCH');
  });

  it('allows legacy active membership dual-read on localhost', async () => {
    const token = jwt.sign(
      { sub: 'u1', active_tenant_id: 'ws-1', workspaceId: 'ws-1', sv: 1 },
      JWT_SECRET,
    );
    const fakeUser = {
      id: 'u1',
      workspace_id: 'ws-1',
      is_active: true,
      session_version: 1,
      created_at: new Date(),
    };
    const fakeWorkspace = { id: 'ws-1', name: 'Test' };
    // user, membership undefined, tenant undefined, workspace
    const db = mockDbSequence([fakeUser, undefined, undefined, fakeWorkspace]);

    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(db as never, JWT_SECRET);
    const req = {
      cookies: { vencore_token: token },
      headers: { host: 'localhost' },
      body: {},
      method: 'GET',
      path: '/api/contacts',
    } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as { tenantContext?: { tenantId: string } }).tenantContext?.tenantId).toBe('ws-1');
  });

  it('blocks suspended tenant mutations', async () => {
    const token = jwt.sign(
      { sub: 'u1', active_tenant_id: 'ws-1', workspaceId: 'ws-1', sv: 1 },
      JWT_SECRET,
    );
    const fakeUser = {
      id: 'u1',
      workspace_id: 'ws-1',
      is_active: true,
      session_version: 1,
      created_at: new Date(),
    };
    const membership = {
      id: 'm1',
      tenant_id: 'ws-1',
      user_id: 'u1',
      status: 'active',
      is_owner: true,
    };
    const tenant = { id: 'ws-1', status: 'suspended' };
    const db = mockDbSequence([fakeUser, membership, tenant, { id: 'ws-1' }]);

    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth(db as never, JWT_SECRET);
    const req = {
      cookies: { vencore_token: token },
      headers: { host: 'localhost' },
      body: {},
      method: 'POST',
      path: '/api/contacts',
    } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json.mock.calls[0][0].error.code).toBe('MUTATION_BLOCKED');
  });
});

describe('switchTenantMembership', () => {
  it('denies unauthorized tenant switch', async () => {
    const db = {
      selectFrom: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnThis(),
        selectAll: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(undefined),
      }),
      insertInto: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    };
    const { switchTenantMembership } = await import('../middleware/auth');
    const result = await switchTenantMembership(db as never, 'userA', 'tenantB');
    expect(result.ok).toBe(false);
  });
});

describe('requireAdmin', () => {
  it('returns 403 if isAdmin is false', async () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const { requireAdmin } = await import('../middleware/auth');
    requireAdmin(
      { user: { id: '1' }, isAdmin: false } as never,
      { status, json } as never,
      vi.fn() as never,
    );
    expect(status).toHaveBeenCalledWith(403);
  });
});

describe('platform vs tenant principal', () => {
  it('rejects non-platform realm tokens', async () => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const next = vi.fn();
    const token = jwt.sign({ sub: 'u1', realm: 'tenant' }, JWT_SECRET);
    const { createRequirePlatformAdmin } = await import('../middleware/auth');
    const mw = createRequirePlatformAdmin({ selectFrom: vi.fn() } as never, JWT_SECRET);
    await mw(
      { cookies: { thinkaiq_platform_token: token }, headers: {} } as never,
      { status, json } as never,
      next,
    );
    expect(status).toHaveBeenCalledWith(403);
  });
});
