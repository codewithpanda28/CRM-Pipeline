/**
 * Phase 5 — ensure default COA + current fiscal year period exist.
 */
import type { DbOrTx } from '@vencore/events';
import { DEFAULT_COA, type ControlKey } from './coa';

export async function ensureDefaultChartOfAccounts(
  db: DbOrTx,
  workspaceId: string,
): Promise<void> {
  const existing = await db
    .selectFrom('accounts')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .limit(1)
    .executeTakeFirst();
  if (existing) return;

  const now = new Date();
  for (const row of DEFAULT_COA) {
    await db
      .insertInto('accounts')
      .values({
        workspace_id: workspaceId,
        code: row.code,
        name: row.name,
        account_type: row.account_type,
        is_control: row.is_control,
        control_key: row.control_key,
        is_system: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) => oc.columns(['workspace_id', 'code']).doNothing())
      .execute();
  }
}

export async function getControlAccount(
  db: DbOrTx,
  workspaceId: string,
  controlKey: ControlKey,
) {
  await ensureDefaultChartOfAccounts(db, workspaceId);
  const row = await db
    .selectFrom('accounts')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('control_key', '=', controlKey)
    .where('is_active', '=', true)
    .executeTakeFirst();
  if (!row) throw new Error(`Missing control account: ${controlKey}`);
  return row;
}

export async function listAccounts(
  db: DbOrTx,
  workspaceId: string,
  opts?: { includeInactive?: boolean },
) {
  await ensureDefaultChartOfAccounts(db, workspaceId);
  let q = db.selectFrom('accounts').selectAll().where('workspace_id', '=', workspaceId);
  if (!opts?.includeInactive) q = q.where('is_active', '=', true);
  return q.orderBy('code', 'asc').execute();
}

export async function createAccount(
  db: DbOrTx,
  input: {
    workspaceId: string;
    code: string;
    name: string;
    account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    description?: string | null;
    parent_id?: string | null;
  },
) {
  await ensureDefaultChartOfAccounts(db, input.workspaceId);
  const now = new Date();
  const row = await db
    .insertInto('accounts')
    .values({
      workspace_id: input.workspaceId,
      code: input.code.trim(),
      name: input.name.trim(),
      account_type: input.account_type,
      is_control: false,
      control_key: null,
      is_system: false,
      is_active: true,
      parent_id: input.parent_id ?? null,
      description: input.description ?? null,
      created_at: now,
      updated_at: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row;
}

export async function updateAccount(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    patch: { name?: string; description?: string | null; is_active?: boolean };
  },
) {
  const existing = await db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!existing) return null;
  return (
    (await db
      .updateTable('accounts')
      .set({
        ...(opts.patch.name !== undefined ? { name: opts.patch.name.trim() } : {}),
        ...(opts.patch.description !== undefined ? { description: opts.patch.description } : {}),
        ...(opts.patch.is_active !== undefined ? { is_active: opts.patch.is_active } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .returningAll()
      .executeTakeFirst()) ?? null
  );
}
