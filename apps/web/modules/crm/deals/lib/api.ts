'use client';

import { apiFetch } from '@/modules/shared/lib/api';

export type DealStatus = 'open' | 'won' | 'lost' | 'abandoned';

export interface Deal {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  owner_id: string;
  amount: string;
  currency: string;
  probability: number;
  expected_close_at: string | null;
  source: string | null;
  primary_contact_id: string | null;
  company_id: string | null;
  customer_party_id: string | null;
  status: DealStatus;
  won_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  custom_fields?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  display?: {
    owner_name?: string | null;
    company_name?: string | null;
    customer_name?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    pipeline_name?: string | null;
    stage_name?: string | null;
  } | null;
}

export interface CreateDealBody {
  name: string;
  pipeline_id: string;
  stage_id: string;
  owner_id: string;
  amount?: string | number;
  currency?: string;
  probability?: number;
  expected_close_at?: string | null;
  source?: string | null;
  primary_contact_id?: string | null;
  company_id?: string | null;
  customer_party_id?: string | null;
  lead_id?: string | null;
  custom_fields?: Record<string, unknown>;
  position?: number;
}

export async function createDeal(token: string, body: CreateDealBody) {
  return apiFetch<{ data: Deal; error: null }>('/api/deals', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export async function getDeal(token: string, id: string) {
  return apiFetch<{ data: Deal; error: null }>(`/api/deals/${id}`, { token });
}

export async function updateDeal(token: string, id: string, body: Record<string, unknown>) {
  return apiFetch<{ data: Deal; error: null }>(`/api/deals/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  });
}

export async function moveDeal(token: string, id: string, body: { stage_id: string; lost_reason?: string | null }) {
  return apiFetch<{ data: Deal; error: null }>(`/api/deals/${id}/move`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}
