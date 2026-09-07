/**
 * Product CRUD domain helpers.
 */
import type { DbOrTx } from '@vencore/events';
import type { ProductKind, ProductBillingModel } from '@vencore/db';
import { parseMoneyAmount, normalizeCurrency, DEFAULT_CURRENCY } from '../crm-money';

export type ProductFail =
  | 'not_found'
  | 'deleted'
  | 'sku_conflict'
  | 'validation';

export async function getProduct(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; includeDeleted?: boolean },
) {
  let q = db
    .selectFrom('products')
    .selectAll()
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId);
  if (!opts.includeDeleted) q = q.where('deleted_at', 'is', null);
  return q.executeTakeFirst() ?? null;
}

export async function findProductBySku(
  db: DbOrTx,
  opts: { workspaceId: string; sku: string; excludeId?: string },
) {
  let q = db
    .selectFrom('products')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('sku', '=', opts.sku)
    .where('deleted_at', 'is', null);
  if (opts.excludeId) q = q.where('id', '<>', opts.excludeId);
  return q.executeTakeFirst() ?? null;
}

export interface CreateProductInput {
  workspaceId: string;
  kind: ProductKind;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  unit?: string;
  list_price?: unknown;
  currency?: unknown;
  cost?: unknown;
  tax_category_code?: string | null;
  tax_metadata?: Record<string, unknown>;
  billing_model?: ProductBillingModel | null;
  is_active?: boolean;
  custom_fields?: Record<string, unknown>;
  created_by?: string | null;
}

export async function createProduct(
  db: DbOrTx,
  input: CreateProductInput,
): Promise<{ ok: true; product: Awaited<ReturnType<typeof getProduct>> } | { ok: false; fail: ProductFail; message?: string }> {
  const sku = input.sku.trim();
  if (!sku || !input.name.trim()) {
    return { ok: false, fail: 'validation', message: 'sku and name required' };
  }
  const existing = await findProductBySku(db, { workspaceId: input.workspaceId, sku });
  if (existing) return { ok: false, fail: 'sku_conflict' };

  try {
    const row = await db
      .insertInto('products')
      .values({
        workspace_id: input.workspaceId,
        kind: input.kind,
        sku,
        name: input.name.trim(),
        description: input.description ?? null,
        category: input.category ?? null,
        unit: input.unit?.trim() || 'each',
        list_price: parseMoneyAmount(input.list_price ?? 0),
        currency: normalizeCurrency(input.currency ?? DEFAULT_CURRENCY),
        cost: input.cost != null && input.cost !== '' ? parseMoneyAmount(input.cost) : null,
        tax_category_code: input.tax_category_code ?? null,
        tax_metadata: input.tax_metadata ?? {},
        billing_model: input.billing_model ?? null,
        is_active: input.is_active ?? true,
        custom_fields: input.custom_fields ?? {},
        created_by: input.created_by ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { ok: true, product: row };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') return { ok: false, fail: 'sku_conflict' };
    throw err;
  }
}

export async function updateProduct(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    patch: Partial<{
      kind: ProductKind;
      sku: string;
      name: string;
      description: string | null;
      category: string | null;
      unit: string;
      list_price: unknown;
      currency: unknown;
      cost: unknown;
      tax_category_code: string | null;
      tax_metadata: Record<string, unknown>;
      billing_model: ProductBillingModel | null;
      is_active: boolean;
      custom_fields: Record<string, unknown>;
    }>;
  },
): Promise<{ ok: true; product: NonNullable<Awaited<ReturnType<typeof getProduct>>> } | { ok: false; fail: ProductFail }> {
  const existing = await getProduct(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!existing) return { ok: false, fail: 'not_found' };

  if (opts.patch.sku != null) {
    const sku = opts.patch.sku.trim();
    const conflict = await findProductBySku(db, {
      workspaceId: opts.workspaceId,
      sku,
      excludeId: opts.id,
    });
    if (conflict) return { ok: false, fail: 'sku_conflict' };
  }

  const values: Record<string, unknown> = { updated_at: new Date() };
  const p = opts.patch;
  if (p.kind !== undefined) values.kind = p.kind;
  if (p.sku !== undefined) values.sku = p.sku.trim();
  if (p.name !== undefined) values.name = p.name.trim();
  if (p.description !== undefined) values.description = p.description;
  if (p.category !== undefined) values.category = p.category;
  if (p.unit !== undefined) values.unit = p.unit.trim() || 'each';
  if (p.list_price !== undefined) values.list_price = parseMoneyAmount(p.list_price);
  if (p.currency !== undefined) values.currency = normalizeCurrency(p.currency);
  if (p.cost !== undefined) {
    values.cost = p.cost != null && p.cost !== '' ? parseMoneyAmount(p.cost) : null;
  }
  if (p.tax_category_code !== undefined) values.tax_category_code = p.tax_category_code;
  if (p.tax_metadata !== undefined) values.tax_metadata = p.tax_metadata;
  if (p.billing_model !== undefined) values.billing_model = p.billing_model;
  if (p.is_active !== undefined) values.is_active = p.is_active;
  if (p.custom_fields !== undefined) values.custom_fields = p.custom_fields;

  const row = await db
    .updateTable('products')
    .set(values)
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();

  if (!row) return { ok: false, fail: 'not_found' };
  return { ok: true, product: row };
}

export async function softDeleteProduct(
  db: DbOrTx,
  opts: { workspaceId: string; id: string },
): Promise<{ ok: true } | { ok: false; fail: ProductFail }> {
  const row = await db
    .updateTable('products')
    .set({ deleted_at: new Date(), updated_at: new Date(), is_active: false })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .returning('id')
    .executeTakeFirst();
  if (!row) return { ok: false, fail: 'not_found' };
  return { ok: true };
}

export * from './events';
