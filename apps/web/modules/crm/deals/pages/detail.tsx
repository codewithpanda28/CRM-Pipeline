'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { getPipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { getItemActivity } from '@/modules/crm/pipeline/lib/items';
import { listQuotes } from '@/modules/crm/quotes/lib/api';
import { listInvoices } from '@/modules/finance/lib/api';
import { pmApi } from '@/modules/projects/lib/api';
import {
  DangerButton,
  GhostButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  formGrid,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import { getDeal, moveDeal, type Deal } from '../lib/api';

function money(amount: string | number | undefined, currency = 'INR') {
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
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(value).slice(0, 10);
  }
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text3)' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: 'var(--text)', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  );
}

export function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const getToken = useApiToken();
  const { user, hasPermission } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const canEdit = hasPermission('deals:edit') || hasPermission('pipelines:edit');

  const dealQ = useQuery({
    queryKey: ['deal', id],
    queryFn: async () => getDeal(await getToken(), id),
    enabled: Boolean(user && id),
  });
  const deal = dealQ.data?.data as Deal | undefined;

  const pipelineQ = useQuery({
    queryKey: ['pipeline', deal?.pipeline_id],
    queryFn: async () => getPipeline(await getToken(), deal!.pipeline_id),
    enabled: Boolean(deal?.pipeline_id),
  });
  const pipeline = pipelineQ.data;

  const activityQ = useQuery({
    queryKey: ['deal-activity', id],
    queryFn: async () => getItemActivity(await getToken(), id),
    enabled: Boolean(user && id),
  });

  const quotesQ = useQuery({
    queryKey: ['deal-quotes', id],
    queryFn: async () => listQuotes(await getToken(), { deal_id: id, per_page: '20' }),
    enabled: Boolean(user && id),
  });

  const invoicesQ = useQuery({
    queryKey: ['deal-invoices', id],
    queryFn: async () => listInvoices(await getToken(), { per_page: '50' }),
    enabled: Boolean(user && id),
  });

  const projectsQ = useQuery({
    queryKey: ['deal-projects', id],
    queryFn: async () => pmApi.listProjectsByDeal(await getToken(), id),
    enabled: Boolean(user && id),
  });

  const moveMut = useMutation({
    mutationFn: async (stage_id: string) => moveDeal(await getToken(), id, { stage_id }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['deal', id] });
      void qc.invalidateQueries({ queryKey: ['items', deal?.pipeline_id] });
      void qc.invalidateQueries({ queryKey: ['deal-activity', id] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const linkedInvoices = useMemo(() => {
    const rows = invoicesQ.data?.data ?? [];
    return rows.filter((inv) => inv.deal_id === id || inv.customer_party_id === deal?.customer_party_id).slice(0, 8);
  }, [invoicesQ.data, id, deal?.customer_party_id]);

  const customerLabel =
    deal?.display?.customer_name || deal?.display?.company_name || deal?.display?.contact_name || null;
  const stageName = deal?.display?.stage_name || pipeline?.stages.find((s) => s.id === deal?.stage_id)?.name;

  if (dealQ.isLoading) {
    return <div style={{ padding: 24, color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>Loading deal…</div>;
  }
  if (!deal) {
    return (
      <div style={{ padding: 24, fontFamily: 'var(--font-sans)' }}>
        <PageHeader title="Deal not found" subtitle="This deal may have been deleted or is outside your workspace." />
        <SecondaryButton type="button" onClick={() => router.push('/crm/pipeline')}>
          Back to Pipeline
        </SecondaryButton>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, minWidth: 0, overflowX: 'hidden', fontFamily: 'var(--font-sans)' }}>
      <PageHeader
        title={deal.name}
        subtitle={[customerLabel, money(deal.amount, deal.currency), stageName].filter(Boolean).join(' · ')}
        actions={
          <>
            <StatusPill status={deal.status} />
            <GhostButton type="button" onClick={() => router.push(`/crm/pipeline/${deal.pipeline_id}`)}>
              Back to board
            </GhostButton>
          </>
        }
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--red)', marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      <section style={{ ...panelStyle, marginBottom: 16 }}>
        <div style={{ ...formGrid(160), alignItems: 'end' }}>
          <MetaRow label="Amount" value={<strong>{money(deal.amount, deal.currency)}</strong>} />
          <MetaRow label="Stage" value={stageName ?? '—'} />
          <MetaRow label="Owner" value={deal.display?.owner_name ?? 'Assigned'} />
          <MetaRow label="Expected close" value={fmtDate(deal.expected_close_at)} />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {canEdit && pipeline ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>
                Move stage
              </span>
              <select
                value={deal.stage_id}
                onChange={(e) => moveMut.mutate(e.target.value)}
                disabled={moveMut.isPending}
                style={{
                  minHeight: 40,
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  padding: '0 10px',
                  fontFamily: 'inherit',
                }}
              >
                {pipeline.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {deal.customer_party_id ? (
            <Link href={`/crm/customer-parties/${deal.customer_party_id}`} style={{ textDecoration: 'none' }}>
              <SecondaryButton type="button">Open Customer</SecondaryButton>
            </Link>
          ) : null}

          <Link
            href={`/crm/quotes/new?deal_id=${deal.id}${deal.customer_party_id ? `&customer_party_id=${deal.customer_party_id}` : ''}`}
            style={{ textDecoration: 'none' }}
          >
            <PrimaryButton type="button">Create quote</PrimaryButton>
          </Link>

          <Link href={`/activity?deal_id=${deal.id}`} style={{ textDecoration: 'none' }}>
            <SecondaryButton type="button">Add activity</SecondaryButton>
          </Link>

          <Link href={`/crm/tasks?deal_id=${deal.id}`} style={{ textDecoration: 'none' }}>
            <SecondaryButton type="button">Add task</SecondaryButton>
          </Link>

          {canEdit && pipeline?.stages.some((s) => s.is_won) ? (
            <PrimaryButton
              type="button"
              onClick={() => {
                const won = pipeline.stages.find((s) => s.is_won);
                if (won) moveMut.mutate(won.id);
              }}
            >
              Mark won
            </PrimaryButton>
          ) : null}
          {canEdit && pipeline?.stages.some((s) => s.is_lost) ? (
            <DangerButton
              type="button"
              onClick={() => {
                const lost = pipeline.stages.find((s) => s.is_lost);
                if (lost) moveMut.mutate(lost.id);
              }}
            >
              Mark lost
            </DangerButton>
          ) : null}
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: 16,
          minWidth: 0,
        }}
      >
        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Customer</h2>
          <div style={formGrid(140)}>
            <MetaRow label="Customer" value={deal.display?.customer_name} />
            <MetaRow label="Company" value={deal.display?.company_name} />
            <MetaRow label="Primary contact" value={deal.display?.contact_name} />
            <MetaRow label="Email" value={deal.display?.contact_email} />
            <MetaRow label="Phone" value={deal.display?.contact_phone} />
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitleStyle}>Deal information</h2>
          <div style={formGrid(140)}>
            <MetaRow label="Pipeline" value={deal.display?.pipeline_name} />
            <MetaRow label="Stage" value={stageName} />
            <MetaRow label="Status" value={deal.status} />
            <MetaRow label="Probability" value={`${deal.probability ?? 0}%`} />
            <MetaRow label="Source" value={deal.source} />
            <MetaRow label="Currency" value={deal.currency} />
            <MetaRow label="Created" value={fmtDate(deal.created_at)} />
            <MetaRow label="Owner" value={deal.display?.owner_name} />
          </div>
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text3)' }}>Advanced / diagnostics</summary>
            <p style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 8 }}>
              Deal ID: {deal.id}
            </p>
          </details>
        </section>
      </div>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={sectionTitleStyle}>Timeline</h2>
        {(activityQ.data ?? []).length === 0 ? (
          <p style={{ margin: 0, color: 'var(--text3)', fontSize: 13 }}>No activity recorded yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(activityQ.data ?? []).slice(0, 40).map((a) => (
              <li
                key={a.id}
                style={{
                  borderLeft: '2px solid var(--border)',
                  paddingLeft: 12,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textTransform: 'capitalize' }}>
                  {String(a.event_type).replace(/_/g, ' ')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{fmtDate(a.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ ...panelStyle, marginTop: 16 }}>
        <h2 style={sectionTitleStyle}>Commercial</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div>
            <h3 style={{ ...sectionTitleStyle, fontSize: 13 }}>Quotes</h3>
            {(quotesQ.data?.data ?? []).length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No quotes linked.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(quotesQ.data?.data ?? []).map((q) => (
                  <li key={q.id} style={{ marginBottom: 6 }}>
                    <Link href={`/crm/quotes/${q.id}`}>{q.quote_number}</Link>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {' '}
                      · {q.status} · {money(q.total, q.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 style={{ ...sectionTitleStyle, fontSize: 13 }}>Invoices</h3>
            {linkedInvoices.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No related invoices.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {linkedInvoices.map((inv) => (
                  <li key={inv.id} style={{ marginBottom: 6 }}>
                    <Link href={`/finance/invoices/${inv.id}`}>{inv.invoice_number}</Link>
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {' '}
                      · {inv.status} · {money(inv.total, inv.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 style={{ ...sectionTitleStyle, fontSize: 13 }}>Projects</h3>
            {(projectsQ.data?.data ?? []).length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>No linked projects.</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(projectsQ.data?.data ?? []).map((p: { id: string; name?: string; title?: string }) => (
                  <li key={p.id} style={{ marginBottom: 6 }}>
                    <Link href={`/projects/${p.id}`}>{p.name || p.title || 'Project'}</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
