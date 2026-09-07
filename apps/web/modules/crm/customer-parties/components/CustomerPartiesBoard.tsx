'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listCompanies, listContacts } from '@vencore/api-client';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { Input, Select } from '@/modules/shared/components/ui/FormField';
import {
  EmptyState,
  LabeledSelect,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
} from '@/modules/crm/shared/ui';
import { createCustomerParty, listCustomerParties, type CustomerParty } from '../lib/api';

export function CustomerPartiesBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [partyType, setPartyType] = useState('');
  const [status, setStatus] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<'contact' | 'company'>('company');
  const [identityId, setIdentityId] = useState('');
  const [pickerQ, setPickerQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (q.trim()) p.q = q.trim();
    if (partyType) p.party_type = partyType;
    if (status) p.status = status;
    return p;
  }, [q, partyType, status]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-parties', params],
    queryFn: async () => listCustomerParties(await getToken(), params),
    enabled: Boolean(user),
  });

  const companiesQ = useQuery({
    queryKey: ['companies', 'customer-create'],
    queryFn: async () => listCompanies(await getToken()),
    enabled: Boolean(user && showCreate && createMode === 'company'),
  });

  const contactsQ = useQuery({
    queryKey: ['contacts', 'customer-create'],
    queryFn: async () => listContacts(await getToken(), { per_page: '200' }),
    enabled: Boolean(user && showCreate && createMode === 'contact'),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const body =
        createMode === 'company' ? { company_id: identityId } : { contact_id: identityId };
      return createCustomerParty(await getToken(), body);
    },
    onSuccess: () => {
      setShowCreate(false);
      setIdentityId('');
      setPickerQ('');
      setError(null);
      setFieldError(undefined);
      void qc.invalidateQueries({ queryKey: ['customer-parties'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const parties = data?.data ?? [];

  const companyOptions = useMemo(() => {
    const rows = companiesQ.data?.data ?? [];
    const needle = pickerQ.trim().toLowerCase();
    return rows
      .filter((c) => !needle || c.name.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [companiesQ.data, pickerQ]);

  const contactOptions = useMemo(() => {
    const rows = contactsQ.data?.data ?? [];
    const needle = pickerQ.trim().toLowerCase();
    return rows
      .filter((c) => {
        if (!needle) return true;
        return (
          c.name.toLowerCase().includes(needle) ||
          (c.email ?? '').toLowerCase().includes(needle) ||
          (c.phone ?? '').toLowerCase().includes(needle)
        );
      })
      .slice(0, 80);
  }, [contactsQ.data, pickerQ]);

  function submitCreate() {
    if (!identityId) {
      setFieldError(createMode === 'company' ? 'Select a company' : 'Select a contact');
      setError('Please fix the highlighted fields.');
      return;
    }
    setFieldError(undefined);
    createMut.mutate();
  }

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Customers"
        subtitle="Commercial parties — B2B (Company) or B2C (Contact)."
        actions={
          <PrimaryButton
            type="button"
            onClick={() => {
              setShowCreate(true);
              setError(null);
            }}
          >
            New customer
          </PrimaryButton>
        }
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'flex-end',
          marginBottom: 16,
          minWidth: 0,
        }}
      >
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
            Search
          </label>
          <Input
            aria-label="Search customers"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Display name"
            style={{ minHeight: 40 }}
          />
        </div>
        <div style={{ flex: '0 1 140px', minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
            Type
          </label>
          <Select
            aria-label="Filter by customer type"
            value={partyType}
            onChange={(e) => setPartyType(e.target.value)}
            style={{ minHeight: 40 }}
          >
            <option value="">All</option>
            <option value="company">B2B (Company)</option>
            <option value="contact">B2C (Contact)</option>
          </Select>
        </div>
        <div style={{ flex: '0 1 140px', minWidth: 120 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
            Status
          </label>
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ minHeight: 40 }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="merged">Merged</option>
            <option value="">All</option>
          </Select>
        </div>
      </div>

      {showCreate ? (
        <div style={{ ...panelStyle, marginBottom: 16, maxWidth: 560 }}>
          <h2 style={sectionTitleStyle}>Create customer</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text2)' }}>
            Create or reuse a customer party from an existing company or contact.
          </p>
          <LabeledSelect
            label="Customer type"
            value={createMode}
            onChange={(e) => {
              setCreateMode(e.target.value as 'contact' | 'company');
              setIdentityId('');
              setPickerQ('');
              setFieldError(undefined);
            }}
          >
            <option value="company">Company (B2B)</option>
            <option value="contact">Contact (B2C)</option>
          </LabeledSelect>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
              Search {createMode === 'company' ? 'companies' : 'contacts'}
            </label>
            <Input
              aria-label={`Search ${createMode === 'company' ? 'companies' : 'contacts'}`}
              value={pickerQ}
              onChange={(e) => setPickerQ(e.target.value)}
              placeholder={createMode === 'company' ? 'Filter by company name' : 'Filter by name, email, or phone'}
              style={{ minHeight: 40 }}
            />
          </div>

          <LabeledSelect
            label={createMode === 'company' ? 'Select company' : 'Select contact'}
            value={identityId}
            onChange={(e) => setIdentityId(e.target.value)}
            error={fieldError}
          >
            <option value="">
              {createMode === 'company' ? 'Choose a company…' : 'Choose a contact…'}
            </option>
            {createMode === 'company'
              ? companyOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.industry ? ` · ${c.industry}` : ''}
                  </option>
                ))
              : contactOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` · ${c.email}` : c.phone ? ` · ${c.phone}` : ''}
                  </option>
                ))}
          </LabeledSelect>

          {error ? (
            <p role="alert" style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>
              {error}
            </p>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <SecondaryButton
              type="button"
              onClick={() => {
                setShowCreate(false);
                setError(null);
                setFieldError(undefined);
              }}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton type="button" disabled={createMut.isPending} onClick={submitCreate}>
              Create / reuse
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading customers…</p>
        </div>
      ) : parties.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Create a customer from a company (B2B) or contact (B2C) to unlock 360 views, quotes, and deals."
          action={
            <PrimaryButton type="button" onClick={() => setShowCreate(true)}>
              New customer
            </PrimaryButton>
          }
        />
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            minWidth: 0,
          }}
        >
          {parties.map((p: CustomerParty) => (
            <li key={p.id} style={panelStyle}>
              <Link
                href={`/crm/customer-parties/${p.id}`}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'inherit',
                  minHeight: 40,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <strong style={{ fontSize: 15, wordBreak: 'break-word' }}>{p.display_name}</strong>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        minHeight: 28,
                        padding: '0 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: 'var(--surface2)',
                        color: 'var(--text2)',
                      }}
                    >
                      {p.party_type === 'company' ? 'B2B' : 'B2C'}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 8 }}>
                  {p.party_type === 'company' ? 'Company account' : 'Contact account'}
                  {p.merged_into_id ? ' · Merged' : ''}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
