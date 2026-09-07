'use client';

import { apiFetch } from '@/modules/shared/lib/api';

export type ProductKind = 'product' | 'service' | 'package' | 'plan';

export interface Product {
  id: string;
  kind: ProductKind;
  sku: string;
  name: string;
  description: string | null;
  unit: string;
  list_price: string;
  currency: string;
  cost?: string | null;
  tax_category_code?: string | null;
  billing_model?: string | null;
  is_active: boolean;
  category: string | null;
}

export async function listProducts(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Product[]; error: null }>(`/api/products${qs}`, { token });
}

export async function getProduct(token: string, id: string) {
  return apiFetch<{ data: Product; error: null }>(`/api/products/${id}`, { token });
}

export async function createProduct(token: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Product; error: null }>('/api/products', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function updateProduct(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Product; error: null }>(`/api/products/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function deleteProduct(token: string, id: string) {
  return apiFetch<{ data: { deleted: boolean }; error: null }>(`/api/products/${id}`, {
    method: 'DELETE',
    token,
  });
}
