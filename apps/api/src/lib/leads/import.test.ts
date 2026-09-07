import { describe, it, expect, vi, beforeEach } from 'vitest';
import { previewLeadImport, commitLeadImport } from './import';

vi.mock('./events', () => ({
  onLeadCreated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./duplicates', () => ({
  findLeadDuplicates: vi.fn(),
}));

vi.mock('./integrity', () => ({
  assertLeadOwner: vi.fn().mockResolvedValue('ok'),
}));

import { findLeadDuplicates } from './duplicates';

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of [
    'selectFrom',
    'select',
    'where',
    'insertInto',
    'values',
    'execute',
    'executeTakeFirst',
    'transaction',
  ]) {
    c[m] = vi.fn(self);
  }
  c.execute = vi.fn().mockResolvedValue(Array.isArray(result) ? result : []);
  c.executeTakeFirst = vi.fn().mockResolvedValue(result);
  c.executeTakeFirstOrThrow = vi.fn().mockResolvedValue(result);
  return c;
}

describe('lead import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preview validates and does not write', async () => {
    vi.mocked(findLeadDuplicates).mockResolvedValue([]);
    const db = {
      selectFrom: vi.fn(() => chain({ id: 'u1' })),
      insertInto: vi.fn(() => chain({})),
      transaction: vi.fn(),
    };

    const preview = await previewLeadImport(db as never, {
      workspaceId: 'ws',
      actorUserId: '11111111-1111-1111-1111-111111111111',
      rows: [
        { name: 'Ada', email: 'ada@example.com' },
        { email: 'bad' },
      ],
    });

    expect(preview.total).toBe(2);
    expect(preview.valid).toBe(1);
    expect(preview.invalid).toBe(1);
    expect(db.insertInto).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('marks open-lead email duplicates as duplicate_warn', async () => {
    vi.mocked(findLeadDuplicates).mockResolvedValue([
      { entity: 'lead', id: 'lead-1', reason: 'email', label: 'Ada' },
    ]);
    const db = { selectFrom: vi.fn(() => chain({ id: 'u1' })) };

    const preview = await previewLeadImport(db as never, {
      workspaceId: 'ws',
      actorUserId: '11111111-1111-1111-1111-111111111111',
      rows: [{ name: 'Ada', email: 'ada@example.com' }],
    });

    expect(preview.rows[0]?.status).toBe('duplicate_warn');
    expect(preview.rows[0]?.email_open_lead_duplicate).toBe(true);
  });

  it('commit skips open-lead email duplicates by default', async () => {
    vi.mocked(findLeadDuplicates).mockResolvedValue([
      { entity: 'lead', id: 'lead-1', reason: 'email', label: 'Ada' },
    ]);

    const trx = {
      selectFrom: vi.fn(() => chain({ id: 'existing' })),
      insertInto: vi.fn(() => chain({})),
    };
    const db = {
      selectFrom: vi.fn(() => chain({ id: 'u1' })),
      transaction: vi.fn((fn?: (t: unknown) => Promise<unknown>) => ({
        execute: async (inner: (t: unknown) => Promise<unknown>) => inner(trx),
      })),
    };
    // Fix transaction API used by kysely: db.transaction().execute(async trx => ...)
    db.transaction = vi.fn(() => ({
      execute: async (inner: (t: unknown) => Promise<unknown>) => inner(trx),
    }));

    const summary = await commitLeadImport(db as never, {
      workspaceId: 'ws',
      actorUserId: '11111111-1111-1111-1111-111111111111',
      rows: [{ name: 'Ada', email: 'ada@example.com' }],
    });

    expect(summary.created).toBe(0);
    expect(summary.duplicate).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(trx.insertInto).not.toHaveBeenCalled();
  });
});
