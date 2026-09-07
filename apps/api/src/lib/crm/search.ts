import { sql, type Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export const CRM_SEARCH_TYPE_ORDER = [
  'lead',
  'contact',
  'company',
  'customer_party',
  'deal',
  'quote',
  'invoice',
  'payment',
  'task',
] as const;

export type CrmSearchEntityType = (typeof CRM_SEARCH_TYPE_ORDER)[number];

/** Topbar client-focused scope (Round A). */
export const CLIENT_SEARCH_TYPES: readonly CrmSearchEntityType[] = [
  'lead',
  'contact',
  'company',
  'customer_party',
  'deal',
];

export type CrmSearchHrefMode = 'legacy' | 'unified';

export interface CrmSearchHit {
  entity_type: CrmSearchEntityType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  rank: number;
}

export const CRM_SEARCH_PERMISSION: Record<CrmSearchEntityType, string> = {
  lead: 'leads:view',
  contact: 'contacts:view',
  company: 'companies:view',
  customer_party: 'customers:view',
  deal: 'deals:view',
  quote: 'quotes:view',
  invoice: 'invoices:view',
  payment: 'payments:view',
  task: 'tasks:view',
};

/** Escape LIKE wildcards and backslash for ILIKE patterns. */
export function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function likeContains(q: string): string {
  return `%${escapeLikePattern(q)}%`;
}

function rankExpr(column: string, q: string) {
  const exact = q.toLowerCase();
  const prefix = `${escapeLikePattern(exact)}%`;
  return sql<number>`CASE
    WHEN lower(${sql.ref(column)}) = ${exact} THEN 0
    WHEN lower(${sql.ref(column)}) LIKE ${prefix} ESCAPE '\\' THEN 1
    ELSE 2
  END`;
}

function sortHits(hits: CrmSearchHit[]): CrmSearchHit[] {
  return hits.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const t = a.title.localeCompare(b.title);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

async function searchLeads(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('leads')
    .select([
      'id',
      'name',
      'email',
      'company_name',
      rankExpr('name', q).as('rank'),
    ])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('name', 'ilike', pattern),
        eb('email', 'ilike', pattern),
        eb('company_name', 'ilike', pattern),
        eb('phone', 'ilike', pattern),
      ]),
    )
    .orderBy('rank', 'asc')
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'lead' as const,
      id: r.id,
      title: r.name,
      subtitle: r.email ?? r.company_name ?? null,
      href: hrefMode === 'unified' ? `/crm/records/lead:${r.id}` : '/crm/leads',
      rank: Number(r.rank),
    })),
  );
}

async function searchContacts(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('contacts')
    .select(['id', 'name', 'email', rankExpr('name', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where((eb) => eb.or([eb('name', 'ilike', pattern), eb('email', 'ilike', pattern)]))
    .orderBy('rank', 'asc')
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  const partyByContact = new Map<string, string>();
  if (hrefMode === 'unified' && rows.length > 0) {
    const parties = await db
      .selectFrom('customer_parties')
      .select(['id', 'party_id'])
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .where('party_type', '=', 'contact')
      .where(
        'party_id',
        'in',
        rows.map((r) => r.id),
      )
      .execute();
    for (const p of parties) partyByContact.set(p.party_id, p.id);
  }

  return sortHits(
    rows.map((r) => {
      const partyId = partyByContact.get(r.id);
      return {
        entity_type: 'contact' as const,
        id: r.id,
        title: r.name,
        subtitle: r.email,
        href:
          hrefMode === 'unified' && partyId
            ? `/crm/records/party:${partyId}`
            : `/crm/contacts?focus=${encodeURIComponent(r.id)}`,
        rank: Number(r.rank),
      };
    }),
  );
}

async function searchCompanies(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('companies')
    .select(['id', 'name', rankExpr('name', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('name', 'ilike', pattern)
    .orderBy('rank', 'asc')
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  const partyByCompany = new Map<string, string>();
  if (hrefMode === 'unified' && rows.length > 0) {
    const parties = await db
      .selectFrom('customer_parties')
      .select(['id', 'party_id'])
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .where('party_type', '=', 'company')
      .where(
        'party_id',
        'in',
        rows.map((r) => r.id),
      )
      .execute();
    for (const p of parties) partyByCompany.set(p.party_id, p.id);
  }

  return sortHits(
    rows.map((r) => {
      const partyId = partyByCompany.get(r.id);
      return {
        entity_type: 'company' as const,
        id: r.id,
        title: r.name,
        subtitle: null,
        href:
          hrefMode === 'unified' && partyId
            ? `/crm/records/party:${partyId}`
            : '/crm/companies',
        rank: Number(r.rank),
      };
    }),
  );
}

async function searchCustomerParties(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('customer_parties')
    .select(['id', 'display_name', 'party_type', rankExpr('display_name', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', '!=', 'merged')
    .where('display_name', 'ilike', pattern)
    .orderBy('rank', 'asc')
    .orderBy('display_name', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'customer_party' as const,
      id: r.id,
      title: r.display_name,
      subtitle: r.party_type,
      href:
        hrefMode === 'unified'
          ? `/crm/records/party:${r.id}`
          : `/crm/customer-parties/${r.id}`,
      rank: Number(r.rank),
    })),
  );
}

async function searchDeals(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('deals')
    .select(['id', 'name', 'status', rankExpr('name', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('name', 'ilike', pattern)
    .orderBy('rank', 'asc')
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'deal' as const,
      id: r.id,
      title: r.name,
      subtitle: r.status,
      href: hrefMode === 'unified' ? `/crm/records/deal:${r.id}` : `/crm/deals/${r.id}`,
      rank: Number(r.rank),
    })),
  );
}

async function searchQuotes(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  _hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('quotes')
    .select(['id', 'quote_number', 'status', rankExpr('quote_number', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('quote_number', 'ilike', pattern)
    .orderBy('rank', 'asc')
    .orderBy('quote_number', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'quote' as const,
      id: r.id,
      title: r.quote_number,
      subtitle: r.status,
      href: `/crm/quotes/${r.id}`,
      rank: Number(r.rank),
    })),
  );
}

async function searchInvoices(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  _hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('invoices')
    .select(['id', 'invoice_number', 'status', rankExpr('invoice_number', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('invoice_number', 'ilike', pattern)
    .orderBy('rank', 'asc')
    .orderBy('invoice_number', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'invoice' as const,
      id: r.id,
      title: r.invoice_number,
      subtitle: r.status,
      href: `/finance/invoices/${r.id}`,
      rank: Number(r.rank),
    })),
  );
}

async function searchPayments(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  _hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const exact = q.toLowerCase();
  const prefix = `${escapeLikePattern(exact)}%`;
  const rows = await db
    .selectFrom('payments as p')
    .leftJoin('invoices as i', (join) =>
      join.onRef('i.id', '=', 'p.invoice_id').on('i.workspace_id', '=', workspaceId),
    )
    .select([
      'p.id',
      'p.payment_number',
      'p.amount',
      'i.invoice_number',
      sql<number>`CASE
        WHEN lower(p.payment_number) = ${exact} THEN 0
        WHEN lower(p.payment_number) LIKE ${prefix} ESCAPE '\\' THEN 1
        ELSE 2
      END`.as('rank'),
    ])
    .where('p.workspace_id', '=', workspaceId)
    .where('p.deleted_at', 'is', null)
    .where((eb) =>
      eb.or([
        eb('p.payment_number', 'ilike', pattern),
        eb('i.invoice_number', 'ilike', pattern),
      ]),
    )
    .orderBy('rank', 'asc')
    .orderBy('p.payment_number', 'asc')
    .orderBy('p.id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'payment' as const,
      id: r.id,
      title: r.payment_number,
      subtitle: r.invoice_number ? `${r.invoice_number} · ${r.amount}` : String(r.amount),
      href: '/finance/payments',
      rank: Number(r.rank),
    })),
  );
}

async function searchTasks(
  db: Kysely<Database>,
  workspaceId: string,
  q: string,
  limit: number,
  _hrefMode: CrmSearchHrefMode,
): Promise<CrmSearchHit[]> {
  const pattern = likeContains(q);
  const rows = await db
    .selectFrom('tasks')
    .select(['id', 'title', 'status', rankExpr('title', q).as('rank')])
    .where('workspace_id', '=', workspaceId)
    .where('title', 'ilike', pattern)
    .orderBy('rank', 'asc')
    .orderBy('title', 'asc')
    .orderBy('id', 'asc')
    .limit(limit)
    .execute();

  return sortHits(
    rows.map((r) => ({
      entity_type: 'task' as const,
      id: r.id,
      title: r.title,
      subtitle: r.status,
      href: '/crm/tasks',
      rank: Number(r.rank),
    })),
  );
}

const SEARCHERS: Record<
  CrmSearchEntityType,
  (
    db: Kysely<Database>,
    workspaceId: string,
    q: string,
    limit: number,
    hrefMode: CrmSearchHrefMode,
  ) => Promise<CrmSearchHit[]>
> = {
  lead: searchLeads,
  contact: searchContacts,
  company: searchCompanies,
  customer_party: searchCustomerParties,
  deal: searchDeals,
  quote: searchQuotes,
  invoice: searchInvoices,
  payment: searchPayments,
  task: searchTasks,
};

export async function runCrmSearch(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    q: string;
    types: CrmSearchEntityType[];
    limit: number;
    permitted: Set<CrmSearchEntityType>;
    recordHrefMode?: CrmSearchHrefMode;
  },
): Promise<{ results: CrmSearchHit[]; counts: Partial<Record<CrmSearchEntityType, number>> }> {
  const hrefMode = opts.recordHrefMode ?? 'legacy';
  const enabled = opts.types.filter((t) => opts.permitted.has(t));
  const settled = await Promise.all(
    enabled.map(async (type) => {
      const hits = await SEARCHERS[type](db, opts.workspaceId, opts.q, opts.limit, hrefMode);
      return { type, hits };
    }),
  );

  const byType = new Map(settled.map((s) => [s.type, s.hits]));
  const results: CrmSearchHit[] = [];
  const counts: Partial<Record<CrmSearchEntityType, number>> = {};

  for (const type of CRM_SEARCH_TYPE_ORDER) {
    const hits = byType.get(type);
    if (!hits) continue;
    counts[type] = hits.length;
    results.push(...hits);
  }

  return { results, counts };
}

export function parseCrmSearchTypes(raw: string | undefined): CrmSearchEntityType[] {
  if (!raw?.trim()) return [...CRM_SEARCH_TYPE_ORDER];
  const allowed = new Set<string>(CRM_SEARCH_TYPE_ORDER);
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is CrmSearchEntityType => allowed.has(s));
  return parsed.length > 0 ? parsed : [...CRM_SEARCH_TYPE_ORDER];
}
