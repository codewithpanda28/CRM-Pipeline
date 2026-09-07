/**
 * Legacy auth middleware tests — superseded by isolation.test.ts for Phase 2A.
 * Kept minimal regression for 401 paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, NextFunction } from 'express';

const JWT_SECRET = 'test-secret';

describe('createRequireAuth (legacy smoke)', () => {
  let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: NextFunction;

  beforeEach(() => {
    vi.resetModules();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    mockRes = { status, json };
    next = vi.fn() as unknown as NextFunction;
    vi.doMock('../middleware/permission', () => ({
      getEnabledModuleIds: vi.fn().mockResolvedValue([]),
      resolveUserPermissions: vi.fn().mockResolvedValue({ superuser: false, permissions: new Set() }),
    }));
  });

  it('returns 401 if no cookie', async () => {
    const { createRequireAuth } = await import('../middleware/auth');
    const mw = createRequireAuth({ selectFrom: vi.fn() } as never, JWT_SECRET);
    const req = { cookies: {}, headers: {}, body: {}, method: 'GET', path: '/' } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
  });
});
