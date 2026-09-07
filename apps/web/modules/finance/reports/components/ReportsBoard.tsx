'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  LabeledInput,
  PageHeader,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import { getFinanceReports, getGlReport, type GlReportKind } from '../../lib/api';

function money(amount: string | number | undefined, currency = 'INR') {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return String(amount ?? '—');
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return String(value).slice(0, 10) || '—';
}

const BUCKET_LABELS: Record<string, string> = {
  current: 'Current',
  '1_30': '1–30 days',
  '31_60': '31–60 days',
  '61_90': '61–90 days',
  '90_plus': '90+ days',
};

type TabId = 'operational' | GlReportKind;

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'operational', label: 'AR / Sales / Tax' },
  { id: 'trial-balance', label: 'Trial Balance' },
  { id: 'profit-and-loss', label: 'P&L' },
  { id: 'balance-sheet', label: 'Balance Sheet' },
  { id: 'cash-flow', label: 'Cash Flow' },
];

const DISCLAIMER =
  'Management accounting from posted journals — not audited GAAP/IFRS or statutory certification.';

export function ReportsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('operational');
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(() => `${new Date().getUTCFullYear()}-01-01`);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const agingQ = useQuery({
    queryKey: ['finance-reports', 'ar-aging'],
    queryFn: async () => getFinanceReports(await getToken(), 'ar-aging'),
    enabled: Boolean(user) && tab === 'operational',
  });
  const salesQ = useQuery({
    queryKey: ['finance-reports', 'sales'],
    queryFn: async () => getFinanceReports(await getToken(), 'sales'),
    enabled: Boolean(user) && tab === 'operational',
  });
  const paymentsQ = useQuery({
    queryKey: ['finance-reports', 'payments'],
    queryFn: async () => getFinanceReports(await getToken(), 'payments'),
    enabled: Boolean(user) && tab === 'operational',
  });
  const expensesQ = useQuery({
    queryKey: ['finance-reports', 'expenses'],
    queryFn: async () => getFinanceReports(await getToken(), 'expenses'),
    enabled: Boolean(user) && tab === 'operational',
  });
  const taxQ = useQuery({
    queryKey: ['finance-reports', 'tax'],
    queryFn: async () => getFinanceReports(await getToken(), 'tax'),
    enabled: Boolean(user) && tab === 'operational',
  });

  const glParams: Record<string, string> | undefined =
    tab === 'trial-balance' || tab === 'balance-sheet'
      ? { as_of: asOf }
      : tab === 'profit-and-loss' || tab === 'cash-flow'
        ? { from, to }
        : undefined;

  const glQ = useQuery({
    queryKey: ['gl-reports', tab, glParams],
    queryFn: async () => getGlReport(await getToken(), tab as GlReportKind, glParams),
    enabled: Boolean(user) && tab !== 'operational',
  });

  const aging = (agingQ.data?.data ?? []) as Array<{
    bucket: string;
    invoice_count: string;
    amount_due: string;
  }>;
  const sales = (salesQ.data?.data ?? []) as Array<{
    invoice_number: string;
    status: string;
    issue_date?: string;
    currency: string;
    subtotal: string;
    tax_amount: string;
    total: string;
    amount_due: string;
  }>;
  const payments = (paymentsQ.data?.data ?? []) as Array<{
    payment_number: string;
    amount: string;
    currency: string;
    method: string;
    payment_date: string;
    status: string;
  }>;
  const expenses = (expensesQ.data?.data ?? []) as Array<{
    category?: string | null;
    amount: string;
    total?: string;
    currency: string;
    expense_date: string;
    payment_status?: string;
  }>;
  const tax = (taxQ.data?.data ?? null) as {
    invoice_count?: string;
    taxable_amount?: string;
    tax_amount?: string;
    total?: string;
  } | null;

  const loading =
    tab === 'operational'
      ? agingQ.isLoading || salesQ.isLoading || paymentsQ.isLoading || expensesQ.isLoading || taxQ.isLoading
      : glQ.isLoading;

  function refetchAll() {
    if (tab === 'operational') {
      void agingQ.refetch();
      void salesQ.refetch();
      void paymentsQ.refetch();
      void expensesQ.refetch();
      void taxQ.refetch();
    } else {
      void glQ.refetch();
    }
  }

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Finance reports"
        subtitle="Operational registers and management GL statements."
        actions={
          <SecondaryButton type="button" onClick={refetchAll} disabled={loading}>
            Refresh
          </SecondaryButton>
        }
      />

      <p
        style={{
          margin: '0 0 16px',
          fontSize: 13,
          color: 'var(--text2)',
          lineHeight: 1.45,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
        }}
      >
        {DISCLAIMER} AR aging, sales, and tax views summarize commercial documents for day-to-day
        operations.
      </p>

      <div
        className="tq-rpt-tabs"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 14,
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                minHeight: 36,
                padding: '6px 12px',
                borderRadius: 8,
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface)',
                color: active ? 'var(--text)' : 'var(--text2)',
                fontSize: 13,
                fontWeight: active ? 650 : 500,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab !== 'operational' ? (
        <div
          style={{
            ...panelStyle,
            padding: 14,
            marginBottom: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'flex-end',
          }}
        >
          {tab === 'trial-balance' || tab === 'balance-sheet' ? (
            <LabeledInput
              label="As of"
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          ) : (
            <>
              <LabeledInput label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <LabeledInput label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
        </div>
      ) : null}

      {tab === 'operational' ? (
        <OperationalSection
          aging={aging}
          sales={sales}
          payments={payments}
          expenses={expenses}
          tax={tax}
        />
      ) : loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading report…</p>
        </div>
      ) : glQ.isError ? (
        <div style={panelStyle}>
          <p role="alert" style={{ margin: 0, color: 'var(--red)', fontSize: 13 }}>
            {(glQ.error as Error).message}
          </p>
        </div>
      ) : (
        <GlSection kind={tab} data={glQ.data?.data} />
      )}
    </div>
  );
}

function OperationalSection({
  aging,
  sales,
  payments,
  expenses,
  tax,
}: {
  aging: Array<{ bucket: string; invoice_count: string; amount_due: string }>;
  sales: Array<{
    invoice_number: string;
    status: string;
    issue_date?: string;
    currency: string;
    subtotal: string;
    tax_amount: string;
    total: string;
    amount_due: string;
  }>;
  payments: Array<{
    payment_number: string;
    amount: string;
    currency: string;
    method: string;
    payment_date: string;
    status: string;
  }>;
  expenses: Array<{
    category?: string | null;
    amount: string;
    total?: string;
    currency: string;
    expense_date: string;
    payment_status?: string;
  }>;
  tax: {
    invoice_count?: string;
    taxable_amount?: string;
    tax_amount?: string;
    total?: string;
  } | null;
}) {
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          minWidth: 0,
        }}
      >
        <section style={{ ...panelStyle, padding: 16 }}>
          <h2 style={sectionTitleStyle}>AR aging</h2>
          {aging.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No open receivables.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text2)' }}>
                  <th style={{ padding: '6px 0', fontWeight: 600 }}>Bucket</th>
                  <th style={{ padding: '6px 0', fontWeight: 600 }}>Invoices</th>
                  <th style={{ padding: '6px 0', fontWeight: 600 }}>Due</th>
                </tr>
              </thead>
              <tbody>
                {aging.map((row) => (
                  <tr key={row.bucket} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>{BUCKET_LABELS[row.bucket] ?? row.bucket}</td>
                    <td style={{ padding: '8px 0' }}>{row.invoice_count}</td>
                    <td style={{ padding: '8px 0', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                      {money(row.amount_due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section style={{ ...panelStyle, padding: 16 }}>
          <h2 style={sectionTitleStyle}>Tax summary</h2>
          {!tax ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No tax data.</p>
          ) : (
            <div style={{ fontSize: 13, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Invoices</span>
                <span style={{ fontWeight: 600 }}>{tax.invoice_count ?? '0'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Taxable</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(tax.taxable_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Tax</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{money(tax.tax_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text2)' }}>Total</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{money(tax.total)}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <RegisterTable
        title="Sales register"
        empty="No posted sales yet."
        headers={['Invoice', 'Status', 'Issue date', 'Subtotal', 'Tax', 'Total', 'Due']}
        minWidth={640}
        rows={sales.slice(0, 50).map((row, i) => [
          row.invoice_number,
          <StatusPill key={`s-${i}`} status={row.status} />,
          fmtDate(row.issue_date),
          money(row.subtotal, row.currency),
          money(row.tax_amount, row.currency),
          money(row.total, row.currency),
          money(row.amount_due, row.currency),
        ])}
      />

      <RegisterTable
        title="Payments register"
        empty="No payments recorded."
        headers={['Payment #', 'Amount', 'Method', 'Date', 'Status']}
        minWidth={560}
        rows={payments.slice(0, 50).map((row, i) => [
          row.payment_number,
          money(row.amount, row.currency),
          row.method,
          fmtDate(row.payment_date),
          <StatusPill key={`p-${i}`} status={row.status} />,
        ])}
      />

      <RegisterTable
        title="Expenses register"
        empty="No expenses logged."
        headers={['Date', 'Category', 'Amount', 'Status']}
        minWidth={520}
        rows={expenses.slice(0, 50).map((row, i) => [
          fmtDate(row.expense_date),
          row.category || '—',
          money(row.total ?? row.amount, row.currency),
          row.payment_status ? <StatusPill key={`e-${i}`} status={row.payment_status} /> : '—',
        ])}
      />
    </>
  );
}

function RegisterTable({
  title,
  empty,
  headers,
  rows,
  minWidth,
}: {
  title: string;
  empty: string;
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
  minWidth: number;
}) {
  return (
    <section style={{ ...panelStyle, marginTop: 12, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text2)' }}>{empty}</p>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                {headers.map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text2)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  {cells.map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        padding: '10px 14px',
                        fontVariantNumeric: j > 0 ? 'tabular-nums' : undefined,
                        fontWeight: j === 0 ? 600 : undefined,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GlSection({ kind, data }: { kind: GlReportKind; data: unknown }) {
  if (!data || typeof data !== 'object') {
    return (
      <div style={panelStyle}>
        <p style={{ margin: 0, color: 'var(--text2)' }}>No data.</p>
      </div>
    );
  }

  if (kind === 'trial-balance') {
    const tb = data as {
      as_of: string;
      accounts: Array<{
        code: string;
        name: string;
        account_type: string;
        debit: string;
        credit: string;
      }>;
      total_debit: string;
      total_credit: string;
      balanced: boolean;
      disclaimer?: string;
    };
    return (
      <section style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ ...sectionTitleStyle, margin: 0 }}>
            Trial balance · as of {fmtDate(tb.as_of)}
            {tb.balanced ? ' · balanced' : ' · unbalanced'}
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text2)' }}>
            {tb.disclaimer ?? DISCLAIMER}
          </p>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                {['Code', 'Name', 'Type', 'Debit', 'Credit'].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text2)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tb.accounts.map((row) => (
                <tr key={row.code} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 650 }}>{row.code}</td>
                  <td style={{ padding: '10px 14px' }}>{row.name}</td>
                  <td style={{ padding: '10px 14px', textTransform: 'capitalize' }}>{row.account_type}</td>
                  <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(row.debit) > 0 ? money(row.debit) : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                    {Number(row.credit) > 0 ? money(row.credit) : '—'}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td colSpan={3} style={{ padding: '10px 14px' }}>
                  Totals
                </td>
                <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                  {money(tb.total_debit)}
                </td>
                <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                  {money(tb.total_credit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  if (kind === 'profit-and-loss') {
    const pnl = data as {
      from: string;
      to: string;
      revenue: Array<{ code: string; name: string; amount: string }>;
      expenses: Array<{ code: string; name: string; amount: string }>;
      revenue_total: string;
      expense_total: string;
      net_income: string;
      disclaimer?: string;
    };
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
          {fmtDate(pnl.from)} → {fmtDate(pnl.to)} · {pnl.disclaimer ?? DISCLAIMER}
        </p>
        <AmountList title="Revenue" rows={pnl.revenue} total={pnl.revenue_total} />
        <AmountList title="Expenses" rows={pnl.expenses} total={pnl.expense_total} />
        <section style={{ ...panelStyle, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
            <span>Net income</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(pnl.net_income)}</span>
          </div>
        </section>
      </div>
    );
  }

  if (kind === 'balance-sheet') {
    const bs = data as {
      as_of: string;
      assets: Array<{ code: string; name: string; amount: string }>;
      liabilities: Array<{ code: string; name: string; amount: string }>;
      equity: Array<{ code: string; name: string; amount: string }>;
      assets_total: string;
      liabilities_total: string;
      equity_total: string;
      liabilities_and_equity_total: string;
      disclaimer?: string;
    };
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
          As of {fmtDate(bs.as_of)} · {bs.disclaimer ?? DISCLAIMER}
        </p>
        <AmountList title="Assets" rows={bs.assets} total={bs.assets_total} />
        <AmountList title="Liabilities" rows={bs.liabilities} total={bs.liabilities_total} />
        <AmountList title="Equity" rows={bs.equity} total={bs.equity_total} />
        <section style={{ ...panelStyle, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>Liabilities + equity</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {money(bs.liabilities_and_equity_total)}
            </span>
          </div>
        </section>
      </div>
    );
  }

  const cf = data as {
    from: string;
    to: string;
    operating: {
      net_income: string;
      cash_receipts: string;
      cash_payments: string;
      net_cash_from_operations: string;
    };
    investing: { net: string };
    financing: { net: string };
    net_change_in_cash: string;
    disclaimer?: string;
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text2)' }}>
        {fmtDate(cf.from)} → {fmtDate(cf.to)} · {cf.disclaimer ?? DISCLAIMER}
      </p>
      <section style={{ ...panelStyle, padding: 16 }}>
        <h2 style={sectionTitleStyle}>Operating</h2>
        <Kv label="Net income" value={money(cf.operating.net_income)} />
        <Kv label="Cash receipts" value={money(cf.operating.cash_receipts)} />
        <Kv label="Cash payments" value={money(cf.operating.cash_payments)} />
        <Kv label="Net from operations" value={money(cf.operating.net_cash_from_operations)} bold />
      </section>
      <section style={{ ...panelStyle, padding: 16 }}>
        <h2 style={sectionTitleStyle}>Investing / financing (MVP)</h2>
        <Kv label="Investing net" value={money(cf.investing.net)} />
        <Kv label="Financing net" value={money(cf.financing.net)} />
      </section>
      <section style={{ ...panelStyle, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Net change in cash</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(cf.net_change_in_cash)}</span>
        </div>
      </section>
    </div>
  );
}

function AmountList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ code: string; name: string; amount: string }>;
  total: string;
}) {
  return (
    <section style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ ...sectionTitleStyle, margin: 0 }}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, padding: 16, fontSize: 13, color: 'var(--text2)' }}>No balances.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 650, width: 80 }}>{row.code}</td>
                  <td style={{ padding: '10px 14px' }}>{row.name}</td>
                  <td
                    style={{
                      padding: '10px 14px',
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {money(row.amount)}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '10px 14px' }}>
                  Total
                </td>
                <td
                  style={{
                    padding: '10px 14px',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {money(total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Kv({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 13,
        padding: '6px 0',
        fontWeight: bold ? 700 : 400,
      }}
    >
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
