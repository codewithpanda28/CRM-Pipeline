/**
 * Operational finance reports (queries over transactional tables — not 4B journals).
 */
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';

export async function reportArAging(db: DbOrTx, workspaceId: string) {
  const rows = await sql<{
    bucket: string;
    invoice_count: string;
    amount_due: string;
  }>`
    SELECT
      CASE
        WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'current'
        WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' THEN '1_30'
        WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' THEN '31_60'
        WHEN due_date >= CURRENT_DATE - INTERVAL '90 days' THEN '61_90'
        ELSE '90_plus'
      END AS bucket,
      COUNT(*)::text AS invoice_count,
      COALESCE(SUM(amount_due), 0)::text AS amount_due
    FROM invoices
    WHERE workspace_id = ${workspaceId}::uuid
      AND deleted_at IS NULL
      AND amount_due > 0
      AND status IN ('issued', 'partially_paid', 'overdue')
    GROUP BY 1
    ORDER BY 1
  `.execute(db);
  return rows.rows;
}

export async function reportSalesRegister(
  db: DbOrTx,
  opts: { workspaceId: string; from?: string; to?: string },
) {
  let query = db
    .selectFrom('invoices')
    .select([
      'id',
      'invoice_number',
      'status',
      'customer_party_id',
      'issue_date',
      'currency',
      'subtotal',
      'tax_amount',
      'total',
      'amount_paid',
      'amount_due',
    ])
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['draft', 'cancelled', 'void'])
    .orderBy('issue_date', 'desc')
    .limit(500);

  if (opts.from) query = query.where('issue_date', '>=', new Date(opts.from));
  if (opts.to) query = query.where('issue_date', '<=', new Date(opts.to));
  return query.execute();
}

export async function reportPaymentsRegister(
  db: DbOrTx,
  opts: { workspaceId: string; from?: string; to?: string },
) {
  let query = db
    .selectFrom('payments')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', 'in', ['succeeded', 'partially_refunded', 'refunded'])
    .orderBy('payment_date', 'desc')
    .limit(500);

  if (opts.from) query = query.where('payment_date', '>=', new Date(opts.from));
  if (opts.to) query = query.where('payment_date', '<=', new Date(opts.to));
  return query.execute();
}

export async function reportExpensesRegister(
  db: DbOrTx,
  opts: { workspaceId: string; from?: string; to?: string },
) {
  let query = db
    .selectFrom('expenses')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .orderBy('expense_date', 'desc')
    .limit(500);

  if (opts.from) query = query.where('expense_date', '>=', new Date(opts.from));
  if (opts.to) query = query.where('expense_date', '<=', new Date(opts.to));
  return query.execute();
}

export async function reportTaxSummary(
  db: DbOrTx,
  opts: { workspaceId: string; from?: string; to?: string },
) {
  let query = db
    .selectFrom('invoices')
    .select((eb) => [
      eb.fn.countAll<string>().as('invoice_count'),
      eb.fn.coalesce(eb.fn.sum('taxable_amount'), eb.val(0)).as('taxable_amount'),
      eb.fn.coalesce(eb.fn.sum('tax_amount'), eb.val(0)).as('tax_amount'),
      eb.fn.coalesce(eb.fn.sum('total'), eb.val(0)).as('total'),
    ])
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['draft', 'cancelled', 'void']);

  if (opts.from) query = query.where('issue_date', '>=', new Date(opts.from));
  if (opts.to) query = query.where('issue_date', '<=', new Date(opts.to));

  const row = await query.executeTakeFirst();
  return {
    invoice_count: String(row?.invoice_count ?? 0),
    taxable_amount: String(row?.taxable_amount ?? '0.00'),
    tax_amount: String(row?.tax_amount ?? '0.00'),
    total: String(row?.total ?? '0.00'),
  };
}

/** AP register — unpaid expenses (commercial truth, not GL). */
export async function reportApRegister(db: DbOrTx, workspaceId: string) {
  return db
    .selectFrom('expenses')
    .select([
      'id',
      'expense_number',
      'vendor_id',
      'expense_date',
      'due_date',
      'total',
      'currency',
      'payment_status',
      'category',
    ])
    .where('workspace_id', '=', workspaceId)
    .where('deleted_at', 'is', null)
    .where('payment_status', 'in', ['unpaid', 'partial'])
    .orderBy('expense_date', 'desc')
    .limit(500)
    .execute();
}
