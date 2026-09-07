'use client';

import { apiFetch } from '@/modules/shared/lib/api';

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface QuoteLine {
  id?: string;
  product_id?: string | null;
  name_snapshot: string;
  sku_snapshot?: string | null;
  quantity: string;
  unit_price: string;
  discount_amount?: string;
  tax_rate?: string | null;
  tax_amount?: string;
  line_total?: string;
  hsn_sac?: string | null;
}

export interface Quote {
  id: string;
  quote_number: string;
  version: number;
  status: QuoteStatus;
  customer_party_id: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  currency: string;
  subtotal: string;
  discount_total?: string;
  taxable_amount?: string;
  tax_amount: string;
  total: string;
  tax_breakup?: Record<string, unknown>;
  issue_date?: string;
  expiry_date?: string | null;
  notes: string | null;
  terms: string | null;
  lines?: QuoteLine[];
}

export async function listQuotes(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Quote[]; error: null }>(`/api/quotes${qs}`, { token });
}

export async function getQuote(token: string, id: string) {
  return apiFetch<{ data: Quote; error: null }>(`/api/quotes/${id}`, { token });
}

export async function createQuote(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Quote; error: null }>('/api/quotes', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateQuote(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Quote; error: null }>(`/api/quotes/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function quoteAction(token: string, id: string, action: string, body?: Record<string, unknown>) {
  return apiFetch<{ data: Quote; error: null }>(`/api/quotes/${id}/${action}`, {
    method: 'POST',
    token,
    body: JSON.stringify(body ?? {}),
  });
}

/** Document PDF — uses /api/documents/render + artifact download. */
export async function generateQuoteDocument(token: string, quoteId: string) {
  const { generateDocument } = await import('@/modules/finance/lib/api');
  return generateDocument(token, { source_type: 'quote', source_id: quoteId, sync: true });
}

export async function downloadQuoteDocument(token: string, documentId: string) {
  const { downloadDocument } = await import('@/modules/finance/lib/api');
  return downloadDocument(token, documentId, `quote-${documentId.slice(0, 8)}.pdf`);
}
