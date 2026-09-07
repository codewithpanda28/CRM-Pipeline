/**
 * Phase 5 — immutable posted journals (balanced debit == credit).
 */
import { randomUUID } from 'crypto';
import type { DbOrTx } from '@vencore/events';
import { addMoney, moneyToNumber, roundMoneyHalfUp } from '../crm-money';
import { resolvePeriodForDate } from './periods';

export type JournalFail =
  | 'unbalanced'
  | 'period_locked'
  | 'period_closed'
  | 'no_period'
  | 'empty_lines'
  | 'not_found'
  | 'already_reversed'
  | 'not_posted'
  | 'invalid_line';

export interface JournalLineInput {
  account_id: string;
  debit?: string;
  credit?: string;
  description?: string | null;
  party_type?: string | null;
  party_id?: string | null;
}

async function nextEntryNumber(db: DbOrTx, workspaceId: string): Promise<string> {
  const row = await db
    .selectFrom('journal_entries')
    .select(({ fn }) => fn.countAll<string>().as('c'))
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();
  const n = Number(row?.c ?? 0) + 1;
  return `JE-${String(n).padStart(6, '0')}`;
}

function normalizeLines(lines: JournalLineInput[]): Array<JournalLineInput & { debit: string; credit: string }> {
  return lines.map((l) => {
    const debit = roundMoneyHalfUp(moneyToNumber(l.debit ?? '0'));
    const credit = roundMoneyHalfUp(moneyToNumber(l.credit ?? '0'));
    return { ...l, debit, credit };
  });
}

export async function postJournal(
  db: DbOrTx,
  input: {
    workspaceId: string;
    entryDate: string;
    memo?: string | null;
    sourceType: string;
    sourceId?: string | null;
    postingKey: string;
    currency?: string;
    actorId?: string | null;
    lines: JournalLineInput[];
    /** Allow posting into soft_closed periods (reversals). */
    allowSoftClosed?: boolean;
  },
): Promise<
  | {
      ok: true;
      entry: Awaited<ReturnType<typeof getJournalEntry>>;
      lines: Awaited<ReturnType<typeof getJournalLines>>;
      idempotent?: boolean;
    }
  | { ok: false; fail: JournalFail; message?: string }
> {
  const existing = await db
    .selectFrom('journal_entries')
    .selectAll()
    .where('workspace_id', '=', input.workspaceId)
    .where('posting_key', '=', input.postingKey)
    .executeTakeFirst();
  if (existing) {
    const lines = await getJournalLines(db, { workspaceId: input.workspaceId, entryId: existing.id });
    return { ok: true, entry: existing, lines, idempotent: true };
  }

  const normalized = normalizeLines(input.lines);
  if (normalized.length === 0) return { ok: false, fail: 'empty_lines' };

  let debitTotal = '0.00';
  let creditTotal = '0.00';
  for (const l of normalized) {
    if (moneyToNumber(l.debit) > 0 && moneyToNumber(l.credit) > 0) {
      return { ok: false, fail: 'invalid_line', message: 'Line cannot have both debit and credit' };
    }
    if (moneyToNumber(l.debit) <= 0 && moneyToNumber(l.credit) <= 0) {
      return { ok: false, fail: 'invalid_line', message: 'Line must have debit or credit' };
    }
    debitTotal = addMoney(debitTotal, l.debit);
    creditTotal = addMoney(creditTotal, l.credit);
  }
  if (debitTotal !== creditTotal) {
    return { ok: false, fail: 'unbalanced', message: `Debits ${debitTotal} != credits ${creditTotal}` };
  }

  // Tenant-scope account IDs — reject foreign/missing accounts.
  const accountIds = [...new Set(normalized.map((l) => l.account_id))];
  const owned = await db
    .selectFrom('accounts')
    .select(['id'])
    .where('workspace_id', '=', input.workspaceId)
    .where('id', 'in', accountIds)
    .where('is_active', '=', true)
    .execute();
  if (owned.length !== accountIds.length) {
    return { ok: false, fail: 'invalid_line', message: 'Account not found in workspace' };
  }

  const periodRes = await resolvePeriodForDate(db, input.workspaceId, input.entryDate);
  if (!periodRes.ok) {
    if (periodRes.reason === 'locked') return { ok: false, fail: 'period_locked' };
    return { ok: false, fail: 'no_period' };
  }
  if (periodRes.period.status === 'soft_closed' && !input.allowSoftClosed) {
    return { ok: false, fail: 'period_closed' };
  }

  const now = new Date();
  const entryNumber = await nextEntryNumber(db, input.workspaceId);
  const entryId = randomUUID();

  try {
    await db
      .insertInto('journal_entries')
      .values({
        id: entryId,
        workspace_id: input.workspaceId,
        entry_number: entryNumber,
        entry_date: input.entryDate,
        period_id: periodRes.period.id,
        status: 'posted',
        memo: input.memo ?? null,
        source_type: input.sourceType,
        source_id: input.sourceId ?? null,
        posting_key: input.postingKey,
        currency: (input.currency ?? 'INR').toUpperCase(),
        posted_at: now,
        posted_by: input.actorId ?? null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  } catch (err: unknown) {
    // Race on posting_key unique
    const raced = await db
      .selectFrom('journal_entries')
      .selectAll()
      .where('workspace_id', '=', input.workspaceId)
      .where('posting_key', '=', input.postingKey)
      .executeTakeFirst();
    if (raced) {
      const lines = await getJournalLines(db, { workspaceId: input.workspaceId, entryId: raced.id });
      return { ok: true, entry: raced, lines, idempotent: true };
    }
    throw err;
  }

  for (let i = 0; i < normalized.length; i++) {
    const l = normalized[i]!;
    await db
      .insertInto('journal_lines')
      .values({
        workspace_id: input.workspaceId,
        journal_entry_id: entryId,
        line_no: i + 1,
        account_id: l.account_id,
        description: l.description ?? null,
        debit: l.debit,
        credit: l.credit,
        party_type: l.party_type ?? null,
        party_id: l.party_id ?? null,
        created_at: now,
      })
      .execute();
  }

  const entry = await getJournalEntry(db, { workspaceId: input.workspaceId, id: entryId });
  const lines = await getJournalLines(db, { workspaceId: input.workspaceId, entryId });
  return { ok: true, entry: entry!, lines };
}

export async function getJournalEntry(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('journal_entries')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .executeTakeFirst()) ?? null
  );
}

export async function getJournalLines(db: DbOrTx, opts: { workspaceId: string; entryId: string }) {
  return db
    .selectFrom('journal_lines')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('journal_entry_id', '=', opts.entryId)
    .orderBy('line_no', 'asc')
    .execute();
}

export async function listJournalEntries(
  db: DbOrTx,
  opts: { workspaceId: string; limit?: number; offset?: number },
) {
  return db
    .selectFrom('journal_entries')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .orderBy('entry_date', 'desc')
    .orderBy('created_at', 'desc')
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0)
    .execute();
}

/** Reverse a posted journal by creating an opposite entry (never edits lines). */
export async function reverseJournal(
  db: DbOrTx,
  opts: { workspaceId: string; entryId: string; actorId?: string | null; memo?: string | null },
): Promise<
  | { ok: true; original: NonNullable<Awaited<ReturnType<typeof getJournalEntry>>>; reversal: NonNullable<Awaited<ReturnType<typeof getJournalEntry>>> }
  | { ok: false; fail: JournalFail }
> {
  const original = await getJournalEntry(db, { workspaceId: opts.workspaceId, id: opts.entryId });
  if (!original) return { ok: false, fail: 'not_found' };
  if (original.status === 'reversed') return { ok: false, fail: 'already_reversed' };
  if (original.status !== 'posted') return { ok: false, fail: 'not_posted' };

  const lines = await getJournalLines(db, { workspaceId: opts.workspaceId, entryId: opts.entryId });
  const reverseLines: JournalLineInput[] = lines.map((l) => ({
    account_id: l.account_id,
    debit: l.credit,
    credit: l.debit,
    description: l.description ? `Reversal: ${l.description}` : 'Reversal',
    party_type: l.party_type,
    party_id: l.party_id,
  }));

  const posted = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: original.entry_date,
    memo: opts.memo ?? `Reversal of ${original.entry_number}`,
    sourceType: 'reversal',
    sourceId: original.id,
    postingKey: `reversal:${original.id}`,
    currency: original.currency,
    actorId: opts.actorId,
    lines: reverseLines,
    allowSoftClosed: true,
  });
  if (!posted.ok) return { ok: false, fail: posted.fail };

  await db
    .updateTable('journal_entries')
    .set({
      status: 'reversed',
      reversed_by_entry_id: posted.entry!.id,
      updated_at: new Date(),
    })
    .where('id', '=', original.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  await db
    .updateTable('journal_entries')
    .set({
      reverses_entry_id: original.id,
      updated_at: new Date(),
    })
    .where('id', '=', posted.entry!.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  const refreshed = await getJournalEntry(db, { workspaceId: opts.workspaceId, id: original.id });
  const reversal = await getJournalEntry(db, { workspaceId: opts.workspaceId, id: posted.entry!.id });
  return { ok: true, original: refreshed!, reversal: reversal! };
}
