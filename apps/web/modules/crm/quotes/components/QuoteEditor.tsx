'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import { listProducts, type Product } from '@/modules/crm/products/lib/api';
import { listCustomerParties } from '@/modules/crm/customer-parties/lib/api';
import { listContacts } from '@vencore/api-client';
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
  createQuote,
  downloadQuoteDocument,
  generateQuoteDocument,
  getQuote,
  quoteAction,
  updateQuote,
  type QuoteLine,
} from '../lib/api';

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

export function QuoteEditor({ id }: { id?: string }) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const isNew = !id;

  const [partyId, setPartyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [dealId, setDealId] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [intra, setIntra] = useState(true);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const partiesQ = useQuery({
    queryKey: ['customer-parties', 'quote-picker'],
    queryFn: async () => listCustomerParties(await getToken(), { status: 'active', per_page: '100' }),
    enabled: Boolean(user),
  });

  const productsQ = useQuery({
    queryKey: ['products', 'quote-picker'],
    queryFn: async () => listProducts(await getToken(), { is_active: 'true', per_page: '100' }),
    enabled: Boolean(user),
  });

  const dealsQ = useQuery({
    queryKey: ['deals', 'quote-picker'],
    queryFn: async () =>
      apiFetch<{ data: { id: string; name: string }[]; error: null }>('/api/deals?per_page=50', {
        token: await getToken(),
      }),
    enabled: Boolean(user),
  });

  const contactsQ = useQuery({
    queryKey: ['contacts', 'quote-picker'],
    queryFn: async () => listContacts(await getToken(), { per_page: '100' }),
    enabled: Boolean(user),
  });

  const quoteQ = useQuery({
    queryKey: ['quote', id],
    queryFn: async () => getQuote(await getToken(), id!),
    enabled: Boolean(user && id),
  });

  useEffect(() => {
    const q = quoteQ.data?.data;
    if (!q) return;
    setPartyId(q.customer_party_id);
    setContactId(q.contact_id ?? '');
    setDealId(q.deal_id ?? '');
    setCurrency(q.currency || 'INR');
    setIssueDate(toDateInput(q.issue_date) || new Date().toISOString().slice(0, 10));
    setExpiryDate(toDateInput(q.expiry_date));
    setNotes(q.notes ?? '');
    if (q.lines?.length) {
      setLines(
        q.lines.map((l: QuoteLine) => ({
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
  }, [quoteQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        customer_party_id: partyId || undefined,
        contact_id: contactId || null,
        deal_id: dealId || null,
        currency,
        issue_date: issueDate || null,
        expiry_date: expiryDate || null,
        notes: notes || null,
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
      if (isNew) return createQuote(await getToken(), body);
      return updateQuote(await getToken(), id!, body);
    },
    onSuccess: (res) => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      if (isNew && res.data?.id) router.push(`/crm/quotes/${res.data.id}`);
      else void qc.invalidateQueries({ queryKey: ['quote', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const actionMut = useMutation({
    mutationFn: async (action: string) => quoteAction(await getToken(), id!, action),
    onSuccess: (res, action) => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      if (action === 'revise' && res.data?.id) {
        router.push(`/crm/quotes/${res.data.id}`);
        return;
      }
      void qc.invalidateQueries({ queryKey: ['quote', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const [pdfDocId, setPdfDocId] = useState<string | null>(null);
  const pdfMut = useMutation({
    mutationFn: async (mode: 'generate' | 'download') => {
      const token = await getToken();
      if (mode === 'generate') {
        const res = await generateQuoteDocument(token, id!);
        const artifactId = res.data?.id ?? res.data?.artifactId ?? null;
        setPdfDocId(artifactId);
        return res;
      }
      if (!pdfDocId) throw new Error('Generate a PDF first');
      await downloadQuoteDocument(token, pdfDocId);
      return { data: { ok: true }, error: null };
    },
    onError: (e: Error) => setError(e.message),
  });

  const quote = quoteQ.data?.data;
  const status = quote?.status ?? 'draft';
  const canEdit = isNew || status === 'draft';
  const parties = partiesQ.data?.data ?? [];
  const products = productsQ.data?.data ?? [];
  const deals = dealsQ.data?.data ?? [];
  const contacts = contactsQ.data?.data ?? [];

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

  const displayCurrency = quote?.currency ?? currency;

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
        aria-labelledby="quote-builder-title"
        style={{
          ...panelStyle,
          maxWidth: 960,
          width: '100%',
          margin: '0 auto',
          boxShadow: '0 8px 28px color-mix(in srgb, var(--text) 8%, transparent)',
          padding: 0,
          overflow: 'hidden',
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
            <h1 id="quote-builder-title" style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.02em' }}>
              {isNew ? 'New quote' : `${quote?.quote_number ?? 'Quote'} v${quote?.version ?? ''}`}
            </h1>
            {!isNew ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <StatusPill status={status} />
                {quote ? (
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {money(quote.total, quote.currency)}
                  </span>
                ) : null}
              </div>
            ) : (
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text2)' }}>
                Build a commercial quote with labeled line items and clear totals.
              </p>
            )}
          </div>
          <GhostButton type="button" aria-label="Close quote builder" onClick={() => router.push('/crm/quotes')}>
            Close
          </GhostButton>
        </header>

        <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section>
            <h2 style={sectionTitleStyle}>Quote information</h2>
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
                label="Contact"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Optional contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` · ${c.email}` : c.phone ? ` · ${c.phone}` : ''}
                  </option>
                ))}
              </LabeledSelect>

              <LabeledSelect
                label="Deal"
                value={dealId}
                onChange={(e) => setDealId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Optional deal…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
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
                label="Expiry date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                disabled={!canEdit}
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
                        id={`line-${i}-product`}
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
                        id={`line-${i}-description`}
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
                        {' · '}Unit {product.unit}
                      </p>
                    ) : null}

                    <div style={twoColGrid()}>
                      <LabeledInput
                        id={`line-${i}-qty`}
                        label="Quantity"
                        value={line.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        id={`line-${i}-unit-price`}
                        label="Unit price"
                        value={line.unit_price}
                        onChange={(e) => setLine(i, { unit_price: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        id={`line-${i}-discount`}
                        label="Discount"
                        value={line.discount_amount}
                        onChange={(e) => setLine(i, { discount_amount: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        id={`line-${i}-tax`}
                        label="Tax %"
                        value={line.tax_rate}
                        onChange={(e) => setLine(i, { tax_rate: e.target.value })}
                        disabled={!canEdit}
                        inputMode="decimal"
                      />
                      <LabeledInput
                        id={`line-${i}-hsn`}
                        label="HSN / SAC"
                        value={line.hsn_sac}
                        onChange={(e) => setLine(i, { hsn_sac: e.target.value })}
                        disabled={!canEdit}
                      />
                      <LabeledInput
                        id={`line-${i}-total`}
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
                        {i > 0 ? (
                          <GhostButton
                            type="button"
                            onClick={() =>
                              setLines((prev) => {
                                const next = [...prev];
                                [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                                return next;
                              })
                            }
                          >
                            Move up
                          </GhostButton>
                        ) : null}
                        {i < lines.length - 1 ? (
                          <GhostButton
                            type="button"
                            onClick={() =>
                              setLines((prev) => {
                                const next = [...prev];
                                [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
                                return next;
                              })
                            }
                          >
                            Move down
                          </GhostButton>
                        ) : null}
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
                ['Subtotal', !isNew && quote ? quote.subtotal : draftTotals.subtotal],
                ['Discount', !isNew && quote ? quote.discount_total ?? '0' : draftTotals.discount],
                ['Taxable amount', !isNew && quote ? quote.taxable_amount ?? quote.subtotal : draftTotals.taxableAmount],
                ['Tax', !isNew && quote ? quote.tax_amount : draftTotals.tax],
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
                {money(!isNew && quote ? quote.total : draftTotals.grand, displayCurrency)}
              </span>
            </div>
            {isNew || status === 'draft' ? (
              <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text2)' }}>
                Draft totals are estimates. Saved quotes use server-side calculation.
              </p>
            ) : null}
          </section>

          {error ? (
            <p role="alert" style={{ margin: 0, color: 'var(--red, #b91c1c)', fontSize: 13 }}>
              {error}
            </p>
          ) : null}
        </div>

        <footer
          className="tq-quote-actions"
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
          <SecondaryButton type="button" onClick={() => router.push('/crm/quotes')}>
            Cancel
          </SecondaryButton>

          {canEdit ? (
            <PrimaryButton type="button" onClick={validateAndSave} disabled={saveMut.isPending}>
              {isNew ? 'Create quote' : 'Save draft'}
            </PrimaryButton>
          ) : null}

          {!isNew && status === 'draft' ? (
            <PrimaryButton type="button" onClick={() => actionMut.mutate('send')} disabled={actionMut.isPending}>
              Send
            </PrimaryButton>
          ) : null}

          {!isNew && (status === 'sent' || status === 'viewed') ? (
            <>
              <SecondaryButton type="button" onClick={() => actionMut.mutate('view')} disabled={actionMut.isPending}>
                Mark viewed
              </SecondaryButton>
              <PrimaryButton type="button" onClick={() => actionMut.mutate('accept')} disabled={actionMut.isPending}>
                Accept
              </PrimaryButton>
              <DangerButton type="button" onClick={() => actionMut.mutate('reject')} disabled={actionMut.isPending}>
                Reject
              </DangerButton>
              <SecondaryButton type="button" onClick={() => actionMut.mutate('revise')} disabled={actionMut.isPending}>
                Revise
              </SecondaryButton>
            </>
          ) : null}

          {!isNew && (status === 'draft' || status === 'sent' || status === 'viewed') ? (
            <DangerButton type="button" onClick={() => actionMut.mutate('cancel')} disabled={actionMut.isPending}>
              Cancel quote
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
