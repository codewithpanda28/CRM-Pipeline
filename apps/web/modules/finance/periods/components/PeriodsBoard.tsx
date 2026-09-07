'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
} from '@/modules/crm/shared/ui';
import {
  listPeriods,
  setPeriodStatus,
  type AccountingPeriod,
  type PeriodStatus,
} from '../../lib/api';

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return String(value).slice(0, 10) || '—';
}

export function PeriodsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const periodsQ = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: async () => listPeriods(await getToken()),
    enabled: Boolean(user),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PeriodStatus }) =>
      setPeriodStatus(await getToken(), id, status),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows: AccountingPeriod[] = periodsQ.data?.data ?? [];
  const loading = periodsQ.isLoading;

  function actionsFor(row: AccountingPeriod) {
    const status = row.status as PeriodStatus;
    const btns: Array<{ label: string; next: PeriodStatus }> = [];
    if (status === 'open') {
      btns.push({ label: 'Soft close', next: 'soft_closed' });
      btns.push({ label: 'Lock', next: 'locked' });
    } else if (status === 'soft_closed') {
      btns.push({ label: 'Reopen', next: 'open' });
      btns.push({ label: 'Lock', next: 'locked' });
    } else if (status === 'locked') {
      btns.push({ label: 'Reopen', next: 'open' });
    }
    return btns;
  }

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Accounting periods"
        subtitle="Open, soft-close, or lock fiscal periods. Soft-close still allows reversing journals."
        actions={
          <SecondaryButton type="button" onClick={() => void periodsQ.refetch()} disabled={loading}>
            Refresh
          </SecondaryButton>
        }
      />

      {error ? (
        <p role="alert" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading periods…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No periods"
          description="The current fiscal year period is created automatically on first use."
        />
      ) : (
        <>
          <div className="tq-ap-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Period', 'Start', 'End', 'Status', 'Actions'].map((h) => (
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
                      <td style={{ padding: '12px 14px', fontWeight: 650 }}>{row.name}</td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.start_date)}</td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.end_date)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={row.status} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {actionsFor(row).map((a) =>
                            a.next === 'locked' || a.next === 'soft_closed' ? (
                              <PrimaryButton
                                key={a.next}
                                type="button"
                                disabled={statusMut.isPending}
                                onClick={() => statusMut.mutate({ id: row.id, status: a.next })}
                              >
                                {a.label}
                              </PrimaryButton>
                            ) : (
                              <SecondaryButton
                                key={a.next}
                                type="button"
                                disabled={statusMut.isPending}
                                onClick={() => statusMut.mutate({ id: row.id, status: a.next })}
                              >
                                {a.label}
                              </SecondaryButton>
                            ),
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-ap-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <div key={row.id} style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{row.name}</strong>
                  <StatusPill status={row.status} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>
                  {fmtDate(row.start_date)} → {fmtDate(row.end_date)}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {actionsFor(row).map((a) => (
                    <SecondaryButton
                      key={a.next}
                      type="button"
                      disabled={statusMut.isPending}
                      onClick={() => statusMut.mutate({ id: row.id, status: a.next })}
                    >
                      {a.label}
                    </SecondaryButton>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-ap-table { display: none !important; }
          .tq-ap-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
