/**
 * Tenant-safe Deal relation checks. Never trust client IDs without workspace scope.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { DbOrTx } from '@vencore/events';
import { validatePartyIdentity } from '../customer-parties/ensure';

export type IntegrityFail =
  | 'pipeline'
  | 'stage'
  | 'owner'
  | 'contact'
  | 'company'
  | 'customer_party';

/**
 * Validate optional customer_party_id for Deal writes (Step 2A).
 * Requires: same workspace, not soft-deleted, not merged, identity still valid.
 */
export async function assertCustomerPartyForDeal(
  db: DbOrTx,
  opts: { workspaceId: string; customerPartyId: string },
): Promise<'ok' | 'customer_party'> {
  const party = await db
    .selectFrom('customer_parties')
    .select(['id', 'workspace_id', 'party_type', 'party_id', 'status', 'deleted_at'])
    .where('id', '=', opts.customerPartyId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();

  if (!party) return 'customer_party';
  if (party.deleted_at != null) return 'customer_party';
  if (party.status === 'merged') return 'customer_party';

  const identity = await validatePartyIdentity(db, {
    workspaceId: opts.workspaceId,
    partyType: party.party_type,
    partyId: party.party_id,
  });
  if (!identity.ok) return 'customer_party';

  return 'ok';
}

export async function assertDealRelations(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    pipelineId: string;
    stageId: string;
    ownerId: string;
    primaryContactId?: string | null;
    companyId?: string | null;
    customerPartyId?: string | null;
  },
): Promise<'ok' | IntegrityFail> {
  const pipeline = await db
    .selectFrom('pipelines')
    .select('id')
    .where('id', '=', opts.pipelineId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!pipeline) return 'pipeline';

  const stage = await db
    .selectFrom('pipeline_stages')
    .select(['id', 'is_won', 'is_lost'])
    .where('id', '=', opts.stageId)
    .where('pipeline_id', '=', opts.pipelineId)
    .executeTakeFirst();
  if (!stage) return 'stage';

  const owner = await db
    .selectFrom('users')
    .select('id')
    .where('id', '=', opts.ownerId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!owner) return 'owner';

  if (opts.primaryContactId) {
    const contact = await db
      .selectFrom('contacts')
      .select('id')
      .where('id', '=', opts.primaryContactId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!contact) return 'contact';
  }

  if (opts.companyId) {
    const company = await db
      .selectFrom('companies')
      .select('id')
      .where('id', '=', opts.companyId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!company) return 'company';
  }

  if (opts.customerPartyId) {
    return assertCustomerPartyForDeal(db, {
      workspaceId: opts.workspaceId,
      customerPartyId: opts.customerPartyId,
    });
  }

  return 'ok';
}

export async function loadStageFlags(
  db: DbOrTx,
  opts: { workspaceId: string; stageId: string },
): Promise<{ is_won: boolean; is_lost: boolean } | null> {
  const stage = await db
    .selectFrom('pipeline_stages')
    .innerJoin('pipelines', 'pipelines.id', 'pipeline_stages.pipeline_id')
    .select(['pipeline_stages.is_won', 'pipeline_stages.is_lost'])
    .where('pipeline_stages.id', '=', opts.stageId)
    .where('pipelines.workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!stage) return null;
  return { is_won: Boolean(stage.is_won), is_lost: Boolean(stage.is_lost) };
}

export async function resolveFallbackOwner(
  db: Kysely<Database> | DbOrTx,
  workspaceId: string,
  preferred?: string | null,
): Promise<string | null> {
  if (preferred) {
    const ok = await db
      .selectFrom('users')
      .select('id')
      .where('id', '=', preferred)
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst();
    if (ok) return ok.id;
  }
  const first = await db
    .selectFrom('users')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  return first?.id ?? null;
}
