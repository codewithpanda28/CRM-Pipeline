'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  GhostButton,
  LabeledInput,
  LabeledSelect,
  LabeledTextarea,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
  twoColGrid,
} from '@/modules/crm/shared/ui';
import { getProduct, updateProduct } from '../lib/api';

export function ProductDetail({ id }: { id: string }) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: 'service',
    name: '',
    sku: '',
    description: '',
    category: '',
    list_price: '',
    currency: 'INR',
    unit: 'each',
    cost: '',
    tax_category_code: '',
    billing_model: '',
    is_active: 'true',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => getProduct(await getToken(), id),
    enabled: Boolean(user && id),
  });

  useEffect(() => {
    const p = data?.data;
    if (!p) return;
    setForm({
      kind: p.kind,
      name: p.name,
      sku: p.sku,
      description: p.description ?? '',
      category: p.category ?? '',
      list_price: p.list_price,
      currency: p.currency,
      unit: p.unit,
      cost: p.cost ?? '',
      tax_category_code: p.tax_category_code ?? '',
      billing_model: p.billing_model ?? '',
      is_active: p.is_active ? 'true' : 'false',
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () =>
      updateProduct(await getToken(), id, {
        kind: form.kind,
        name: form.name,
        sku: form.sku,
        description: form.description || null,
        category: form.category || null,
        list_price: form.list_price,
        currency: form.currency,
        unit: form.unit,
        cost: form.cost || null,
        tax_category_code: form.tax_category_code || null,
        billing_model: form.billing_model || null,
        is_active: form.is_active === 'true',
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['product', id] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data?.data) {
    return (
      <div style={pageShellStyle}>
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading product…</p>
        </div>
      </div>
    );
  }

  const p = data.data;

  return (
    <div style={pageShellStyle}>
      <div style={{ ...panelStyle, maxWidth: 900 }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 650, letterSpacing: '-0.02em' }}>{p.name}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <StatusPill status={p.is_active ? 'active' : 'inactive'} />
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                {p.sku} · {p.kind}
              </span>
            </div>
          </div>
          <GhostButton type="button" onClick={() => router.push('/crm/products')}>
            Close
          </GhostButton>
        </div>

        <h2 style={sectionTitleStyle}>Product details</h2>
        <div style={twoColGrid()}>
          <LabeledSelect
            label="Product kind"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            <option value="product">Product</option>
            <option value="service">Service</option>
            <option value="package">Package</option>
            <option value="plan">Plan</option>
          </LabeledSelect>
          <LabeledInput
            label="Name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <LabeledInput label="SKU" value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} />
          <LabeledInput
            label="Category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
          <LabeledInput
            label="Price"
            value={form.list_price}
            onChange={(e) => setForm((f) => ({ ...f, list_price: e.target.value }))}
            inputMode="decimal"
          />
          <LabeledSelect
            label="Currency"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
          >
            <option value="INR">INR</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AED">AED</option>
          </LabeledSelect>
          <LabeledInput label="Unit" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
          <LabeledInput
            label="Cost (optional)"
            value={form.cost}
            onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
            inputMode="decimal"
          />
          <LabeledInput
            label="Tax category"
            value={form.tax_category_code}
            onChange={(e) => setForm((f) => ({ ...f, tax_category_code: e.target.value }))}
          />
          <LabeledSelect
            label="Billing model"
            value={form.billing_model}
            onChange={(e) => setForm((f) => ({ ...f, billing_model: e.target.value }))}
          >
            <option value="">Not set</option>
            <option value="one_time">One-time</option>
            <option value="recurring">Recurring</option>
            <option value="usage">Usage</option>
          </LabeledSelect>
          <LabeledSelect
            label="Active"
            value={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value }))}
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </LabeledSelect>
        </div>
        <LabeledTextarea
          label="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
        />
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--text2)' }}>
          Changing price does not alter existing quote line snapshots.
        </p>
        {error ? (
          <p role="alert" style={{ color: 'var(--red)', margin: '0 0 12px', fontSize: 13 }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <SecondaryButton type="button" onClick={() => router.push('/crm/products')}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            Save product
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
