import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../middleware/permission', () => ({
  userHasPermission: vi.fn(),
}));

vi.mock('../lib/crm/search', async () => {
  const actual = await vi.importActual<typeof import('../lib/crm/search')>('../lib/crm/search');
  return {
    ...actual,
    runCrmSearch: vi.fn().mockResolvedValue({
      results: [
        {
          entity_type: 'lead',
          id: 'l1',
          title: 'Ada',
          subtitle: 'ada@example.com',
          href: '/crm/leads',
          rank: 0,
        },
      ],
      counts: { lead: 1 },
    }),
  };
});

import { userHasPermission } from '../middleware/permission';
import { runCrmSearch } from '../lib/crm/search';

describe('GET /api/crm/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects short queries', async () => {
    const { createCrmSearchRouter } = await import('./crm-search');
    const app = express();
    app.use((req, _res, next) => {
      (req as { workspace?: { id: string }; user?: { id: string } }).workspace = { id: 'ws' };
      (req as { user?: { id: string } }).user = { id: 'u1' };
      next();
    });
    app.use('/api/crm/search', createCrmSearchRouter({} as never));

    const res = await request(app).get('/api/crm/search').query({ q: 'a' });
    expect(res.status).toBe(400);
  });

  it('skips buckets without permission (does not 403 whole search)', async () => {
    vi.mocked(userHasPermission).mockImplementation(async (_db, _user, _ws, perm) => {
      return perm === 'leads:view';
    });

    const { createCrmSearchRouter } = await import('./crm-search');
    const app = express();
    app.use((req, _res, next) => {
      (req as { workspace?: { id: string }; user?: { id: string } }).workspace = { id: 'ws' };
      (req as { user?: { id: string } }).user = { id: 'u1' };
      next();
    });
    app.use('/api/crm/search', createCrmSearchRouter({} as never));

    const res = await request(app).get('/api/crm/search').query({ q: 'ada' });
    expect(res.status).toBe(200);
    expect(runCrmSearch).toHaveBeenCalled();
    const args = vi.mocked(runCrmSearch).mock.calls[0]![1];
    expect(args.permitted.has('lead')).toBe(true);
    expect(args.permitted.has('invoice')).toBe(false);
  });

  it('scope=clients defaults types to client entities and unified href mode', async () => {
    vi.mocked(userHasPermission).mockResolvedValue(true);

    const { createCrmSearchRouter } = await import('./crm-search');
    const app = express();
    app.use((req, _res, next) => {
      (req as { workspace?: { id: string }; user?: { id: string } }).workspace = { id: 'ws' };
      (req as { user?: { id: string } }).user = { id: 'u1' };
      next();
    });
    app.use('/api/crm/search', createCrmSearchRouter({} as never));

    const res = await request(app).get('/api/crm/search').query({ q: 'ada', scope: 'clients' });
    expect(res.status).toBe(200);
    const args = vi.mocked(runCrmSearch).mock.calls[0]![1];
    expect(args.types).toEqual(['lead', 'contact', 'company', 'customer_party', 'deal']);
    expect(args.recordHrefMode).toBe('unified');
    expect(res.body.data.scope).toBe('clients');
  });
});