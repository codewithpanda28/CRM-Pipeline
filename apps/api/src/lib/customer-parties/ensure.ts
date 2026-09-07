/**
 * CustomerParty identity validation + ensure/reuse (Phase 3A.3 Step 1).
 * Tenant-scoped. Never silent-merges. Does not wire Deal/Lead.
 */
import type {
  CustomerPartyStatus,
  CustomerPartyType,
} from '@vencore/db';
import type { DbOrTx } from '@vencore/events';
import { onCustomerPartyCreated } from './events';

export type CustomerPartyRow = {
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

export type IdentityValidationFail =
  | 'invalid_party_type'
  | 'identity_not_found'
  | 'identity_deleted';

export type EnsureCustomerPartyFail = IdentityValidationFail;

export type EnsureCustomerPartyOk = {
  ok: true;
  party: CustomerPartyRow;
  created: boolean;
  reused: boolean;
};

export type EnsureCustomerPartyErr = {
  ok: false;
  fail: EnsureCustomerPartyFail;
};

export type EnsureCustomerPartyResult = EnsureCustomerPartyOk | EnsureCustomerPartyErr;

function isPartyType(value: string): value is CustomerPartyType {
  return value === 'contact' || value === 'company';
}

function mapPartyRow(row: {
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
}): CustomerPartyRow {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    party_type: row.party_type,
    party_id: row.party_id,
    display_name: row.display_name,
    status: row.status,
    primary_owner_id: row.primary_owner_id,
    merged_into_id: row.merged_into_id,
    custom_fields: row.custom_fields ?? {},
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Active or inactive, not merged, not soft-deleted — eligible for reuse. */
export function isReusableParty(party: Pick<CustomerPartyRow, 'status' | 'deleted_at'>): boolean {
  return party.deleted_at == null && party.status !== 'merged';
}

/**
 * Validate Contact or Company belongs to the same workspace and is not soft-deleted.
 */
export async function validatePartyIdentity(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    partyType: CustomerPartyType | string;
    partyId: string;
  },
): Promise<
  | { ok: true; displayName: string; primaryOwnerId: string | null }
  | { ok: false; fail: IdentityValidationFail }
> {
  if (!isPartyType(opts.partyType)) {
    return { ok: false, fail: 'invalid_party_type' };
  }

  if (opts.partyType === 'contact') {
    const contact = await db
      .selectFrom('contacts')
      .select(['id', 'name', 'owner_id', 'deleted_at', 'workspace_id'])
      .where('id', '=', opts.partyId)
      .where('workspace_id', '=', opts.workspaceId)
      .executeTakeFirst();
    if (!contact) return { ok: false, fail: 'identity_not_found' };
    if (contact.deleted_at != null) return { ok: false, fail: 'identity_deleted' };
    return {
      ok: true,
      displayName: contact.name,
      primaryOwnerId: contact.owner_id,
    };
  }

  const company = await db
    .selectFrom('companies')
    .select(['id', 'name', 'deleted_at', 'workspace_id'])
    .where('id', '=', opts.partyId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!company) return { ok: false, fail: 'identity_not_found' };
  if (company.deleted_at != null) return { ok: false, fail: 'identity_deleted' };
  return {
    ok: true,
    displayName: company.name,
    primaryOwnerId: null,
  };
}

export async function getCustomerParty(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; includeDeleted?: boolean },
): Promise<CustomerPartyRow | null> {
  let q = db
    .selectFrom('customer_parties')
    .selectAll()
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId);
  if (!opts.includeDeleted) {
    q = q.where('deleted_at', 'is', null);
  }
  const row = await q.executeTakeFirst();
  return row ? mapPartyRow(row) : null;
}

/** Resolve reusable (active/inactive) party for a Contact. */
export async function resolvePartyByContact(
  db: DbOrTx,
  opts: { workspaceId: string; contactId: string },
): Promise<CustomerPartyRow | null> {
  return findReusablePartyByIdentity(db, {
    workspaceId: opts.workspaceId,
    partyType: 'contact',
    partyId: opts.contactId,
  });
}

/** Resolve reusable (active/inactive) party for a Company. */
export async function resolvePartyByCompany(
  db: DbOrTx,
  opts: { workspaceId: string; companyId: string },
): Promise<CustomerPartyRow | null> {
  return findReusablePartyByIdentity(db, {
    workspaceId: opts.workspaceId,
    partyType: 'company',
    partyId: opts.companyId,
  });
}

export async function findReusablePartyByIdentity(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    partyType: CustomerPartyType;
    partyId: string;
  },
): Promise<CustomerPartyRow | null> {
  const row = await db
    .selectFrom('customer_parties')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('party_type', '=', opts.partyType)
    .where('party_id', '=', opts.partyId)
    .where('deleted_at', 'is', null)
    .where('status', '!=', 'merged')
    .executeTakeFirst();
  return row ? mapPartyRow(row) : null;
}

/**
 * Idempotent ensure/reuse. Never creates duplicates for active identity.
 * Soft-deleted → creates a new active party (does not revive).
 * Merged-only → creates a new active party (does not silent-merge or revive).
 */
export async function ensureCustomerParty(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    partyType: CustomerPartyType | string;
    partyId: string;
    displayName?: string;
    primaryOwnerId?: string | null;
    customFields?: Record<string, unknown>;
  },
): Promise<EnsureCustomerPartyResult> {
  const identity = await validatePartyIdentity(db, {
    workspaceId: opts.workspaceId,
    partyType: opts.partyType,
    partyId: opts.partyId,
  });
  if (!identity.ok) {
    return { ok: false, fail: identity.fail };
  }

  const partyType = opts.partyType as CustomerPartyType;

  const existing = await findReusablePartyByIdentity(db, {
    workspaceId: opts.workspaceId,
    partyType,
    partyId: opts.partyId,
  });
  if (existing && isReusableParty(existing)) {
    return { ok: true, party: existing, created: false, reused: true };
  }

  const displayName = (opts.displayName?.trim() || identity.displayName).trim() || 'Customer';
  const primaryOwnerId =
    opts.primaryOwnerId !== undefined ? opts.primaryOwnerId : identity.primaryOwnerId;

  try {
    const inserted = await db
      .insertInto('customer_parties')
      .values({
        workspace_id: opts.workspaceId,
        party_type: partyType,
        party_id: opts.partyId,
        display_name: displayName,
        status: 'active',
        primary_owner_id: primaryOwnerId,
        merged_into_id: null,
        custom_fields: opts.customFields ?? {},
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const party = mapPartyRow(inserted);
    await onCustomerPartyCreated(db, {
      workspaceId: opts.workspaceId,
      partyId: party.id,
      partyType,
      identityId: opts.partyId,
    });

    return { ok: true, party, created: true, reused: false };
  } catch (err) {
    // Concurrent ensure — unique index race → re-select and reuse
    const raced = await findReusablePartyByIdentity(db, {
      workspaceId: opts.workspaceId,
      partyType,
      partyId: opts.partyId,
    });
    if (raced) {
      return { ok: true, party: raced, created: false, reused: true };
    }
    throw err;
  }
}
