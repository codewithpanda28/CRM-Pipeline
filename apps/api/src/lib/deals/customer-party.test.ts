/**
 * Deal ↔ CustomerParty Step 2A unit tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ensureCustomerParty = vi.fn();
const onCustomerPartyLinked = vi.fn();
const validatePartyIdentity = vi.fn();

vi.mock('../customer-parties/ensure', () => ({
  ensureCustomerParty: (...args: unknown[]) => ensureCustomerParty(...args),
  validatePartyIdentity: (...args: unknown[]) => validatePartyIdentity(...args),
}));

vi.mock('../customer-parties/events', () => ({
  onCustomerPartyLinked: (...args: unknown[]) => onCustomerPartyLinked(...args),
}));

import {
  attachCustomerPartyToDeal,
  ensureCustomerPartyOnDealWon,
  resolveCustomerPartyForDeal,
} from './customer-party';
import { assertCustomerPartyForDeal } from './integrity';

const WS = '11111111-1111-1111-1111-111111111111';
const DEAL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const COMPANY = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARTY = 'pppppppp-pppp-pppp-pppp-pppppppppppp';

function partyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PARTY,
    workspace_id: WS,
    party_type: 'company',
    party_id: COMPANY,
    display_name: 'Acme',
    status: 'active',
    primary_owner_id: null,
    merged_into_id: null,
    custom_fields: {},
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('resolveCustomerPartyForDeal (P3)', () => {
  beforeEach(() => {
    ensureCustomerParty.mockReset();
    onCustomerPartyLinked.mockReset();
  });

  it('prefers company over contact', async () => {
    ensureCustomerParty.mockResolvedValue({
      ok: true,
      party: partyRow(),
      created: true,
      reused: false,
    });
    const result = await resolveCustomerPartyForDeal({} as never, {
      workspaceId: WS,
      companyId: COMPANY,
      primaryContactId: CONTACT,
    });
    expect(result.ok).toBe(true);
    expect(ensureCustomerParty).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ partyType: 'company', partyId: COMPANY }),
    );
    expect(ensureCustomerParty).toHaveBeenCalledTimes(1);
  });

  it('uses contact when no company', async () => {
    ensureCustomerParty.mockResolvedValue({
      ok: true,
      party: partyRow({ party_type: 'contact', party_id: CONTACT }),
      created: false,
      reused: true,
    });
    const result = await resolveCustomerPartyForDeal({} as never, {
      workspaceId: WS,
      primaryContactId: CONTACT,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.party?.party_type).toBe('contact');
    expect(result.reused).toBe(true);
  });

  it('returns null party when neither identity present', async () => {
    const result = await resolveCustomerPartyForDeal({} as never, { workspaceId: WS });
    expect(result).toEqual({ ok: true, party: null, created: false, reused: false });
    expect(ensureCustomerParty).not.toHaveBeenCalled();
  });
});

describe('attachCustomerPartyToDeal', () => {
  beforeEach(() => {
    ensureCustomerParty.mockReset();
    onCustomerPartyLinked.mockReset().mockResolvedValue(undefined);
  });

  it('skips when existingPartyId already set (won no-op)', async () => {
    const result = await attachCustomerPartyToDeal({} as never, {
      workspaceId: WS,
      dealId: DEAL,
      companyId: COMPANY,
      existingPartyId: PARTY,
    });
    expect(result).toEqual({
      ok: true,
      customerPartyId: PARTY,
      created: false,
      reused: true,
      linked: false,
    });
    expect(ensureCustomerParty).not.toHaveBeenCalled();
    expect(onCustomerPartyLinked).not.toHaveBeenCalled();
  });

  it('ensures company party and emits linked', async () => {
    ensureCustomerParty.mockResolvedValue({
      ok: true,
      party: partyRow(),
      created: true,
      reused: false,
    });
    const result = await attachCustomerPartyToDeal({} as never, {
      workspaceId: WS,
      dealId: DEAL,
      companyId: COMPANY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.customerPartyId).toBe(PARTY);
    expect(result.created).toBe(true);
    expect(result.linked).toBe(true);
    expect(onCustomerPartyLinked).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ partyId: PARTY, linkType: 'deal', linkId: DEAL }),
    );
  });

  it('does not create duplicate — reused party still links once', async () => {
    ensureCustomerParty.mockResolvedValue({
      ok: true,
      party: partyRow(),
      created: false,
      reused: true,
    });
    const result = await attachCustomerPartyToDeal({} as never, {
      workspaceId: WS,
      dealId: DEAL,
      companyId: COMPANY,
    });
    expect(result.ok && result.reused).toBe(true);
    expect(onCustomerPartyLinked).toHaveBeenCalledTimes(1);
  });
});

describe('ensureCustomerPartyOnDealWon', () => {
  beforeEach(() => {
    ensureCustomerParty.mockReset();
    onCustomerPartyLinked.mockReset().mockResolvedValue(undefined);
  });

  it('no-op when party already present', async () => {
    const deal = {
      id: DEAL,
      workspace_id: WS,
      status: 'won',
      customer_party_id: PARTY,
      company_id: COMPANY,
      primary_contact_id: null,
    };
    const result = await ensureCustomerPartyOnDealWon({} as never, deal);
    expect(result.attached).toBe(false);
    expect(ensureCustomerParty).not.toHaveBeenCalled();
  });

  it('creates/reuses party when won and party null', async () => {
    ensureCustomerParty.mockResolvedValue({
      ok: true,
      party: partyRow(),
      created: true,
      reused: false,
    });
    const updatedDeal = {
      id: DEAL,
      workspace_id: WS,
      status: 'won',
      customer_party_id: PARTY,
      company_id: COMPANY,
      primary_contact_id: null,
    };
    const db = {
      updateTable: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returningAll: vi.fn().mockReturnValue({
                executeTakeFirstOrThrow: vi.fn().mockResolvedValue(updatedDeal),
              }),
            }),
          }),
        }),
      }),
    };
    const result = await ensureCustomerPartyOnDealWon(db as never, {
      id: DEAL,
      workspace_id: WS,
      status: 'won',
      customer_party_id: null,
      company_id: COMPANY,
      primary_contact_id: null,
    });
    expect(result.attached).toBe(true);
    expect(result.deal.customer_party_id).toBe(PARTY);
  });

  it('leaves null when won without company/contact', async () => {
    const deal = {
      id: DEAL,
      workspace_id: WS,
      status: 'won',
      customer_party_id: null,
      company_id: null,
      primary_contact_id: null,
    };
    const result = await ensureCustomerPartyOnDealWon({} as never, deal);
    expect(result.attached).toBe(false);
    expect(result.deal.customer_party_id).toBeNull();
  });
});

describe('assertCustomerPartyForDeal', () => {
  beforeEach(() => {
    validatePartyIdentity.mockReset();
  });

  function partySelectDb(row: Record<string, unknown> | undefined) {
    return {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue(row),
      }),
    };
  }

  it('rejects missing / wrong-tenant party', async () => {
    const db = partySelectDb(undefined);
    expect(await assertCustomerPartyForDeal(db as never, { workspaceId: WS, customerPartyId: PARTY })).toBe(
      'customer_party',
    );
  });

  it('rejects soft-deleted party', async () => {
    const db = partySelectDb({
      id: PARTY,
      workspace_id: WS,
      party_type: 'company',
      party_id: COMPANY,
      status: 'active',
      deleted_at: new Date(),
    });
    expect(await assertCustomerPartyForDeal(db as never, { workspaceId: WS, customerPartyId: PARTY })).toBe(
      'customer_party',
    );
  });

  it('rejects merged party', async () => {
    const db = partySelectDb({
      id: PARTY,
      workspace_id: WS,
      party_type: 'company',
      party_id: COMPANY,
      status: 'merged',
      deleted_at: null,
    });
    expect(await assertCustomerPartyForDeal(db as never, { workspaceId: WS, customerPartyId: PARTY })).toBe(
      'customer_party',
    );
  });

  it('accepts active party with valid identity', async () => {
    validatePartyIdentity.mockResolvedValue({ ok: true, displayName: 'Acme', primaryOwnerId: null });
    const db = partySelectDb({
      id: PARTY,
      workspace_id: WS,
      party_type: 'company',
      party_id: COMPANY,
      status: 'active',
      deleted_at: null,
    });
    expect(await assertCustomerPartyForDeal(db as never, { workspaceId: WS, customerPartyId: PARTY })).toBe(
      'ok',
    );
  });
});
