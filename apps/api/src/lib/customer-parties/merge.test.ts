/**
 * CustomerParty merge + backfill unit tests
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./events', () => ({
  onCustomerPartyMerged: vi.fn().mockResolvedValue(undefined),
  onCustomerPartyLinked: vi.fn().mockResolvedValue(undefined),
  onCustomerPartyCreated: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./ensure', async () => {
  const actual = await vi.importActual<typeof import('./ensure')>('./ensure');
  return {
    ...actual,
    getCustomerParty: vi.fn(),
    ensureCustomerParty: vi.fn(),
  };
});

import { mergeCustomerParties } from './merge';
import { getCustomerParty, ensureCustomerParty } from './ensure';
import { onCustomerPartyMerged } from './events';

const WS = '11111111-1111-1111-1111-111111111111';
const SRC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TGT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('mergeCustomerParties', () => {
  beforeEach(() => {
    vi.mocked(getCustomerParty).mockReset();
    vi.mocked(onCustomerPartyMerged).mockClear();
  });

  it('rejects same party', async () => {
    const result = await mergeCustomerParties({} as never, {
      workspaceId: WS,
      sourcePartyId: SRC,
      targetPartyId: SRC,
      reason: 'dup',
      actorUserId: null,
    });
    expect(result).toEqual({ ok: false, fail: 'same_party' });
  });

  it('rejects merged source', async () => {
    vi.mocked(getCustomerParty)
      .mockResolvedValueOnce({
        id: SRC,
        workspace_id: WS,
        status: 'merged',
        deleted_at: null,
        party_type: 'company',
        party_id: 'c1',
        display_name: 'S',
        primary_owner_id: null,
        merged_into_id: TGT,
        custom_fields: {},
        created_at: new Date(),
        updated_at: new Date(),
      })
      .mockResolvedValueOnce({
        id: TGT,
        workspace_id: WS,
        status: 'active',
        deleted_at: null,
        party_type: 'company',
        party_id: 'c2',
        display_name: 'T',
        primary_owner_id: null,
        merged_into_id: null,
        custom_fields: {},
        created_at: new Date(),
        updated_at: new Date(),
      });
    const result = await mergeCustomerParties({} as never, {
      workspaceId: WS,
      sourcePartyId: SRC,
      targetPartyId: TGT,
      reason: 'dup',
      actorUserId: null,
    });
    expect(result).toEqual({ ok: false, fail: 'source_merged' });
  });

  it('merges in one TX path and emits event', async () => {
    vi.mocked(getCustomerParty)
      .mockResolvedValueOnce({
        id: SRC,
        workspace_id: WS,
        status: 'active',
        deleted_at: null,
        party_type: 'company',
        party_id: 'c1',
        display_name: 'S',
        primary_owner_id: null,
        merged_into_id: null,
        custom_fields: {},
        created_at: new Date(),
        updated_at: new Date(),
      })
      .mockResolvedValueOnce({
        id: TGT,
        workspace_id: WS,
        status: 'active',
        deleted_at: null,
        party_type: 'company',
        party_id: 'c2',
        display_name: 'T',
        primary_owner_id: null,
        merged_into_id: null,
        custom_fields: {},
        created_at: new Date(),
        updated_at: new Date(),
      });

    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };
    const db = {
      updateTable: vi.fn().mockReturnValue(chain),
      insertInto: vi.fn().mockReturnValue(chain),
    };

    const result = await mergeCustomerParties(db as never, {
      workspaceId: WS,
      sourcePartyId: SRC,
      targetPartyId: TGT,
      reason: 'duplicate account',
      actorUserId: 'u1',
    });
    expect(result).toEqual({ ok: true, survivorId: TGT, sourceId: SRC });
    expect(onCustomerPartyMerged).toHaveBeenCalled();
    expect(db.updateTable).toHaveBeenCalledWith('deals');
    expect(db.updateTable).toHaveBeenCalledWith('lead_conversion_links');
    expect(db.updateTable).toHaveBeenCalledWith('customer_parties');
    expect(db.insertInto).toHaveBeenCalledWith('customer_party_merge_events');
  });
});

describe('ensureCustomerParty mock sanity', () => {
  it('ensure is mockable for backfill tests', () => {
    expect(vi.isMockFunction(ensureCustomerParty)).toBe(true);
  });
});
