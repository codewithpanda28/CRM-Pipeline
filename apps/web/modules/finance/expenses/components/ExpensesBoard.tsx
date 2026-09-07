'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  EmptyState,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
  twoColGrid,
} from '@/modules/crm/shared/ui';
import {
  createExpense,
  deleteExpense,
  listExpenses,
  listVendors,
  type Expense,
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

const emptyForm = () => ({
  vendor_id: '',
  category: '',
  amount: '',
  currency: 'INR',
  expense_date: new Date().toISOString().slice(0, 10),
  notes: '',
});

export function ExpensesBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const expensesQ = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => listExpenses(await getToken(), { per_page: '50' }),
    enabled: Boolean(user),
  });

  const vendorsQ = useQuery({
    queryKey: ['vendors', 'expense-picker'],
    queryFn: async () => listVendors(await getToken(), { per_page: '100' }),
    enabled: Boolean(user),
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createExpense(await getToken(), {
        vendor_id: form.vendor_id || null,
        category: form.category || null,
        amount: form.amount,
        currency: form.currency,
        expense_date: form.expense_date || undefined,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setForm(emptyForm());
      setError(null);
      void qc.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => deleteExpense(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const rows: Expense[] = expensesQ.data?.data ?? [];
  const vendors = vendorsQ.data?.data ?? [];
  const vendorName = new Map(vendors.map((v) => [v.id, v.display_name]));
  const loading = expensesQ.isLoading;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Expenses"
        subtitle="Track vendor spend by category and date."
        actions={
          <>
            <SecondaryButton type="button" onClick={() => void expensesQ.refetch()} disabled={loading}>
              Refresh
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                setShowCreate(true);
                setError(null);
              }}
            >
              New expense
            </PrimaryButton>
          </>
        }
      />

      {showCreate ? (
        <section style={{ ...panelStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>New expense</h2>
          <div style={twoColGrid()}>
            <LabeledSelect
              label="Vendor"
              value={form.vendor_id}
              onChange={(e) => setForm((f) => ({ ...f, vendor_id: e.target.value }))}
            >
              <option value="">Optional vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.display_name}
                </option>
              ))}
            </LabeledSelect>
            <LabeledInput
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="ops, travel, software…"
            />
            <LabeledInput
              label="Amount *"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              inputMode="decimal"
            />
            <LabeledSelect
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </LabeledSelect>
            <LabeledInput
              label="Date"
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
            />
          </div>
          <LabeledTextarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
          {error ? (
            <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <PrimaryButton
              type="button"
              disabled={!form.amount || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create expense
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </SecondaryButton>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading expenses…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description="Log vendor spend with category, amount, and date."
          action={
            <PrimaryButton type="button" onClick={() => setShowCreate(true)}>
              New expense
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-exp-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Date', 'Vendor', 'Category', 'Amount', 'Status', 'Actions'].map((h) => (
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
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.expense_date)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.vendor_id ? vendorName.get(row.vendor_id) ?? '—' : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>{row.category || '—'}</td>
                      <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {money(row.total ?? row.amount, row.currency)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.payment_status ? <StatusPill status={row.payment_status} /> : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <SecondaryButton
                          type="button"
                          onClick={() => delMut.mutate(row.id)}
                          disabled={delMut.isPending}
                        >
                          Delete
                        </SecondaryButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-exp-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <div key={row.id} style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{money(row.total ?? row.amount, row.currency)}</strong>
                  {row.payment_status ? <StatusPill status={row.payment_status} /> : null}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, display: 'grid', gap: 4 }}>
                  <div>{row.category || 'Uncategorized'}</div>
                  <div>{row.vendor_id ? vendorName.get(row.vendor_id) ?? '—' : 'No vendor'}</div>
                  <div>{fmtDate(row.expense_date)}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-exp-table { display: none !important; }
          .tq-exp-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
