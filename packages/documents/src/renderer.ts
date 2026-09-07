/**
 * DocumentRenderer — HTML via Handlebars; PDF via optional Playwright peer.
 *
 * PDF strategy:
 * 1. Prefer Playwright Chromium (`playwright` peer) for production-quality PDFs.
 * 2. If Playwright is not installed / fails to launch, emit a *minimal valid PDF*
 *    placeholder (text-only) so local/dev pipelines still produce downloadable bytes.
 *    Set DOCUMENT_PDF_REQUIRE_PLAYWRIGHT=1 to throw instead of placeholder.
 *
 * Finance / CRM domains must NOT import Playwright — only this package may.
 */
import Handlebars from 'handlebars';
import type {
  BrandingSnapshot,
  DocumentRenderContext,
  DocumentRenderer,
  RenderHtmlOptions,
  RenderPdfResult,
} from './types';
import { getDefaultTemplate } from './templates';

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, fallback = ''): string {
  if (v == null) return fallback;
  return String(v);
}

function formatAddress(addr: unknown): string {
  const a = asRecord(addr);
  const parts = [
    a['line1'] ?? a['address_line1'] ?? a['street'],
    a['line2'] ?? a['address_line2'],
    [a['city'], a['state'], a['postal_code'] ?? a['zip']].filter(Boolean).join(', '),
    a['country'],
  ]
    .map((p) => (p == null || p === '' ? null : String(p)))
    .filter(Boolean);
  return parts.join('<br/>');
}

function partyName(party: Record<string, unknown>): string {
  return (
    str(party['display_name']) ||
    str(party['name']) ||
    str(party['legal_name']) ||
    str(party['company_name']) ||
    'Customer'
  );
}

function sellerName(branding: BrandingSnapshot): string {
  return (
    str(branding.legal_name) ||
    str(branding.trade_name) ||
    str(branding.brand_name) ||
    'Seller'
  );
}

function taxBreakupRows(breakup: Record<string, unknown>): Array<{ label: string; amount: string }> {
  const rows: Array<{ label: string; amount: string }> = [];
  for (const [k, v] of Object.entries(breakup)) {
    if (v == null) continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const inner = asRecord(v);
      const amount = inner['amount'] ?? inner['value'] ?? JSON.stringify(v);
      rows.push({ label: k.toUpperCase(), amount: String(amount) });
    } else {
      rows.push({ label: k.toUpperCase(), amount: String(v) });
    }
  }
  return rows;
}

/** Assert branding is not platform ThinkAIQ asset paths. */
export function assertTenantBranding(branding: BrandingSnapshot): void {
  const logo = branding.logo_url;
  if (typeof logo === 'string' && logo.includes('/platform/branding/')) {
    throw new Error(
      'DocumentRenderer refused platform ThinkAIQ branding on a tenant document — use seller branding snapshot',
    );
  }
}

function buildViewModel(context: DocumentRenderContext): Record<string, unknown> {
  assertTenantBranding(context.brandingSnapshot);
  const party = asRecord(context.partySnapshot);
  const primary =
    (typeof context.brandingSnapshot.primary_color === 'string' &&
      context.brandingSnapshot.primary_color) ||
    '#111827';

  return {
    ...context,
    primaryColor: primary,
    sellerName: sellerName(context.brandingSnapshot),
    sellerAddressHtml: formatAddress(context.brandingSnapshot.address),
    buyerName: partyName(party),
    buyerGstin: str(party['gstin'] ?? party['tax_id'] ?? context.partySnapshot['gstin'], ''),
    buyerAddressHtml: formatAddress(
      party['billing_address'] ?? party['address'] ?? party['billingAddress'],
    ),
    taxBreakupRows: taxBreakupRows(asRecord(context.taxBreakup)),
  };
}

/**
 * Minimal PDF 1.4 with a single page of Helvetica text.
 * Used when Playwright is unavailable — not for production print quality.
 */
export function buildPlaceholderPdf(html: string): Buffer {
  const plain = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);

  const header =
    'DOCUMENT PDF PLACEHOLDER — install optional peer "playwright" for production HTML→PDF rendering.\n\n';
  const text = (header + plain).replace(/[()\\]/g, (c) => `\\${c}`);

  // Simple single-page PDF
  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n',
  );
  const stream = `BT /F1 9 Tf 40 800 Td 14 TL (${text}) Tj ET`;
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export function createDocumentRenderer(): DocumentRenderer {
  return {
    renderHtml(context: DocumentRenderContext, options?: RenderHtmlOptions): string {
      const templateHtml = options?.templateHtml ?? getDefaultTemplate(context.docType);
      const compiled = Handlebars.compile(templateHtml, { noEscape: false });
      return compiled(buildViewModel(context));
    },

    async renderPdf(html: string): Promise<RenderPdfResult> {
      const requirePlaywright = process.env['DOCUMENT_PDF_REQUIRE_PLAYWRIGHT'] === '1';
      try {
        // Dynamic import keeps Playwright optional for Finance/API that only need HTML.
        const playwright = await import('playwright');
        const browser = await playwright.chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle' });
          const buffer = Buffer.from(
            await page.pdf({
              format: 'A4',
              printBackground: true,
              margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
            }),
          );
          return { buffer, mimeType: 'application/pdf', placeholder: false, pageCount: null };
        } finally {
          await browser.close();
        }
      } catch (err) {
        if (requirePlaywright) {
          throw new Error(
            `DocumentRenderer.renderPdf requires Playwright Chromium (peerDependency). ` +
              `Install playwright and ensure browsers are available. Cause: ${
                err instanceof Error ? err.message : String(err)
              }`,
          );
        }
        return {
          buffer: buildPlaceholderPdf(html),
          mimeType: 'application/pdf',
          placeholder: true,
          pageCount: 1,
        };
      }
    },
  };
}

export const defaultDocumentRenderer = createDocumentRenderer();
