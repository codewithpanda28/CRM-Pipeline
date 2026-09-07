'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { listCustomerParties } from '@/modules/crm/customer-parties/lib/api';
import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
} from '@/modules/crm/shared/ui';
import { Input } from '@/modules/shared/components/ui/FormField';
import { listInvoices, type Invoice } from '../../lib/api';

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

export function InvoicesBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = { per_page: '50' };
    if (q.trim()) p.q = q.trim();
    return p;
  }, [q]);

  const invoicesQ = useQuery({
    queryKey: ['invoices', params],
    queryFn: async () => listInvoices(await getToken(), params),
    enabled: Boolean(user),
  });

  const partiesQ = useQuery({
    queryKey: ['customer-parties', 'invoice-list'],
    queryFn: async () => listCustomerParties(await getToken(), { per_page: '100' }),
    enabled: Boolean(user),
  });

  const rows: Invoice[] = invoicesQ.data?.data ?? [];
  const partyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partiesQ.data?.data ?? []) {
      map.set(p.id, p.display_name);
    }
    return map;
  }, [partiesQ.data]);

  const loading = invoicesQ.isLoading;
  const error = invoicesQ.error instanceof Error ? invoicesQ.error.message : null;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Invoices"
        subtitle="Bill customers, track amounts due, and record payments."
        actions={
          <>
            <Input
              aria-label="Search invoices"
              placeholder="Search invoice #"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ minHeight: 40, minWidth: 160, maxWidth: 240 }}
            />
            <SecondaryButton type="button" onClick={() => void invoicesQ.refetch()} disabled={loading}>
              Refresh
            </SecondaryButton>
            <PrimaryButton type="button" onClick={() => router.push('/finance/invoices/new')}>
              New invoice
            </PrimaryButton>
          </>
        }
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--red, #b91c1c)', marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading invoices…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create an invoice from scratch or from an accepted quote. Issue it, then record payments as they come in."
          action={
            <PrimaryButton type="button" onClick={() => router.push('/finance/invoices/new')}>
              New invoice
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-inv-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {[
                      'Invoice number',
                      'Customer',
                      'Status',
                      'Total',
                      'Amount due',
                      'Issue date',
                      'Due date',
                      'Actions',
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '12px 14px',
                          fontWeight: 600,
                          color: 'var(--text2)',
                          whiteSpace: 'nowrap',
                          borderBottom: '1px solid var(--border)',
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
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                        <Link
                          href={`/finance/invoices/${row.id}`}
                          style={{ color: 'var(--accent)', textDecoration: 'none' }}
                        >
                          {row.invoice_number}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>{partyName.get(row.customer_party_id) ?? '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={row.status} />
                      </td>
                      <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {money(row.total, row.currency)}
                      </td>
                      <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>
                        {money(row.amount_due, row.currency)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.issue_date)}</td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.due_date)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/finance/invoices/${row.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 40,
                            padding: '0 12px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            color: 'var(--text)',
                            textDecoration: 'none',
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-inv-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/finance/invoices/${row.id}`}
                style={{ ...panelStyle, textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 15 }}>{row.invoice_number}</strong>
                  <StatusPill status={row.status} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  <div>
                    <span style={{ opacity: 0.8 }}>Customer · </span>
                    {partyName.get(row.customer_party_id) ?? '—'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: 15 }}>
                      {money(row.total, row.currency)}
                    </span>
                    <span>Due {money(row.amount_due, row.currency)}</span>
                  </div>
                  <div>
                    {fmtDate(row.issue_date)} → {fmtDate(row.due_date)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-inv-table { display: none !important; }
          .tq-inv-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
