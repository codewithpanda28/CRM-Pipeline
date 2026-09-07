/**
 * Shared DocumentRenderer types.
 * Branding MUST be tenant seller snapshot — never ThinkAIQ platform branding.
 */

export type DocumentDocType = 'quote' | 'invoice' | 'credit_note' | 'debit_note';

export interface DocumentLine {
  position: number;
  name: string;
  description?: string | null;
  hsnSac?: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount?: string;
  taxRate?: string | null;
  taxAmount: string;
  lineTotal: string;
  taxBreakup?: Record<string, unknown>;
}

export interface DocumentTotals {
  subtotal: string;
  discountTotal: string;
  taxableAmount: string;
  taxAmount: string;
  total: string;
  amountPaid?: string;
  amountDue?: string;
  currency: string;
}

/** Tenant seller branding frozen at issue/render time. Never platform ThinkAIQ assets. */
export interface BrandingSnapshot {
  legal_name?: string | null;
  trade_name?: string | null;
  brand_name?: string | null;
  gstin?: string | null;
  tax_id?: string | null;
  address?: Record<string, unknown>;
  bank_details?: Record<string, unknown>;
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
  [key: string]: unknown;
}

export interface DocumentRenderContext {
  docType: DocumentDocType;
  documentNumber: string;
  issueDate: string;
  dueDate?: string | null;
  expiryDate?: string | null;
  /** Tenant branding only — never ThinkAIQ platform branding for tenant docs. */
  brandingSnapshot: BrandingSnapshot;
  partySnapshot: Record<string, unknown>;
  lines: DocumentLine[];
  totals: DocumentTotals;
  taxBreakup: Record<string, unknown>;
  placeOfSupply?: string | null;
  notes?: string | null;
  terms?: string | null;
  reason?: string | null;
  locale?: string;
}

export interface RenderHtmlOptions {
  templateHtml?: string;
}

export interface RenderPdfResult {
  buffer: Buffer;
  mimeType: 'application/pdf';
  /** true when Playwright was unavailable and a minimal placeholder PDF was written */
  placeholder: boolean;
  pageCount: number | null;
}

export interface DocumentRenderer {
  renderHtml(context: DocumentRenderContext, options?: RenderHtmlOptions): string;
  renderPdf(html: string): Promise<RenderPdfResult>;
}
