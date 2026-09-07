/**
 * Customer 360 aggregation (Phase 3A.3) — CORE slices + extension stubs.
 */
import type { DbOrTx } from '@vencore/events';
import { getCustomerParty, type CustomerPartyRow } from './ensure';

const LIST_LIMIT = 50;

export type Customer360Result =
  | {
      ok: true;
      redirected?: false;
      party: CustomerPartyRow;
      identity: {
        party_type: string;
        contact: Record<string, unknown> | null;
        company: Record<string, unknown> | null;
      };
      related_contacts: Record<string, unknown>[];
      leads: Record<string, unknown>[];
      deals: Record<string, unknown>[];
      quotes: Record<string, unknown>[];
      activities: Record<string, unknown>[];
      tasks: Record<string, unknown>[];
      projects: Record<string, unknown>[];
      extensions: Record<
        string,
        | { available: boolean; reason?: string }
        | {
            available: boolean;
            invoices: Record<string, unknown>[];
            payments: Record<string, unknown>[];
            outstanding_total: string;
            credit_notes: Record<string, unknown>[];
            accounting_summary?: {
              note: string;
              open_invoice_count: number;
            };
          }
      >;
    }
  | {
      ok: true;
      redirected: true;
      from_party_id: string;
      into_party_id: string;
    }
  | { ok: false; fail: 'not_found' | 'deleted' };

export async function buildCustomer360(
  db: DbOrTx,
  opts: { workspaceId: string; partyId: string },
): Promise<Customer360Result> {
  const party = await getCustomerParty(db, {
    workspaceId: opts.workspaceId,
    id: opts.partyId,
    includeDeleted: true,
  });
  if (!party) return { ok: false, fail: 'not_found' };
  if (party.deleted_at != null) return { ok: false, fail: 'deleted' };

  if (party.status === 'merged' && party.merged_into_id) {
    return {
      ok: true,
      redirected: true,
      from_party_id: party.id,
      into_party_id: party.merged_into_id,
    };
  }

  let contact: Record<string, unknown> | null = null;
  let company: Record<string, unknown> | null = null;
  const contactIds: string[] = [];
  const companyIds: string[] = [];

  if (party.party_type === 'contact') {
    contact =
      (await db
        .selectFrom('contacts')
        .selectAll()
        .where('id', '=', party.party_id)
        .where('workspace_id', '=', opts.workspaceId)
        .executeTakeFirst()) ?? null;
    if (contact) {
      contactIds.push(String(contact.id));
      if (contact.company_id) companyIds.push(String(contact.company_id));
    }
  } else {
    company =
      (await db
        .selectFrom('companies')
        .selectAll()
        .where('id', '=', party.party_id)
        .where('workspace_id', '=', opts.workspaceId)
        .executeTakeFirst()) ?? null;
    if (company) companyIds.push(String(company.id));
  }

  if (companyIds.length && !company) {
    company =
      (await db
        .selectFrom('companies')
        .selectAll()
        .where('id', '=', companyIds[0]!)
        .where('workspace_id', '=', opts.workspaceId)
        .executeTakeFirst()) ?? null;
  }

  let relatedContacts: Record<string, unknown>[] = [];
  if (companyIds.length) {
    relatedContacts = await db
      .selectFrom('contacts')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .where('company_id', 'in', companyIds)
      .orderBy('updated_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();
    for (const c of relatedContacts) {
      if (!contactIds.includes(String(c.id))) contactIds.push(String(c.id));
    }
  } else if (contact) {
    relatedContacts = [contact];
  }

  const deals = await db
    .selectFrom('deals')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('customer_party_id', '=', party.id),
        ...(companyIds.length ? [eb('company_id', 'in', companyIds)] : []),
        ...(contactIds.length ? [eb('primary_contact_id', 'in', contactIds)] : []),
      ]),
    )
    .orderBy('updated_at', 'desc')
    .limit(LIST_LIMIT)
    .execute();

  const dealIds = deals.map((d) => d.id);

  let leads: Record<string, unknown>[] = [];
  if (contactIds.length || companyIds.length) {
    leads = await db
      .selectFrom('leads')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .where((eb) =>
        eb.or([
          ...(contactIds.length ? [eb('contact_id', 'in', contactIds)] : []),
          ...(companyIds.length ? [eb('company_id', 'in', companyIds)] : []),
        ]),
      )
      .orderBy('updated_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();
  }

  // Also leads with conversion link to this party
  const linkedLeadIds = await db
    .selectFrom('lead_conversion_links')
    .select('lead_id')
    .where('workspace_id', '=', opts.workspaceId)
    .where('entity_type', '=', 'customer_party')
    .where('entity_id', '=', party.id)
    .execute();
  if (linkedLeadIds.length) {
    const extra = await db
      .selectFrom('leads')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where(
        'id',
        'in',
        linkedLeadIds.map((r) => r.lead_id),
      )
      .where('deleted_at', 'is', null)
      .execute();
    const seen = new Set(leads.map((l) => String(l.id)));
    for (const l of extra) {
      if (!seen.has(String(l.id))) leads.push(l);
    }
  }

  let activities: Record<string, unknown>[] = [];
  let tasks: Record<string, unknown>[] = [];
  if (contactIds.length || dealIds.length) {
    activities = await db
      .selectFrom('activities')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where((eb) =>
        eb.or([
          ...(contactIds.length ? [eb('contact_id', 'in', contactIds)] : []),
          ...(dealIds.length ? [eb('record_id', 'in', dealIds)] : []),
        ]),
      )
      .orderBy('created_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();

    tasks = await db
      .selectFrom('tasks')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where((eb) =>
        eb.or([
          ...(contactIds.length ? [eb('contact_id', 'in', contactIds)] : []),
          ...(dealIds.length ? [eb('record_id', 'in', dealIds)] : []),
        ]),
      )
      .orderBy('updated_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();
  }

  let projects: Record<string, unknown>[] = [];
  if (contactIds.length || companyIds.length || dealIds.length) {
    projects = await db
      .selectFrom('projects')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where('status', '!=', 'DELETED')
      .where((eb) =>
        eb.or([
          ...(contactIds.length ? [eb('contact_id', 'in', contactIds)] : []),
          ...(companyIds.length ? [eb('company_id', 'in', companyIds)] : []),
          ...(dealIds.length ? [eb('deal_id', 'in', dealIds)] : []),
        ]),
      )
      .orderBy('updated_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();
  }

  const quotes = await db
    .selectFrom('quotes')
    .select([
      'id',
      'quote_number',
      'version',
      'status',
      'total',
      'currency',
      'issue_date',
      'expiry_date',
      'deal_id',
      'updated_at',
    ])
    .where('workspace_id', '=', opts.workspaceId)
    .where('customer_party_id', '=', party.id)
    .where('deleted_at', 'is', null)
    .orderBy('updated_at', 'desc')
    .limit(LIST_LIMIT)
    .execute();

  const financeModule = await db
    .selectFrom('workspace_modules')
    .select('enabled')
    .where('workspace_id', '=', opts.workspaceId)
    .where('module_id', '=', 'finance')
    .executeTakeFirst();
  const financeEnabled = financeModule?.enabled === true;

  let invoices: Record<string, unknown>[] = [];
  let payments: Record<string, unknown>[] = [];
  let creditNotes: Record<string, unknown>[] = [];
  let outstandingTotal = '0.00';

  if (financeEnabled) {
    invoices = await db
      .selectFrom('invoices')
      .select([
        'id',
        'invoice_number',
        'status',
        'total',
        'amount_due',
        'amount_paid',
        'currency',
        'issue_date',
        'due_date',
        'updated_at',
      ])
      .where('workspace_id', '=', opts.workspaceId)
      .where('customer_party_id', '=', party.id)
      .where('deleted_at', 'is', null)
      .orderBy('updated_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();

    payments = await db
      .selectFrom('payments')
      .select([
        'id',
        'payment_number',
        'invoice_id',
        'amount',
        'currency',
        'payment_date',
        'method',
        'status',
        'updated_at',
      ])
      .where('workspace_id', '=', opts.workspaceId)
      .where('customer_party_id', '=', party.id)
      .where('deleted_at', 'is', null)
      .orderBy('payment_date', 'desc')
      .limit(LIST_LIMIT)
      .execute();

    creditNotes = await db
      .selectFrom('credit_notes')
      .select([
        'id',
        'credit_note_number',
        'status',
        'total',
        'applied_amount',
        'unapplied_amount',
        'currency',
        'invoice_id',
        'issue_date',
        'updated_at',
      ])
      .where('workspace_id', '=', opts.workspaceId)
      .where('customer_party_id', '=', party.id)
      .where('deleted_at', 'is', null)
      .orderBy('updated_at', 'desc')
      .limit(LIST_LIMIT)
      .execute();

    for (const inv of invoices) {
      if (['issued', 'partially_paid', 'overdue'].includes(String(inv.status))) {
        const due = Number(inv.amount_due);
        if (Number.isFinite(due)) outstandingTotal = (Number(outstandingTotal) + due).toFixed(2);
      }
    }
  }

  return {
    ok: true,
    party,
    identity: {
      party_type: party.party_type,
      contact,
      company,
    },
    related_contacts: relatedContacts,
    leads,
    deals,
    quotes,
    activities,
    tasks,
    projects,
    extensions: {
      finance: financeEnabled
        ? {
            available: true,
            invoices,
            payments,
            outstanding_total: outstandingTotal,
            credit_notes: creditNotes,
            accounting_summary: {
              note: 'AR outstanding from commercial invoices; journals are tenant GL truth',
              open_invoice_count: invoices.filter((i) =>
                ['issued', 'partially_paid', 'overdue'].includes(String(i.status)),
              ).length,
            },
          }
        : { available: false, reason: 'module_disabled' },
      whatsapp: { available: false, reason: 'not_implemented' },
      support: { available: false, reason: 'not_implemented' },
      voice: { available: false, reason: 'not_implemented' },
      automation: { available: false, reason: 'not_implemented' },
    },
  };
}
