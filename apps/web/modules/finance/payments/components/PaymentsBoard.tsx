'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  EmptyState,
  LabeledInput,
  LabeledSelect,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  formGrid,
  formSpanFull,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import {
  createPayment,
  listInvoices,
  listPayments,
  type Payment,
  type PaymentMethod,
} from '../../lib/api';

function money(amount: string | undefined, currency: string) {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} ${amount ?? '—'}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return String(value).slice(0, 10) || '—';
}

export function PaymentsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const paymentsQ = useQuery({
    queryKey: ['payments'],
    queryFn: async () => listPayments(await getToken(), { per_page: '50' }),
    enabled: Boolean(user),
  });

  const openInvoicesQ = useQuery({
    queryKey: ['invoices', 'open-for-payment'],
    queryFn: async () => listInvoices(await getToken(), { per_page: '100' }),
    enabled: Boolean(user),
  });

  const openInvoices = useMemo(
    () =>
      (openInvoicesQ.data?.data ?? []).filter((inv) =>
        ['issued', 'partially_paid', 'overdue'].includes(inv.status),
      ),
    [openInvoicesQ.data],
  );

  const invoiceLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const inv of openInvoicesQ.data?.data ?? []) {
      map.set(inv.id, `${inv.invoice_number} · due ${money(inv.amount_due, inv.currency)}`);
    }
    return map;
  }, [openInvoicesQ.data]);

  const createMut = useMutation({
    mutationFn: async () =>
      createPayment(await getToken(), {
        invoice_id: invoiceId,
        amount,
        method,
        payment_date: paymentDate,
        reference: reference || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      setInvoiceId('');
      setAmount('');
      setReference('');
      setNotes('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['payments'] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows: Payment[] = paymentsQ.data?.data ?? [];
  const loading = paymentsQ.isLoading;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Payments"
        subtitle="Record customer payments against open invoices."
        actions={
          <SecondaryButton type="button" onClick={() => void paymentsQ.refetch()} disabled={loading}>
            Refresh
          </SecondaryButton>
        }
      />

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>Record payment</h2>
        <div style={formGrid(180)}>
          <LabeledSelect label="Invoice *" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">Select open invoice…</option>
            {openInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} · {money(inv.amount_due, inv.currency)} due
              </option>
            ))}
          </LabeledSelect>
          <LabeledInput
            label="Amount *"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
          <LabeledSelect
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="gateway">Gateway</option>
            <option value="other">Other</option>
          </LabeledSelect>
          <LabeledInput
            label="Payment date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
          <LabeledInput label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          <div style={formSpanFull()}>
            <LabeledInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error ? (
          <p role="alert" style={{ color: 'var(--red)', fontSize: 13, margin: '8px 0 0' }}>
            {error}
          </p>
        ) : null}
        <PrimaryButton
          type="button"
          style={{ marginTop: 12 }}
          disabled={!invoiceId || !amount || createMut.isPending}
          onClick={() => createMut.mutate()}
        >
          Record payment
        </PrimaryButton>
      </section>

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading payments…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No payments yet"
          description="Record a payment against an issued invoice to update amounts due."
        />
      ) : (
        <>
          <div className="tq-pay-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Payment #', 'Invoice', 'Amount', 'Method', 'Date', 'Status'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '12px 14px',
                          fontWeight: 600,
                          color: 'var(--text2)',
                          borderBottom: '1px solid var(--border)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{row.payment_number}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/finance/invoices/${row.invoice_id}`}
                          style={{ color: 'var(--accent)', textDecoration: 'none', minHeight: 40, display: 'inline-flex', alignItems: 'center' }}
                        >
                          {invoiceLabel.get(row.invoice_id)?.split(' · ')[0] ?? 'Invoice'}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {money(row.amount, row.currency)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>{row.method}</td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.payment_date)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-pay-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <div key={row.id} style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <strong>{row.payment_number}</strong>
                  <StatusPill status={row.status} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  <div>{money(row.amount, row.currency)} · {row.method}</div>
                  <div>{fmtDate(row.payment_date)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-pay-table { display: none !important; }
          .tq-pay-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
