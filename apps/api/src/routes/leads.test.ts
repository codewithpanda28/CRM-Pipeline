import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../lib/domain-outbox', () => ({
  withUnitOfWork: async (_db: unknown, fn: (trx: unknown) => Promise<unknown>) => fn(_db),
}));

vi.mock('../lib/leads', async () => {
  const actual = await vi.importActual<typeof import('../lib/leads')>('../lib/leads');
  return {
    ...actual,
    onLeadCreated: vi.fn().mockResolvedValue(undefined),
    onLeadUpdated: vi.fn().mockResolvedValue(undefined),
    onLeadStatusChanged: vi.fn().mockResolvedValue(undefined),
  };
});

function mockPermission() {
  return () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
}

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of [
    'selectFrom',
    'selectAll',
    'select',
    'where',
    'orderBy',
    'limit',
    'offset',
    'insertInto',
    'values',
    'returningAll',
    'updateTable',
    'set',
    'forUpdate',
  ]) {
    c[m] = vi.fn(self);
  }
  c.execute = vi.fn().mockResolvedValue(Array.isArray(result) ? result : []);
  c.executeTakeFirst = vi.fn().mockResolvedValue(result);
  c.executeTakeFirstOrThrow = vi.fn().mockResolvedValue(result);
  return c;
}

describe('leads routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/leads creates a lead', async () => {
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const lead = {
      id: '22222222-2222-2222-2222-222222222222',
      workspace_id: 'ws-1',
      name: 'Ada',
      email: 'ada@example.com',
      status: 'new',
      owner_id: ownerId,
    };

    const db = {
      selectFrom: vi.fn((table: string) => {
        if (table === 'users') return chain({ id: ownerId });
        if (table === 'contacts' || table === 'companies' || table === 'leads') {
          return chain(undefined);
        }
        return chain(undefined);
      }),
      insertInto: vi.fn(() => chain(lead)),
    };

    const { createLeadsRouter } = await import('./leads');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as { workspace?: { id: string }; user?: { id: string } }).workspace = { id: 'ws-1' };
      (req as { user?: { id: string } }).user = { id: ownerId };
      next();
    });
    app.use('/api/leads', createLeadsRouter(db as never, mockPermission()));

    const res = await request(app)
      .post('/api/leads')
      .send({ name: 'Ada', email: 'ada@example.com', owner_id: ownerId });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Ada');
  });

  it('PATCH rejects edits on converted leads', async () => {
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const current = {
      id: '22222222-2222-2222-2222-222222222222',
      workspace_id: 'ws-1',
      name: 'Ada',
      email: 'ada@example.com',
      status: 'converted',
      owner_id: ownerId,
      phone: null,
      alternate_phone: null,
      company_name: null,
      website: null,
      first_name: null,
      last_name: null,
    };
    const db = {
      selectFrom: vi.fn(() => chain(current)),
    };
    const { createLeadsRouter } = await import('./leads');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as { workspace?: { id: string }; user?: { id: string } }).workspace = { id: 'ws-1' };
      (req as { user?: { id: string } }).user = { id: ownerId };
      next();
    });
    app.use('/api/leads', createLeadsRouter(db as never, mockPermission()));

    const res = await request(app)
      .patch(`/api/leads/${current.id}`)
      .send({ name: 'Nope' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_CONVERTED');
  });
});
