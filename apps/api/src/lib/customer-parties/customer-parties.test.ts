/**
 * CustomerParty Step 1 unit tests — in-memory Kysely-shaped store.
 * Covers ensure/reuse, soft-delete, merged, and cross-tenant rejection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerPartyStatus, CustomerPartyType } from '@vencore/db';

vi.mock('./events', () => ({
  onCustomerPartyCreated: vi.fn().mockResolvedValue(undefined),
  onCustomerPartyUpdated: vi.fn().mockResolvedValue(undefined),
  onCustomerPartyLinked: vi.fn().mockResolvedValue(undefined),
  onCustomerPartyMerged: vi.fn().mockResolvedValue(undefined),
}));

import {
  ensureCustomerParty,
  findReusablePartyByIdentity,
  getCustomerParty,
  isReusableParty,
  resolvePartyByCompany,
  resolvePartyByContact,
  validatePartyIdentity,
} from './ensure';
import { onCustomerPartyCreated } from './events';

type PartyRow = {
  id: string;
  workspace_id: string;
  party_type: CustomerPartyType;
  party_id: string;
  display_name: string;
  status: CustomerPartyStatus;
  primary_owner_id: string | null;
  merged_into_id: string | null;
  custom_fields: Record<string, unknown>;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type ContactRow = {
  id: string;
  workspace_id: string;
  name: string;
  owner_id: string;
  deleted_at: Date | null;
};

type CompanyRow = {
  id: string;
  workspace_id: string;
  name: string;
  deleted_at: Date | null;
};

const WS_A = '11111111-1111-1111-1111-111111111111';
const WS_B = '22222222-2222-2222-2222-222222222222';
const CONTACT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONTACT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const COMPANY_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const COMPANY_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OWNER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function uuid(): string {
  return crypto.randomUUID();
}

function createStore() {
  const contacts: ContactRow[] = [];
  const companies: CompanyRow[] = [];
  const parties: PartyRow[] = [];

  function matchWhere(row: Record<string, unknown>, clauses: Array<[string, string, unknown]>): boolean {
    return clauses.every(([col, op, val]) => {
      const cur = row[col];
      if (op === '=') return cur === val;
      if (op === '!=') return cur !== val;
      if (op === 'is') return val === null ? cur == null : cur === val;
      return false;
    });
  }

  function selectFrom(table: string) {
    const clauses: Array<[string, string, unknown]> = [];
    const api: Record<string, unknown> = {};
    const self = () => api;
    api.select = () => self();
    api.selectAll = () => self();
    api.where = (col: string, op: string, val: unknown) => {
      clauses.push([col, op, val]);
      return self();
    };
    api.executeTakeFirst = async () => {
      const rows =
        table === 'contacts' ? contacts :
        table === 'companies' ? companies :
        parties;
      return (rows as Record<string, unknown>[]).find((r) => matchWhere(r, clauses)) ?? undefined;
    };
    return api;
  }

  function insertInto(table: string) {
    let values: Record<string, unknown> = {};
    const api: Record<string, unknown> = {};
    const self = () => api;
    api.values = (v: Record<string, unknown>) => {
      values = v;
      return self();
    };
    api.returningAll = () => self();
    api.executeTakeFirstOrThrow = async () => {
      if (table !== 'customer_parties') throw new Error(`unexpected insert ${table}`);
      // Simulate unique active identity constraint
      const conflict = parties.find(
        (p) =>
          p.workspace_id === values.workspace_id &&
          p.party_type === values.party_type &&
          p.party_id === values.party_id &&
          p.deleted_at == null &&
          p.status !== 'merged',
      );
      if (conflict) {
        const err = new Error('unique_violation') as Error & { code: string };
        err.code = '23505';
        throw err;
      }
      const row: PartyRow = {
        id: uuid(),
        workspace_id: values.workspace_id as string,
        party_type: values.party_type as CustomerPartyType,
        party_id: values.party_id as string,
        display_name: values.display_name as string,
        status: (values.status as CustomerPartyStatus) ?? 'active',
        primary_owner_id: (values.primary_owner_id as string | null) ?? null,
        merged_into_id: (values.merged_into_id as string | null) ?? null,
        custom_fields: (values.custom_fields as Record<string, unknown>) ?? {},
        deleted_at: (values.deleted_at as Date | null) ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      parties.push(row);
      return row;
    };
    return api;
  }

  const db = {
    selectFrom,
    insertInto,
    updateTable: () => {
      throw new Error('update not used in Step 1 ensure');
    },
  };

  return { db: db as never, contacts, companies, parties };
}

describe('isReusableParty', () => {
  it('allows active and inactive; rejects merged and soft-deleted', () => {
    expect(isReusableParty({ status: 'active', deleted_at: null })).toBe(true);
    expect(isReusableParty({ status: 'inactive', deleted_at: null })).toBe(true);
    expect(isReusableParty({ status: 'merged', deleted_at: null })).toBe(false);
    expect(isReusableParty({ status: 'active', deleted_at: new Date() })).toBe(false);
  });
});

describe('ensureCustomerParty', () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    vi.mocked(onCustomerPartyCreated).mockClear();
    store.contacts.push({
      id: CONTACT_A,
      workspace_id: WS_A,
      name: 'Ada Contact',
      owner_id: OWNER,
      deleted_at: null,
    });
    store.contacts.push({
      id: CONTACT_B,
      workspace_id: WS_B,
      name: 'Other Tenant Contact',
      owner_id: OWNER,
      deleted_at: null,
    });
    store.companies.push({
      id: COMPANY_A,
      workspace_id: WS_A,
      name: 'Acme Co',
      deleted_at: null,
    });
    store.companies.push({
      id: COMPANY_B,
      workspace_id: WS_B,
      name: 'Other Tenant Co',
      deleted_at: null,
    });
  });

  it('creates a Contact party', async () => {
    const result = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.party.party_type).toBe('contact');
    expect(result.party.party_id).toBe(CONTACT_A);
    expect(result.party.display_name).toBe('Ada Contact');
    expect(result.party.primary_owner_id).toBe(OWNER);
    expect(result.party.status).toBe('active');
    expect(onCustomerPartyCreated).toHaveBeenCalledTimes(1);
  });

  it('creates a Company party', async () => {
    const result = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'company',
      partyId: COMPANY_A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.party.party_type).toBe('company');
    expect(result.party.display_name).toBe('Acme Co');
    expect(result.party.primary_owner_id).toBeNull();
  });

  it('ensure/reuses the same party (idempotent)', async () => {
    const first = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    const second = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.created).toBe(false);
    expect(second.party.id).toBe(first.party.id);
    expect(store.parties.filter((p) => p.status !== 'merged' && p.deleted_at == null)).toHaveLength(1);
    expect(onCustomerPartyCreated).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate active parties for the same identity', async () => {
    await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'company',
      partyId: COMPANY_A,
    });
    await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'company',
      partyId: COMPANY_A,
    });
    const active = store.parties.filter(
      (p) => p.party_id === COMPANY_A && p.deleted_at == null && p.status !== 'merged',
    );
    expect(active).toHaveLength(1);
  });

  it('soft-deleted party is not reused — creates a new active party', async () => {
    const softId = uuid();
    store.parties.push({
      id: softId,
      workspace_id: WS_A,
      party_type: 'contact',
      party_id: CONTACT_A,
      display_name: 'Old',
      status: 'active',
      primary_owner_id: OWNER,
      merged_into_id: null,
      custom_fields: {},
      deleted_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    });
    const result = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.party.id).not.toBe(softId);
    expect(result.party.deleted_at).toBeNull();
  });

  it('merged party is not reused — creates a new active party (no silent merge)', async () => {
    const survivor = uuid();
    const mergedId = uuid();
    store.parties.push({
      id: survivor,
      workspace_id: WS_A,
      party_type: 'company',
      party_id: COMPANY_A,
      display_name: 'Survivor (different identity path)',
      status: 'active',
      primary_owner_id: null,
      merged_into_id: null,
      custom_fields: {},
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    // Force unique: merged row for CONTACT instead — company already has active above.
    // Use contact identity for merged-only case:
    store.parties.length = 0;
    store.parties.push({
      id: mergedId,
      workspace_id: WS_A,
      party_type: 'contact',
      party_id: CONTACT_A,
      display_name: 'Merged Away',
      status: 'merged',
      primary_owner_id: OWNER,
      merged_into_id: uuid(),
      custom_fields: {},
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const result = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.party.id).not.toBe(mergedId);
    expect(result.party.status).toBe('active');
    expect(result.party.merged_into_id).toBeNull();
  });

  it('rejects Contact from another workspace', async () => {
    const result = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_B,
    });
    expect(result).toEqual({ ok: false, fail: 'identity_not_found' });
    expect(store.parties).toHaveLength(0);
  });

  it('rejects Company from another workspace', async () => {
    const result = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'company',
      partyId: COMPANY_B,
    });
    expect(result).toEqual({ ok: false, fail: 'identity_not_found' });
  });

  it('resolve helpers find ensured parties', async () => {
    await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'company',
      partyId: COMPANY_A,
    });
    const byContact = await resolvePartyByContact(store.db, {
      workspaceId: WS_A,
      contactId: CONTACT_A,
    });
    const byCompany = await resolvePartyByCompany(store.db, {
      workspaceId: WS_A,
      companyId: COMPANY_A,
    });
    expect(byContact?.party_id).toBe(CONTACT_A);
    expect(byCompany?.party_id).toBe(COMPANY_A);
  });

  it('getCustomerParty is tenant-scoped', async () => {
    const created = await ensureCustomerParty(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const ok = await getCustomerParty(store.db, { workspaceId: WS_A, id: created.party.id });
    const wrong = await getCustomerParty(store.db, { workspaceId: WS_B, id: created.party.id });
    expect(ok?.id).toBe(created.party.id);
    expect(wrong).toBeNull();
  });

  it('validatePartyIdentity rejects deleted identity', async () => {
    store.contacts[0]!.deleted_at = new Date();
    const result = await validatePartyIdentity(store.db, {
      workspaceId: WS_A,
      partyType: 'contact',
      partyId: CONTACT_A,
    });
    expect(result).toEqual({ ok: false, fail: 'identity_deleted' });
  });

  it('findReusablePartyByIdentity skips merged rows', async () => {
    store.parties.push({
      id: uuid(),
      workspace_id: WS_A,
      party_type: 'company',
      party_id: COMPANY_A,
      display_name: 'Merged',
      status: 'merged',
      primary_owner_id: null,
      merged_into_id: uuid(),
      custom_fields: {},
      deleted_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const found = await findReusablePartyByIdentity(store.db, {
      workspaceId: WS_A,
      partyType: 'company',
      partyId: COMPANY_A,
    });
    expect(found).toBeNull();
  });
});
