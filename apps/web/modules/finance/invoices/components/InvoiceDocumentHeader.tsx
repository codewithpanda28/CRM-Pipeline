'use client';

import type { CSSProperties } from 'react';
import type { Invoice, InvoiceLine, SellerBrandingSnapshot } from '../../lib/api';
import { StatusPill } from '@/modules/crm/shared/ui';

function asBrand(raw: Invoice['seller_branding_snapshot']): SellerBrandingSnapshot {
  return (raw && typeof raw === 'object' ? raw : {}) as SellerBrandingSnapshot;
}

function formatAddress(addr: Record<string, unknown> | null | undefined): string[] {
  if (!addr || typeof addr !== 'object') return [];
  return [
    addr['line1'] ?? addr['street'] ?? addr['address_line1'],
    addr['line2'] ?? addr['address_line2'],
    [addr['city'], addr['state'], addr['postal_code'] ?? addr['zip']].filter(Boolean).join(', '),
    addr['country'],
  ]
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);
}

function money(amount: string | number | undefined, currency: string) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} ${amount ?? '—'}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function taxParts(breakup: Record<string, unknown> | null | undefined) {
  const b = breakup ?? {};
  const cgst = (b['cgst'] as { amount?: string } | undefined)?.amount;
  const sgst = (b['sgst'] as { amount?: string } | undefined)?.amount;
  const igst = (b['igst'] as { amount?: string } | undefined)?.amount;
  return { cgst, sgst, igst };
}

function monogram(name: string | null | undefined) {
  return ((name ?? 'T').trim()[0] ?? 'T').toUpperCase();
}

export function InvoiceDocumentHeader({
  invoice,
  previewBrand,
  customerLabel,
}: {
  invoice: Invoice | null | undefined;
  previewBrand?: SellerBrandingSnapshot | null;
  customerLabel?: string | null;
}) {
  const isPosted = invoice && invoice.status !== 'draft' && invoice.status !== 'cancelled';
  const snap = asBrand(invoice?.seller_branding_snapshot);
  const brand: SellerBrandingSnapshot =
    isPosted && (snap.legal_name || snap.brand_name || snap.logo_url || snap.gstin)
      ? snap
      : { ...previewBrand, ...snap };

  const sellerName = brand.legal_name || brand.trade_name || brand.brand_name || 'Your business';
  const party = (invoice?.party_snapshot ?? {}) as Record<string, unknown>;
  const billTo =
    customerLabel ||
    (typeof party['display_name'] === 'string' ? party['display_name'] : null) ||
    'Customer';
  const buyerGstin = invoice?.buyer_gstin_snapshot;
  const billingLines = formatAddress(invoice?.billing_address_snapshot as Record<string, unknown>);
  const sellerLines = formatAddress(brand.address as Record<string, unknown>);
  const bank = (brand.bank_details ?? {}) as Record<string, unknown>;
  const lines: InvoiceLine[] = invoice?.lines ?? [];
  const currency = invoice?.currency ?? 'INR';
  const docTax = taxParts(invoice?.tax_breakup as Record<string, unknown>);

  const logoStyle: CSSProperties = {
    width: 56,
    height: 56,
    borderRadius: 10,
    objectFit: 'contain',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    flexShrink: 0,
  };

  return (
    <section
      style={{
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 16,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0, flex: '1 1 240px' }}>
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={`${sellerName} logo`} style={logoStyle} />
          ) : (
            <div
              aria-hidden
              style={{
                ...logoStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 18,
                color: brand.primary_color || 'var(--text)',
                background: brand.primary_color
                  ? `color-mix(in srgb, ${brand.primary_color} 14%, transparent)`
                  : 'var(--surface2)',
              }}
            >
              {monogram(sellerName)}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: 'var(--text3)', textTransform: 'uppercase' }}>
              Invoice from
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{sellerName}</div>
            {sellerLines.map((l) => (
              <div key={l} style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                {l}
              </div>
            ))}
            {(brand.email || brand.phone) && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                {[brand.email, brand.phone].filter(Boolean).join(' · ')}
              </div>
            )}
            {(brand.gstin || invoice?.seller_gstin_snapshot) && (
              <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text2)' }}>
                GSTIN {brand.gstin || invoice?.seller_gstin_snapshot}
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', minWidth: 150, flex: '0 1 200px' }}>
          <div style={{ fontSize: 22, fontWeight: 750, letterSpacing: '-0.03em' }}>INVOICE</div>
          {invoice?.invoice_number && (
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 650 }}>{invoice.invoice_number}</div>
          )}
          {invoice?.status && (
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <StatusPill status={invoice.status} />
            </div>
          )}
          {invoice?.issue_date && (
            <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
              Issued {String(invoice.issue_date).slice(0, 10)}
            </div>
          )}
          {invoice?.due_date && (
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Due {String(invoice.due_date).slice(0, 10)}</div>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14,
          borderTop: '1px solid var(--border)',
          paddingTop: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text3)', textTransform: 'uppercase' }}>
            Bill to
          </div>
          <div style={{ marginTop: 4, fontSize: 14, fontWeight: 650 }}>{billTo}</div>
          {billingLines.map((l) => (
            <div key={l} style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
              {l}
            </div>
          ))}
          {buyerGstin ? <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>GSTIN {buyerGstin}</div> : null}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text3)', textTransform: 'uppercase' }}>
            Supply
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--text2)' }}>
            Place of supply: {invoice?.place_of_supply || '—'}
          </div>
          {invoice?.payment_terms ? (
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text2)' }}>Terms: {invoice.payment_terms}</div>
          ) : null}
        </div>
      </div>

      {lines.length > 0 && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                {['#', 'Item', 'HSN', 'Qty', 'Rate', 'Tax %', 'Amount', 'CGST', 'SGST', 'IGST', 'Total'].map((h) => (
                  <th key={h} style={{ padding: '8px 10px', fontWeight: 650, whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const t = taxParts(line.tax_breakup as Record<string, unknown>);
                return (
                  <tr key={line.id ?? i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px' }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px', minWidth: 140 }}>{line.name_snapshot}</td>
                    <td style={{ padding: '8px 10px' }}>{line.hsn_sac || '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{line.quantity}</td>
                    <td style={{ padding: '8px 10px' }}>{money(line.unit_price, currency)}</td>
                    <td style={{ padding: '8px 10px' }}>{line.tax_rate != null ? `${line.tax_rate}%` : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{money(line.taxable_amount ?? line.unit_price, currency)}</td>
                    <td style={{ padding: '8px 10px' }}>{t.cgst ? money(t.cgst, currency) : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{t.sgst ? money(t.sgst, currency) : '—'}</td>
                    <td style={{ padding: '8px 10px' }}>{t.igst ? money(t.igst, currency) : '—'}</td>
                    <td style={{ padding: '8px 10px', fontWeight: 650 }}>{money(line.line_total, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {invoice && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            borderTop: '1px solid var(--border)',
            paddingTop: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>
              Payment
            </div>
            {bank['bank_name'] || bank['account_number'] || bank['upi_id'] ? (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
                {bank['bank_name'] ? <div>{String(bank['bank_name'])}</div> : null}
                {bank['account_name'] ? <div>A/c name: {String(bank['account_name'])}</div> : null}
                {bank['account_number'] ? <div>A/c: {String(bank['account_number'])}</div> : null}
                {bank['ifsc'] ? <div>IFSC: {String(bank['ifsc'])}</div> : null}
                {bank['upi_id'] ? <div>UPI: {String(bank['upi_id'])}</div> : null}
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>No bank details on file.</div>
            )}
            {brand.payment_qr_url ? (
              <div style={{ marginTop: 10 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brand.payment_qr_url}
                  alt={brand.payment_qr_label || 'Payment QR'}
                  style={{ width: 100, height: 100, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
                />
                {brand.payment_qr_label ? (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{brand.payment_qr_label}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            {(
              [
                ['Subtotal', invoice.subtotal],
                ['Discount', invoice.discount_total ?? '0'],
                ['Taxable', invoice.taxable_amount ?? invoice.subtotal],
                ['CGST', docTax.cgst],
                ['SGST', docTax.sgst],
                ['IGST', docTax.igst],
                ['Tax', invoice.tax_amount],
                ['Grand total', invoice.total],
                ['Amount paid', invoice.amount_paid ?? '0'],
                ['Amount due', invoice.amount_due ?? invoice.total],
              ] as const
            )
              .filter(([, v]) => v != null && v !== '')
              .map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '4px 0',
                    fontWeight: label === 'Grand total' || label === 'Amount due' ? 700 : 400,
                    color: label === 'Grand total' || label === 'Amount due' ? 'var(--text)' : undefined,
                  }}
                >
                  <span>{label}</span>
                  <span>{money(value, currency)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {(invoice?.terms || brand.default_terms || brand.footer_note || brand.support_email || brand.support_phone) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 12, color: 'var(--text2)' }}>
          {(invoice?.terms || brand.default_terms) && (
            <>
              <div style={{ fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Terms & conditions
              </div>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{invoice?.terms || brand.default_terms}</p>
            </>
          )}
          {brand.footer_note ? <p style={{ margin: '10px 0 0' }}>{brand.footer_note}</p> : null}
          {(brand.support_email || brand.support_phone) && (
            <p style={{ margin: '8px 0 0' }}>
              Support: {[brand.support_email, brand.support_phone].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
