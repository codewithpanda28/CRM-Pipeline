import type { Insertable, Updateable } from 'kysely';
import type { Database, Deal } from '@vencore/db';
import type { DbOrTx } from '@vencore/events';
import { dealToFieldValues, mapFieldValuesToDeal, statusFromStageFlags } from './field-map';
import { parseMoneyAmount, normalizeCurrency } from './money';
import { loadStageFlags, resolveFallbackOwner } from './integrity';
import { attachCustomerPartyToDeal, ensureCustomerPartyOnDealWon } from './customer-party';

type DealInsert = Insertable<Database['deals']>;
type DealUpdate = Updateable<Database['deals']>;

/** Upsert Deal from a pipeline_item row (same TX as item mutation). */
export async function upsertDealFromPipelineItem(
  trx: DbOrTx,
  opts: {
    item: {
      id: string;
      workspace_id: string;
      pipeline_id: string;
      stage_id: string;
      field_values: Record<string, unknown> | null;
      deleted_at?: Date | null;
      created_at?: Date;
      updated_at?: Date;
    };
    actorUserId?: string;
  },
): Promise<Deal> {
  const flags = await loadStageFlags(trx, {
    workspaceId: opts.item.workspace_id,
    stageId: opts.item.stage_id,
  });
  const mapped = mapFieldValuesToDeal(opts.item.field_values, {
    fallbackOwnerId: opts.actorUserId,
  });
  const ownerId =
    (await resolveFallbackOwner(trx, opts.item.workspace_id, mapped.owner_id ?? opts.actorUserId)) ??
    opts.actorUserId;
  if (!ownerId) {
    throw new Error('DEAL_OWNER_REQUIRED');
  }

  const status = statusFromStageFlags(Boolean(flags?.is_won), Boolean(flags?.is_lost));
  const now = new Date();

  const existing = await trx
    .selectFrom('deals')
    .select(['id', 'customer_party_id'])
    .where('id', '=', opts.item.id)
    .executeTakeFirst();

  // Attach party on create; preserve existing party on update (dual-write safe).
  let customerPartyId: string | null = existing?.customer_party_id ?? null;
  if (!existing) {
    const attached = await attachCustomerPartyToDeal(trx, {
      workspaceId: opts.item.workspace_id,
      dealId: opts.item.id,
      companyId: mapped.company_id,
      primaryContactId: mapped.primary_contact_id,
    });
    if (attached.ok) {
      customerPartyId = attached.customerPartyId;
    }
  }

  const values: DealInsert = {
    id: opts.item.id,
    workspace_id: opts.item.workspace_id,
    pipeline_id: opts.item.pipeline_id,
    stage_id: opts.item.stage_id,
    name: mapped.name,
    owner_id: ownerId,
    amount: mapped.amount,
    currency: mapped.currency,
    probability: mapped.probability,
    expected_close_at: mapped.expected_close_at,
    source: mapped.source,
    primary_contact_id: mapped.primary_contact_id,
    company_id: mapped.company_id,
    customer_party_id: customerPartyId,
    status,
    won_at: status === 'won' ? now : null,
    lost_at: status === 'lost' ? now : null,
    lost_reason: null,
    custom_fields: mapped.custom_fields as never,
    source_pipeline_item_id: opts.item.id,
    deleted_at: opts.item.deleted_at ?? null,
    updated_at: now,
  };

  if (existing) {
    const patch: DealUpdate = {
      pipeline_id: values.pipeline_id,
      stage_id: values.stage_id,
      name: values.name,
      owner_id: values.owner_id,
      amount: values.amount,
      currency: values.currency,
      probability: values.probability,
      expected_close_at: values.expected_close_at,
      source: values.source,
      primary_contact_id: values.primary_contact_id,
      company_id: values.company_id,
      status: values.status,
      won_at: values.won_at,
      lost_at: values.lost_at,
      custom_fields: values.custom_fields,
      deleted_at: values.deleted_at,
      updated_at: now,
    };
    let row = await trx
      .updateTable('deals')
      .set(patch)
      .where('id', '=', opts.item.id)
      .where('workspace_id', '=', opts.item.workspace_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const wonParty = await ensureCustomerPartyOnDealWon(trx, row);
    return wonParty.deal as Deal;
  }

  return trx.insertInto('deals').values(values).returningAll().executeTakeFirstOrThrow();
}

/** Soft-delete Deal when pipeline item is deleted. */
export async function softDeleteDealProjection(
  trx: DbOrTx,
  opts: { workspaceId: string; dealId: string },
): Promise<void> {
  await trx
    .updateTable('deals')
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where('id', '=', opts.dealId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .execute();
}

/** Project Deal → pipeline_items (compatibility). Same id. */
export async function upsertPipelineItemFromDeal(
  trx: DbOrTx,
  deal: Deal,
  opts?: { position?: number },
): Promise<void> {
  const fieldValues = dealToFieldValues({
    name: deal.name,
    owner_id: deal.owner_id,
    amount: deal.amount,
    currency: deal.currency,
    probability: deal.probability,
    expected_close_at: deal.expected_close_at,
    source: deal.source,
    primary_contact_id: deal.primary_contact_id,
    company_id: deal.company_id,
    custom_fields: deal.custom_fields as Record<string, unknown>,
  });

  const existing = await trx
    .selectFrom('pipeline_items')
    .select('id')
    .where('id', '=', deal.id)
    .executeTakeFirst();

  if (existing) {
    await trx
      .updateTable('pipeline_items')
      .set({
        pipeline_id: deal.pipeline_id,
        stage_id: deal.stage_id,
        field_values: fieldValues as never,
        deleted_at: deal.deleted_at,
        updated_at: new Date(),
      })
      .where('id', '=', deal.id)
      .where('workspace_id', '=', deal.workspace_id)
      .execute();
    return;
  }

  await trx
    .insertInto('pipeline_items')
    .values({
      id: deal.id,
      pipeline_id: deal.pipeline_id,
      stage_id: deal.stage_id,
      workspace_id: deal.workspace_id,
      position: opts?.position ?? 0,
      field_values: fieldValues as never,
      deleted_at: deal.deleted_at,
    })
    .execute();
}

export function normalizeDealPatch(body: {
  name?: string;
  owner_id?: string;
  amount?: unknown;
  currency?: string;
  probability?: number;
  expected_close_at?: string | null;
  source?: string | null;
  primary_contact_id?: string | null;
  company_id?: string | null;
  customer_party_id?: string | null;
  custom_fields?: Record<string, unknown>;
  lost_reason?: string | null;
}): DealUpdate {
  const patch: DealUpdate = { updated_at: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.owner_id !== undefined) patch.owner_id = body.owner_id;
  if (body.amount !== undefined) patch.amount = parseMoneyAmount(body.amount);
  if (body.currency !== undefined) patch.currency = normalizeCurrency(body.currency);
  if (body.probability !== undefined) {
    patch.probability = Math.max(0, Math.min(100, Math.round(body.probability)));
  }
  if (body.expected_close_at !== undefined) {
    patch.expected_close_at = body.expected_close_at ? new Date(body.expected_close_at) : null;
  }
  if (body.source !== undefined) patch.source = body.source;
  if (body.primary_contact_id !== undefined) patch.primary_contact_id = body.primary_contact_id;
  if (body.company_id !== undefined) patch.company_id = body.company_id;
  if (body.customer_party_id !== undefined) patch.customer_party_id = body.customer_party_id;
  if (body.custom_fields !== undefined) patch.custom_fields = body.custom_fields as never;
  if (body.lost_reason !== undefined) patch.lost_reason = body.lost_reason;
  return patch;
}
