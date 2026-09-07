'use client';

import { apiFetch } from '@/modules/shared/lib/api';

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'unqualified'
  | 'lost'
  | 'abandoned';

export type LeadNextTask = {
  id: string;
  title: string;
  due_at?: string | null;
  due?: string | null;
  priority?: string | null;
};

export type LeadLinkedDeal = {
  id: string;
  name: string;
  stage_id: string;
  stage_name: string | null;
  stage_color: string | null;
  pipeline_id: string;
  status: string;
};

export interface Lead {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source: string | null;
  status: LeadStatus;
  rating: 'hot' | 'warm' | 'cold' | null;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  converted_at: string | null;
  created_at: string;
  next_task?: LeadNextTask | null;
  deal?: LeadLinkedDeal | null;
  pipeline_stage?: { id: string; name: string; color: string | null } | null;
}

export async function listLeads(token: string, params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<{ data: Lead[]; error: null }>(`/api/leads${qs}`, { token });
}

export async function createLead(
  token: string,
  body: Record<string, unknown>,
) {
  return apiFetch<{ data: Lead; error: null; meta?: { duplicates?: unknown[] } }>(
    '/api/leads',
    { method: 'POST', body: JSON.stringify(body), token },
  );
}

export async function convertLead(
  token: string,
  id: string,
  body: Record<string, unknown>,
) {
  return apiFetch<{ data: unknown; error: null }>(`/api/leads/${id}/convert`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  });
}

export async function updateLead(
  token: string,
  id: string,
  body: Record<string, unknown>,
) {
  return apiFetch<{ data: Lead; error: null }>(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  });
}

export async function bulkLeads(
  token: string,
  body: {
    action: 'assign' | 'status' | 'delete';
    ids: string[];
    owner_id?: string;
    status?: string;
  },
) {
  return apiFetch<{ data: { updated: number; failed: number; errors: string[] }; error: null }>(
    '/api/leads/bulk',
    { method: 'POST', body: JSON.stringify(body), token },
  );
}
