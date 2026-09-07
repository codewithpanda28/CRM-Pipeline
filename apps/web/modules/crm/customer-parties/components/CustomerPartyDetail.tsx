'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { apiFetch } from '@/modules/shared/lib/api';
import {
  EmptyState,
  GhostButton,
  LabeledInput,
  LabeledSelect,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import {
  getCustomer360,
  getCustomerParty,
  linkDealToParty,
  listCustomerParties,
  mergeCustomerParties,
} from '../lib/api';

function SectionCard({
  title,
  rows,
  emptyHint,
  renderRow,
}: {
  title: string;
  rows: unknown[];
  emptyHint: string;
  renderRow?: (row: Record<string, unknown>, index: number) => ReactNode;
}) {
  return (
    <section style={{ ...panelStyle, padding: 16 }}>
      <h2 style={{ ...sectionTitleStyle, marginBottom: 10 }}>{title}</h2>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>{emptyHint}</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.slice(0, 20).map((row, i) => {
            const r = row as Record<string, unknown>;
            if (renderRow) return <li key={String(r.id ?? i)}>{renderRow(r, i)}</li>;
            const label =
              (r.name as string) ||
              (r.title as string) ||
              (r.display_name as string) ||
              (r.quote_number
                ? `${String(r.quote_number)} v${String(r.version ?? '')} (${String(r.status ?? '')})`
                : null) ||
              String(r.id ?? i);
            return (
              <li
                key={String(r.id ?? i)}
                style={{
                  fontSize: 14,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  wordBreak: 'break-word',
                }}
              >
                {label}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function CustomerPartyDetail() {
  const params = useParams();
  const id = String(params['id'] ?? '');
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [dealId, setDealId] = useState('');
  const [mergeInto, setMergeInto] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const partyQ = useQuery({
    queryKey: ['customer-party', id],
    queryFn: async () => getCustomerParty(await getToken(), id),
    enabled: Boolean(user && id),
  });

  const view360 = useQuery({
    queryKey: ['customer-party-360', id],
    queryFn: async () => getCustomer360(await getToken(), id),
    enabled: Boolean(user && id),
  });

  const dealsQ = useQuery({
    queryKey: ['deals', 'customer-link'],
    queryFn: async () =>
      apiFetch<{ data: Array<{ id: string; name: string }>; error: null }>('/api/deals?per_page=100', {
        token: await getToken(),
      }),
    enabled: Boolean(user),
  });

  const partiesQ = useQuery({
    queryKey: ['customer-parties', 'merge-picker'],
    queryFn: async () => listCustomerParties(await getToken(), { status: 'active', per_page: '100' }),
    enabled: Boolean(user),
  });

  const linkMut = useMutation({
    mutationFn: async () => linkDealToParty(await getToken(), id, dealId),
    onSuccess: () => {
      setDealId('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['customer-party-360', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const mergeMut = useMutation({
    mutationFn: async () => mergeCustomerParties(await getToken(), id, mergeInto, mergeReason),
    onSuccess: (res) => {
      router.push(`/crm/customer-parties/${res.data.survivor_id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const mergeOptions = useMemo(
    () => (partiesQ.data?.data ?? []).filter((p) => p.id !== id),
    [partiesQ.data, id],
  );

  if (partyQ.isLoading || view360.isLoading) {
    return (
      <div style={pageShellStyle}>
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading customer…</p>
        </div>
      </div>
    );
  }

  const redirect = view360.data?.data as { redirected?: boolean; into_party_id?: string } | undefined;
  if (redirect?.redirected && redirect.into_party_id) {
    return (
      <div style={pageShellStyle}>
        <EmptyState
          title="Customer merged"
          description="This customer was merged into another party."
          action={
            <PrimaryButton type="button" onClick={() => router.push(`/crm/customer-parties/${redirect.into_party_id}`)}>
              Open survivor
            </PrimaryButton>
          }
        />
      </div>
    );
  }

  const party = partyQ.data?.data;
  const slice = view360.data?.data as Record<string, unknown> | undefined;
  const identity = (slice?.identity ?? {}) as {
    party_type?: string;
    contact?: Record<string, unknown> | null;
    company?: Record<string, unknown> | null;
  };

  const identityLabel = identity.company
    ? String(identity.company.name ?? 'Company')
    : identity.contact
      ? String(identity.contact.name ?? 'Contact')
      : '—';
  const identityMeta = identity.company
    ? [identity.company.industry, identity.company.location].filter(Boolean).join(' · ')
    : identity.contact
      ? [identity.contact.email, identity.contact.phone].filter(Boolean).join(' · ')
      : '';

  return (
    <div style={pageShellStyle}>
      <GhostButton type="button" onClick={() => router.push('/crm/customer-parties')} style={{ marginBottom: 12 }}>
        ← Customers
      </GhostButton>

      <div style={{ ...panelStyle, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 240px' }}>
            <h1
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 650,
                letterSpacing: '-0.03em',
                wordBreak: 'break-word',
              }}
            >
              {party?.display_name}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 10 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 28,
                  padding: '0 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  color: 'var(--accent)',
                }}
              >
                {party?.party_type === 'company' ? 'B2B' : 'B2C'}
              </span>
              {party?.status ? <StatusPill status={party.status} /> : null}
              {party?.primary_owner_id ? (
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>Owner assigned</span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>No owner</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <SecondaryButton type="button" onClick={() => router.push('/crm/quotes/new')}>
              New quote
            </SecondaryButton>
            <PrimaryButton type="button" onClick={() => router.push('/crm/pipeline')}>
              Open pipeline
            </PrimaryButton>
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>
          {error}
        </p>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          minWidth: 0,
        }}
      >
        <section style={{ ...panelStyle, padding: 16 }}>
          <h2 style={sectionTitleStyle}>Identity</h2>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, wordBreak: 'break-word' }}>{identityLabel}</p>
          {identityMeta ? (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text2)', wordBreak: 'break-word' }}>
              {identityMeta}
            </p>
          ) : null}
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--text2)' }}>
            {party?.party_type === 'company' ? 'Linked company identity' : 'Linked contact identity'}
          </p>
        </section>

        <SectionCard
          title="Contacts"
          rows={(slice?.related_contacts as unknown[]) ?? []}
          emptyHint="No related contacts yet."
        />
        <SectionCard title="Deals" rows={(slice?.deals as unknown[]) ?? []} emptyHint="No deals linked yet." />
        <SectionCard title="Leads" rows={(slice?.leads as unknown[]) ?? []} emptyHint="No leads linked yet." />
        <SectionCard
          title="Quotes"
          rows={(slice?.quotes as unknown[]) ?? []}
          emptyHint="No quotes yet."
          renderRow={(r) => (
            <Link
              href={r.id ? `/crm/quotes/${String(r.id)}` : '/crm/quotes'}
              style={{
                display: 'block',
                fontSize: 14,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--accent)',
                textDecoration: 'none',
                wordBreak: 'break-word',
                minHeight: 40,
              }}
            >
              {r.quote_number
                ? `${String(r.quote_number)} v${String(r.version ?? '')} · ${String(r.status ?? '')}`
                : String(r.id)}
            </Link>
          )}
        />
        <SectionCard
          title="Activities"
          rows={(slice?.activities as unknown[]) ?? []}
          emptyHint="No activities yet."
        />
        <SectionCard title="Tasks" rows={(slice?.tasks as unknown[]) ?? []} emptyHint="No tasks yet." />
        <SectionCard title="Projects" rows={(slice?.projects as unknown[]) ?? []} emptyHint="No projects yet." />

        {(() => {
          const extensions = (slice?.extensions ?? {}) as Record<string, unknown>;
          const finance = (extensions.finance ?? {}) as {
            available?: boolean;
            invoices?: Array<Record<string, unknown>>;
            payments?: Array<Record<string, unknown>>;
            outstanding_total?: string;
            credit_notes?: Array<Record<string, unknown>>;
          };
          if (finance.available) {
            const invoices = finance.invoices ?? [];
            const payments = finance.payments ?? [];
            const creditNotes = finance.credit_notes ?? [];
            return (
              <section style={{ ...panelStyle, padding: 16, gridColumn: '1 / -1' }}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: 8,
                    alignItems: 'center',
                    marginBottom: 12,
                  }}
                >
                  <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Finance</h2>
                  <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                    Outstanding{' '}
                    <strong style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                      {finance.outstanding_total ?? '0.00'}
                    </strong>
                    {' · '}
                    {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                  }}
                >
                  <div>
                    <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 650, color: 'var(--text2)' }}>
                      Invoices
                    </h3>
                    {invoices.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No invoices.</p>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {invoices.slice(0, 10).map((inv) => (
                          <li key={String(inv.id)}>
                            <Link
                              href={`/finance/invoices/${String(inv.id)}`}
                              style={{
                                display: 'block',
                                fontSize: 14,
                                padding: '10px 12px',
                                borderRadius: 10,
                                background: 'var(--bg)',
                                border: '1px solid var(--border)',
                                color: 'var(--accent)',
                                textDecoration: 'none',
                                minHeight: 40,
                                wordBreak: 'break-word',
                              }}
                            >
                              {String(inv.invoice_number ?? inv.id)} · {String(inv.status ?? '')}
                              {inv.amount_due != null ? ` · due ${String(inv.amount_due)}` : ''}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 650, color: 'var(--text2)' }}>
                      Payments
                    </h3>
                    {payments.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No payments.</p>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {payments.slice(0, 10).map((pay) => (
                          <li
                            key={String(pay.id)}
                            style={{
                              fontSize: 14,
                              padding: '10px 12px',
                              borderRadius: 10,
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              minHeight: 40,
                              wordBreak: 'break-word',
                            }}
                          >
                            <Link
                              href="/finance/payments"
                              style={{ color: 'var(--accent)', textDecoration: 'none' }}
                            >
                              {String(pay.payment_number ?? 'Payment')}
                            </Link>
                            {' · '}
                            {String(pay.amount ?? '')} {String(pay.currency ?? '')}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 650, color: 'var(--text2)' }}>
                      Credit notes
                    </h3>
                    {creditNotes.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No credit notes.</p>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {creditNotes.slice(0, 10).map((cn) => (
                          <li
                            key={String(cn.id)}
                            style={{
                              fontSize: 14,
                              padding: '10px 12px',
                              borderRadius: 10,
                              background: 'var(--bg)',
                              border: '1px solid var(--border)',
                              minHeight: 40,
                              wordBreak: 'break-word',
                            }}
                          >
                            {String(cn.credit_note_number ?? cn.id)} · {String(cn.status ?? '')}
                            {cn.total != null ? ` · ${String(cn.total)}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <SecondaryButton type="button" onClick={() => router.push('/finance/invoices/new')}>
                    New invoice
                  </SecondaryButton>
                  <GhostButton type="button" onClick={() => router.push('/finance/payments')}>
                    Payments
                  </GhostButton>
                </div>
              </section>
            );
          }
          return (
            <section style={{ ...panelStyle, padding: 16 }}>
              <h2 style={sectionTitleStyle}>Extensions</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
                Finance, WhatsApp, Support, Voice, and Automation will appear here in later phases.
              </p>
            </section>
          );
        })()}
      </div>

      <section style={{ ...panelStyle, marginTop: 16, maxWidth: 560 }}>
        <h2 style={sectionTitleStyle}>Link deal</h2>
        <LabeledSelect label="Select deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
          <option value="">Choose a deal…</option>
          {(dealsQ.data?.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </LabeledSelect>
        <PrimaryButton type="button" disabled={!dealId || linkMut.isPending} onClick={() => linkMut.mutate()}>
          Link deal
        </PrimaryButton>
      </section>

      <section style={{ ...panelStyle, marginTop: 12, maxWidth: 560 }}>
        <h2 style={sectionTitleStyle}>Admin merge</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
          Merge this party into a survivor. Requires customers:merge.
        </p>
        <LabeledSelect label="Survivor customer" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
          <option value="">Select survivor…</option>
          {mergeOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ({p.party_type === 'company' ? 'B2B' : 'B2C'})
            </option>
          ))}
        </LabeledSelect>
        <LabeledInput
          label="Reason"
          value={mergeReason}
          onChange={(e) => setMergeReason(e.target.value)}
          placeholder="Why merge these parties?"
        />
        <SecondaryButton
          type="button"
          disabled={!mergeInto || !mergeReason || mergeMut.isPending}
          onClick={() => mergeMut.mutate()}
        >
          Merge into survivor
        </SecondaryButton>
      </section>
    </div>
  );
}
