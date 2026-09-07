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
  formGrid,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import {
  createAccount,
  listAccounts,
  type AccountType,
  type GlAccount,
} from '../../lib/api';

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const emptyForm = () => ({
  code: '',
  name: '',
  account_type: 'asset' as AccountType,
  description: '',
});

export function AccountsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const accountsQ = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: async () => listAccounts(await getToken(), { include_inactive: '1' }),
    enabled: Boolean(user),
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createAccount(await getToken(), {
        code: form.code.trim(),
        name: form.name.trim(),
        account_type: form.account_type,
        description: form.description.trim() || null,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setForm(emptyForm());
      setError(null);
      void qc.invalidateQueries({ queryKey: ['accounting-accounts'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows: GlAccount[] = accountsQ.data?.data ?? [];
  const loading = accountsQ.isLoading;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Chart of accounts"
        subtitle="General ledger accounts for management books."
        actions={
          <>
            <SecondaryButton type="button" onClick={() => void accountsQ.refetch()} disabled={loading}>
              Refresh
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                setShowCreate(true);
                setError(null);
              }}
            >
              New account
            </PrimaryButton>
          </>
        }
      />

      {showCreate ? (
        <section style={{ ...panelStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>New account</h2>
          <div style={formGrid(180)}>
            <LabeledInput
              label="Code *"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="1200"
            />
            <LabeledInput
              label="Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Inventory"
            />
            <LabeledSelect
              label="Type *"
              value={form.account_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, account_type: e.target.value as AccountType }))
              }
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </LabeledSelect>
          </div>
          <LabeledTextarea
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
              disabled={!form.code.trim() || !form.name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create account
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </SecondaryButton>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading accounts…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Default chart seeds on first accounting use, or create accounts manually."
          action={
            <PrimaryButton type="button" onClick={() => setShowCreate(true)}>
              New account
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-coa-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Code', 'Name', 'Type', 'Control', 'Status'].map((h) => (
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
                      <td style={{ padding: '12px 14px', fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                        {row.code}
                      </td>
                      <td style={{ padding: '12px 14px' }}>{row.name}</td>
                      <td style={{ padding: '12px 14px', textTransform: 'capitalize' }}>{row.account_type}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--text2)' }}>
                        {row.is_control ? row.control_key ?? 'control' : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={row.is_active === false ? 'inactive' : 'active'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-coa-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <div key={row.id} style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{row.code}</div>
                    <div style={{ marginTop: 4 }}>{row.name}</div>
                  </div>
                  <StatusPill status={row.is_active === false ? 'inactive' : 'active'} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, textTransform: 'capitalize' }}>
                  {row.account_type}
                  {row.is_control ? ` · ${row.control_key ?? 'control'}` : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-coa-table { display: none !important; }
          .tq-coa-cards { display: flex !important; }
        }
        @media (min-width: 768px) and (max-width: 1279px) {
          .tq-coa-table table { min-width: 560px; }
        }
      `}</style>
    </div>
  );
}
