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
  LabeledTextarea,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  formGrid,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import {
  createJournal,
  listAccounts,
  listJournals,
  type GlAccount,
  type JournalEntry,
} from '../../lib/api';

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

type LineDraft = { account_id: string; debit: string; credit: string; description: string };

const emptyLine = (): LineDraft => ({
  account_id: '',
  debit: '',
  credit: '',
  description: '',
});

export function JournalsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine(), emptyLine()]);

  const journalsQ = useQuery({
    queryKey: ['accounting-journals'],
    queryFn: async () => listJournals(await getToken(), { limit: '50' }),
    enabled: Boolean(user),
  });

  const accountsQ = useQuery({
    queryKey: ['accounting-accounts', 'journal-picker'],
    queryFn: async () => listAccounts(await getToken()),
    enabled: Boolean(user) && showCreate,
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createJournal(await getToken(), {
        entry_date: entryDate,
        memo: memo.trim() || null,
        currency,
        lines: lines
          .filter((l) => l.account_id && (l.debit || l.credit))
          .map((l) => ({
            account_id: l.account_id,
            debit: l.debit || '0',
            credit: l.credit || '0',
            description: l.description.trim() || null,
          })),
      }),
    onSuccess: () => {
      setShowCreate(false);
      setMemo('');
      setLines([emptyLine(), emptyLine()]);
      setError(null);
      void qc.invalidateQueries({ queryKey: ['accounting-journals'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows: JournalEntry[] = journalsQ.data?.data ?? [];
  const accounts: GlAccount[] = accountsQ.data?.data ?? [];
  const loading = journalsQ.isLoading;

  const balanceHint = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const l of lines) {
      d += Number(l.debit) || 0;
      c += Number(l.credit) || 0;
    }
    return { debit: d, credit: c, balanced: Math.abs(d - c) < 0.005 };
  }, [lines]);

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Journals"
        subtitle="Posted double-entry journals. Reversals create opposite entries — never edit posted lines."
        actions={
          <>
            <SecondaryButton type="button" onClick={() => void journalsQ.refetch()} disabled={loading}>
              Refresh
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                setShowCreate(true);
                setError(null);
              }}
            >
              Manual journal
            </PrimaryButton>
          </>
        }
      />

      {showCreate ? (
        <section style={{ ...panelStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>Manual journal</h2>
          <div style={formGrid(180)}>
            <LabeledInput
              label="Entry date *"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
            <LabeledSelect
              label="Currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </LabeledSelect>
          </div>
          <LabeledTextarea
            label="Memo"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={2}
          />

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {lines.map((line, idx) => (
              <div
                key={idx}
                style={{
                  ...formGrid(140),
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              >
                <LabeledSelect
                  label={`Account (line ${idx + 1})`}
                  value={line.account_id}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, account_id: e.target.value } : p)),
                    )
                  }
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </LabeledSelect>
                <LabeledInput
                  label="Debit"
                  value={line.debit}
                  inputMode="decimal"
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((p, i) =>
                        i === idx ? { ...p, debit: e.target.value, credit: e.target.value ? '' : p.credit } : p,
                      ),
                    )
                  }
                />
                <LabeledInput
                  label="Credit"
                  value={line.credit}
                  inputMode="decimal"
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((p, i) =>
                        i === idx ? { ...p, credit: e.target.value, debit: e.target.value ? '' : p.debit } : p,
                      ),
                    )
                  }
                />
                <LabeledInput
                  label="Description"
                  value={line.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((p, i) => (i === idx ? { ...p, description: e.target.value } : p)),
                    )
                  }
                />
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              marginTop: 10,
              fontSize: 13,
              color: balanceHint.balanced ? 'var(--text2)' : 'var(--red)',
            }}
          >
            <span>
              Debits {money(balanceHint.debit, currency)} · Credits {money(balanceHint.credit, currency)}
              {balanceHint.balanced ? ' · balanced' : ' · unbalanced'}
            </span>
            <SecondaryButton
              type="button"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              Add line
            </SecondaryButton>
          </div>

          {error ? (
            <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>
              {error}
            </p>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <PrimaryButton
              type="button"
              disabled={!balanceHint.balanced || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Post journal
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </SecondaryButton>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading journals…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No journals yet"
          description="Commercial finance events post automatically; you can also enter manual journals."
          action={
            <PrimaryButton type="button" onClick={() => setShowCreate(true)}>
              Manual journal
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-je-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Entry #', 'Date', 'Memo', 'Source', 'Status'].map((h) => (
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
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/finance/journals/${row.id}`}
                          style={{ color: 'var(--accent)', fontWeight: 650, textDecoration: 'none' }}
                        >
                          {row.entry_number}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>{fmtDate(row.entry_date)}</td>
                      <td style={{ padding: '12px 14px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {row.memo || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>{row.source_type || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-je-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <Link
                key={row.id}
                href={`/finance/journals/${row.id}`}
                style={{ ...panelStyle, textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{row.entry_number}</strong>
                  <StatusPill status={row.status} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, display: 'grid', gap: 4 }}>
                  <div>{fmtDate(row.entry_date)}</div>
                  <div>{row.memo || 'No memo'}</div>
                  <div>{row.source_type || 'manual'}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-je-table { display: none !important; }
          .tq-je-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
