/**
 * Enrich pipeline items with Deal display fields for board/list UX.
 * Additive response only — does not change Deal schema or pipeline_items storage.
 */
import type { DbOrTx } from '@vencore/events';
import { mapFieldValuesToDeal } from '../deals/field-map';

export type PipelineItemNextAction = {
  title: string;
  due_at: string | null;
};

export type PipelineItemDisplay = {
  name: string;
  amount: string;
  currency: string;
  owner_id: string | null;
  owner_name: string | null;
  company_id: string | null;
  company_name: string | null;
  customer_party_id: string | null;
  customer_name: string | null;
  expected_close_at: string | null;
  status: string | null;
  /** 0–100 from deals.probability or field_values */
  probability: number | null;
  next_action: PipelineItemNextAction | null;
  /** Soft label from field_values only — no quote/product joins in v1 */
  product_label: string | null;
};

const PRODUCT_FIELD_KEYS = [
  'product_name',
  'product',
  'service',
  'service_name',
  'sku',
  'offering',
] as const;

export function productLabelFromFieldValues(fv: Record<string, unknown> | null | undefined): string | null {
  if (!fv) return null;
  for (const key of PRODUCT_FIELD_KEYS) {
    const raw = fv[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 40);
  }
  return null;
}

function toIso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString();
  const parsed = new Date(String(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function taskSortKey(t: {
  due_at: Date | null;
  due_date: Date | null;
  created_at: Date;
}): number {
  const due = t.due_at ?? t.due_date;
  if (due) return due.getTime();
  return t.created_at.getTime() + 1e15; // undated last among incomplete
}

export async function enrichPipelineItemsWithDisplay(
  db: DbOrTx,
  opts: { workspaceId: string; items: Array<{ id: string; field_values: unknown }> },
): Promise<Map<string, PipelineItemDisplay>> {
  const out = new Map<string, PipelineItemDisplay>();
  if (!opts.items.length) return out;

  const ids = opts.items.map((i) => i.id);
  const deals = await db
    .selectFrom('deals')
    .select([
      'id',
      'name',
      'amount',
      'currency',
      'owner_id',
      'company_id',
      'customer_party_id',
      'expected_close_at',
      'status',
      'probability',
    ])
    .where('workspace_id', '=', opts.workspaceId)
    .where('id', 'in', ids)
    .where('deleted_at', 'is', null)
    .execute();

  const dealById = new Map(deals.map((d) => [d.id, d]));
  const ownerIds = [...new Set(deals.map((d) => d.owner_id).filter(Boolean))] as string[];
  const companyIds = [...new Set(deals.map((d) => d.company_id).filter(Boolean))] as string[];
  const partyIds = [...new Set(deals.map((d) => d.customer_party_id).filter(Boolean))] as string[];

  for (const item of opts.items) {
    const mapped = mapFieldValuesToDeal(item.field_values as Record<string, unknown>);
    if (mapped.owner_id) ownerIds.push(mapped.owner_id);
    if (mapped.company_id) companyIds.push(mapped.company_id);
  }

  const uniqueOwners = [...new Set(ownerIds)];
  const uniqueCompanies = [...new Set(companyIds)];
  const uniqueParties = [...new Set(partyIds)];

  const users =
    uniqueOwners.length > 0
      ? await db
          .selectFrom('users')
          .select(['id', 'name'])
          .where('workspace_id', '=', opts.workspaceId)
          .where('id', 'in', uniqueOwners)
          .execute()
      : [];
  const companies =
    uniqueCompanies.length > 0
      ? await db
          .selectFrom('companies')
          .select(['id', 'name'])
          .where('workspace_id', '=', opts.workspaceId)
          .where('id', 'in', uniqueCompanies)
          .where('deleted_at', 'is', null)
          .execute()
      : [];
  const parties =
    uniqueParties.length > 0
      ? await db
          .selectFrom('customer_parties')
          .select(['id', 'display_name'])
          .where('workspace_id', '=', opts.workspaceId)
          .where('id', 'in', uniqueParties)
          .where('deleted_at', 'is', null)
          .execute()
      : [];

  const nextByDeal = new Map<string, PipelineItemNextAction>();
  const taskRows = await db
    .selectFrom('tasks')
    .select(['title', 'due_at', 'due_date', 'related_deal_id', 'created_at', 'status'])
    .where('workspace_id', '=', opts.workspaceId)
    .where('related_deal_id', 'in', ids)
    .where('status', 'not in', ['done', 'cancelled'])
    .execute();

  const grouped = new Map<string, typeof taskRows>();
  for (const t of taskRows) {
    if (!t.related_deal_id) continue;
    const list = grouped.get(t.related_deal_id) ?? [];
    list.push(t);
    grouped.set(t.related_deal_id, list);
  }
  for (const [dealId, list] of grouped) {
    list.sort((a, b) => taskSortKey(a) - taskSortKey(b));
    const best = list[0]!;
    nextByDeal.set(dealId, {
      title: best.title.trim() || 'Task',
      due_at: toIso(best.due_at ?? best.due_date),
    });
  }

  const userName = new Map(users.map((u) => [u.id, u.name]));
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const partyName = new Map(parties.map((p) => [p.id, p.display_name]));

  for (const item of opts.items) {
    const deal = dealById.get(item.id);
    const fv = (item.field_values ?? {}) as Record<string, unknown>;
    const mapped = mapFieldValuesToDeal(fv);
    const ownerId = deal?.owner_id ?? mapped.owner_id;
    const companyId = deal?.company_id ?? mapped.company_id;
    const partyId = deal?.customer_party_id ?? null;
    const expected = deal?.expected_close_at ?? mapped.expected_close_at;
    const probability =
      deal?.probability != null
        ? Number(deal.probability)
        : fv['probability'] != null && fv['probability'] !== ''
          ? mapped.probability
          : null;

    out.set(item.id, {
      name: (deal?.name?.trim() || mapped.name || 'Untitled deal').trim(),
      amount: String(deal?.amount ?? mapped.amount ?? '0.00'),
      currency: String(deal?.currency ?? mapped.currency ?? 'INR'),
      owner_id: ownerId,
      owner_name: ownerId ? userName.get(ownerId) ?? null : null,
      company_id: companyId,
      company_name: companyId ? companyName.get(companyId) ?? null : null,
      customer_party_id: partyId,
      customer_name: partyId ? partyName.get(partyId) ?? null : null,
      expected_close_at: expected
        ? expected instanceof Date
          ? expected.toISOString()
          : String(expected)
        : null,
      status: deal?.status ?? null,
      probability: Number.isFinite(probability as number) ? (probability as number) : null,
      next_action: nextByDeal.get(item.id) ?? null,
      product_label: productLabelFromFieldValues(fv),
    });
  }

  return out;
}
