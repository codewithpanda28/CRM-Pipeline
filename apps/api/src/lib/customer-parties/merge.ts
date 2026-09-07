/**
 * Admin merge of CustomerParties (Phase 3A.3).
 * Explicit source→target, same TX, never silent.
 */
import type { DbOrTx } from '@vencore/events';
import { getCustomerParty } from './ensure';
import { onCustomerPartyMerged } from './events';

export type MergeCustomerPartyFail =
  | 'not_found'
  | 'same_party'
  | 'cross_tenant'
  | 'source_merged'
  | 'target_merged'
  | 'target_deleted'
  | 'source_deleted';

export async function mergeCustomerParties(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    sourcePartyId: string;
    targetPartyId: string;
    reason: string;
    actorUserId: string | null;
  },
): Promise<
  | { ok: true; survivorId: string; sourceId: string }
  | { ok: false; fail: MergeCustomerPartyFail }
> {
  const reason = opts.reason.trim();
  if (!reason) {
    throw Object.assign(new Error('reason required'), { code: 'INVALID_REASON', status: 400 });
  }
  if (opts.sourcePartyId === opts.targetPartyId) {
    return { ok: false, fail: 'same_party' };
  }

  const source = await getCustomerParty(db, {
    workspaceId: opts.workspaceId,
    id: opts.sourcePartyId,
    includeDeleted: true,
  });
  const target = await getCustomerParty(db, {
    workspaceId: opts.workspaceId,
    id: opts.targetPartyId,
    includeDeleted: true,
  });

  if (!source || !target) return { ok: false, fail: 'not_found' };
  if (source.deleted_at != null) return { ok: false, fail: 'source_deleted' };
  if (target.deleted_at != null) return { ok: false, fail: 'target_deleted' };
  if (source.status === 'merged') return { ok: false, fail: 'source_merged' };
  if (target.status === 'merged') return { ok: false, fail: 'target_merged' };

  const snapshot = {
    source: {
      id: source.id,
      party_type: source.party_type,
      party_id: source.party_id,
      display_name: source.display_name,
      status: source.status,
    },
    target: {
      id: target.id,
      party_type: target.party_type,
      party_id: target.party_id,
      display_name: target.display_name,
      status: target.status,
    },
    reason,
  };

  // Repoint Deal.customer_party_id
  await db
    .updateTable('deals')
    .set({ customer_party_id: target.id, updated_at: new Date() })
    .where('workspace_id', '=', opts.workspaceId)
    .where('customer_party_id', '=', source.id)
    .where('deleted_at', 'is', null)
    .execute();

  // Preserve Lead conversion lineage: rewrite customer_party link entity_id → survivor
  await db
    .updateTable('lead_conversion_links')
    .set({ entity_id: target.id })
    .where('workspace_id', '=', opts.workspaceId)
    .where('entity_type', '=', 'customer_party')
    .where('entity_id', '=', source.id)
    .execute();

  await db
    .updateTable('customer_parties')
    .set({
      status: 'merged',
      merged_into_id: target.id,
      updated_at: new Date(),
    })
    .where('id', '=', source.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  await db
    .insertInto('customer_party_merge_events')
    .values({
      workspace_id: opts.workspaceId,
      from_party_id: source.id,
      into_party_id: target.id,
      actor_user_id: opts.actorUserId,
      reason,
      snapshot: snapshot as never,
    })
    .execute();

  await onCustomerPartyMerged(db, {
    workspaceId: opts.workspaceId,
    fromPartyId: source.id,
    intoPartyId: target.id,
    reason,
  });

  return { ok: true, survivorId: target.id, sourceId: source.id };
}
