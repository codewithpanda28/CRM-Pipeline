import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { parseMoneyAmount, normalizeCurrency } from '../lib/deals/money';
import { mapFieldValuesToDeal, dealToFieldValues } from '../lib/deals/field-map';

vi.mock('../lib/domain-outbox', () => ({
  onPipelineItemCreated: vi.fn().mockResolvedValue(undefined),
  onPipelineStageChanged: vi.fn().mockResolvedValue(undefined),
  withUnitOfWork: async (db: unknown, fn: (trx: unknown) => Promise<unknown>) => fn(db),
}));

vi.mock('../lib/deals/events', () => ({
  onDealCreated: vi.fn().mockResolvedValue(undefined),
  onDealStageChanged: vi.fn().mockResolvedValue(undefined),
  onDealUpdated: vi.fn().mockResolvedValue(undefined),
  queueDealLostWebhook: vi.fn().mockResolvedValue(undefined),
  appendDealDomainEvent: vi.fn().mockResolvedValue({ id: 'e1', deduped: false }),
}));

vi.mock('../lib/pipeline-activity', () => ({
  logItemCreated: vi.fn().mockResolvedValue(undefined),
  logStageChanged: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/crm-events', () => ({
  emitCrmEvent: vi.fn(),
}));

vi.mock('../lib/deal-close-hooks', () => ({
  maybeSpawnProjectOnDealWon: vi.fn().mockResolvedValue(undefined),
}));

describe('deal money helpers', () => {
  it('normalizes currency and amount without float drift', () => {
    expect(normalizeCurrency('inr')).toBe('INR');
    expect(normalizeCurrency('xxxx')).toBe('INR');
    expect(normalizeCurrency('')).toBe('INR');
    expect(parseMoneyAmount('1234.5')).toBe('1234.50');
    expect(parseMoneyAmount(99.999)).toBe('100.00');
    expect(parseMoneyAmount('₹1,250.00')).toBe('1250.00');
  });
});

describe('field_values mapping', () => {
  it('maps known keys and keeps customs', () => {
    const mapped = mapFieldValuesToDeal({
      name: 'Acme',
      value: '5000',
      owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      custom_note: 'keep',
    });
    expect(mapped.name).toBe('Acme');
    expect(mapped.amount).toBe('5000.00');
    expect(mapped.custom_fields).toEqual({ custom_note: 'keep' });
    const fv = dealToFieldValues({
      name: mapped.name,
      owner_id: mapped.owner_id!,
      amount: mapped.amount,
      currency: mapped.currency,
      probability: 10,
      expected_close_at: null,
      source: null,
      primary_contact_id: null,
      company_id: null,
      custom_fields: mapped.custom_fields,
    });
    expect(fv['name']).toBe('Acme');
    expect(fv['value']).toBe('5000.00');
    expect(fv['custom_note']).toBe('keep');
  });
});

describe('GET/POST /api/deals', () => {
  const WORKSPACE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const PIPELINE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const STAGE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const DEAL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  function mockPermission() {
    return () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();
  }

  it('lists deals for workspace only', async () => {
    const deal = {
      id: DEAL_ID,
      workspace_id: WORKSPACE_ID,
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_ID,
      name: 'Deal',
      owner_id: USER_ID,
      amount: '100.00',
      currency: 'INR',
      deleted_at: null,
    };
    const chain = {
      selectAll: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([deal]),
    };
    const db = {
      selectFrom: vi.fn().mockReturnValue(chain),
    } as unknown as Kysely<Database>;

    const { createDealsRouter } = await import('./deals');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: USER_ID };
      (req as any).workspace = { id: WORKSPACE_ID };
      next();
    });
    app.use('/api/deals', createDealsRouter(db, mockPermission()));

    const res = await request(app).get('/api/deals');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(DEAL_ID);
  });

  it('rejects create with foreign pipeline', async () => {
    const ownershipMiss = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      executeTakeFirst: vi.fn().mockResolvedValue(undefined),
    };
    const db = {
      selectFrom: vi.fn().mockReturnValue(ownershipMiss),
    } as unknown as Kysely<Database>;

    const { createDealsRouter } = await import('./deals');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: USER_ID };
      (req as any).workspace = { id: WORKSPACE_ID };
      next();
    });
    app.use('/api/deals', createDealsRouter(db, mockPermission()));

    const res = await request(app).post('/api/deals').send({
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_ID,
      name: 'X',
      owner_id: USER_ID,
      customer_party_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toMatch(/INVALID_PIPELINE|NOT_FOUND/);
  });

  it('rejects create without customer identity', async () => {
    const db = {
      selectFrom: vi.fn(),
    } as unknown as Kysely<Database>;

    const { createDealsRouter } = await import('./deals');
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = { id: USER_ID };
      (req as any).workspace = { id: WORKSPACE_ID };
      next();
    });
    app.use('/api/deals', createDealsRouter(db, mockPermission()));

    const res = await request(app).post('/api/deals').send({
      pipeline_id: PIPELINE_ID,
      stage_id: STAGE_ID,
      name: 'X',
      owner_id: USER_ID,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CUSTOMER_REQUIRED');
  });
});

describe('backfill report shape', () => {
  it('exports backfillDealsFromPipelineItems', async () => {
    const { backfillDealsFromPipelineItems } = await import('../lib/deals/backfill');
    expect(typeof backfillDealsFromPipelineItems).toBe('function');
  });
});
