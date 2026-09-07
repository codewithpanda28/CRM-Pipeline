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
  pageShellStyle,
  panelStyle,
  sectionTitleStyle,
  twoColGrid,
} from '@/modules/crm/shared/ui';
import { Input, Select } from '@/modules/shared/components/ui/FormField';
import { createProduct, deleteProduct, listProducts, type Product } from '../lib/api';

const emptyForm = () => ({
  kind: 'service',
  name: '',
  sku: '',
  description: '',
  category: '',
  list_price: '0.00',
  currency: 'INR',
  unit: 'each',
  cost: '',
  tax_category_code: '',
  billing_model: '',
  is_active: 'true',
});

function money(amount: string, currency: string) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${currency} ${amount}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function ProductsBoard() {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [active, setActive] = useState('true');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (q.trim()) p.q = q.trim();
    if (kind) p.kind = kind;
    if (active) p.is_active = active;
    return p;
  }, [q, kind, active]);

  const { data, isLoading } = useQuery({
    queryKey: ['products', params],
    queryFn: async () => listProducts(await getToken(), params),
    enabled: Boolean(user),
  });

  const createMut = useMutation({
    mutationFn: async () =>
      createProduct(await getToken(), {
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
      setShowCreate(false);
      setForm(emptyForm());
      setError(null);
      setFieldErrors({});
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => deleteProduct(await getToken(), id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const products: Product[] = data?.data ?? [];

  function submitCreate() {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Name is required';
    if (!form.sku.trim()) next.sku = 'SKU is required';
    if (!form.list_price.trim()) next.list_price = 'Price is required';
    setFieldErrors(next);
    if (Object.keys(next).length) {
      setError('Please fix the highlighted fields.');
      return;
    }
    createMut.mutate();
  }

  return (
    <div style={pageShellStyle}>
      <PageHeader
        title="Products"
        subtitle="Catalog of products, services, packages, and plans."
        actions={
          <PrimaryButton
            type="button"
            onClick={() => {
              setShowCreate(true);
              setError(null);
            }}
          >
            New product
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
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
            Search
          </label>
          <Input
            aria-label="Search products"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or SKU"
            style={{ minHeight: 40 }}
          />
        </div>
        <div style={{ flex: '0 1 140px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
            Kind
          </label>
          <Select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)} style={{ minHeight: 40 }}>
            <option value="">All</option>
            <option value="product">Product</option>
            <option value="service">Service</option>
            <option value="package">Package</option>
            <option value="plan">Plan</option>
          </Select>
        </div>
        <div style={{ flex: '0 1 120px' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>
            Status
          </label>
          <Select aria-label="Filter by status" value={active} onChange={(e) => setActive(e.target.value)} style={{ minHeight: 40 }}>
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
        </div>
      </div>

      {showCreate ? (
        <div style={{ ...panelStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>New product</h2>
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
              error={fieldErrors.name}
            />
            <LabeledInput
              label="SKU"
              value={form.sku}
              onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              error={fieldErrors.sku}
            />
            <LabeledInput
              label="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Optional"
            />
            <LabeledInput
              label="Price"
              value={form.list_price}
              onChange={(e) => setForm((f) => ({ ...f, list_price: e.target.value }))}
              error={fieldErrors.list_price}
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
            <LabeledInput
              label="Unit"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
            />
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
              placeholder="Optional"
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
                setFieldErrors({});
              }}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton type="button" onClick={submitCreate} disabled={createMut.isPending}>
              Save product
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div style={panelStyle}>
          <p style={{ margin: 0, color: 'var(--text2)' }}>Loading products…</p>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add your first catalog item so quotes can pull pricing, SKUs, and units automatically."
          action={
            <PrimaryButton type="button" onClick={() => setShowCreate(true)}>
              New product
            </PrimaryButton>
          }
        />
      ) : (
        <>
          <div className="tq-products-table" style={{ ...panelStyle, padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 680 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                    {['Name', 'SKU', 'Kind', 'Price', 'Currency', 'Unit', 'Status', 'Actions'].map((h) => (
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
                  {products.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                        <Link href={`/crm/products/${p.id}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                          {p.name}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>{p.sku}</td>
                      <td style={{ padding: '12px 14px', textTransform: 'capitalize' }}>{p.kind}</td>
                      <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>
                        {money(p.list_price, p.currency)}
                      </td>
                      <td style={{ padding: '12px 14px' }}>{p.currency}</td>
                      <td style={{ padding: '12px 14px' }}>{p.unit}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={p.is_active ? 'active' : 'inactive'} />
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <Link
                            href={`/crm/products/${p.id}`}
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
                            }}
                          >
                            Edit
                          </Link>
                          <SecondaryButton
                            type="button"
                            onClick={() => {
                              if (confirm('Soft-delete this product?')) delMut.mutate(p.id);
                            }}
                          >
                            Delete
                          </SecondaryButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="tq-products-cards" style={{ display: 'none', flexDirection: 'column', gap: 12 }}>
            {products.map((p) => (
              <div key={p.id} style={panelStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <Link href={`/crm/products/${p.id}`} style={{ fontWeight: 650, color: 'var(--accent)', textDecoration: 'none' }}>
                    {p.name}
                  </Link>
                  <StatusPill status={p.is_active ? 'active' : 'inactive'} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  <div>SKU · {p.sku}</div>
                  <div style={{ textTransform: 'capitalize' }}>
                    {p.kind} · {p.unit}
                  </div>
                  <div style={{ fontWeight: 650, color: 'var(--text)', marginTop: 4 }}>
                    {money(p.list_price, p.currency)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <Link
                    href={`/crm/products/${p.id}`}
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
                    }}
                  >
                    Edit
                  </Link>
                  <SecondaryButton
                    type="button"
                    onClick={() => {
                      if (confirm('Soft-delete this product?')) delMut.mutate(p.id);
                    }}
                  >
                    Delete
                  </SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @media (max-width: 767px) {
          .tq-products-table { display: none !important; }
          .tq-products-cards { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
