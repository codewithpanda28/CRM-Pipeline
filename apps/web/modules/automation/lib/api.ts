import { apiFetch } from '@/modules/shared/lib/api';

type Token = string | null | undefined;

async function getData<T>(path: string, token: Token, init?: RequestInit): Promise<T> {
  const res = await apiFetch<{ data: T; error: { code: string; message: string } | null }>(path, {
    token: token ?? undefined,
    ...init,
  });
  if (res.error) throw new Error(res.error.message || res.error.code);
  return res.data;
}

export interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  current_draft_version_id: string | null;
  current_published_version_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  draft_graph?: Record<string, unknown> | null;
  draft_version_number?: number | null;
  published_version_number?: number | null;
}

export interface ApprovalRow {
  id: string;
  action_type: string;
  status: string;
  requested_payload_snapshot: Record<string, unknown>;
  payload_hash: string;
  requester_type: string;
  requester_id: string;
  approver_id: string | null;
  reason: string | null;
  comment: string | null;
  requested_at: string;
  expires_at: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_run_id: string;
  workflow_run_step_id: string | null;
}

export interface RunRow {
  id: string;
  workflow_id: string;
  status: string;
  trigger_event_name: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: Record<string, unknown> | null;
  steps?: Array<{
    id: string;
    node_id: string;
    step_type: string;
    status: string;
    attempt: number;
    error: Record<string, unknown> | null;
    output_snapshot: Record<string, unknown> | null;
    started_at: string | null;
    finished_at: string | null;
  }>;
}

export interface UsageRow {
  runs_started: number;
  runs_completed: number;
  runs_failed: number;
  steps_executed: number;
  display_limit: number;
  period_start: string | null;
}

export const automationApi = {
  listWorkflows: (token: Token) => getData<WorkflowRow[]>('/api/automation/workflows', token),
  getWorkflow: (token: Token, id: string) => getData<WorkflowRow>(`/api/automation/workflows/${id}`, token),
  createWorkflow: (token: Token, body: { name: string; description?: string; graph?: Record<string, unknown> }) =>
    getData<WorkflowRow>('/api/automation/workflows', token, { method: 'POST', body: JSON.stringify(body) }),
  updateDraft: (token: Token, id: string, graph: Record<string, unknown>) =>
    getData<WorkflowRow>(`/api/automation/workflows/${id}/draft`, token, {
      method: 'PATCH',
      body: JSON.stringify({ graph }),
    }),
  publish: (token: Token, id: string) =>
    getData<WorkflowRow>(`/api/automation/workflows/${id}/publish`, token, { method: 'POST', body: '{}' }),
  archive: (token: Token, id: string) =>
    getData<WorkflowRow>(`/api/automation/workflows/${id}/archive`, token, { method: 'POST', body: '{}' }),
  enable: (token: Token, id: string) =>
    getData<WorkflowRow>(`/api/automation/workflows/${id}/enable`, token, { method: 'POST', body: '{}' }),
  listApprovals: (token: Token) => getData<ApprovalRow[]>('/api/automation/approvals', token),
  getApproval: (token: Token, id: string) => getData<ApprovalRow>(`/api/automation/approvals/${id}`, token),
  authorize: (token: Token, id: string, comment?: string) =>
    getData<ApprovalRow>(`/api/automation/approvals/${id}/authorize`, token, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  reject: (token: Token, id: string, reason: string) =>
    getData<ApprovalRow>(`/api/automation/approvals/${id}/reject`, token, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  listRuns: (token: Token) => getData<RunRow[]>('/api/automation/runs', token),
  getRun: (token: Token, id: string) => getData<RunRow>(`/api/automation/runs/${id}`, token),
  replayRun: (token: Token, id: string) =>
    getData<{ replayed: boolean; note: string }>(`/api/automation/runs/${id}/replay`, token, {
      method: 'POST',
      body: '{}',
    }),
  usage: (token: Token) => getData<UsageRow>('/api/automation/usage', token),
  flags: (token: Token) => getData<Record<string, unknown>>('/api/automation/flags', token),
  setFlags: (token: Token, body: Record<string, unknown>) =>
    getData<Record<string, unknown>>('/api/automation/flags', token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
