/**
 * Expenses CRUD (expenses-first AP — D4, no vendor_bills).
 */
import { randomUUID } from 'crypto';
import type { DbOrTx } from '@vencore/events';
import type { ExpensePaymentStatus } from '@vencore/db';
import { normalizeCurrency, DEFAULT_CURRENCY, parseMoneyAmount, addMoney, moneyToNumber } from '../crm-money';
import { allocateFinanceNumber } from './numbering';
import { appendFinanceDomainEvent } from './events';
import { postExpense } from '../accounting/posting';
import { recordSecurityAudit } from '../security-audit';
import { getFinanceProfile } from './profile';
import { getVendor } from './vendors';

export type ExpenseFail = 'not_found' | 'validation' | 'vendor_invalid';

export async function getExpense(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('expenses')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

export async function createExpense(
  db: DbOrTx,
  input: {
    workspaceId: string;
    createdBy?: string | null;
    vendor_id?: string | null;
    category?: string | null;
    expense_date?: string;
    due_date?: string | null;
    amount?: unknown;
    tax_amount?: unknown;
    currency?: string;
    tax_breakup?: Record<string, unknown>;
    payment_status?: ExpensePaymentStatus;
    receipt_ref?: string | null;
    notes?: string | null;
    custom_fields?: Record<string, unknown>;
  },
): Promise<{ ok: true; expense: NonNullable<Awaited<ReturnType<typeof getExpense>>> } | { ok: false; fail: ExpenseFail }> {
  if (input.vendor_id) {
    const v = await getVendor(db, { workspaceId: input.workspaceId, id: input.vendor_id });
    if (!v) return { ok: false, fail: 'vendor_invalid' };
  }

  const amount = parseMoneyAmount(input.amount ?? 0);
  const taxAmount = parseMoneyAmount(input.tax_amount ?? 0);
  const total = addMoney(amount, taxAmount);
  if (moneyToNumber(total) <= 0) return { ok: false, fail: 'validation' };

  const profile = await getFinanceProfile(db, input.workspaceId);
  const { number } = await allocateFinanceNumber(db, input.workspaceId, 'expense', profile?.expense_prefix);
  const id = randomUUID();

  await db
    .insertInto('expenses')
    .values({
      id,
      workspace_id: input.workspaceId,
      expense_number: number,
      vendor_id: input.vendor_id ?? null,
      category: input.category ?? null,
      expense_date: input.expense_date ? new Date(input.expense_date) : new Date(),
      due_date: input.due_date ? new Date(input.due_date) : null,
      amount,
      tax_amount: taxAmount,
      total,
      currency: normalizeCurrency(input.currency ?? profile?.default_currency ?? DEFAULT_CURRENCY),
      tax_breakup: input.tax_breakup ?? {},
      payment_status: input.payment_status ?? 'unpaid',
      receipt_ref: input.receipt_ref ?? null,
      notes: input.notes ?? null,
      custom_fields: input.custom_fields ?? {},
      created_by: input.createdBy ?? null,
    })
    .execute();

  await appendFinanceDomainEvent(db, {
    workspaceId: input.workspaceId,
    aggregateType: 'expense',
    aggregateId: id,
    eventType: 'finance.expense.created',
    transitionKey: number,
    data: { expense_id: id, expense_number: number, total },
  });

  await postExpense(db, {
    workspaceId: input.workspaceId,
    expenseId: id,
    actorId: input.createdBy,
  }).then((r) => {
    if (!r.ok) throw new Error(`ACCOUNTING_POST_FAILED:${r.fail}`);
  });
  await recordSecurityAudit(db as never, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.createdBy ?? null,
    action: 'finance.expense.create',
    entity_type: 'expense',
    entity_id: id,
  });

  const expense = await getExpense(db, { workspaceId: input.workspaceId, id });
  return { ok: true, expense: expense! };
}

export async function updateExpense(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    patch: Partial<{
      vendor_id: string | null;
      category: string | null;
      expense_date: string;
      due_date: string | null;
      amount: unknown;
      tax_amount: unknown;
      currency: string;
      tax_breakup: Record<string, unknown>;
      payment_status: ExpensePaymentStatus;
      receipt_ref: string | null;
      notes: string | null;
      custom_fields: Record<string, unknown>;
    }>;
  },
): Promise<{ ok: true; expense: NonNullable<Awaited<ReturnType<typeof getExpense>>> } | { ok: false; fail: ExpenseFail }> {
  const existing = await getExpense(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!existing) return { ok: false, fail: 'not_found' };

  if (opts.patch.vendor_id) {
    const v = await getVendor(db, { workspaceId: opts.workspaceId, id: opts.patch.vendor_id });
    if (!v) return { ok: false, fail: 'vendor_invalid' };
  }

  const amount =
    opts.patch.amount !== undefined ? parseMoneyAmount(opts.patch.amount) : String(existing.amount);
  const taxAmount =
    opts.patch.tax_amount !== undefined
      ? parseMoneyAmount(opts.patch.tax_amount)
      : String(existing.tax_amount);
  const total = addMoney(amount, taxAmount);

  await db
    .updateTable('expenses')
    .set({
      ...(opts.patch.vendor_id !== undefined ? { vendor_id: opts.patch.vendor_id } : {}),
      ...(opts.patch.category !== undefined ? { category: opts.patch.category } : {}),
      ...(opts.patch.expense_date !== undefined
        ? { expense_date: new Date(opts.patch.expense_date) }
        : {}),
      ...(opts.patch.due_date !== undefined
        ? { due_date: opts.patch.due_date ? new Date(opts.patch.due_date) : null }
        : {}),
      ...(opts.patch.amount !== undefined || opts.patch.tax_amount !== undefined
        ? { amount, tax_amount: taxAmount, total }
        : {}),
      ...(opts.patch.currency !== undefined
        ? { currency: normalizeCurrency(opts.patch.currency) }
        : {}),
      ...(opts.patch.tax_breakup !== undefined ? { tax_breakup: opts.patch.tax_breakup } : {}),
      ...(opts.patch.payment_status !== undefined ? { payment_status: opts.patch.payment_status } : {}),
      ...(opts.patch.receipt_ref !== undefined ? { receipt_ref: opts.patch.receipt_ref } : {}),
      ...(opts.patch.notes !== undefined ? { notes: opts.patch.notes } : {}),
      ...(opts.patch.custom_fields !== undefined ? { custom_fields: opts.patch.custom_fields } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  const expense = await getExpense(db, { workspaceId: opts.workspaceId, id: opts.id });
  return { ok: true, expense: expense! };
}

export async function softDeleteExpense(
  db: DbOrTx,
  opts: { workspaceId: string; id: string },
): Promise<{ ok: true } | { ok: false; fail: ExpenseFail }> {
  const existing = await getExpense(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!existing) return { ok: false, fail: 'not_found' };
  await db
    .updateTable('expenses')
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();
  return { ok: true };
}
