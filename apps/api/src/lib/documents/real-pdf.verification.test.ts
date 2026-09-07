/**
 * Real Playwright PDF verification — Chromium must be available.
 * Sets DOCUMENT_PDF_REQUIRE_PLAYWRIGHT=1 so placeholder fallback cannot silently pass.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createDocumentRenderer,
  assertTenantBranding,
  type DocumentRenderContext,
} from '@vencore/documents';

process.env['DOCUMENT_PDF_REQUIRE_PLAYWRIGHT'] = '1';

function baseContext(
  docType: DocumentRenderContext['docType'],
  overrides: Partial<DocumentRenderContext> = {},
): DocumentRenderContext {
  return {
    docType,
    documentNumber:
      docType === 'quote'
        ? 'Q-1001'
        : docType === 'invoice'
          ? 'INV-1001'
          : docType === 'credit_note'
            ? 'CN-1001'
            : 'DN-1001',
    issueDate: '2026-09-05',
    dueDate: '2026-09-20',
    brandingSnapshot: {
      legal_name: 'Acme Tenant Pvt Ltd',
      trade_name: 'Acme Tenant',
      gstin: '22AAAAA0000A1Z5',
      address: {
        line1: '1 Main St',
        city: 'Pune',
        state: 'MH',
        postal_code: '411001',
        country: 'IN',
      },
      logo_url: 'https://cdn.example.com/tenants/acme/logo.png',
      primary_color: '#0f766e',
      bank_details: { account_name: 'Acme Tenant', upi: 'acme@upi' },
    },
    partySnapshot: {
      name: 'Buyer Co Ltd',
      gstin: '27BBBBB0000B1Z5',
      billing_address: { line1: '2 Buyer Rd', city: 'Mumbai', state: 'MH' },
    },
    lines: [
      {
        position: 1,
        name: 'Professional Services',
        description: 'Phase 5 verification line',
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
    notes: 'Thank you',
    terms: 'Net 15',
    locale: 'en-IN',
    ...overrides,
  };
}

function assertRealPdf(buffer: Buffer, placeholder: boolean) {
  expect(placeholder).toBe(false);
  expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  const asText = buffer.toString('latin1');
  expect(asText).not.toContain('DOCUMENT PDF PLACEHOLDER');
  // Playwright A4 PDFs are typically >> 1KB; placeholders are tiny
  expect(buffer.length).toBeGreaterThan(2000);
}

describe('real Playwright PDF pipeline', () => {
  beforeAll(async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  }, 60_000);

  it('refuses platform ThinkAIQ branding paths', () => {
    expect(() =>
      assertTenantBranding({
        legal_name: 'X',
        logo_url: '/platform/branding/logo.png',
      }),
    ).toThrow(/platform ThinkAIQ branding/i);
  });

  for (const docType of ['quote', 'invoice', 'credit_note', 'debit_note'] as const) {
    it(`renders real non-placeholder ${docType} PDF with tenant branding`, async () => {
      const renderer = createDocumentRenderer();
      const ctx = baseContext(docType);
      const html = renderer.renderHtml(ctx);

      expect(html).toContain('Acme Tenant Pvt Ltd');
      expect(html).toContain(ctx.documentNumber);
      expect(html).toContain('1180.00');
      expect(html).toContain('Buyer Co Ltd');
      expect(html).toContain('22AAAAA0000A1Z5');
      expect(html).not.toContain('/platform/branding/');
      expect(html).not.toContain('ThinkAIQ');

      const pdf = await renderer.renderPdf(html);
      assertRealPdf(pdf.buffer, pdf.placeholder);
      expect(pdf.mimeType).toBe('application/pdf');
    }, 90_000);
  }

  it('preserves historical branding snapshot (not live platform assets)', async () => {
    const renderer = createDocumentRenderer();
    const frozen = baseContext('invoice', {
      brandingSnapshot: {
        legal_name: 'Frozen Seller Historical Name',
        trade_name: 'Frozen',
        gstin: '29CCCCC0000C1Z5',
        logo_url: 'https://cdn.example.com/tenants/acme/old-logo.png',
        address: { line1: 'Old Address Only' },
      },
    });
    const html = renderer.renderHtml(frozen);
    expect(html).toContain('Frozen Seller Historical Name');
    expect(html).toContain('Old Address Only');
    expect(html).not.toContain('/platform/branding/');

    const pdf = await renderer.renderPdf(html);
    assertRealPdf(pdf.buffer, pdf.placeholder);
  }, 90_000);
});
