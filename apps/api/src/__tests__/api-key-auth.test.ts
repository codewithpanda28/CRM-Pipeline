import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';

function chainResolving(value: unknown) {
  return {
    where: vi.fn().mockReturnThis(),
    selectAll: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(value),
  };
}

describe('createRequireApiKey', () => {
  let mockRes: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  let next: NextFunction;
  let mockDb: { selectFrom: ReturnType<typeof vi.fn>; updateTable?: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    mockRes = { status, json };
    next = vi.fn() as unknown as NextFunction;
    mockDb = { selectFrom: vi.fn() };
  });

  it('returns 401 if Authorization header missing', async () => {
    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: {}, method: 'GET' } as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if header is not Bearer', async () => {
    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: 'Basic abc' }, method: 'GET' } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if key not found in DB', async () => {
    mockDb.selectFrom.mockReturnValue(chainResolving(undefined));

    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: 'Bearer vnt_rw_unknownkey' }, method: 'GET' } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches workspace and apiKey, calls next on valid key', async () => {
    const rawKey = 'vnt_rw_abc123';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const fakeKey = { id: 'key-1', workspace_id: 'ws-1', scope: 'read_write', key_hash: keyHash };

    mockDb.selectFrom.mockImplementation((table: string) => {
      if (table === 'api_keys') return chainResolving(fakeKey);
      if (table === 'tenants') return chainResolving({ status: 'active' });
      return chainResolving(undefined);
    });
    mockDb.updateTable = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    });

    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: `Bearer ${rawKey}` }, method: 'GET' } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(next).toHaveBeenCalled();
    expect((req as never as { workspace: { id: string } }).workspace).toEqual({ id: 'ws-1' });
  });

  it('blocks mutations when tenant is suspended', async () => {
    const rawKey = 'vnt_rw_abc123';
    const fakeKey = { id: 'key-1', workspace_id: 'ws-1', scope: 'read_write', key_hash: 'x' };
    mockDb.selectFrom.mockImplementation((table: string) => {
      if (table === 'api_keys') return chainResolving(fakeKey);
      if (table === 'tenants') return chainResolving({ status: 'suspended' });
      return chainResolving(undefined);
    });

    const { createRequireApiKey } = await import('../middleware/api-key-auth');
    const mw = createRequireApiKey(mockDb as never);
    const req = { headers: { authorization: `Bearer ${rawKey}` }, method: 'POST' } as unknown as Request;
    await mw(req, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireScope', () => {
  it('returns 403 if key scope is read and route needs read_write', async () => {
    const { requireScope } = await import('../middleware/api-key-auth');
    const json = vi.fn();
    const mockRes = { status: vi.fn().mockReturnValue({ json }) };
    const next = vi.fn();
    const req = { apiKey: { scope: 'read' } };
    requireScope('read_write')(req as never, mockRes as never, next);
    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next if scope is read_write and route needs read_write', async () => {
    const { requireScope } = await import('../middleware/api-key-auth');
    const next = vi.fn();
    const req = { apiKey: { scope: 'read_write' } };
    requireScope('read_write')(req as never, {} as never, next);
    expect(next).toHaveBeenCalled();
  });
});
