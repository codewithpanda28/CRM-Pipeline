/**
 * Lead → Contact / Company / Deal conversion (Phase 3A.2).
 * Same-TX, idempotent, tenant-scoped. Deal via canonical Deal helpers only.
 */
import { randomUUID } from 'crypto';
import type { Transaction } from 'kysely';
import type { Database, Lead, LeadConversionLink } from '@vencore/db';
import { sql } from 'kysely';
import {
  assertDealRelations,
  loadStageFlags,
  statusFromStageFlags,
  upsertPipelineItemFromDeal,
  parseMoneyAmount,
  normalizeCurrency,
  DEFAULT_DEAL_CURRENCY,
  onDealCreated,
  attachCustomerPartyToDeal,
} from '../deals';
import { onPipelineItemCreated } from '../domain-outbox';
import { logItemCreated } from '../pipeline-activity';
import { ensureCustomerParty } from '../customer-parties/ensure';
import { onCustomerPartyLinked } from '../customer-parties/events';
import { normalizeEmail, normalizeWebsiteHost, displayLeadName } from './normalize';
import { onLeadConverted } from './events';

export interface ConvertLeadInput {
  workspaceId: string;
  userId: string;
  leadId: string;
  /** Prefer this contact if tenant-owned */
  contactId?: string | null;
  companyId?: string | null;
  createCompany?: boolean;
  createDeal?: boolean;
  deal?: {
    pipeline_id: string;
    stage_id: string;
    name?: string;
    amount?: string | number;
    currency?: string;
    owner_id?: string;
  } | null;
  /** Client idempotency key — stored in conversion transition */
  idempotencyKey?: string | null;
  /** Opt-in CustomerParty create/link (default false — 3A.2 compat) */
  createCustomerParty?: boolean;
  /** Explicit party id (must be tenant-owned); implies createCustomerParty */
  customerPartyId?: string | null;
}

export interface ConvertLeadResult {
  lead: Lead;
  links: LeadConversionLink[];
  idempotent: boolean;
  contactAction: 'created' | 'reused';
  companyAction: 'created' | 'reused' | 'none';
  dealAction: 'created' | 'none';
  partyAction: 'created' | 'reused' | 'none';
}

export async function convertLead(
  trx: Transaction<Database>,
  input: ConvertLeadInput,
): Promise<ConvertLeadResult> {
  const lead = await trx
    .selectFrom('leads')
    .selectAll()
    .where('id', '=', input.leadId)
    .where('workspace_id', '=', input.workspaceId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();

  if (!lead) {
    throw Object.assign(new Error('Lead not found'), { code: 'NOT_FOUND', status: 404 });
  }

  if (lead.status === 'converted') {
    const links = await trx
      .selectFrom('lead_conversion_links')
      .selectAll()
      .where('lead_id', '=', lead.id)
      .where('workspace_id', '=', input.workspaceId)
      .execute();

    let partyAction: 'created' | 'reused' | 'none' = 'none';
    const wantParty = Boolean(input.createCustomerParty || input.customerPartyId);
    const hasPartyLink = links.some((l) => l.entity_type === 'customer_party');
    if (wantParty && !hasPartyLink && (lead.company_id || lead.contact_id || input.customerPartyId)) {
      const partyResult = await ensurePartyForConvertedLead(trx, {
        workspaceId: input.workspaceId,
        leadId: lead.id,
        companyId: lead.company_id,
        contactId: lead.contact_id,
        preferredPartyId: input.customerPartyId ?? null,
        dealId: lead.deal_id,
      });
      if (partyResult.link) links.push(partyResult.link);
      partyAction = partyResult.action;
    } else if (hasPartyLink) {
      partyAction = 'reused';
    }

    return {
      lead,
      links,
      idempotent: true,
      contactAction: 'reused',
      companyAction: lead.company_id ? 'reused' : 'none',
      dealAction: lead.deal_id ? 'created' : 'none',
      partyAction,
    };
  }

  const now = new Date();
  const email = normalizeEmail(lead.email);
  let contactAction: 'created' | 'reused' = 'created';
  let contactId = input.contactId ?? lead.contact_id ?? null;

  if (contactId) {
    const owned = await trx
      .selectFrom('contacts')
      .select('id')
      .where('id', '=', contactId)
      .where('workspace_id', '=', input.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!owned) {
      throw Object.assign(new Error('contact_id not found in tenant'), {
        code: 'INVALID_CONTACT',
        status: 400,
      });
    }
    contactAction = 'reused';
  } else if (email) {
    const existing = await trx
      .selectFrom('contacts')
      .select('id')
      .where('workspace_id', '=', input.workspaceId)
      .where('deleted_at', 'is', null)
      .where(sql`lower(email)`, '=', email)
      .executeTakeFirst();
    if (existing) {
      contactId = existing.id;
      contactAction = 'reused';
    }
  }

  if (!contactId) {
    if (!email) {
      throw Object.assign(new Error('Lead email required to create a Contact'), {
        code: 'EMAIL_REQUIRED',
        status: 400,
      });
    }
    contactId = randomUUID();
    await trx
      .insertInto('contacts')
      .values({
        id: contactId,
        workspace_id: input.workspaceId,
        owner_id: lead.owner_id,
        name: displayLeadName(lead),
        email,
        phone: lead.phone,
        company_id: null,
        status: 'prospect',
      })
      .execute();
    await trx
      .updateTable('workspaces')
      .set({ contact_count: sql`contact_count + 1` })
      .where('id', '=', input.workspaceId)
      .execute();
    contactAction = 'created';
  }

  let companyAction: 'created' | 'reused' | 'none' = 'none';
  let companyId = input.companyId ?? lead.company_id ?? null;

  if (companyId) {
    const owned = await trx
      .selectFrom('companies')
      .select('id')
      .where('id', '=', companyId)
      .where('workspace_id', '=', input.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!owned) {
      throw Object.assign(new Error('company_id not found in tenant'), {
        code: 'INVALID_COMPANY',
        status: 400,
      });
    }
    companyAction = 'reused';
  } else if (input.createCompany !== false && (lead.company_name || lead.website)) {
    const host = normalizeWebsiteHost(lead.website);
    const companies = await trx
      .selectFrom('companies')
      .select(['id', 'name', 'website'])
      .where('workspace_id', '=', input.workspaceId)
      .where('deleted_at', 'is', null)
      .execute();
    const match = companies.find((c) => {
      if (host && normalizeWebsiteHost(c.website) === host) return true;
      if (
        lead.company_name &&
        c.name.trim().toLowerCase() === lead.company_name.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    });
    if (match) {
      companyId = match.id;
      companyAction = 'reused';
    } else {
      companyId = randomUUID();
      await trx
        .insertInto('companies')
        .values({
          id: companyId,
          workspace_id: input.workspaceId,
          name: lead.company_name?.trim() || host || 'Company',
          website: lead.website,
        })
        .execute();
      companyAction = 'created';
    }
  }

  if (companyId) {
    await trx
      .updateTable('contacts')
      .set({ company_id: companyId, updated_at: now })
      .where('id', '=', contactId)
      .where('workspace_id', '=', input.workspaceId)
      .execute();
  }

  let dealAction: 'created' | 'none' = 'none';
  let dealId: string | null = lead.deal_id;
  let customerPartyId: string | null = null;
  let partyAction: 'created' | 'reused' | 'none' = 'none';

  const wantParty = Boolean(input.createCustomerParty || input.customerPartyId);
  if (wantParty) {
    if (input.customerPartyId) {
      const owned = await trx
        .selectFrom('customer_parties')
        .select(['id', 'status', 'deleted_at'])
        .where('id', '=', input.customerPartyId)
        .where('workspace_id', '=', input.workspaceId)
        .executeTakeFirst();
      if (!owned || owned.deleted_at != null || owned.status === 'merged') {
        throw Object.assign(new Error('customer_party_id invalid in tenant'), {
          code: 'INVALID_CUSTOMER_PARTY',
          status: 400,
        });
      }
      customerPartyId = owned.id;
      partyAction = 'reused';
    } else {
      const partyType = companyId ? 'company' : 'contact';
      const partyIdentityId = companyId ?? contactId;
      const ensured = await ensureCustomerParty(trx, {
        workspaceId: input.workspaceId,
        partyType,
        partyId: partyIdentityId,
      });
      if (!ensured.ok) {
        throw Object.assign(new Error(`CustomerParty ensure failed: ${ensured.fail}`), {
          code: 'INVALID_CUSTOMER_PARTY',
          status: 400,
        });
      }
      customerPartyId = ensured.party.id;
      partyAction = ensured.created ? 'created' : 'reused';
    }
  }

  if (input.createDeal && input.deal) {
    const dealBody = input.deal;
    const ownerId = dealBody.owner_id ?? lead.owner_id;
    const rel = await assertDealRelations(trx, {
      workspaceId: input.workspaceId,
      pipelineId: dealBody.pipeline_id,
      stageId: dealBody.stage_id,
      ownerId,
      primaryContactId: contactId,
      companyId,
      customerPartyId,
    });
    if (rel !== 'ok') {
      throw Object.assign(new Error(`Invalid deal relation: ${rel}`), {
        code: `INVALID_${rel.toUpperCase()}`,
        status: rel === 'pipeline' ? 404 : 400,
      });
    }
    const flags = await loadStageFlags(trx, {
      workspaceId: input.workspaceId,
      stageId: dealBody.stage_id,
    });
    const status = statusFromStageFlags(Boolean(flags?.is_won), Boolean(flags?.is_lost));
    dealId = randomUUID();

    // If party requested, attach before insert; else leave null (Lead exception to Deal auto-create)
    let dealPartyId = customerPartyId;
    if (!dealPartyId && wantParty) {
      const attached = await attachCustomerPartyToDeal(trx, {
        workspaceId: input.workspaceId,
        dealId,
        companyId,
        primaryContactId: contactId,
      });
      if (attached.ok) dealPartyId = attached.customerPartyId;
    }

    const created = await trx
      .insertInto('deals')
      .values({
        id: dealId,
        workspace_id: input.workspaceId,
        pipeline_id: dealBody.pipeline_id,
        stage_id: dealBody.stage_id,
        name: dealBody.name?.trim() || displayLeadName(lead),
        owner_id: ownerId,
        amount: parseMoneyAmount(dealBody.amount ?? 0),
        currency: normalizeCurrency(dealBody.currency ?? DEFAULT_DEAL_CURRENCY),
        probability: 0,
        source: lead.source ? `lead:${lead.source}` : 'lead_conversion',
        primary_contact_id: contactId,
        company_id: companyId,
        customer_party_id: dealPartyId,
        status,
        won_at: status === 'won' ? now : null,
        lost_at: status === 'lost' ? now : null,
        custom_fields: { lead_id: lead.id } as never,
        source_pipeline_item_id: dealId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (dealPartyId && customerPartyId !== dealPartyId) {
      customerPartyId = dealPartyId;
    }
    if (dealPartyId) {
      await onCustomerPartyLinked(trx, {
        workspaceId: input.workspaceId,
        partyId: dealPartyId,
        linkType: 'deal',
        linkId: dealId,
      });
    }

    await upsertPipelineItemFromDeal(trx, created, { position: 0 });
    await logItemCreated({
      db: trx,
      itemId: created.id,
      pipelineId: created.pipeline_id,
      workspaceId: input.workspaceId,
      userId: input.userId,
    });
    await onPipelineItemCreated(trx, {
      workspaceId: input.workspaceId,
      itemId: created.id,
      pipelineId: created.pipeline_id,
      stageId: created.stage_id,
    });
    await onDealCreated(trx, {
      workspaceId: input.workspaceId,
      dealId: created.id,
      pipelineId: created.pipeline_id,
      stageId: created.stage_id,
    });
    dealAction = 'created';
  }

  const links: LeadConversionLink[] = [];
  const linkRows: Array<{
    entity_type: 'contact' | 'company' | 'deal' | 'customer_party';
    entity_id: string;
    action: 'created' | 'reused';
  }> = [
    { entity_type: 'contact', entity_id: contactId, action: contactAction },
  ];
  if (companyId && companyAction !== 'none') {
    linkRows.push({ entity_type: 'company', entity_id: companyId, action: companyAction });
  }
  if (dealId && dealAction === 'created') {
    linkRows.push({ entity_type: 'deal', entity_id: dealId, action: 'created' });
  }
  if (customerPartyId && partyAction !== 'none') {
    linkRows.push({
      entity_type: 'customer_party',
      entity_id: customerPartyId,
      action: partyAction === 'created' ? 'created' : 'reused',
    });
    await onCustomerPartyLinked(trx, {
      workspaceId: input.workspaceId,
      partyId: customerPartyId,
      linkType: 'lead',
      linkId: lead.id,
    });
  }

  for (const row of linkRows) {
    const link = await trx
      .insertInto('lead_conversion_links')
      .values({
        id: randomUUID(),
        workspace_id: input.workspaceId,
        lead_id: lead.id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        action: row.action,
      })
      .onConflict((oc) => oc.columns(['lead_id', 'entity_type']).doNothing())
      .returningAll()
      .executeTakeFirst();
    if (link) links.push(link);
    else {
      const existing = await trx
        .selectFrom('lead_conversion_links')
        .selectAll()
        .where('lead_id', '=', lead.id)
        .where('entity_type', '=', row.entity_type)
        .executeTakeFirstOrThrow();
      links.push(existing);
    }
  }

  const updated = await trx
    .updateTable('leads')
    .set({
      status: 'converted',
      contact_id: contactId,
      company_id: companyId,
      deal_id: dealId,
      converted_at: now,
      converted_by: input.userId,
      updated_at: now,
    })
    .where('id', '=', lead.id)
    .where('workspace_id', '=', input.workspaceId)
    .returningAll()
    .executeTakeFirstOrThrow();

  await onLeadConverted(trx, {
    workspaceId: input.workspaceId,
    leadId: lead.id,
    contactId,
    companyId,
    dealId,
  });

  return {
    lead: updated,
    links,
    idempotent: false,
    contactAction,
    companyAction,
    dealAction,
    partyAction,
  };
}

async function ensurePartyForConvertedLead(
  trx: Transaction<Database>,
  opts: {
    workspaceId: string;
    leadId: string;
    companyId: string | null;
    contactId: string | null;
    preferredPartyId: string | null;
    dealId: string | null;
  },
): Promise<{ link: LeadConversionLink | null; action: 'created' | 'reused' | 'none' }> {
  let partyId = opts.preferredPartyId;
  let action: 'created' | 'reused' = 'reused';

  if (partyId) {
    const owned = await trx
      .selectFrom('customer_parties')
      .select(['id', 'status', 'deleted_at'])
      .where('id', '=', partyId)
      .where('workspace_id', '=', opts.workspaceId)
      .executeTakeFirst();
    if (!owned || owned.deleted_at != null || owned.status === 'merged') {
      throw Object.assign(new Error('customer_party_id invalid in tenant'), {
        code: 'INVALID_CUSTOMER_PARTY',
        status: 400,
      });
    }
  } else {
    const partyType = opts.companyId ? 'company' : 'contact';
    const identityId = opts.companyId ?? opts.contactId;
    if (!identityId) return { link: null, action: 'none' };
    const ensured = await ensureCustomerParty(trx, {
      workspaceId: opts.workspaceId,
      partyType,
      partyId: identityId,
    });
    if (!ensured.ok) {
      throw Object.assign(new Error(`CustomerParty ensure failed: ${ensured.fail}`), {
        code: 'INVALID_CUSTOMER_PARTY',
        status: 400,
      });
    }
    partyId = ensured.party.id;
    action = ensured.created ? 'created' : 'reused';
  }

  const link = await trx
    .insertInto('lead_conversion_links')
    .values({
      id: randomUUID(),
      workspace_id: opts.workspaceId,
      lead_id: opts.leadId,
      entity_type: 'customer_party',
      entity_id: partyId,
      action,
    })
    .onConflict((oc) => oc.columns(['lead_id', 'entity_type']).doNothing())
    .returningAll()
    .executeTakeFirst();

  await onCustomerPartyLinked(trx, {
    workspaceId: opts.workspaceId,
    partyId,
    linkType: 'lead',
    linkId: opts.leadId,
  });

  if (opts.dealId) {
    await trx
      .updateTable('deals')
      .set({ customer_party_id: partyId, updated_at: new Date() })
      .where('id', '=', opts.dealId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('customer_party_id', 'is', null)
      .execute();
  }

  if (link) return { link, action };
  const existing = await trx
    .selectFrom('lead_conversion_links')
    .selectAll()
    .where('lead_id', '=', opts.leadId)
    .where('entity_type', '=', 'customer_party')
    .executeTakeFirst();
  return { link: existing ?? null, action: 'reused' };
}
