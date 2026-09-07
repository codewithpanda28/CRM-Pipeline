import { parseMoneyAmount, normalizeCurrency, DEFAULT_DEAL_CURRENCY } from './money';

/** Known field_values keys promoted to typed Deal columns. */
export const CANONICAL_FIELD_KEYS = [
  'name',
  'title',
  'value',
  'amount',
  'currency',
  'owner_id',
  'close_date',
  'expected_close_at',
  'source',
  'probability',
  'contact_id',
  'primary_contact_id',
  'company_id',
] as const;

export type DealStatus = 'open' | 'won' | 'lost' | 'abandoned';

export interface MappedDealFields {
  name: string;
  owner_id: string | null;
  amount: string;
  currency: string;
  probability: number;
  expected_close_at: Date | null;
  source: string | null;
  primary_contact_id: string | null;
  company_id: string | null;
  custom_fields: Record<string, unknown>;
}

function asUuid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return null;
  }
  return s.toLowerCase();
}

function asDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function asProbability(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Map pipeline_items.field_values → Deal typed columns + custom_fields remainder. */
export function mapFieldValuesToDeal(
  fieldValues: Record<string, unknown> | null | undefined,
  opts?: { fallbackOwnerId?: string },
): MappedDealFields {
  const fv = fieldValues ?? {};
  const name =
    (typeof fv['name'] === 'string' && fv['name'].trim()) ||
    (typeof fv['title'] === 'string' && fv['title'].trim()) ||
    'Untitled deal';

  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fv)) {
    if ((CANONICAL_FIELD_KEYS as readonly string[]).includes(k)) continue;
    custom[k] = v;
  }

  return {
    name,
    owner_id: asUuid(fv['owner_id']) ?? opts?.fallbackOwnerId ?? null,
    amount: parseMoneyAmount(fv['amount'] ?? fv['value']),
    currency: normalizeCurrency(fv['currency'] ?? DEFAULT_DEAL_CURRENCY),
    probability: asProbability(fv['probability']),
    expected_close_at: asDate(fv['expected_close_at'] ?? fv['close_date']),
    source: typeof fv['source'] === 'string' && fv['source'].trim() ? fv['source'].trim() : null,
    primary_contact_id: asUuid(fv['primary_contact_id'] ?? fv['contact_id']),
    company_id: asUuid(fv['company_id']),
    custom_fields: custom,
  };
}

/** Project Deal typed columns back into field_values for legacy pipeline consumers. */
export function dealToFieldValues(deal: {
  name: string;
  owner_id: string;
  amount: string | number;
  currency: string;
  probability: number;
  expected_close_at: Date | string | null;
  source: string | null;
  primary_contact_id: string | null;
  company_id: string | null;
  custom_fields: Record<string, unknown> | null;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ...(deal.custom_fields ?? {}),
    name: deal.name,
    value: parseMoneyAmount(deal.amount),
    amount: parseMoneyAmount(deal.amount),
    currency: normalizeCurrency(deal.currency),
    owner_id: deal.owner_id,
    probability: deal.probability,
  };
  if (deal.expected_close_at) {
    const iso =
      deal.expected_close_at instanceof Date
        ? deal.expected_close_at.toISOString()
        : String(deal.expected_close_at);
    base['close_date'] = iso;
    base['expected_close_at'] = iso;
  }
  if (deal.source) base['source'] = deal.source;
  if (deal.primary_contact_id) {
    base['contact_id'] = deal.primary_contact_id;
    base['primary_contact_id'] = deal.primary_contact_id;
  }
  if (deal.company_id) base['company_id'] = deal.company_id;
  return base;
}

export function statusFromStageFlags(isWon: boolean, isLost: boolean): DealStatus {
  if (isWon) return 'won';
  if (isLost) return 'lost';
  return 'open';
}
