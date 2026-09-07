/**
 * Deterministic CustomerParty backfill (P4). Idempotent. No silent merge.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { ensureCustomerParty } from './ensure';
import { onCustomerPartyLinked } from './events';

export interface CustomerPartyBackfillReport {
  dry_run: boolean;
  workspace_id: string | null;
  candidates: number;
  created: number;
  reused: number;
  attached_deals: number;
  attached_leads: number;
  skipped: number;
  ambiguous: Array<{ kind: string; id: string; reason: string }>;
  failed: Array<{ kind: string; id: string; error: string }>;
}

export async function backfillCustomerParties(
  db: Kysely<Database>,
  opts?: { workspaceId?: string; dryRun?: boolean; limit?: number },
): Promise<CustomerPartyBackfillReport> {
  const dryRun = Boolean(opts?.dryRun);
  const report: CustomerPartyBackfillReport = {
    dry_run: dryRun,
    workspace_id: opts?.workspaceId ?? null,
    candidates: 0,
    created: 0,
    reused: 0,
    attached_deals: 0,
    attached_leads: 0,
    skipped: 0,
    ambiguous: [],
    failed: [],
  };

  const limit = opts?.limit;

  // 1) Contact status=customer
  let contactQ = db
    .selectFrom('contacts')
    .select(['id', 'workspace_id', 'name', 'owner_id'])
    .where('deleted_at', 'is', null)
    .where('status', '=', 'customer');
  if (opts?.workspaceId) contactQ = contactQ.where('workspace_id', '=', opts.workspaceId);
  if (limit) contactQ = contactQ.limit(limit);
  const customerContacts = await contactQ.execute();

  for (const c of customerContacts) {
    report.candidates += 1;
    try {
      if (dryRun) {
        report.skipped += 1;
        continue;
      }
      const ensured = await ensureCustomerParty(db, {
        workspaceId: c.workspace_id,
        partyType: 'contact',
        partyId: c.id,
        displayName: c.name,
        primaryOwnerId: c.owner_id,
      });
      if (!ensured.ok) {
        report.failed.push({ kind: 'contact', id: c.id, error: ensured.fail });
        continue;
      }
      if (ensured.created) report.created += 1;
      else report.reused += 1;
    } catch (e) {
      report.failed.push({
        kind: 'contact',
        id: c.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2) Companies linked via deals (company_id set)
  let companyViaDealQ = db
    .selectFrom('deals')
    .select(['company_id', 'workspace_id'])
    .where('deleted_at', 'is', null)
    .where('company_id', 'is not', null)
    .distinct();
  if (opts?.workspaceId) companyViaDealQ = companyViaDealQ.where('workspace_id', '=', opts.workspaceId);
  const companyDealRows = await companyViaDealQ.execute();

  for (const row of companyDealRows) {
    if (!row.company_id) continue;
    report.candidates += 1;
    try {
      if (dryRun) {
        report.skipped += 1;
        continue;
      }
      const ensured = await ensureCustomerParty(db, {
        workspaceId: row.workspace_id,
        partyType: 'company',
        partyId: row.company_id,
      });
      if (!ensured.ok) {
        report.failed.push({ kind: 'company_via_deal', id: row.company_id, error: ensured.fail });
        continue;
      }
      if (ensured.created) report.created += 1;
      else report.reused += 1;
    } catch (e) {
      report.failed.push({
        kind: 'company_via_deal',
        id: row.company_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 3+4) Deals with company_id / primary_contact_id only — attach party
  let dealsQ = db
    .selectFrom('deals')
    .select(['id', 'workspace_id', 'company_id', 'primary_contact_id', 'customer_party_id'])
    .where('deleted_at', 'is', null)
    .where((eb) =>
      eb.or([eb('company_id', 'is not', null), eb('primary_contact_id', 'is not', null)]),
    );
  if (opts?.workspaceId) dealsQ = dealsQ.where('workspace_id', '=', opts.workspaceId);
  if (limit) dealsQ = dealsQ.limit(limit);
  const deals = await dealsQ.execute();

  for (const deal of deals) {
    report.candidates += 1;
    try {
      if (deal.customer_party_id) {
        report.skipped += 1;
        continue;
      }
      if (dryRun) {
        report.skipped += 1;
        continue;
      }

      const partyType = deal.company_id ? 'company' : 'contact';
      const partyId = deal.company_id ?? deal.primary_contact_id;
      if (!partyId) {
        report.skipped += 1;
        continue;
      }

      const ensured = await ensureCustomerParty(db, {
        workspaceId: deal.workspace_id,
        partyType,
        partyId,
      });
      if (!ensured.ok) {
        report.failed.push({ kind: 'deal', id: deal.id, error: ensured.fail });
        continue;
      }
      if (ensured.created) report.created += 1;
      else report.reused += 1;

      await db
        .updateTable('deals')
        .set({ customer_party_id: ensured.party.id, updated_at: new Date() })
        .where('id', '=', deal.id)
        .where('workspace_id', '=', deal.workspace_id)
        .where('customer_party_id', 'is', null)
        .execute();

      await onCustomerPartyLinked(db, {
        workspaceId: deal.workspace_id,
        partyId: ensured.party.id,
        linkType: 'deal',
        linkId: deal.id,
      });
      report.attached_deals += 1;
    } catch (e) {
      report.failed.push({
        kind: 'deal',
        id: deal.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 5) Converted leads with deterministic contact/company
  let leadsQ = db
    .selectFrom('leads')
    .select(['id', 'workspace_id', 'contact_id', 'company_id', 'status'])
    .where('deleted_at', 'is', null)
    .where('status', '=', 'converted');
  if (opts?.workspaceId) leadsQ = leadsQ.where('workspace_id', '=', opts.workspaceId);
  if (limit) leadsQ = leadsQ.limit(limit);
  const leads = await leadsQ.execute();

  for (const lead of leads) {
    report.candidates += 1;
    try {
      const existingLink = await db
        .selectFrom('lead_conversion_links')
        .select('id')
        .where('lead_id', '=', lead.id)
        .where('entity_type', '=', 'customer_party')
        .executeTakeFirst();
      if (existingLink) {
        report.skipped += 1;
        continue;
      }

      if (!lead.company_id && !lead.contact_id) {
        report.ambiguous.push({
          kind: 'lead',
          id: lead.id,
          reason: 'converted without deterministic contact/company',
        });
        continue;
      }

      if (dryRun) {
        report.skipped += 1;
        continue;
      }

      const partyType = lead.company_id ? 'company' : 'contact';
      const partyId = lead.company_id ?? lead.contact_id!;
      const ensured = await ensureCustomerParty(db, {
        workspaceId: lead.workspace_id,
        partyType,
        partyId,
      });
      if (!ensured.ok) {
        report.failed.push({ kind: 'lead', id: lead.id, error: ensured.fail });
        continue;
      }
      if (ensured.created) report.created += 1;
      else report.reused += 1;

      await db
        .insertInto('lead_conversion_links')
        .values({
          workspace_id: lead.workspace_id,
          lead_id: lead.id,
          entity_type: 'customer_party',
          entity_id: ensured.party.id,
          action: ensured.created ? 'created' : 'reused',
        })
        .onConflict((oc) => oc.columns(['lead_id', 'entity_type']).doNothing())
        .execute();

      await onCustomerPartyLinked(db, {
        workspaceId: lead.workspace_id,
        partyId: ensured.party.id,
        linkType: 'lead',
        linkId: lead.id,
      });
      report.attached_leads += 1;
    } catch (e) {
      report.failed.push({
        kind: 'lead',
        id: lead.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return report;
}
