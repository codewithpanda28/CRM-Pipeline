'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { listProducts, type Product } from '@/modules/crm/products/lib/api';
import { listCustomerParties } from '@/modules/crm/customer-parties/lib/api';
import { listQuotes } from '@/modules/crm/quotes/lib/api';
import {
  DangerButton,
  GhostButton,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  panelStyle,
  sectionTitleStyle,
  twoColGrid,
} from '@/modules/crm/shared/ui';
import {
  cancelInvoice,
  createInvoice,
  createPayment,
  downloadDocument,
  generateDocument,
  getFinanceProfile,
  getInvoice,
  invoiceFromQuote,
  issueInvoice,
  updateInvoice,
  voidInvoice,
  type InvoiceLine,
  type PaymentMethod,
  type SellerBrandingSnapshot,
} from '../../lib/api';
import { InvoiceDocumentHeader } from './InvoiceDocumentHeader';
import { apiFetch } from '@/modules/shared/lib/api';

type LineDraft = {
  product_id: string;
  name_snapshot: string;
  quantity: string;
  unit_price: string;
  discount_amount: string;
  tax_rate: string;
  hsn_sac: string;
};

const emptyLine = (): LineDraft => ({
  product_id: '',
  name_snapshot: '',
  quantity: '1.0000',
  unit_price: '0.00',
  discount_amount: '0.00',
  tax_rate: '18',
  hsn_sac: '',
});

function money(amount: string | number | undefined, currency: string) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} ${amount ?? '—'}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function linePreviewTotal(line: LineDraft) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unit_price) || 0;
  const discount = Number(line.discount_amount) || 0;
  const taxable = Math.max(0, qty * price - discount);
  const taxRate = Number(line.tax_rate) || 0;
  const tax = (taxable * taxRate) / 100;
  return taxable + tax;
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function InvoiceEditor({ id }: { id?: string }) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const isNew = !id;

  const [partyId, setPartyId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [intra, setIntra] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [acceptedQuoteId, setAcceptedQuoteId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('upi');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const partiesQ = useQuery({
    queryKey: ['customer-parties', 'invoice-picker'],
    queryFn: async () => listCustomerParties(await getToken(), { status: 'active', per_page: '100' }),
    enabled: Boolean(user),
  });

  const productsQ = useQuery({
    queryKey: ['products', 'invoice-picker'],
    queryFn: async () => listProducts(await getToken(), { is_active: 'true', per_page: '100' }),
    enabled: Boolean(user),
  });

  const acceptedQuotesQ = useQuery({
    queryKey: ['quotes', 'accepted-for-invoice'],
    queryFn: async () => listQuotes(await getToken(), { status: 'accepted', per_page: '50' }),
    enabled: Boolean(user && isNew),
  });

  const invoiceQ = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => getInvoice(await getToken(), id!),
    enabled: Boolean(user && id),
  });

  const sellerPreviewQ = useQuery({
    queryKey: ['invoice-seller-preview'],
    queryFn: async () => {
      const token = await getToken();
      const [profileRes, brandRes] = await Promise.all([
        getFinanceProfile(token),
        apiFetch<{
          data: {
            brand_name?: string | null;
            legal_name?: string | null;
            logo_file_id?: string | null;
            primary_color?: string | null;
            secondary_color?: string | null;
            theme?: Record<string, unknown>;
          };
          error: null;
        }>('/api/tenant/branding', { token }),
      ]);
      const profile = profileRes.data;
      const brand = brandRes.data;
      const theme = brand?.theme ?? {};
      const logoUrl =
        typeof theme['logo_url'] === 'string'
          ? theme['logo_url']
          : typeof theme['logoUrl'] === 'string'
            ? theme['logoUrl']
            : null;
      const preview: SellerBrandingSnapshot = {
        legal_name: profile?.legal_name ?? brand?.legal_name ?? null,
        trade_name: profile?.trade_name ?? brand?.brand_name ?? null,
        brand_name: brand?.brand_name ?? profile?.trade_name ?? profile?.legal_name ?? null,
        gstin: profile?.gstin ?? null,
        logo_file_id: brand?.logo_file_id ?? null,
        logo_url: logoUrl && !String(logoUrl).includes('/platform/branding/') ? String(logoUrl) : null,
        primary_color: brand?.primary_color ?? null,
        secondary_color: brand?.secondary_color ?? null,
        address: (profile as { address?: Record<string, unknown> } | null)?.address ?? {},
      };
      return preview;
    },
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  useEffect(() => {
    const inv = invoiceQ.data?.data;
    if (!inv) return;
    setPartyId(inv.customer_party_id);
    setCurrency(inv.currency || 'INR');
    setIssueDate(toDateInput(inv.issue_date) || new Date().toISOString().slice(0, 10));
    setDueDate(toDateInput(inv.due_date));
    setNotes(inv.notes ?? '');
    setPaymentTerms(inv.payment_terms ?? '');
    if (inv.lines?.length) {
      setLines(
        inv.lines.map((l: InvoiceLine) => ({
          product_id: l.product_id ?? '',
          name_snapshot: l.name_snapshot,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          discount_amount: l.discount_amount != null ? String(l.discount_amount) : '0.00',
          tax_rate: l.tax_rate != null ? String(l.tax_rate) : '',
          hsn_sac: l.hsn_sac ?? '',
        })),
      );
    }
  }, [invoiceQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        customer_party_id: partyId || undefined,
        currency,
        issue_date: issueDate || null,
        due_date: dueDate || null,
        notes: notes || null,
        payment_terms: paymentTerms || null,
        place_of_supply_intra: intra,
        lines: lines.map((l) => ({
          product_id: l.product_id || null,
          name_snapshot: l.name_snapshot || undefined,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount || '0',
          tax_rate: l.tax_rate || null,
          tax_type: l.tax_rate ? 'gst' : 'none',
          hsn_sac: l.hsn_sac || null,
        })),
      };
      if (isNew) return createInvoice(await getToken(), body);
      return updateInvoice(await getToken(), id!, body);
    },
    onSuccess: (res) => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      if (isNew && res.data?.id) router.push(`/finance/invoices/${res.data.id}`);
      else void qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const fromQuoteMut = useMutation({
    mutationFn: async () => invoiceFromQuote(await getToken(), acceptedQuoteId),
    onSuccess: (res) => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      if (res.data?.id) router.push(`/finance/invoices/${res.data.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async (action: 'issue' | 'cancel' | 'void') => {
      const token = await getToken();
      if (action === 'issue') return issueInvoice(token, id!);
      if (action === 'cancel') return cancelInvoice(token, id!);
      return voidInvoice(token, id!);
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const payMut = useMutation({
    mutationFn: async () =>
      createPayment(await getToken(), {
        invoice_id: id,
        amount: payAmount,
        method: payMethod,
        currency,
      }),
    onSuccess: () => {
      setError(null);
      setPayAmount('');
      void qc.invalidateQueries({ queryKey: ['invoices'] });
      void qc.invalidateQueries({ queryKey: ['invoice', id] });
      void qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const [pdfDocId, setPdfDocId] = useState<string | null>(null);

  const pdfMut = useMutation({
    mutationFn: async (mode: 'generate' | 'download') => {
      const token = await getToken();
      if (mode === 'generate') {
        const res = await generateDocument(token, { source_type: 'invoice', source_id: id! });
        const artifactId = res.data?.id ?? res.data?.artifactId ?? null;
        setPdfDocId(artifactId);
        return res;
      }
      const docId = pdfDocId;
      if (!docId) throw new Error('Generate a PDF first');
      await downloadDocument(token, docId, `invoice-${id!.slice(0, 8)}.pdf`);
      return { data: { ok: true }, error: null };
    },
    onError: (e: Error) => setError(e.message),
  });

  const invoice = invoiceQ.data?.data;
  const status = invoice?.status ?? 'draft';
  const canEdit = isNew || status === 'draft';
  const canPay =
    !isNew && ['issued', 'partially_paid', 'overdue'].includes(status) && Number(invoice?.amount_due ?? 0) > 0;
  const parties = partiesQ.data?.data ?? [];
  const products = productsQ.data?.data ?? [];
  const acceptedQuotes = acceptedQuotesQ.data?.data ?? [];
  const customerLabel = parties.find((p) => p.id === (invoice?.customer_party_id ?? partyId))?.display_name ?? null;

  const productById = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const draftTotals = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    let tax = 0;
    for (const line of lines) {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unit_price) || 0;
      const disc = Number(line.discount_amount) || 0;
      const lineSub = qty * price;
      subtotal += lineSub;
      discount += disc;
      const taxable = Math.max(0, lineSub - disc);
      tax += (taxable * (Number(line.tax_rate) || 0)) / 100;
    }
    const taxableAmount = Math.max(0, subtotal - discount);
    return {
      subtotal,
      discount,
      taxableAmount,
      tax,
      grand: taxableAmount + tax,
    };
  }, [lines]);

  function setLine(i: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function onProductPick(i: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!productId) {
      setLine(i, { product_id: '', name_snapshot: '' });
      return;
    }
    setLine(i, {
      product_id: productId,
      name_snapshot: p?.name ?? '',
      unit_price: p?.list_price ?? '0.00',
    });
    if (p?.currency) setCurrency(p.currency);
  }

  function validateAndSave() {
    const next: Record<string, string> = {};
    if (!partyId) next.party = 'Customer Party is required';
    if (!lines.some((l) => l.name_snapshot.trim() || l.product_id)) {
      next.lines = 'Add at least one line item with a product or description';
    }
    setFieldErrors(next);
    if (Object.keys(next).length) {
      setError('Please fix the highlighted fields.');
      return;
    }
    saveMut.mutate();
  }

  const displayCurrency = invoice?.currency ?? currency;

  return (
    <div
      style={{
        padding: '0 0 24px',
        display: 'flex',
        justifyContent: 'center',
        boxSizing: 'border-box',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div
        role="dialog"
        aria-labelledby="invoice-builder-title"
        style={{
          ...panelStyle,
          maxWidth: '100%',
          width: '100%',
          margin: '0',
          boxShadow: 'none',
          padding: 0,
          overflow: 'hidden',
          border: 'none',
          background: 'transparent',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--surface) 92%, var(--bg))',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 id="invoice-builder-title" style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em' }}>
              {isNew ? 'New invoice' : (invoice?.invoice_number ?? 'Invoice')}
            </h1>
            {!isNew ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <StatusPill status={status} />
                {invoice ? (
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {money(invoice.total, invoice.currency)}
                    {invoice.amount_due != null ? ` · Due ${money(invoice.amount_due, invoice.currency)}` : ''}
                  </span>
                ) : null}
              </div>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text2)' }}>
                Build a draft invoice, or create one from an accepted quote.
              </p>
            )}
          </div>
          <GhostButton type="button" aria-label="Close invoice builder" onClick={() => router.push('/finance/invoices')}>
            Close
          </GhostButton>
        </header>

        <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!isNew || sellerPreviewQ.data ? (
            <InvoiceDocumentHeader
              invoice={
                invoice ??
                ({
                  id: 'new',
                  invoice_number: 'DRAFT',
                  status: 'draft',
                  customer_party_id: partyId || '',
                  currency,
                  subtotal: '0',
                  tax_amount: '0',
                  total: '0',
                  issue_date: issueDate,
                  due_date: dueDate || null,
                  payment_terms: paymentTerms || null,
                  party_snapshot: customerLabel ? { display_name: customerLabel } : {},
                } as import('../../lib/api').Invoice)
              }
              previewBrand={sellerPreviewQ.data}
              customerLabel={customerLabel}
            />
          ) : null}

          {isNew ? (
            <section
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--bg)',
              }}
            >
              <h2 style={sectionTitleStyle}>Create from accepted quote</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <LabeledSelect
                    label="Accepted quote"
                    value={acceptedQuoteId}
                    onChange={(e) => setAcceptedQuoteId(e.target.value)}
                  >
                    <option value="">Select accepted quote…</option>
                    {acceptedQuotes.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.quote_number}
                        {q.version > 1 ? ` v${q.version}` : ''} · {money(q.total, q.currency)}
                      </option>
                    ))}
                  </LabeledSelect>
                </div>
                <PrimaryButton
                  type="button"
                  disabled={!acceptedQuoteId || fromQuoteMut.isPending}
                  onClick={() => fromQuoteMut.mutate()}
                >
                  From quote
                </PrimaryButton>
              </div>
            </section>
          ) : null}

          <section>
            <h2 style={sectionTitleStyle}>Invoice information</h2>
            <div style={twoColGrid()}>
              <LabeledSelect
                label="Customer Party *"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                disabled={!canEdit}
                error={fieldErrors.party}
              >
                <option value="">Select customer…</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name} ({p.party_type === 'company' ? 'B2B' : 'B2C'})
                  </option>
                ))}
              </LabeledSelect>

              <LabeledSelect
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={!canEdit}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="AED">AED</option>
              </LabeledSelect>

              <LabeledSelect
                label="Tax treatment"
                value={intra ? 'intra' : 'inter'}
                onChange={(e) => setIntra(e.target.value === 'intra')}
                disabled={!canEdit}
              >
                <option value="intra">Intra-state (CGST + SGST)</option>
                <option value="inter">Inter-state (IGST)</option>
              </LabeledSelect>

              <LabeledInput
                label="Issue date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                disabled={!canEdit}
              />

              <LabeledInput
                label="Due date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
              />

              <LabeledInput
                label="Payment terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                disabled={!canEdit}
                placeholder="Net 15, Due on receipt…"
              />
            </div>
          </section>

          <section>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Line items</h2>
              {canEdit ? (
                <SecondaryButton type="button" onClick={() => setLines((l) => [...l, emptyLine()])}>
                  + Add item
                </SecondaryButton>
              ) : null}
            </div>
            {fieldErrors.lines ? (
              <p role="alert" style={{ margin: '0 0 10px', color: 'var(--red)', fontSize: 12 }}>
                {fieldErrors.lines}
              </p>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lines.map((line, i) => {
                const product = line.product_id ? productById.get(line.product_id) : undefined;
                const isAdhoc = !line.product_id;
                return (
                  <div
                    key={i}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 12,
                      padding: 14,
                      background: 'var(--bg)',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text2)' }}>
                        Item {i + 1}
                        {isAdhoc ? ' · Ad-hoc' : ' · Product'}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                        {money(linePreviewTotal(line), displayCurrency)}
                      </span>
                    </div>

                    <div style={twoColGrid()}>
                      <LabeledSelect
                        id={`inv-line-${i}-product`}
                        label="Product / Ad-hoc"
                        value={line.product_id}
                        onChange={(e) => onProductPick(i, e.target.value)}
                        disabled={!canEdit}
                      >
                        <option value="">Ad-hoc line</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </LabeledSelect>

                      <LabeledInput
                        id={`inv-line-${i}-description`}
                        label="Description"
                        value={line.name_snapshot}
                        onChange={(e) => setLine(i, { name_snapshot: e.target.value })}
                        disabled={!canEdit}
                        placeholder={isAdhoc ? 'Describe this line item' : 'Product name'}
                      />
                    </div>

                    {product ? (
                      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>
                        <strong style={{ color: 'var(--text)' }}>{product.name}</strong>
                        {' · '}SKU {product.sku}
                        {' · '}List {money(product.list_price, product.currency)}
                      </p>
                    ) : null}

                    <div style={twoColGrid()}>
                      <LabeledInput
                        label="Quantity"
                        value={line.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        label="Unit price"
                        value={line.unit_price}
                        onChange={(e) => setLine(i, { unit_price: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        label="Discount"
                        value={line.discount_amount}
                        onChange={(e) => setLine(i, { discount_amount: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        label="Tax %"
                        value={line.tax_rate}
                        onChange={(e) => setLine(i, { tax_rate: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        label="HSN / SAC"
                        value={line.hsn_sac}
                        onChange={(e) => setLine(i, { hsn_sac: e.target.value })}
                        disabled={!canEdit}
                      />
                      <LabeledInput
                        label="Line total"
                        value={money(linePreviewTotal(line), displayCurrency)}
                        readOnly
                        disabled
                      />
                    </div>

                    {canEdit && lines.length > 1 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                        <SecondaryButton
                          type="button"
                          onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          Remove
                        </SecondaryButton>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <LabeledTextarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="Optional notes for the customer"
            />
          </section>

          <section
            style={{
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
              background: 'color-mix(in srgb, var(--surface2) 70%, var(--surface))',
            }}
          >
            <h2 style={sectionTitleStyle}>Totals · {displayCurrency}</h2>
            {(
              [
                ['Subtotal', !isNew && invoice ? invoice.subtotal : draftTotals.subtotal],
                ['Discount', !isNew && invoice ? invoice.discount_total ?? '0' : draftTotals.discount],
                [
                  'Taxable amount',
                  !isNew && invoice ? invoice.taxable_amount ?? invoice.subtotal : draftTotals.taxableAmount,
                ],
                ['Tax', !isNew && invoice ? invoice.tax_amount : draftTotals.tax],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 13,
                  padding: '6px 0',
                  color: 'var(--text2)',
                }}
              >
                <span>{label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                  {money(value, displayCurrency)}
                </span>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 10,
                paddingTop: 12,
                borderTop: '1px solid var(--border)',
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              <span>Grand total</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--accent)' }}>
                {money(!isNew && invoice ? invoice.total : draftTotals.grand, displayCurrency)}
              </span>
            </div>
            {!isNew && invoice ? (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Amount paid</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money(invoice.amount_paid, displayCurrency)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Amount due</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650, color: 'var(--text)' }}>
                    {money(invoice.amount_due, displayCurrency)}
                  </span>
                </div>
              </div>
            ) : null}
            {isNew || status === 'draft' ? (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text2)' }}>
                Draft totals are estimates. Saved invoices use server-side calculation.
              </p>
            ) : null}
          </section>

          {canPay ? (
            <section
              style={{
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--bg)',
              }}
            >
              <h2 style={sectionTitleStyle}>Record payment</h2>
              <div style={twoColGrid()}>
                <LabeledInput
                  label="Amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={invoice?.amount_due ?? ''}
                />
                <LabeledSelect
                  label="Method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                >
                  <option value="upi">UPI</option>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="gateway">Gateway</option>
                  <option value="other">Other</option>
                </LabeledSelect>
              </div>
              <PrimaryButton
                type="button"
                style={{ marginTop: 8 }}
                disabled={!payAmount || payMut.isPending}
                onClick={() => payMut.mutate()}
              >
                Record payment
              </PrimaryButton>
            </section>
          ) : null}

          {error ? (
            <p role="alert" style={{ margin: 0, color: 'var(--red, #b91c1c)', fontSize: 13 }}>
              {error}
            </p>
          ) : null}
        </div>

        <footer
          className="tq-inv-actions"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
            position: 'sticky',
            bottom: 0,
          }}
        >
          <SecondaryButton type="button" onClick={() => router.push('/finance/invoices')}>
            Cancel
          </SecondaryButton>

          {canEdit ? (
            <PrimaryButton type="button" onClick={validateAndSave} disabled={saveMut.isPending}>
              {isNew ? 'Create' : 'Save draft'}
            </PrimaryButton>
          ) : null}

          {!isNew && status === 'draft' ? (
            <PrimaryButton type="button" onClick={() => actionMut.mutate('issue')} disabled={actionMut.isPending}>
              Issue
            </PrimaryButton>
          ) : null}

          {!isNew && status === 'draft' ? (
            <DangerButton type="button" onClick={() => actionMut.mutate('cancel')} disabled={actionMut.isPending}>
              Cancel invoice
            </DangerButton>
          ) : null}

          {!isNew && ['issued', 'partially_paid', 'overdue'].includes(status) ? (
            <DangerButton type="button" onClick={() => actionMut.mutate('void')} disabled={actionMut.isPending}>
              Void
            </DangerButton>
          ) : null}

          {!isNew && status !== 'cancelled' ? (
            <>
              <SecondaryButton
                type="button"
                disabled={pdfMut.isPending}
                onClick={() => pdfMut.mutate('generate')}
              >
                {pdfMut.isPending && pdfMut.variables === 'generate' ? 'Generating…' : 'Generate PDF'}
              </SecondaryButton>
              <SecondaryButton
                type="button"
                disabled={pdfMut.isPending || !pdfDocId}
                onClick={() => pdfMut.mutate('download')}
              >
                Download PDF
              </SecondaryButton>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
