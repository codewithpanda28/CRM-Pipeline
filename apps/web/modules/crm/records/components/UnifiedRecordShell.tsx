'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/modules/shared/components/Topbar';
import { useApiToken } from '@/modules/shared/lib/useApiToken';
import { apiFetch } from '@/modules/shared/lib/api';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { useCreateOpsTask, useOpsAssignableEmployees } from '@/modules/ops/lib/hooks';
import { getPipeline } from '@/modules/crm/pipeline/lib/pipelines';
import { moveItem } from '@/modules/crm/pipeline/lib/items';

export type RecordPayload = {
  mode: 'LeadRecord' | 'PartyRecord' | 'DealContext';
  ref: string | null;
  lead: Record<string, unknown> | null;
  party: Record<string, unknown> | null;
  deal: Record<string, unknown> | null;
  lineage: Array<{ entity_type: string; entity_id: string; action: string }>;
  permissions: Record<string, boolean>;
  tasks?: Array<Record<string, unknown>>;
  customization?: {
    sections: Array<Record<string, unknown>>;
    fields: Array<Record<string, unknown>>;
    values: Array<Record<string, unknown>>;
  };
};

type TimelineItem = {
  id: string;
  type?: string;
  event_type?: string;
  body?: string | null;
  heading?: string | null;
  occurred_at?: string | null;
  created_at?: string | null;
  actor_name?: string | null;
  user_id?: string | null;
  meta?: Record<string, unknown> | null;
};

type TabId = 'overview' | 'contact' | 'sales' | 'tasks' | 'timeline' | 'commercial' | 'custom';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'contact', label: 'Contact' },
  { id: 'sales', label: 'Sales' },
  { id: 'tasks', label: 'Tasks & Meetings' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'custom', label: 'Custom Fields' },
];

const OPEN_TASK_STATUSES = new Set(['open', 'in_progress', 'todo']);

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

const btnPrimary: React.CSSProperties = {
  ...btn,
  background: 'var(--text)',
  color: 'var(--bg)',
  borderColor: 'var(--text)',
  fontWeight: 600,
};

const field: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

function defaultTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function str(v: unknown): string {
  if (v == null || v === '') return '—';
  return String(v);
}

function formatMoney(amount: unknown, currency: unknown): string {
  if (amount == null || amount === '') return '—';
  const cur = currency != null && String(currency).trim() ? String(currency) : '';
  return cur ? `${amount} ${cur}` : String(amount);
}

function formatCustomValue(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map((x) => formatCustomValue(x)).join(', ');
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function isOpenTask(status: unknown): boolean {
  return OPEN_TASK_STATUSES.has(String(status ?? '').toLowerCase());
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: 16,
          fontFamily: 'var(--font-sans)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650, color: 'var(--text)' }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ ...btn, padding: '4px 8px' }}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function UnifiedRecordShell({ recordRef }: { recordRef: string }) {
  const getToken = useApiToken();
  const { user } = useAuth();
  const qc = useQueryClient();
  const createTask = useCreateOpsTask();
  const assignable = useOpsAssignableEmployees();
  const [tab, setTab] = useState<TabId>('overview');
  const [modal, setModal] = useState<'task' | 'meeting' | 'comm' | 'stage' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ['crm-record', recordRef],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ data: RecordPayload; error: null }>(
        `/api/crm/records/${encodeURIComponent(recordRef)}`,
        { token },
      );
      return res.data;
    },
    enabled: Boolean(recordRef),
  });

  const timelineQ = useQuery({
    queryKey: ['crm-record-timeline', recordRef],
    queryFn: async () => {
      const token = await getToken();
      const res = await apiFetch<{ data: TimelineItem[]; error: null }>(
        `/api/crm/records/${encodeURIComponent(recordRef)}/timeline`,
        { token },
      );
      return res.data ?? [];
    },
    enabled: Boolean(recordRef) && Boolean(data),
    retry: false,
  });

  const related = useMemo(() => {
    const leadId = data?.lead?.['id'] ? String(data.lead['id']) : null;
    const partyId = data?.party?.['id'] ? String(data.party['id']) : null;
    const dealId = data?.deal?.['id'] ? String(data.deal['id']) : null;
    return { leadId, partyId, dealId };
  }, [data]);

  const pipelineId = data?.deal?.['pipeline_id'] ? String(data.deal['pipeline_id']) : null;
  const pipelineQ = useQuery({
    queryKey: ['pipeline', pipelineId],
    queryFn: async () => getPipeline(await getToken(), pipelineId!),
    enabled: Boolean(pipelineId),
  });

  const ownerId = String(
    data?.deal?.['owner_id'] ?? data?.lead?.['owner_id'] ?? data?.party?.['owner_id'] ?? '',
  );
  const ownerName = useMemo(() => {
    if (!ownerId) return '—';
    const emp = (assignable.data?.data ?? []).find(
      (e) => e.user_id === ownerId || e.id === ownerId,
    );
    return emp?.display_name ?? ownerId;
  }, [assignable.data?.data, ownerId]);

  const title =
    (data?.deal?.['name'] as string | undefined) ??
    (data?.party?.['display_name'] as string | undefined) ??
    (data?.lead?.['name'] as string | undefined) ??
    'Record';

  const leadStatus = data?.lead ? str(data.lead['status']) : null;
  const dealStatus = data?.deal ? str(data.deal['status']) : null;
  const stageLabel =
    pipelineQ.data?.stages?.find((s) => s.id === data?.deal?.['stage_id'])?.name ??
    (data?.deal?.['stage_id'] ? str(data.deal['stage_id']) : null);

  const headerStatus = dealStatus ?? leadStatus ?? str(data?.party?.['status'] ?? null);

  const openTasks = useMemo(() => {
    const all = data?.tasks ?? [];
    return all.filter((t) => isOpenTask(t['status'] ?? t['status_business']));
  }, [data?.tasks]);

  // Task / meeting form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');
  const [taskDue, setTaskDue] = useState('');
  const [meetStart, setMeetStart] = useState('');
  const [meetDuration, setMeetDuration] = useState('30');
  const [meetTz, setMeetTz] = useState(defaultTz());
  const [meetMode, setMeetMode] = useState<'' | 'online' | 'offline'>('online');
  const [meetLocation, setMeetLocation] = useState('');

  // Communication
  const [commHeading, setCommHeading] = useState('');
  const [commBody, setCommBody] = useState('');

  // Stage
  const [targetStageId, setTargetStageId] = useState('');

  function relatedBody(): Record<string, unknown> {
    const body: Record<string, unknown> = { assignee_id: user?.id };
    if (related.dealId) body.related_deal_id = related.dealId;
    if (related.leadId) body.related_lead_id = related.leadId;
    if (related.partyId) body.related_customer_party_id = related.partyId;
    return body;
  }

  function openModal(kind: typeof modal) {
    setFormError(null);
    setModal(kind);
    if (kind === 'task') {
      setTaskTitle('');
      setTaskPriority('MEDIUM');
      setTaskDue('');
    }
    if (kind === 'meeting') {
      setTaskTitle('Meeting');
      setMeetStart('');
      setMeetDuration('30');
      setMeetTz(defaultTz());
      setMeetMode('online');
      setMeetLocation('');
    }
    if (kind === 'comm') {
      setCommHeading('');
      setCommBody('');
    }
    if (kind === 'stage') {
      setTargetStageId(String(data?.deal?.['stage_id'] ?? ''));
    }
  }

  const commMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return apiFetch(`/api/crm/records/${encodeURIComponent(recordRef)}/communications`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          heading: commHeading.trim() || undefined,
          body: commBody.trim(),
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm-record-timeline', recordRef] });
      setModal(null);
    },
  });

  const stageMut = useMutation({
    mutationFn: async (stageId: string) => {
      if (!related.dealId) throw new Error('No deal');
      return moveItem(await getToken(), related.dealId, { stage_id: stageId, position: 0 });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['crm-record', recordRef] });
      if (pipelineId) void qc.invalidateQueries({ queryKey: ['items', pipelineId] });
      else void qc.invalidateQueries({ queryKey: ['items'] });
      setModal(null);
    },
  });

  async function submitTask() {
    setFormError(null);
    if (!taskTitle.trim()) {
      setFormError('Title is required');
      return;
    }
    try {
      await createTask.mutateAsync({
        ...relatedBody(),
        title: taskTitle.trim(),
        priority: taskPriority,
        task_type: 'follow_up',
        scheduling_mode: 'unbounded',
        ...(taskDue ? { due_at: new Date(taskDue).toISOString() } : {}),
      });
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['crm-record', recordRef] });
      void qc.invalidateQueries({ queryKey: ['crm-record-timeline', recordRef] });
      setModal(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function submitMeeting() {
    setFormError(null);
    if (!taskTitle.trim()) {
      setFormError('Title is required');
      return;
    }
    if (!meetStart) {
      setFormError('Start is required');
      return;
    }
    const dur = Number(meetDuration);
    if (!Number.isFinite(dur) || dur < 1) {
      setFormError('Duration must be ≥ 1');
      return;
    }
    if (meetMode === 'offline' && !meetLocation.trim()) {
      setFormError('Location required for offline');
      return;
    }
    try {
      await createTask.mutateAsync({
        ...relatedBody(),
        title: taskTitle.trim(),
        task_type: 'meeting',
        priority: 'MEDIUM',
        scheduling_mode: 'time_bound',
        start_at: new Date(meetStart).toISOString(),
        duration_minutes: dur,
        timezone: meetTz || defaultTz(),
        ...(meetMode
          ? {
              meeting_mode: meetMode,
              ...(meetMode === 'offline' ? { location: meetLocation.trim() } : {}),
            }
          : {}),
      });
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['crm-record', recordRef] });
      void qc.invalidateQueries({ queryKey: ['crm-record-timeline', recordRef] });
      setModal(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function createOpsOnboarding() {
    setFormError(null);
    try {
      await createTask.mutateAsync({
        ...relatedBody(),
        title: `Ops onboarding — ${title}`,
        task_type: 'onboarding',
        priority: 'HIGH',
        scheduling_mode: 'unbounded',
        assignee_id: user?.id,
      });
      void qc.invalidateQueries({ queryKey: ['ops', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['crm-record', recordRef] });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create ops task');
    }
  }

  const dealWon = String(data?.deal?.['status'] ?? '').toLowerCase() === 'won';
  const unconvertedLead =
    data?.mode === 'LeadRecord' &&
    data.lead &&
    String(data.lead['status'] ?? '') !== 'converted' &&
    !data.party;

  const timeline = timelineQ.data ?? [];

  return (
    <>
      <Topbar />
      <div style={{ padding: 24, fontFamily: 'var(--font-sans)', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
        {isLoading && <p style={{ color: 'var(--text3)' }}>Loading record…</p>}
        {error && (
          <p role="alert" style={{ color: 'var(--red)' }}>
            {error instanceof Error ? error.message : 'Failed to load record'}
          </p>
        )}

        {data && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {data.mode}
            </div>
            <h1 style={{ margin: '4px 0 8px', fontSize: 24, fontWeight: 650, color: 'var(--text)', wordBreak: 'break-word' }}>
              {title}
            </h1>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 14px',
                fontSize: 13,
                color: 'var(--text2)',
                marginBottom: 14,
              }}
            >
              <span>Owner: {ownerName}</span>
              {leadStatus && data.lead ? <span>Lead status: {leadStatus}</span> : null}
              {data.deal ? <span>Deal status: {dealStatus}</span> : <span>Status: {headerStatus}</span>}
              {data.deal ? <span>Pipeline stage: {stageLabel ?? '—'}</span> : null}
            </div>

            {dealWon ? (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'color-mix(in srgb, var(--accent) 8%, var(--surface))',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  Commercial won — ops handoff
                </div>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
                  This deal is won. Create an ops onboarding task so delivery can take ownership.
                </p>
                <button type="button" style={btnPrimary} onClick={() => void createOpsOnboarding()}>
                  Create ops onboarding task
                </button>
              </div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              <button type="button" style={btn} onClick={() => openModal('task')}>
                Add Task
              </button>
              <button type="button" style={btn} onClick={() => openModal('meeting')}>
                Schedule Meeting
              </button>
              <button type="button" style={btn} onClick={() => openModal('comm')}>
                Add Communication
              </button>
              {data.deal ? (
                <button type="button" style={btn} onClick={() => openModal('stage')}>
                  Move Deal Stage
                </button>
              ) : null}
              {unconvertedLead && related.leadId ? (
                <Link href={`/crm/leads`} style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                  Convert lead
                </Link>
              ) : null}
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: '1px solid var(--border)',
              }}
              role="tablist"
            >
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: active ? 650 : 500,
                      color: active ? 'var(--text)' : 'var(--text2)',
                      background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {formError && !modal ? (
              <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>
                {formError}
              </p>
            ) : null}

            <section style={{ minWidth: 0 }}>
              {tab === 'overview' && (
                <div style={{ display: 'grid', gap: 12 }}>
                  {data.lead ? (
                    <>
                      <MetaRow label="Name" value={str(data.lead['name'])} />
                      <MetaRow label="Company" value={str(data.lead['company_name'])} />
                      <MetaRow label="Email" value={str(data.lead['email'])} />
                      <MetaRow label="Phone" value={str(data.lead['phone'])} />
                      <MetaRow label="Lead status" value={str(data.lead['status'])} />
                      <MetaRow label="Source" value={str(data.lead['source'])} />
                      <MetaRow label="Rating" value={str(data.lead['rating'])} />
                    </>
                  ) : null}
                  {data.party ? (
                    <>
                      <MetaRow label="Party" value={str(data.party['display_name'])} />
                      <MetaRow label="Party type" value={str(data.party['party_type'])} />
                      <MetaRow label="Email" value={str(data.party['email'])} />
                      <MetaRow label="Phone" value={str(data.party['phone'])} />
                    </>
                  ) : null}
                  {data.deal ? (
                    <>
                      <MetaRow label="Deal" value={str(data.deal['name'])} />
                      <MetaRow label="Deal status" value={str(data.deal['status'])} />
                      <MetaRow label="Pipeline stage" value={stageLabel ?? '—'} />
                      <MetaRow
                        label="Amount"
                        value={formatMoney(data.deal['amount'], data.deal['currency'])}
                      />
                    </>
                  ) : null}
                  <MetaRow label="Owner" value={ownerName} />
                  {data.lineage.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>
                        Lineage
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text2)' }}>
                        {data.lineage.map((l) => (
                          <li key={`${l.entity_type}:${l.entity_id}`}>
                            {l.entity_type} · {l.action} · {l.entity_id}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <LegacyLinks data={data} />
                </div>
              )}

              {tab === 'contact' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {data.lead && (
                    <>
                      <MetaRow label="Lead name" value={str(data.lead['name'])} />
                      <MetaRow label="Email" value={str(data.lead['email'])} />
                      <MetaRow label="Phone" value={str(data.lead['phone'])} />
                      <MetaRow label="Company" value={str(data.lead['company_name'])} />
                      <MetaRow label="Source" value={str(data.lead['source'])} />
                    </>
                  )}
                  {data.party && (
                    <>
                      <MetaRow label="Party" value={str(data.party['display_name'])} />
                      <MetaRow label="Party type" value={str(data.party['party_type'])} />
                      <MetaRow label="Email" value={str(data.party['email'])} />
                      <MetaRow label="Phone" value={str(data.party['phone'])} />
                    </>
                  )}
                  {!data.lead && !data.party && (
                    <p style={{ color: 'var(--text3)', fontSize: 13 }}>No contact identity on this record.</p>
                  )}
                </div>
              )}

              {tab === 'sales' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>
                    Lead status is prospect lifecycle. Pipeline stage belongs to a deal — they are not the same.
                  </p>
                  {data.lead ? (
                    <>
                      <MetaRow label="Lead status" value={str(data.lead['status'])} />
                      <MetaRow label="Rating" value={str(data.lead['rating'])} />
                    </>
                  ) : null}
                  {data.deal ? (
                    <>
                      <MetaRow label="Deal" value={str(data.deal['name'])} />
                      <MetaRow label="Deal status" value={str(data.deal['status'])} />
                      <MetaRow label="Pipeline stage" value={stageLabel ?? '—'} />
                      <MetaRow
                        label="Amount"
                        value={formatMoney(data.deal['amount'], data.deal['currency'])}
                      />
                      <MetaRow label="Probability" value={str(data.deal['probability'])} />
                      <MetaRow label="Expected close" value={str(data.deal['expected_close_at'])} />
                    </>
                  ) : (
                    <MetaRow
                      label="Deal"
                      value={
                        data.lead?.['deal_id']
                          ? `Linked id ${str(data.lead['deal_id'])}`
                          : 'No deal yet'
                      }
                    />
                  )}
                  {!data.lead && !data.deal ? (
                    <p style={{ color: 'var(--text3)', fontSize: 13 }}>No sales opportunity linked.</p>
                  ) : null}
                </div>
              )}

              {tab === 'tasks' && (
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    <button type="button" style={btnPrimary} onClick={() => openModal('task')}>
                      Add Task
                    </button>
                    <button type="button" style={btn} onClick={() => openModal('meeting')}>
                      Schedule Meeting
                    </button>
                    <Link href="/ops/tasks" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                      My Tasks
                    </Link>
                  </div>
                  {openTasks.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>
                      No open tasks linked to this record.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {openTasks.map((t) => {
                        const id = String(t['id']);
                        const due = t['due_at'] ?? t['due'] ?? t['start_at'];
                        return (
                          <li
                            key={id}
                            style={{
                              padding: '10px 0',
                              borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                              {str(t['title'])}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                              {str(t['status'])}
                              {t['priority'] ? ` · ${str(t['priority'])}` : ''}
                              {t['task_type'] ? ` · ${str(t['task_type'])}` : ''}
                              {due ? ` · ${new Date(String(due)).toLocaleString()}` : ''}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {tab === 'timeline' && (
                <div>
                  {timelineQ.isLoading ? <p style={{ color: 'var(--text3)', fontSize: 13 }}>Loading timeline…</p> : null}
                  {timelineQ.isError ? (
                    <p style={{ color: 'var(--text3)', fontSize: 13 }}>
                      Timeline unavailable yet. Communications still post when the API is live.
                    </p>
                  ) : null}
                  {!timelineQ.isLoading && !timelineQ.isError && timeline.length === 0 ? (
                    <p style={{ color: 'var(--text3)', fontSize: 13 }}>No timeline events yet.</p>
                  ) : null}
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {timeline.map((item) => {
                      const when = item.occurred_at ?? item.created_at;
                      const type = item.type ?? item.event_type ?? 'event';
                      return (
                        <li
                          key={item.id}
                          style={{
                            padding: '10px 0',
                            borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                          }}
                        >
                          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase' }}>
                            {type.replace(/_/g, ' ')}
                            {when ? ` · ${new Date(when).toLocaleString()}` : ''}
                          </div>
                          {item.heading ? (
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>
                              {item.heading}
                            </div>
                          ) : null}
                          {item.body ? (
                            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, whiteSpace: 'pre-wrap' }}>
                              {item.body}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" style={{ ...btn, marginTop: 12 }} onClick={() => openModal('comm')}>
                    Add Communication
                  </button>
                </div>
              )}

              {tab === 'commercial' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {data.deal ? (
                    <>
                      <MetaRow label="Deal" value={str(data.deal['name'])} />
                      <MetaRow label="Deal status" value={str(data.deal['status'])} />
                      <MetaRow label="Pipeline stage" value={stageLabel ?? '—'} />
                      <MetaRow
                        label="Amount"
                        value={formatMoney(data.deal['amount'], data.deal['currency'])}
                      />
                      <MetaRow label="Currency" value={str(data.deal['currency'])} />
                      <MetaRow label="Probability" value={str(data.deal['probability'])} />
                      <MetaRow label="Expected close" value={str(data.deal['expected_close_at'])} />
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>
                        Quotes and invoices live under Finance / Advanced — open the legacy deal page for full commercial
                        history.
                      </p>
                      {related.dealId ? (
                        <Link href={`/crm/deals/${related.dealId}`} style={{ fontSize: 13 }}>
                          Open deal detail
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <p style={{ color: 'var(--text3)', fontSize: 13 }}>No commercial deal on this record.</p>
                  )}
                </div>
              )}

              {tab === 'custom' && <CustomFieldsPanel customization={data.customization} />}
            </section>
          </>
        )}
      </div>

      {modal === 'task' && (
        <Modal title="Add Task" onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} style={field} />
            <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value)} style={field}>
              {['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
              Due (optional)
              <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} style={field} />
            </label>
            {formError ? <p style={{ margin: 0, color: 'var(--red)', fontSize: 12 }}>{formError}</p> : null}
            <button type="button" style={btnPrimary} onClick={() => void submitTask()} disabled={createTask.isPending}>
              Create
            </button>
          </div>
        </Modal>
      )}

      {modal === 'meeting' && (
        <Modal title="Schedule Meeting" onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input placeholder="Title" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} style={field} />
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
              Start
              <input type="datetime-local" value={meetStart} onChange={(e) => setMeetStart(e.target.value)} style={field} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
              Duration (min)
              <input type="number" min={1} value={meetDuration} onChange={(e) => setMeetDuration(e.target.value)} style={field} />
            </label>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
              Timezone
              <input value={meetTz} onChange={(e) => setMeetTz(e.target.value)} style={field} />
            </label>
            <select
              value={meetMode}
              onChange={(e) => setMeetMode(e.target.value as '' | 'online' | 'offline')}
              style={field}
            >
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
            {meetMode === 'offline' ? (
              <input
                placeholder="Location"
                value={meetLocation}
                onChange={(e) => setMeetLocation(e.target.value)}
                style={field}
              />
            ) : null}
            {formError ? <p style={{ margin: 0, color: 'var(--red)', fontSize: 12 }}>{formError}</p> : null}
            <button type="button" style={btnPrimary} onClick={() => void submitMeeting()} disabled={createTask.isPending}>
              Schedule
            </button>
          </div>
        </Modal>
      )}

      {modal === 'comm' && (
        <Modal title="Add Communication" onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              placeholder="Heading (optional)"
              value={commHeading}
              onChange={(e) => setCommHeading(e.target.value)}
              style={field}
            />
            <textarea
              required
              placeholder="Body"
              value={commBody}
              onChange={(e) => setCommBody(e.target.value)}
              rows={5}
              style={{ ...field, resize: 'vertical' }}
            />
            {commMut.isError ? (
              <p style={{ margin: 0, color: 'var(--red)', fontSize: 12 }}>
                {commMut.error instanceof Error ? commMut.error.message : 'Failed'}
              </p>
            ) : null}
            <button
              type="button"
              style={btnPrimary}
              disabled={!commBody.trim() || commMut.isPending}
              onClick={() => commMut.mutate()}
            >
              {commMut.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {modal === 'stage' && data?.deal && (
        <Modal title="Move Deal Stage" onClose={() => setModal(null)}>
          <div style={{ display: 'grid', gap: 10 }}>
            {pipelineQ.isLoading ? <p style={{ fontSize: 13, color: 'var(--text3)' }}>Loading stages…</p> : null}
            <select value={targetStageId} onChange={(e) => setTargetStageId(e.target.value)} style={field}>
              {(pipelineQ.data?.stages ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {stageMut.isError ? (
              <p style={{ margin: 0, color: 'var(--red)', fontSize: 12 }}>
                {stageMut.error instanceof Error ? stageMut.error.message : 'Move failed'}
              </p>
            ) : null}
            <button
              type="button"
              style={btnPrimary}
              disabled={!targetStageId || stageMut.isPending}
              onClick={() => stageMut.mutate(targetStageId)}
            >
              Move
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CustomFieldsPanel({
  customization,
}: {
  customization: RecordPayload['customization'];
}) {
  const fields = (customization?.fields ?? []).filter((f) => !f['archived_at']);
  const values = customization?.values ?? [];
  const valueByKey = new Map(values.map((v) => [String(v['field_key']), v['value_json']]));

  if (fields.length === 0) {
    return (
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--text2)' }}>
          No custom fields configured
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)' }}>
          Configure them in <Link href="/settings/crm-customization">Settings → CRM Customization</Link>.
        </p>
      </div>
    );
  }

  const sections = [...(customization?.sections ?? [])].sort(
    (a, b) => Number(a['position'] ?? 0) - Number(b['position'] ?? 0),
  );
  const bySection = new Map<string | null, typeof fields>();
  for (const f of fields) {
    const sid = f['section_id'] ? String(f['section_id']) : null;
    const list = bySection.get(sid) ?? [];
    list.push(f);
    bySection.set(sid, list);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {sections.map((s) => {
        const sid = String(s['id']);
        const sectionFields = (bySection.get(sid) ?? []).sort(
          (a, b) => Number(a['position'] ?? 0) - Number(b['position'] ?? 0),
        );
        if (sectionFields.length === 0) return null;
        return (
          <div key={sid}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>
              {str(s['label'] ?? s['section_key'])}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {sectionFields.map((f) => (
                <MetaRow
                  key={String(f['id'])}
                  label={str(f['label'] ?? f['field_key'])}
                  value={formatCustomValue(valueByKey.get(String(f['field_key'])))}
                />
              ))}
            </div>
          </div>
        );
      })}
      {(bySection.get(null) ?? []).length > 0 ? (
        <div>
          {sections.length > 0 ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 8 }}>
              Other
            </div>
          ) : null}
          <div style={{ display: 'grid', gap: 8 }}>
            {(bySection.get(null) ?? [])
              .sort((a, b) => Number(a['position'] ?? 0) - Number(b['position'] ?? 0))
              .map((f) => (
                <MetaRow
                  key={String(f['id'])}
                  label={str(f['label'] ?? f['field_key'])}
                  value={formatCustomValue(valueByKey.get(String(f['field_key'])))}
                />
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text3)', minWidth: 110 }}>{label}</span>
      <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function LegacyLinks({ data }: { data: RecordPayload }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12 }}>
      {data.lead?.['id'] ? (
        <Link href="/crm/leads" style={{ color: 'var(--text2)' }}>
          Leads list
        </Link>
      ) : null}
      {data.party?.['id'] ? (
        <Link href={`/crm/customer-parties/${data.party['id']}`} style={{ color: 'var(--text2)' }}>
          Customer party detail
        </Link>
      ) : null}
      {data.deal?.['id'] ? (
        <Link href={`/crm/deals/${data.deal['id']}`} style={{ color: 'var(--text2)' }}>
          Deal detail
        </Link>
      ) : null}
    </div>
  );
}
