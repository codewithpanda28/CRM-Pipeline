'use client';

import { apiFetch } from '@/modules/shared/lib/api';

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'bank' | 'upi' | 'card' | 'gateway' | 'other';

export interface InvoiceLine {
  id?: string;
  product_id?: string | null;
  name_snapshot: string;
  sku_snapshot?: string | null;
  quantity: string;
  unit_price: string;
  discount_amount?: string;
  tax_rate?: string | null;
  tax_amount?: string;
  taxable_amount?: string;
  line_total?: string;
  hsn_sac?: string | null;
  tax_breakup?: Record<string, unknown>;
}

export interface SellerBrandingSnapshot {
  legal_name?: string | null;
  trade_name?: string | null;
  brand_name?: string | null;
  gstin?: string | null;
  tax_id?: string | null;
  address?: Record<string, unknown> | null;
  bank_details?: Record<string, unknown> | null;
  logo_file_id?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  support_email?: string | null;
  support_phone?: string | null;
  payment_qr_url?: string | null;
  payment_qr_label?: string | null;
  default_terms?: string | null;
  footer_note?: string | null;
  snapshotted_at?: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  customer_party_id: string;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
  source_quote_id?: string | null;
  currency: string;
  subtotal: string;
  discount_total?: string;
  taxable_amount?: string;
  tax_amount: string;
  total: string;
  amount_paid?: string;
  amount_due?: string;
  issue_date?: string;
  due_date?: string | null;
  payment_terms?: string | null;
  notes?: string | null;
  terms?: string | null;
  tax_breakup?: Record<string, unknown>;
  place_of_supply?: string | null;
  seller_gstin_snapshot?: string | null;
  buyer_gstin_snapshot?: string | null;
  party_snapshot?: Record<string, unknown> | null;
  billing_address_snapshot?: Record<string, unknown> | null;
  seller_branding_snapshot?: SellerBrandingSnapshot | Record<string, unknown> | null;
  lines?: InvoiceLine[];
}

export interface Payment {
  id: string;
  payment_number: string;
  invoice_id: string;
  customer_party_id: string;
  amount: string;
  currency: string;
  payment_date: string;
  method: PaymentMethod | string;
  status: string;
  reference?: string | null;
  notes?: string | null;
}

export interface Expense {
  id: string;
  expense_number?: string;
  vendor_id?: string | null;
  category?: string | null;
  expense_date: string;
  amount: string;
  tax_amount?: string;
  total?: string;
  currency: string;
  payment_status?: string;
  notes?: string | null;
}

export interface Vendor {
  id: string;
  display_name: string;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
  gstin?: string | null;
  payment_terms?: string | null;
  status?: string;
  notes?: string | null;
}

export interface FinanceProfile {
  legal_name?: string | null;
  trade_name?: string | null;
  gstin?: string | null;
  tax_id?: string | null;
  address?: Record<string, unknown>;
  bank_details?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  default_currency?: string;
  default_tax_scheme?: string;
  default_payment_terms?: string | null;
  place_of_supply_default?: string | null;
  invoice_prefix?: string;
}

// ── Invoices ──────────────────────────────────────────────────────────────

export async function listInvoices(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Invoice[]; error: null }>(`/api/invoices${qs}`, { token });
}

export async function getInvoice(token: string, id: string) {
  return apiFetch<{ data: Invoice; error: null }>(`/api/invoices/${id}`, { token });
}

export async function createInvoice(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Invoice; error: null }>('/api/invoices', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateInvoice(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Invoice; error: null }>(`/api/invoices/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function invoiceFromQuote(token: string, quoteId: string) {
  return apiFetch<{ data: Invoice & { idempotent?: boolean }; error: null }>(
    `/api/invoices/from-quote/${quoteId}`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    },
  );
}

export async function issueInvoice(token: string, id: string) {
  return apiFetch<{ data: Invoice; error: null }>(`/api/invoices/${id}/issue`, {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  });
}

export async function cancelInvoice(token: string, id: string, reason?: string) {
  return apiFetch<{ data: Invoice; error: null }>(`/api/invoices/${id}/cancel`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason }),
  });
}

export async function voidInvoice(token: string, id: string, reason?: string) {
  return apiFetch<{ data: Invoice; error: null }>(`/api/invoices/${id}/void`, {
    method: 'POST',
    token,
    body: JSON.stringify({ reason }),
  });
}

// ── Payments ──────────────────────────────────────────────────────────────

export async function listPayments(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Payment[]; error: null }>(`/api/payments${qs}`, { token });
}

export async function createPayment(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Payment & { invoice?: Invoice }; error: null }>('/api/payments', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function refundPayment(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: { refund: unknown; payment: Payment }; error: null }>(
    `/api/payments/${id}/refund`,
    {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    },
  );
}

// ── Expenses ──────────────────────────────────────────────────────────────

export async function listExpenses(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Expense[]; error: null }>(`/api/expenses${qs}`, { token });
}

export async function createExpense(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Expense; error: null }>('/api/expenses', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateExpense(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Expense; error: null }>(`/api/expenses/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function deleteExpense(token: string, id: string) {
  return apiFetch<{ data: { deleted: boolean }; error: null }>(`/api/expenses/${id}`, {
    method: 'DELETE',
    token,
  });
}

// ── Vendors ───────────────────────────────────────────────────────────────

export async function listVendors(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Vendor[]; error: null }>(`/api/vendors${qs}`, { token });
}

export async function createVendor(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Vendor; error: null }>('/api/vendors', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateVendor(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Vendor; error: null }>(`/api/vendors/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function deleteVendor(token: string, id: string) {
  return apiFetch<{ data: { deleted: boolean }; error: null }>(`/api/vendors/${id}`, {
    method: 'DELETE',
    token,
  });
}

// ── Reports & profile ─────────────────────────────────────────────────────

export type FinanceReportKind = 'ar-aging' | 'sales' | 'payments' | 'expenses' | 'tax';

export async function getFinanceReports(
  token: string,
  kind: FinanceReportKind,
  params?: Record<string, string>,
) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: unknown; error: null }>(`/api/finance/reports/${kind}${qs}`, { token });
}

export async function getFinanceProfile(token: string) {
  return apiFetch<{ data: FinanceProfile | null; error: null }>('/api/finance/profile', { token });
}

export async function updateFinanceProfile(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: FinanceProfile; error: null }>('/api/finance/profile', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

// ── Accounting (COA / journals / periods / GL) ────────────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type PeriodStatus = 'open' | 'soft_closed' | 'locked';
export type JournalStatus = 'posted' | 'reversed' | string;

export interface GlAccount {
  id: string;
  code: string;
  name: string;
  account_type: AccountType | string;
  description?: string | null;
  parent_id?: string | null;
  is_active?: boolean;
  is_control?: boolean;
  control_key?: string | null;
}

export interface AccountingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus | string;
  closed_at?: string | null;
  locked_at?: string | null;
}

export interface JournalLine {
  id?: string;
  account_id: string;
  debit: string;
  credit: string;
  description?: string | null;
  line_no?: number;
}

export interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  memo?: string | null;
  status: JournalStatus;
  currency?: string;
  source_type?: string | null;
  source_id?: string | null;
  reversed_by_entry_id?: string | null;
  lines?: JournalLine[];
}

export type GlReportKind =
  | 'trial-balance'
  | 'profit-and-loss'
  | 'balance-sheet'
  | 'cash-flow';

export async function listAccounts(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: GlAccount[]; error: null }>(`/api/accounting/accounts${qs}`, { token });
}

export async function createAccount(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: GlAccount; error: null }>('/api/accounting/accounts', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateAccount(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: GlAccount; error: null }>(`/api/accounting/accounts/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function listPeriods(token: string) {
  return apiFetch<{ data: AccountingPeriod[]; error: null }>('/api/accounting/periods', { token });
}

export async function setPeriodStatus(token: string, id: string, status: PeriodStatus) {
  return apiFetch<{ data: AccountingPeriod; error: null }>(`/api/accounting/periods/${id}/status`, {
    method: 'POST',
    token,
    body: JSON.stringify({ status }),
  });
}

export async function listJournals(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: JournalEntry[]; error: null }>(`/api/accounting/journals${qs}`, { token });
}

export async function getJournal(token: string, id: string) {
  return apiFetch<{ data: JournalEntry; error: null }>(`/api/accounting/journals/${id}`, { token });
}

export async function createJournal(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: JournalEntry & { idempotent?: boolean }; error: null }>(
    '/api/accounting/journals',
    {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    },
  );
}

export async function reverseJournal(token: string, id: string) {
  return apiFetch<{ data: { original: JournalEntry; reversal: JournalEntry }; error: null }>(
    `/api/accounting/journals/${id}/reverse`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    },
  );
}

export async function getGlReport(
  token: string,
  kind: GlReportKind,
  params?: Record<string, string>,
) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: unknown; error: null }>(`/api/accounting/reports/${kind}${qs}`, { token });
}

// ── Documents (PDF) ───────────────────────────────────────────────────────

export type DocumentSourceType = 'invoice' | 'quote' | 'credit_note' | 'debit_note';

export interface DocumentArtifactRef {
  id: string;
  artifactId?: string;
  status?: string;
  placeholder?: boolean;
}

export async function generateDocument(
  token: string,
  body: { source_type: DocumentSourceType; source_id: string; sync?: boolean },
) {
  return apiFetch<{ data: DocumentArtifactRef; error: null }>('/api/documents/render', {
    method: 'POST',
    token,
    body: JSON.stringify({ ...body, sync: body.sync ?? true }),
  });
}

export async function getDocumentArtifact(token: string, artifactId: string) {
  return apiFetch<{ data: { id: string; status: string; error_message?: string | null }; error: null }>(
    `/api/documents/artifacts/${artifactId}`,
    { token },
  );
}

export async function listDocuments(
  token: string,
  params: { source_type: string; source_id: string },
) {
  const qs = '?' + new URLSearchParams(params).toString();
  return apiFetch<{ data: Array<{ id: string; status?: string; created_at?: string }>; error: null }>(
    `/api/documents/artifacts${qs}`,
    { token },
  );
}

/** Download PDF bytes and trigger a browser save. */
export async function downloadDocument(token: string, artifactId: string, filenameHint?: string) {
  const res = await fetch(`/api/documents/artifacts/${artifactId}/download`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      message = json.error?.message ?? message;
    } catch {
      // binary error body
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (typeof window !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameHint ?? `document-${artifactId.slice(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  return { data: { ok: true as const }, error: null };
}

// ── Ops (admin) ───────────────────────────────────────────────────────────

export async function requestTenantExport(token: string) {
  return apiFetch<{ data: { jobId?: string; id?: string; status?: string }; error: null }>(
    '/api/ops/export',
    {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    },
  );
}

/** Export runs synchronously today — no list endpoint. Surface last request locally. */
export async function listTenantExports(_token: string) {
  return { data: [] as Array<{ id: string; status: string; created_at?: string }>, error: null };
}

export async function listFailedJobs(token: string) {
  return apiFetch<{
    data: Array<{
      id: string;
      what?: string;
      job?: string;
      error?: string | null;
      when?: string;
      name?: string;
      failed_reason?: string;
      timestamp?: string;
    }>;
    error: null;
  }>('/api/ops/outbox/failed', { token });
}

export async function replayFailedJob(token: string, id: string) {
  return apiFetch<{ data: { replayed?: number; ok?: boolean }; error: null }>(
    '/api/ops/outbox/replay',
    {
      method: 'POST',
      token,
      body: JSON.stringify({ ids: [id] }),
    },
  );
}
