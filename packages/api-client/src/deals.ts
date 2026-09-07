import { apiFetch } from './core';
import type { PipelineRecord } from '@vencore/types';

export async function listDeals(token: string, pipelineId: string): Promise<{ data: PipelineRecord[] }> {
  return apiFetch<{ data: PipelineRecord[] }>(
    `/api/deals?pipeline_id=${pipelineId}&per_page=500`,
    { token },
  );
}

export async function getDeal(token: string, id: string): Promise<{ data: PipelineRecord }> {
  return apiFetch<{ data: PipelineRecord }>(`/api/deals/${id}`, { token });
}

export async function createDeal(
  token: string,
  body: {
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
  },
): Promise<{ data: PipelineRecord }> {
  return apiFetch<{ data: PipelineRecord }>('/api/deals', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateDeal(
  token: string,
  id: string,
  body: {
    name?: string;
    stage_id?: string;
    field_values?: Record<string, string>;
  },
): Promise<{ data: PipelineRecord }> {
  return apiFetch<{ data: PipelineRecord }>(`/api/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function deleteDeal(token: string, id: string): Promise<{ data: { id: string } }> {
  return apiFetch<{ data: { id: string } }>(`/api/deals/${id}`, { method: 'DELETE', token });
}
