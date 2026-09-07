/**
 * Document renderer unit tests — HTML from context, no Playwright required.
 */
import { describe, it, expect } from 'vitest';
import { createDocumentRenderer, type DocumentRenderContext } from '@vencore/documents';

const sample: DocumentRenderContext = {
  docType: 'invoice',
  documentNumber: 'INV-1',
  issueDate: '2026-09-05',
  dueDate: '2026-09-20',
  brandingSnapshot: {
    legal_name: 'Acme Tenant Pvt Ltd',
    trade_name: 'Acme',
    gstin: '22AAAAA0000A1Z5',
    address: { line1: '1 Main St', city: 'Pune', state: 'MH', pincode: '411001' },
    logo_url: null,
    bank_details: {},
  },
  partySnapshot: {
    name: 'Buyer Co',
    gstin: '27BBBBB0000B1Z5',
    billing_address: { line1: '2 Buyer Rd' },
  },
  lines: [
    {
      position: 1,
      name: 'Service',
      description: null,
      hsnSac: '998314',
      quantity: '1.0000',
      unit: 'nos',
      unitPrice: '1000.00',
      taxRate: '18',
      taxAmount: '180.00',
      lineTotal: '1180.00',
      taxBreakup: { cgst: '90.00', sgst: '90.00' },
    },
  ],
  totals: {
    subtotal: '1000.00',
    discountTotal: '0.00',
    taxableAmount: '1000.00',
    taxAmount: '180.00',
    total: '1180.00',
    currency: 'INR',
  },
  taxBreakup: { cgst: '90.00', sgst: '90.00' },
  notes: null,
  terms: 'Net 15',
  locale: 'en-IN',
};

describe('DocumentRenderer', () => {
  it('renders HTML with tenant brand, not platform ThinkAIQ logo path', () => {
    const renderer = createDocumentRenderer();
    const html = renderer.renderHtml(sample);
    expect(html).toContain('Acme Tenant Pvt Ltd');
    expect(html).toContain('INV-1');
    expect(html).toContain('1180.00');
    expect(html).not.toContain('/platform/branding/');
  });

  it('renderPdf returns buffer (placeholder allowed without Playwright)', async () => {
    const renderer = createDocumentRenderer();
    const html = renderer.renderHtml(sample);
    const pdf = await renderer.renderPdf(html);
    expect(pdf.buffer.length).toBeGreaterThan(10);
    expect(pdf.mimeType).toBe('application/pdf');
    // When Chromium is installed, must not use placeholder fallback
    if (!pdf.placeholder) {
      expect(pdf.buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
      expect(pdf.buffer.toString('latin1')).not.toContain('DOCUMENT PDF PLACEHOLDER');
      expect(pdf.buffer.length).toBeGreaterThan(2000);
    }
  }, 90_000);
});
