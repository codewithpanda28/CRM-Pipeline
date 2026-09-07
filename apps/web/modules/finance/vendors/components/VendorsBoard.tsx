'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  EmptyState,
  LabeledInput,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
  twoColGrid,
} from '@/modules/crm/shared/ui';
import { createVendor, deleteVendor, listVendors, type Vendor } from '../../lib/api';

const emptyForm = () => ({
  display_name: '',
  email: '',
  phone: '',
  gstin: '',
  payment_terms: '',
});

export function VendorsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const vendorsQ = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => listVendors(await getToken(), { per_page: '50' }),
    enabled: Boolean(user),
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createVendor(await getToken(), {
        display_name: form.display_name,
        email: form.email || null,
        phone: form.phone || null,
        gstin: form.gstin || null,
        payment_terms: form.payment_terms || null,
      }),
    onSuccess: () => {
      setShowCreate(false);
      setForm(emptyForm());
      setError(null);
      void qc.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => deleteVendor(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vendors'] }),
  });

  const rows: Vendor[] = vendorsQ.data?.data ?? [];
  const loading = vendorsQ.isLoading;

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers and payees for expense tracking."
        actions={
          <>
            <SecondaryButton type="button" onClick={() => void vendorsQ.refetch()} disabled={loading}>
              Refresh
            </SecondaryButton>
            <PrimaryButton
              type="button"
              onClick={() => {
                setShowCreate(true);
                setError(null);
              }}
            >
              New vendor
            </PrimaryButton>
          </>
        }
      />

      {showCreate ? (
        <section style={{ ...panelStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>New vendor</h2>
          <div style={twoColGrid()}>
            <LabeledInput
              label="Name *"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            />
            <LabeledInput
              label="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              type="email"
            />
            <LabeledInput
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <LabeledInput
              label="GSTIN"
              value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
            />
            <LabeledInput
              label="Payment terms"
              value={form.payment_terms}
              onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
              placeholder="Net 30…"
            />
          </div>
          {error ? (
            <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>
              {error}
            </p>
          ) : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <PrimaryButton
              type="button"
              disabled={!form.display_name.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Create vendor
            </PrimaryButton>
            <SecondaryButton type="button" onClick={() => setShowCreate(false)}>
              Cancel
            </SecondaryButton>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading vendors…</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No vendors yet"
          description="Add vendors to attach expenses and track payables."
          action={
            <PrimaryButton type="button" onClick={() => setShowCreate(true)}>
              New vendor
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-ven-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Name', 'Email', 'Phone', 'GSTIN', 'Terms', 'Status', 'Actions'].map((h) => (
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
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{row.display_name}</td>
                      <td style={{ padding: '12px 14px' }}>{row.email || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{row.phone || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{row.gstin || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>{row.payment_terms || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {row.status ? <StatusPill status={row.status} /> : '—'}
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

          <div className="tq-ven-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {rows.map((row) => (
              <div key={row.id} style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{row.display_name}</strong>
                  {row.status ? <StatusPill status={row.status} /> : null}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8, display: 'grid', gap: 4 }}>
                  {row.email ? <div>{row.email}</div> : null}
                  {row.phone ? <div>{row.phone}</div> : null}
                  {row.gstin ? <div>GSTIN {row.gstin}</div> : null}
                  {row.payment_terms ? <div>{row.payment_terms}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-ven-table { display: none !important; }
          .tq-ven-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
