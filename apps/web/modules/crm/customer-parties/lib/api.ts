'use client';

import { apiFetch } from '@/modules/shared/lib/api';

export type CustomerPartyType = 'contact' | 'company';
export type CustomerPartyStatus = 'active' | 'inactive' | 'merged';

export interface CustomerParty {
  id: string;
  workspace_id: string;
  party_type: CustomerPartyType;
  party_id: string;
  display_name: string;
  status: CustomerPartyStatus;
  primary_owner_id: string | null;
  merged_into_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listCustomerParties(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: CustomerParty[]; error: null }>(`/api/customer-parties${qs}`, { token });
}

export async function getCustomerParty(token: string, id: string) {
  return apiFetch<{ data: CustomerParty; meta?: { redirected_to?: string }; error: null }>(
    `/api/customer-parties/${id}`,
    { token },
  );
}

export async function getCustomer360(token: string, id: string) {
  return apiFetch<{ data: Record<string, unknown>; error: null }>(
    `/api/customer-parties/${id}/360`,
    { token },
  );
}

export async function createCustomerParty(
  token: string,
  body: { contact_id?: string; company_id?: string; display_name?: string },
) {
  return apiFetch<{ data: CustomerParty; meta?: { created?: boolean }; error: null }>(
    '/api/customer-parties',
    { method: 'POST', token, body: JSON.stringify(body) },
  );
}

export async function linkDealToParty(token: string, partyId: string, dealId: string) {
  return apiFetch<{ data: unknown; error: null }>(`/api/customer-parties/${partyId}/link`, {
    method: 'POST',
    token,
    body: JSON.stringify({ deal_id: dealId }),
  });
}

export async function mergeCustomerParties(
  token: string,
  sourceId: string,
  intoId: string,
  reason: string,
) {
  return apiFetch<{ data: { survivor_id: string }; error: null }>(
    `/api/customer-parties/${sourceId}/merge`,
    { method: 'POST', token, body: JSON.stringify({ into_id: intoId, reason }) },
  );
}
