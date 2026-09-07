'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
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
import { listQuotes, type Quote } from '../lib/api';

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

export function QuotesBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');

  const params = useMemo(() => {
    const p: Record<string, string> = { per_page: '50' };
    if (q.trim()) p.q = q.trim();
    return p;
  }, [q]);

  const quotesQ = useQuery({
    queryKey: ['quotes', params],
    queryFn: async () => listQuotes(await getToken(), params),
    enabled: Boolean(user),
  });

  const partiesQ = useQuery({
    queryKey: ['customer-parties', 'quote-list'],
    queryFn: async () => listCustomerParties(await getToken(), { per_page: '100' }),
    enabled: Boolean(user),
  });

  const dealsQ = useQuery({
    queryKey: ['deals', 'quote-list'],
    queryFn: async () =>
      apiFetch<{ data: Array<{ id: string; name: string }>; error: null }>('/api/deals?per_page=100', {
        token: await getToken(),
      }),
    enabled: Boolean(user),
  });

  const rows: Quote[] = quotesQ.data?.data ?? [];
  const partyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of partiesQ.data?.data ?? []) {
      map.set(p.id, p.display_name);
    }
    return map;
  }, [partiesQ.data]);
  const dealName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of dealsQ.data?.data ?? []) map.set(d.id, d.name);
    return map;
  }, [dealsQ.data]);

  const loading = quotesQ.isLoading;
  const error = quotesQ.error instanceof Error ? quotesQ.error.message : null;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Quotes"
        subtitle="Create and manage sales quotes for customers and deals."
        actions={
          <>
            <Input
              aria-label="Search quotes"
              placeholder="Search quote #"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ minHeight: 40, minWidth: 160, maxWidth: 240 }}
            />
            <SecondaryButton type="button" onClick={() => void quotesQ.refetch()} disabled={loading}>
              Refresh
            </SecondaryButton>
            <PrimaryButton type="button" onClick={() => router.push('/crm/quotes/new')}>
              New quote
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
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading quotes…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No quotes yet"
          description="Create your first quote to send pricing to a customer. Attach products, set tax treatment, and track acceptance."
          action={
            <PrimaryButton type="button" onClick={() => router.push('/crm/quotes/new')}>
              New quote
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-quotes-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {[
                      'Quote number',
                      'Customer',
                      'Deal',
                      'Status',
                      'Total',
                      'Currency',
                      'Issue date',
                      'Expiry date',
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
                        <Link href={`/crm/quotes/${row.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {row.quote_number}
                          {row.version > 1 ? ` v${row.version}` : ''}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>{partyName.get(row.customer_party_id) ?? '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.deal_id ? dealName.get(row.deal_id) ?? 'Linked deal' : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={row.status} />
                      </td>
                      <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {money(row.total, row.currency)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>{row.currency}</td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.issue_date)}</td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.expiry_date)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/crm/quotes/${row.id}`}
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

          <div className="tq-quotes-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/crm/quotes/${row.id}`}
                style={{ ...panelStyle, textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 15 }}>
                    {row.quote_number}
                    {row.version > 1 ? ` v${row.version}` : ''}
                  </strong>
                  <StatusPill status={row.status} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  <div>
                    <span style={{ opacity: 0.8 }}>Customer · </span>
                    {partyName.get(row.customer_party_id) ?? '—'}
                  </div>
                  <div>
                    <span style={{ opacity: 0.8 }}>Deal · </span>
                    {row.deal_id ? dealName.get(row.deal_id) ?? 'Linked deal' : '—'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontWeight: 650, color: 'var(--text)', fontSize: 15 }}>
                      {money(row.total, row.currency)}
                    </span>
                    <span>
                      {fmtDate(row.issue_date)} → {fmtDate(row.expiry_date)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-quotes-table { display: none !important; }
          .tq-quotes-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
