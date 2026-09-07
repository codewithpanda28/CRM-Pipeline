/**
 * Deal ↔ CustomerParty attach helpers (Phase 3A.3 Step 2A).
 * P3: company_id preferred over primary_contact_id.
 * Same-TX with Deal mutations. Never silent-merges.
 */
import type { DbOrTx } from '@vencore/events';
import {
  ensureCustomerParty,
  type CustomerPartyRow,
  type EnsureCustomerPartyFail,
} from '../customer-parties/ensure';
import { onCustomerPartyLinked } from '../customer-parties/events';

export type ResolveDealPartyResult =
  | { ok: true; party: CustomerPartyRow | null; created: boolean; reused: boolean }
  | { ok: false; fail: EnsureCustomerPartyFail };

/**
 * Resolve party for Deal identity fields (P3).
 * Returns party=null when neither company nor contact is present.
 */
export async function resolveCustomerPartyForDeal(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    companyId?: string | null;
    primaryContactId?: string | null;
  },
): Promise<ResolveDealPartyResult> {
  if (opts.companyId) {
    const ensured = await ensureCustomerParty(db, {
      workspaceId: opts.workspaceId,
      partyType: 'company',
      partyId: opts.companyId,
    });
    if (!ensured.ok) return { ok: false, fail: ensured.fail };
    return {
      ok: true,
      party: ensured.party,
      created: ensured.created,
      reused: ensured.reused,
    };
  }

  if (opts.primaryContactId) {
    const ensured = await ensureCustomerParty(db, {
      workspaceId: opts.workspaceId,
      partyType: 'contact',
      partyId: opts.primaryContactId,
    });
    if (!ensured.ok) return { ok: false, fail: ensured.fail };
    return {
      ok: true,
      party: ensured.party,
      created: ensured.created,
      reused: ensured.reused,
    };
  }

  return { ok: true, party: null, created: false, reused: false };
}

/**
 * Ensure/reuse party for Deal create / won-when-null.
 * Emits crm.customer_party.linked when a party is attached to the deal.
 *
 * - `existingPartyId`: already on Deal → no-op (won path when already set)
 * - `preferredPartyId`: client-supplied on create (integrity already validated) → link + use
 * - else: ensure from company_id then primary_contact_id (P3)
 */
export async function attachCustomerPartyToDeal(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    dealId: string;
    companyId?: string | null;
    primaryContactId?: string | null;
    existingPartyId?: string | null;
    preferredPartyId?: string | null;
  },
): Promise<
  | { ok: true; customerPartyId: string | null; created: boolean; reused: boolean; linked: boolean }
  | { ok: false; fail: EnsureCustomerPartyFail }
> {
  if (opts.existingPartyId) {
    return {
      ok: true,
      customerPartyId: opts.existingPartyId,
      created: false,
      reused: true,
      linked: false,
    };
  }

  if (opts.preferredPartyId) {
    await onCustomerPartyLinked(db, {
      workspaceId: opts.workspaceId,
      partyId: opts.preferredPartyId,
      linkType: 'deal',
      linkId: opts.dealId,
    });
    return {
      ok: true,
      customerPartyId: opts.preferredPartyId,
      created: false,
      reused: true,
      linked: true,
    };
  }

  const resolved = await resolveCustomerPartyForDeal(db, {
    workspaceId: opts.workspaceId,
    companyId: opts.companyId,
    primaryContactId: opts.primaryContactId,
  });
  if (!resolved.ok) return { ok: false, fail: resolved.fail };

  if (!resolved.party) {
    return {
      ok: true,
      customerPartyId: null,
      created: false,
      reused: false,
      linked: false,
    };
  }

  await onCustomerPartyLinked(db, {
    workspaceId: opts.workspaceId,
    partyId: resolved.party.id,
    linkType: 'deal',
    linkId: opts.dealId,
  });

  return {
    ok: true,
    customerPartyId: resolved.party.id,
    created: resolved.created,
    reused: resolved.reused,
    linked: true,
  };
}

/**
 * When Deal becomes won and still has no party, ensure/reuse (P2) and persist.
 * No-op if party already set or no company/contact identity.
 */
export async function ensureCustomerPartyOnDealWon(
  db: DbOrTx,
  deal: {
    id: string;
    workspace_id: string;
    status: string;
    customer_party_id: string | null;
    company_id: string | null;
    primary_contact_id: string | null;
  },
): Promise<{
  deal: typeof deal & { customer_party_id: string | null };
  attached: boolean;
}> {
  if (deal.status !== 'won' || deal.customer_party_id) {
    return { deal, attached: false };
  }

  const attached = await attachCustomerPartyToDeal(db, {
    workspaceId: deal.workspace_id,
    dealId: deal.id,
    companyId: deal.company_id,
    primaryContactId: deal.primary_contact_id,
    existingPartyId: deal.customer_party_id,
  });

  if (!attached.ok || !attached.customerPartyId) {
    return { deal, attached: false };
  }

  const updated = await db
    .updateTable('deals')
    .set({
      customer_party_id: attached.customerPartyId,
      updated_at: new Date(),
    })
    .where('id', '=', deal.id)
    .where('workspace_id', '=', deal.workspace_id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return { deal: updated, attached: true };
}
