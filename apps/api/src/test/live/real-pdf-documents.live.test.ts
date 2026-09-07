/**
 * Live — real Playwright PDF render + secure download isolation for all doc types.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { authedGet, authedPost, expectDenied, signTenantToken } from './http';
import { renderArtifactNow, downloadArtifact, enqueueRender } from '../../lib/documents';
import { withUnitOfWork } from '../../lib/domain-outbox';

process.env['DOCUMENT_PDF_REQUIRE_PLAYWRIGHT'] = '1';

function assertRealPdfBytes(buf: Buffer) {
  expect(buf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
  expect(buf.toString('latin1')).not.toContain('DOCUMENT PDF PLACEHOLDER');
  expect(buf.length).toBeGreaterThan(2000);
}

describe('live real-pdf-documents', () => {
  beforeAll(async () => {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    await getLiveCtx();
  }, 120_000);

  it('renders real Invoice/Quote/CN/DN PDFs; download + cross-tenant deny; regen idempotent', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const tokenB = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });

    const party = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { company_id: fx.companyA.id },
    });
    expect([200, 201]).toContain(party.status);
    const partyId = party.body.data.id as string;

    // Branding snapshot path: issue freezes seller branding
    await authedPost(app, '/api/finance/profile', {
      token,
      host: fx.tenantA.host,
      body: {
        legal_name: 'Live Tenant Seller Ltd',
        gstin: '22AAAAA0000A1Z5',
      },
    }).catch(() => undefined);
    // PATCH profile may need settings perm — upsert via branding if needed
    await authedGet(app, '/api/tenant/branding', { token, host: fx.tenantA.host });

    // Quote → accept for PDF
    const quote = await authedPost(app, '/api/quotes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        place_of_supply_intra: true,
        lines: [
          {
            name_snapshot: 'Quote PDF Line',
            quantity: '1',
            unit_price: '500.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect([200, 201]).toContain(quote.status);
    const quoteId = quote.body.data.id as string;
    await authedPost(app, `/api/quotes/${quoteId}/send`, { token, host: fx.tenantA.host, body: {} });
    await authedPost(app, `/api/quotes/${quoteId}/accept`, { token, host: fx.tenantA.host, body: {} });

    const inv = await authedPost(app, '/api/invoices', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        place_of_supply_intra: true,
        lines: [
          {
            name_snapshot: 'Invoice PDF Line',
            quantity: '1',
            unit_price: '1000.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect([200, 201]).toContain(inv.status);
    const invoiceId = inv.body.data.id as string;
    const issued = await authedPost(app, `/api/invoices/${invoiceId}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(issued.status).toBe(200);
    expect(issued.body.data.total).toBe('1180.00');

    const cn = await authedPost(app, '/api/credit-notes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        invoice_id: invoiceId,
        lines: [
          {
            name_snapshot: 'CN PDF Line',
            quantity: '1',
            unit_price: '100.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect([200, 201]).toContain(cn.status);
    const cnId = cn.body.data.id as string;

    const dn = await authedPost(app, '/api/debit-notes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        invoice_id: invoiceId,
        lines: [
          {
            name_snapshot: 'DN PDF Line',
            quantity: '1',
            unit_price: '50.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect([200, 201]).toContain(dn.status);
    const dnId = dn.body.data.id as string;

    const sources: Array<{ type: 'quote' | 'invoice' | 'credit_note' | 'debit_note'; id: string }> = [
      { type: 'quote', id: quoteId },
      { type: 'invoice', id: invoiceId },
      { type: 'credit_note', id: cnId },
      { type: 'debit_note', id: dnId },
    ];

    for (const src of sources) {
      const enq = await withUnitOfWork(db, async (trx) =>
        enqueueRender(trx, {
          workspaceId: fx.tenantA.id,
          sourceType: src.type,
          sourceId: src.id,
          createdBy: fx.userA.id,
          templateVersion: 1,
        }),
      );
      const artifactId = enq.artifactId;

      const rendered = await renderArtifactNow(db, {
        workspaceId: fx.tenantA.id,
        artifactId,
      });
      expect(rendered.placeholder).toBe(false);
      expect(rendered.storageKey).toContain(`tenants/${fx.tenantA.id}/`);
      expect(rendered.storageKey).toContain('/documents/');

      const art = await authedGet(app, `/api/documents/artifacts/${artifactId}`, {
        token,
        host: fx.tenantA.host,
      });
      expect(art.status).toBe(200);
      expect(art.body.data.status).toBe('ready');
      expect(art.body.data.template_version).toBe(1);
      expect(Number(art.body.data.byte_size)).toBeGreaterThan(2000);
      const branding = art.body.data.branding_snapshot ?? {};
      const brandStr = JSON.stringify(branding);
      expect(brandStr).not.toContain('/platform/branding/');

      const dl = await downloadArtifact(db, {
        workspaceId: fx.tenantA.id,
        artifactId,
      });
      assertRealPdfBytes(dl.bytes);

      // Cross-tenant download denied
      await expect(
        downloadArtifact(db, { workspaceId: fx.tenantB.id, artifactId }),
      ).rejects.toThrow();

      expectDenied(
        await authedGet(app, `/api/documents/artifacts/${artifactId}/download`, {
          token: tokenB,
          host: fx.tenantA.host,
        }),
      );

      // Regeneration with same key is idempotent (same artifact)
      const again = await withUnitOfWork(db, async (trx) =>
        enqueueRender(trx, {
          workspaceId: fx.tenantA.id,
          sourceType: src.type,
          sourceId: src.id,
          createdBy: fx.userA.id,
          templateVersion: 1,
        }),
      );
      expect(again.artifactId).toBe(artifactId);

      // New version key creates new artifact
      const v2 = await withUnitOfWork(db, async (trx) =>
        enqueueRender(trx, {
          workspaceId: fx.tenantA.id,
          sourceType: src.type,
          sourceId: src.id,
          createdBy: fx.userA.id,
          templateVersion: 2,
          renderIdempotencyKey: `${fx.tenantA.id}:${src.type}:${src.id}:v2`,
        }),
      );
      expect(v2.artifactId).not.toBe(artifactId);
      const r2 = await renderArtifactNow(db, {
        workspaceId: fx.tenantA.id,
        artifactId: v2.artifactId,
      });
      expect(r2.placeholder).toBe(false);
    }
  }, 300_000);
});
