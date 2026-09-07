import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export type LeadRelationError = 'owner' | 'contact' | 'company' | 'ok';

export async function assertLeadOwner(
  db: Kysely<Database>,
  workspaceId: string,
  ownerId: string,
): Promise<'ok' | 'owner'> {
  const row = await db
    .selectFrom('users')
    .select('id')
    .where('id', '=', ownerId)
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  return row ? 'ok' : 'owner';
}

export async function assertLeadOptionalRefs(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    contactId?: string | null;
    companyId?: string | null;
  },
): Promise<LeadRelationError> {
  if (opts.contactId) {
    const c = await db
      .selectFrom('contacts')
      .select('id')
      .where('id', '=', opts.contactId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!c) return 'contact';
  }
  if (opts.companyId) {
    const c = await db
      .selectFrom('companies')
      .select('id')
      .where('id', '=', opts.companyId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!c) return 'company';
  }
  return 'ok';
}
