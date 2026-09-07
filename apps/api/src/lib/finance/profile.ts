/**
 * Tenant finance profile get/upsert.
 */
import type { DbOrTx } from '@vencore/events';

export async function getFinanceProfile(db: DbOrTx, workspaceId: string) {
  return (
    (await db
      .selectFrom('tenant_finance_profiles')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirst()) ?? null
  );
}

export async function upsertFinanceProfile(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    patch: {
      legal_name?: string | null;
      trade_name?: string | null;
      gstin?: string | null;
      tax_id?: string | null;
      address?: Record<string, unknown>;
      bank_details?: Record<string, unknown>;
      default_currency?: string;
      default_tax_scheme?: 'none' | 'in_gst' | 'vat' | 'other';
      default_payment_terms?: string | null;
      place_of_supply_default?: string | null;
      invoice_prefix?: string;
      credit_note_prefix?: string;
      debit_note_prefix?: string;
      payment_prefix?: string;
      expense_prefix?: string;
      metadata?: Record<string, unknown>;
    };
  },
) {
  const existing = await getFinanceProfile(db, opts.workspaceId);
  if (!existing) {
    await db
      .insertInto('tenant_finance_profiles')
      .values({
        workspace_id: opts.workspaceId,
        legal_name: opts.patch.legal_name ?? null,
        trade_name: opts.patch.trade_name ?? null,
        gstin: opts.patch.gstin ?? null,
        tax_id: opts.patch.tax_id ?? null,
        address: opts.patch.address ?? {},
        bank_details: opts.patch.bank_details ?? {},
        default_currency: opts.patch.default_currency ?? 'INR',
        default_tax_scheme: opts.patch.default_tax_scheme ?? 'in_gst',
        default_payment_terms: opts.patch.default_payment_terms ?? null,
        place_of_supply_default: opts.patch.place_of_supply_default ?? null,
        invoice_prefix: opts.patch.invoice_prefix ?? 'INV-',
        credit_note_prefix: opts.patch.credit_note_prefix ?? 'CN-',
        debit_note_prefix: opts.patch.debit_note_prefix ?? 'DN-',
        payment_prefix: opts.patch.payment_prefix ?? 'PAY-',
        expense_prefix: opts.patch.expense_prefix ?? 'EXP-',
        metadata: opts.patch.metadata ?? {},
      })
      .execute();
  } else {
    await db
      .updateTable('tenant_finance_profiles')
      .set({
        ...(opts.patch.legal_name !== undefined ? { legal_name: opts.patch.legal_name } : {}),
        ...(opts.patch.trade_name !== undefined ? { trade_name: opts.patch.trade_name } : {}),
        ...(opts.patch.gstin !== undefined ? { gstin: opts.patch.gstin } : {}),
        ...(opts.patch.tax_id !== undefined ? { tax_id: opts.patch.tax_id } : {}),
        ...(opts.patch.address !== undefined ? { address: opts.patch.address } : {}),
        ...(opts.patch.bank_details !== undefined ? { bank_details: opts.patch.bank_details } : {}),
        ...(opts.patch.default_currency !== undefined
          ? { default_currency: opts.patch.default_currency }
          : {}),
        ...(opts.patch.default_tax_scheme !== undefined
          ? { default_tax_scheme: opts.patch.default_tax_scheme }
          : {}),
        ...(opts.patch.default_payment_terms !== undefined
          ? { default_payment_terms: opts.patch.default_payment_terms }
          : {}),
        ...(opts.patch.place_of_supply_default !== undefined
          ? { place_of_supply_default: opts.patch.place_of_supply_default }
          : {}),
        ...(opts.patch.invoice_prefix !== undefined
          ? { invoice_prefix: opts.patch.invoice_prefix }
          : {}),
        ...(opts.patch.credit_note_prefix !== undefined
          ? { credit_note_prefix: opts.patch.credit_note_prefix }
          : {}),
        ...(opts.patch.debit_note_prefix !== undefined
          ? { debit_note_prefix: opts.patch.debit_note_prefix }
          : {}),
        ...(opts.patch.payment_prefix !== undefined
          ? { payment_prefix: opts.patch.payment_prefix }
          : {}),
        ...(opts.patch.expense_prefix !== undefined
          ? { expense_prefix: opts.patch.expense_prefix }
          : {}),
        ...(opts.patch.metadata !== undefined ? { metadata: opts.patch.metadata } : {}),
        updated_at: new Date(),
      })
      .where('workspace_id', '=', opts.workspaceId)
      .execute();
  }
  return getFinanceProfile(db, opts.workspaceId);
}
