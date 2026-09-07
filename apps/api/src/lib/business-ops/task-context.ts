/**
 * Resolve related CRM entity labels for Today / My Work context chips.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export type TaskContextChip = {
  type: 'lead' | 'customer' | 'deal' | 'quote' | 'invoice';
  id: string;
  label: string;
  href: string;
};

export async function enrichTasksWithContext<
  T extends {
    related_lead_id?: string | null;
    related_customer_party_id?: string | null;
    related_deal_id?: string | null;
    related_quote_id?: string | null;
    related_invoice_id?: string | null;
  },
>(
  db: Kysely<Database>,
  workspaceId: string,
  tasks: T[],
): Promise<Array<T & { context: TaskContextChip[] }>> {
  const leadIds = [...new Set(tasks.map((t) => t.related_lead_id).filter(Boolean))] as string[];
  const partyIds = [
    ...new Set(tasks.map((t) => t.related_customer_party_id).filter(Boolean)),
  ] as string[];
  const dealIds = [...new Set(tasks.map((t) => t.related_deal_id).filter(Boolean))] as string[];
  const quoteIds = [...new Set(tasks.map((t) => t.related_quote_id).filter(Boolean))] as string[];
  const invoiceIds = [
    ...new Set(tasks.map((t) => t.related_invoice_id).filter(Boolean)),
  ] as string[];

  const [leads, parties, deals, quotes, invoices] = await Promise.all([
    leadIds.length
      ? db
          .selectFrom('leads')
          .select(['id', 'name', 'company_name'])
          .where('workspace_id', '=', workspaceId)
          .where('id', 'in', leadIds)
          .execute()
      : Promise.resolve([]),
    partyIds.length
      ? db
          .selectFrom('customer_parties')
          .select(['id', 'display_name'])
          .where('workspace_id', '=', workspaceId)
          .where('id', 'in', partyIds)
          .execute()
      : Promise.resolve([]),
    dealIds.length
      ? db
          .selectFrom('deals')
          .select(['id', 'name'])
          .where('workspace_id', '=', workspaceId)
          .where('id', 'in', dealIds)
          .execute()
      : Promise.resolve([]),
    quoteIds.length
      ? db
          .selectFrom('quotes')
          .select(['id', 'quote_number'])
          .where('workspace_id', '=', workspaceId)
          .where('id', 'in', quoteIds)
          .execute()
      : Promise.resolve([]),
    invoiceIds.length
      ? db
          .selectFrom('invoices')
          .select(['id', 'invoice_number'])
          .where('workspace_id', '=', workspaceId)
          .where('id', 'in', invoiceIds)
          .execute()
      : Promise.resolve([]),
  ]);

  const leadMap = new Map(
    leads.map((l) => [l.id, l.name || l.company_name || 'Lead']),
  );
  const partyMap = new Map(parties.map((p) => [p.id, p.display_name || 'Customer']));
  const dealMap = new Map(deals.map((d) => [d.id, d.name || 'Deal']));
  const quoteMap = new Map(quotes.map((q) => [q.id, q.quote_number || 'Quote']));
  const invoiceMap = new Map(invoices.map((i) => [i.id, i.invoice_number || 'Invoice']));

  return tasks.map((t) => {
    const context: TaskContextChip[] = [];
    if (t.related_lead_id && leadMap.has(t.related_lead_id)) {
      context.push({
        type: 'lead',
        id: t.related_lead_id,
        label: leadMap.get(t.related_lead_id)!,
        href: `/crm/records/lead:${t.related_lead_id}`,
      });
    }
    if (t.related_customer_party_id && partyMap.has(t.related_customer_party_id)) {
      context.push({
        type: 'customer',
        id: t.related_customer_party_id,
        label: partyMap.get(t.related_customer_party_id)!,
        href: `/crm/records/party:${t.related_customer_party_id}`,
      });
    }
    if (t.related_deal_id && dealMap.has(t.related_deal_id)) {
      context.push({
        type: 'deal',
        id: t.related_deal_id,
        label: dealMap.get(t.related_deal_id)!,
        href: `/crm/records/deal:${t.related_deal_id}`,
      });
    }
    if (t.related_quote_id && quoteMap.has(t.related_quote_id)) {
      context.push({
        type: 'quote',
        id: t.related_quote_id,
        label: quoteMap.get(t.related_quote_id)!,
        href: `/crm/quotes/${t.related_quote_id}`,
      });
    }
    if (t.related_invoice_id && invoiceMap.has(t.related_invoice_id)) {
      context.push({
        type: 'invoice',
        id: t.related_invoice_id,
        label: invoiceMap.get(t.related_invoice_id)!,
        href: `/finance/invoices/${t.related_invoice_id}`,
      });
    }
    return { ...t, context };
  });
}
