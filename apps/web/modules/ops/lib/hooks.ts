'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/modules/shared/lib/api';
import { useApiToken } from '@/modules/shared/lib/useApiToken';

export type TaskContextChip = {
  type: string;
  id: string;
  label: string;
  href: string;
};

export type OpsTask = {
  id: string;
  title: string;
  status: string;
  status_business?: string;
  priority: string;
  task_type?: string;
  due?: string | null;
  due_at?: string | null;
  assignee_id?: string | null;
  related_deal_id?: string | null;
  related_lead_id?: string | null;
  related_invoice_id?: string | null;
  related_quote_id?: string | null;
  related_customer_party_id?: string | null;
  context?: TaskContextChip[];
  completion_outcome?: string | null;
  scheduling_mode?: 'unbounded' | 'time_bound' | string | null;
  start_at?: string | null;
  end_at?: string | null;
  duration_minutes?: number | null;
  timezone?: string | null;
  meeting_mode?: 'online' | 'offline' | string | null;
  location?: string | null;
};

export type OpsTasksFilters = {
  status?: string;
  priority?: string;
  type?: string;
  /** When true, include done/cancelled (status=all). */
  include_done?: boolean;
};

export type TodayBuckets = {
  overdue: OpsTask[];
  today: OpsTask[];
  upcoming: OpsTask[];
  high_priority: OpsTask[];
  scope?: string;
};

export function useOpsToday(scope?: string) {
  const getToken = useApiToken();
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return useQuery({
    queryKey: ['ops', 'today', scope ?? 'default'],
    queryFn: async () =>
      apiFetch<{ data: TodayBuckets }>(`/api/ops/today${qs}`, { token: await getToken() }),
  });
}

export function useOpsMyWork(filters?: { type?: string; priority?: string; status?: string }) {
  const getToken = useApiToken();
  const params = new URLSearchParams();
  if (filters?.type) params.set('type', filters.type);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString() ? `?${params}` : '';
  return useQuery({
    queryKey: ['ops', 'my-work', filters ?? {}],
    queryFn: async () =>
      apiFetch<{ data: { open: OpsTask[]; done: OpsTask[]; buckets: TodayBuckets } }>(
        `/api/ops/my-work${qs}`,
        { token: await getToken() },
      ),
  });
}

export function useOpsTasks(filters?: OpsTasksFilters) {
  const getToken = useApiToken();
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.priority) params.set('priority', filters.priority);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.include_done) params.set('include_done', '1');
  const qs = params.toString() ? `?${params}` : '';
  return useQuery({
    queryKey: ['ops', 'tasks', filters ?? {}],
    queryFn: async () =>
      apiFetch<{ data: OpsTask[] }>(`/api/ops/tasks${qs}`, { token: await getToken() }),
  });
}

export function useCompleteOpsTask() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: string | { id: string; completion_outcome?: string }) => {
      const id = typeof p === 'string' ? p : p.id;
      const outcome = typeof p === 'string' ? undefined : p.completion_outcome;
      return apiFetch(`/api/ops/tasks/${id}/complete`, {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ completion_outcome: outcome ?? null }),
      });
    },
    onMutate: async (p) => {
      const id = typeof p === 'string' ? p : p.id;
      await qc.cancelQueries({ queryKey: ['ops', 'tasks'] });
      const previous = qc.getQueriesData<{ data: OpsTask[] }>({ queryKey: ['ops', 'tasks'] });
      qc.setQueriesData<{ data: OpsTask[] }>({ queryKey: ['ops', 'tasks'] }, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t) =>
            t.id === id ? { ...t, status: 'done' } : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _p, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'today'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'my-work'] });
    },
  });
}

export function useRescheduleOpsTask() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; due_at: string }) =>
      apiFetch(`/api/ops/tasks/${p.id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ due_at: p.due_at }),
      }),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ['ops', 'tasks'] });
      const previous = qc.getQueriesData<{ data: OpsTask[] }>({ queryKey: ['ops', 'tasks'] });
      qc.setQueriesData<{ data: OpsTask[] }>({ queryKey: ['ops', 'tasks'] }, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t) => (t.id === p.id ? { ...t, due_at: p.due_at } : t)),
        };
      });
      return { previous };
    },
    onError: (_err, _p, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'today'] });
    },
  });
}

export function useReassignOpsTask() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; assignee_id: string }) =>
      apiFetch(`/api/ops/tasks/${p.id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ assignee_id: p.assignee_id }),
      }),
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: ['ops', 'tasks'] });
      const previous = qc.getQueriesData<{ data: OpsTask[] }>({ queryKey: ['ops', 'tasks'] });
      qc.setQueriesData<{ data: OpsTask[] }>({ queryKey: ['ops', 'tasks'] }, (old) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.map((t) => (t.id === p.id ? { ...t, assignee_id: p.assignee_id } : t)),
        };
      });
      return { previous };
    },
    onError: (_err, _p, ctx) => {
      if (ctx?.previous) {
        for (const [key, data] of ctx.previous) qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
    },
  });
}

export function useCreateOpsTask() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiFetch('/api/ops/tasks', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'today'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'my-work'] });
    },
  });
}

export function useOpsEmployees() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'employees'],
    queryFn: async () =>
      apiFetch<{ data: any[] }>('/api/ops/employees', { token: await getToken() }),
  });
}

export function useOpsEmployeeMe() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'employees', 'me'],
    queryFn: async () =>
      apiFetch<{ data: { id: string; display_name: string; user_id: string } | null }>(
        '/api/ops/employees/me',
        { token: await getToken() },
      ),
    retry: false,
  });
}

export function useOpsAssignableEmployees() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'employees', 'assignable'],
    queryFn: async () =>
      apiFetch<{ data: Array<{ id: string; user_id: string; display_name: string }> }>(
        '/api/ops/employees/assignable',
        { token: await getToken() },
      ),
  });
}

export function useOpsDepartments() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'departments'],
    queryFn: async () =>
      apiFetch<{ data: any[] }>('/api/ops/departments', { token: await getToken() }),
  });
}

export function useOpsTeams() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'teams'],
    queryFn: async () =>
      apiFetch<{ data: any[] }>('/api/ops/teams', { token: await getToken() }),
  });
}

export function useOpsTargets(opts?: { period_id?: string; granularity?: string }) {
  const getToken = useApiToken();
  const params = new URLSearchParams();
  if (opts?.period_id) params.set('period_id', opts.period_id);
  if (opts?.granularity) params.set('granularity', opts.granularity);
  const qs = params.toString() ? `?${params}` : '';
  return useQuery({
    queryKey: ['ops', 'targets', opts ?? {}],
    queryFn: async () =>
      apiFetch<{ data: any[] }>(`/api/ops/targets${qs}`, { token: await getToken() }),
  });
}

export function useOpsPeriods() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'periods'],
    queryFn: async () =>
      apiFetch<{ data: any[] }>('/api/ops/periods', { token: await getToken() }),
  });
}

export function useOpsPerformance(opts?: {
  period_id?: string;
  granularity?: string;
  subject_type?: string;
  subject_id?: string;
}) {
  const getToken = useApiToken();
  const params = new URLSearchParams();
  if (opts?.period_id) params.set('period_id', opts.period_id);
  if (opts?.granularity) params.set('granularity', opts.granularity ?? 'monthly');
  if (opts?.subject_type) params.set('subject_type', opts.subject_type);
  if (opts?.subject_id) params.set('subject_id', opts.subject_id);
  const qs = params.toString() ? `?${params}` : '';
  return useQuery({
    queryKey: ['ops', 'performance', opts ?? {}],
    queryFn: async () =>
      apiFetch<{ data: any }>(`/api/ops/performance/summary${qs}`, { token: await getToken() }),
  });
}

export function useOpsDprMe(date?: string) {
  const getToken = useApiToken();
  const qs = date ? `?date=${date}` : '';
  return useQuery({
    queryKey: ['ops', 'dpr', 'me', date ?? 'today'],
    queryFn: async () =>
      apiFetch<{ data: any }>(`/api/ops/dpr/me${qs}`, { token: await getToken() }),
  });
}

export function useOpsDprInbox() {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'dpr', 'inbox'],
    queryFn: async () =>
      apiFetch<{ data: any[] }>('/api/ops/dpr/inbox', { token: await getToken() }),
  });
}

export function useOpsDprDetail(id: string | undefined) {
  const getToken = useApiToken();
  return useQuery({
    queryKey: ['ops', 'dpr', id],
    enabled: !!id,
    queryFn: async () =>
      apiFetch<{ data: any }>(`/api/ops/dpr/${id}`, { token: await getToken() }),
  });
}

export function useDprRefresh() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/ops/dpr/${id}/refresh`, { method: 'POST', token: await getToken() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops', 'dpr'] }),
  });
}

export function useDprOverlay() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; notes?: string }) =>
      apiFetch(`/api/ops/dpr/${p.id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: JSON.stringify({ notes: p.notes }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops', 'dpr'] }),
  });
}

export function useDprSubmit() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/ops/dpr/${id}/submit`, { method: 'POST', token: await getToken() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops', 'dpr'] }),
  });
}

export function useDprReview() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; decision: 'approve' | 'return'; comment?: string }) =>
      apiFetch(`/api/ops/dpr/${p.id}/review`, {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify({ decision: p.decision, comment: p.comment }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ops', 'dpr'] }),
  });
}

/** Convenience bundle — call each hook at component top level. */
export function useDprMutation() {
  return {
    refresh: useDprRefresh(),
    overlay: useDprOverlay(),
    submit: useDprSubmit(),
    review: useDprReview(),
  };
}

export function useCreatePeriod() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { granularity: string }) =>
      apiFetch('/api/ops/periods', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'periods'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'targets'] });
    },
  });
}

export function useClosePeriod() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/api/ops/periods/${id}/close`, {
        method: 'POST',
        token: await getToken(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'periods'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'targets'] });
    },
  });
}

export function useCreateTarget() {
  const getToken = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      apiFetch('/api/ops/targets', {
        method: 'POST',
        token: await getToken(),
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ops', 'targets'] });
      void qc.invalidateQueries({ queryKey: ['ops', 'performance'] });
    },
  });
}

export function formatDueTime(due?: string | null) {
  if (!due) return '—';
  const d = new Date(due);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function contextLabel(t: OpsTask) {
  if (t.context && t.context.length > 0) return t.context[0]!.label;
  if (t.related_invoice_id) return `INV`;
  if (t.related_quote_id) return 'Quote';
  if (t.related_deal_id) return 'Deal';
  if (t.related_lead_id) return 'Lead';
  if (t.related_customer_party_id) return 'Customer';
  return null;
}
