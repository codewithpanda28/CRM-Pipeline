'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import { getJournal, listAccounts, reverseJournal, type GlAccount, type JournalLine } from '../../lib/api';

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

export function JournalDetailBoard({ id }: { id: string }) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  const journalQ = useQuery({
    queryKey: ['accounting-journal', id],
    queryFn: async () => getJournal(await getToken(), id),
    enabled: Boolean(user) && Boolean(id),
  });

  const accountsQ = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: async () => listAccounts(await getToken(), { include_inactive: '1' }),
    enabled: Boolean(user),
  });

  const reverseMut = useMutation({
    mutationFn: async () => reverseJournal(await getToken(), id),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['accounting-journals'] });
      void qc.invalidateQueries({ queryKey: ['accounting-journal', id] });
      const revId = res.data?.reversal?.id;
      if (revId) router.push(`/finance/journals/${revId}`);
    },
  });

  const entry = journalQ.data?.data;
  const accounts: GlAccount[] = accountsQ.data?.data ?? [];
  const accountLabel = new Map(accounts.map((a) => [a.id, `${a.code} — ${a.name}`]));
  const lines: JournalLine[] = entry?.lines ?? [];
  const currency = entry?.currency ?? 'INR';
  const canReverse = entry?.status === 'posted';

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title={entry?.entry_number ?? 'Journal'}
        subtitle={entry ? `${fmtDate(entry.entry_date)} · ${entry.source_type || 'manual'}` : 'Loading…'}
        actions={
          <>
            <SecondaryButton type="button" onClick={() => router.push('/finance/journals')}>
              Back
            </SecondaryButton>
            {canReverse ? (
              <PrimaryButton
                type="button"
                disabled={reverseMut.isPending}
                onClick={() => {
                  if (window.confirm('Post a reversing journal? Posted lines are never edited.')) {
                    reverseMut.mutate();
                  }
                }}
              >
                Reverse
              </PrimaryButton>
            ) : null}
          </>
        }
      />

      {journalQ.isLoading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading journal…</p>
        </div>
      ) : !entry ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Journal not found.</p>
        </div>
      ) : (
        <>
          <section style={{ ...panelStyle, marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
              <StatusPill status={entry.status} />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{entry.memo || 'No memo'}</span>
            </div>
            {reverseMut.isError ? (
              <p role="alert" style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>
                {(reverseMut.error as Error).message}
              </p>
            ) : null}
          </section>

          <section style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ ...sectionTitleStyle, margin: 0 }}>Lines</h2>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Account', 'Description', 'Debit', 'Credit'].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '10px 14px',
                          fontWeight: 600,
                          color: 'var(--text2)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={line.id ?? i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                        {accountLabel.get(line.account_id) ?? line.account_id}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>
                        {line.description || '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(line.debit) > 0 ? money(line.debit, currency) : '—'}
                      </td>
                      <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(line.credit) > 0 ? money(line.credit, currency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
