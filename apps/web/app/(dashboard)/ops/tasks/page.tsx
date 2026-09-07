'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import {
  useOpsTasks,
  useCompleteOpsTask,
  useCreateOpsTask,
  formatDueTime,
  type OpsTask,
} from '@/modules/ops/lib/hooks';
import { groupMyTasks } from '@/modules/ops/lib/my-tasks-groups';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import { PRIORITY_BG, PRIORITY_COLOR } from '@/modules/crm/tasks/lib/types';

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
const TYPES = [
  'follow_up',
  'call',
  'demo',
  'meeting',
  'payment_follow_up',
  'onboarding',
  'renewal',
  'support',
  'internal',
  'other',
] as const;

const sel: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
};

const field: React.CSSProperties = {
  ...sel,
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
};

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

function defaultTz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function whenLabel(t: OpsTask) {
  if (t.scheduling_mode === 'time_bound' && t.start_at) {
    const start = new Date(t.start_at);
    const startStr = Number.isNaN(start.getTime())
      ? t.start_at
      : start.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `Start ${startStr}`;
  }
  const due = t.due ?? t.due_at;
  if (!due) return 'No deadline';
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return formatDueTime(due);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function PriorityChip({ priority }: { priority?: string | null }) {
  const p = (priority ?? 'NONE').toUpperCase();
  if (p === 'NONE' || !p) return null;
  const key = p as keyof typeof PRIORITY_COLOR;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 7px',
        borderRadius: 6,
        letterSpacing: '0.04em',
        color: PRIORITY_COLOR[key] ?? 'var(--text3)',
        background: PRIORITY_BG[key] ?? 'transparent',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {p}
    </span>
  );
}

function primaryRecordHref(t: OpsTask): string | null {
  if (t.context && t.context.length > 0) return t.context[0]!.href;
  if (t.related_deal_id) return `/crm/records/deal:${t.related_deal_id}`;
  if (t.related_lead_id) return `/crm/records/lead:${t.related_lead_id}`;
  if (t.related_customer_party_id) return `/crm/records/party:${t.related_customer_party_id}`;
  return null;
}

function relatedClientLabel(t: OpsTask): string | null {
  if (t.context && t.context.length > 0) {
    const c = t.context[0]!;
    return `${c.type}: ${c.label}`;
  }
  return null;
}

function TaskRow({
  t,
  onComplete,
  completing,
}: {
  t: OpsTask;
  onComplete: (id: string) => void;
  completing: boolean;
}) {
  const status = t.status_business ?? t.status;
  const open = status !== 'done' && status !== 'cancelled';
  const href = primaryRecordHref(t);
  const client = relatedClientLabel(t);

  return (
    <li
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '14px 0',
        borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)', wordBreak: 'break-word' }}>
              {t.title}
            </div>
            <PriorityChip priority={t.priority} />
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 12,
              color: 'var(--text2)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 12px',
              alignItems: 'center',
            }}
          >
            <span>{whenLabel(t)}</span>
            {t.meeting_mode ? (
              <span style={{ textTransform: 'capitalize' }}>
                {t.meeting_mode}
                {t.meeting_mode === 'offline' && t.location ? ` · ${t.location}` : ''}
              </span>
            ) : null}
            {t.task_type ? <span>{t.task_type.replace(/_/g, ' ')}</span> : null}
          </div>
          {client ? (
            <div style={{ marginTop: 8 }}>
              {href ? (
                <Link
                  href={href}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    color: 'var(--text2)',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {client}
                </Link>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{client}</span>
              )}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {open ? (
            <button type="button" onClick={() => onComplete(t.id)} disabled={completing} style={btn}>
              Complete
            </button>
          ) : null}
          {href ? (
            <Link href={href} style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
              Open record
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function OpsTasksPage() {
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'open' | 'done' | 'all'>('open');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');

  const filters = useMemo(() => {
    if (statusFilter === 'all') {
      return {
        priority: priority || undefined,
        type: type || undefined,
        include_done: true as const,
      };
    }
    if (statusFilter === 'done') {
      return {
        status: 'done',
        priority: priority || undefined,
        type: type || undefined,
      };
    }
    return {
      status: 'open',
      priority: priority || undefined,
      type: type || undefined,
    };
  }, [statusFilter, priority, type]);

  const { data, isLoading, error } = useOpsTasks(filters);
  const complete = useCompleteOpsTask();
  const create = useCreateOpsTask();
  const tasks = data?.data ?? [];

  const groups = useMemo(() => (statusFilter === 'open' ? groupMyTasks(tasks) : []), [tasks, statusFilter]);

  const [title, setTitle] = useState('');
  const [createPriority, setCreatePriority] = useState<string>('MEDIUM');
  const [due, setDue] = useState('');
  const [schedulingMode, setSchedulingMode] = useState<'unbounded' | 'time_bound'>('unbounded');
  const [startAt, setStartAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [timezone, setTimezone] = useState(defaultTz());
  const [meetingMode, setMeetingMode] = useState<'' | 'online' | 'offline'>('');
  const [location, setLocation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  function resetCreate() {
    setTitle('');
    setCreatePriority('MEDIUM');
    setDue('');
    setSchedulingMode('unbounded');
    setStartAt('');
    setDurationMinutes('30');
    setTimezone(defaultTz());
    setMeetingMode('');
    setLocation('');
    setFormError(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }
    const body: Record<string, unknown> = {
      title: title.trim(),
      priority: createPriority,
      task_type: schedulingMode === 'time_bound' ? 'meeting' : 'follow_up',
      assignee_id: user?.id,
      scheduling_mode: schedulingMode,
    };
    if (schedulingMode === 'unbounded' && due) {
      body.due_at = new Date(due).toISOString();
    }
    if (schedulingMode === 'time_bound') {
      if (!startAt) {
        setFormError('Start time is required for time-bound tasks');
        return;
      }
      body.start_at = new Date(startAt).toISOString();
      body.timezone = timezone || defaultTz();
      const dur = Number(durationMinutes);
      if (!Number.isFinite(dur) || dur < 1) {
        setFormError('Duration must be at least 1 minute');
        return;
      }
      body.duration_minutes = dur;
      if (meetingMode) {
        body.meeting_mode = meetingMode;
        if (meetingMode === 'offline') {
          if (!location.trim()) {
            setFormError('Location is required for offline meetings');
            return;
          }
          body.location = location.trim();
        }
      }
    }
    try {
      await create.mutateAsync(body);
      resetCreate();
      setShowCreate(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="My Tasks"
        subtitle="Your next business actions — grouped by urgency, sorted within each bucket."
        actions={
          <button type="button" style={btnPrimary} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Close' : '+ Quick create'}
          </button>
        }
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 16,
            alignItems: 'center',
          }}
        >
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'open' | 'done' | 'all')}
            style={sel}
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
          <select
            aria-label="Filter by priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            style={sel}
          >
            <option value="">All priorities</option>
            {PRIORITIES.filter((p) => p !== 'NONE').map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="NONE">No priority</option>
          </select>
          <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} style={sel}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {showCreate ? (
          <form
            onSubmit={onCreate}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 20,
              padding: 14,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'var(--surface)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Quick create</div>
            <input
              required
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={field}
            />
            <div
              style={{
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              }}
            >
              <select
                aria-label="Priority"
                value={createPriority}
                onChange={(e) => setCreatePriority(e.target.value)}
                style={field}
              >
                {PRIORITIES.filter((p) => p !== 'NONE').map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="NONE">No priority</option>
              </select>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  style={{
                    ...btn,
                    fontWeight: schedulingMode === 'unbounded' ? 650 : 500,
                    background:
                      schedulingMode === 'unbounded'
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'var(--surface)',
                  }}
                  onClick={() => setSchedulingMode('unbounded')}
                >
                  Unbounded
                </button>
                <button
                  type="button"
                  style={{
                    ...btn,
                    fontWeight: schedulingMode === 'time_bound' ? 650 : 500,
                    background:
                      schedulingMode === 'time_bound'
                        ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
                        : 'var(--surface)',
                  }}
                  onClick={() => setSchedulingMode('time_bound')}
                >
                  Time-bound / meeting
                </button>
              </div>
            </div>

            {schedulingMode === 'unbounded' ? (
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                Due (optional)
                <input
                  type="datetime-local"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  style={field}
                />
              </label>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                }}
              >
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  Start
                  <input
                    type="datetime-local"
                    required
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    style={field}
                  />
                </label>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  Duration (min)
                  <input
                    type="number"
                    min={1}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    style={field}
                  />
                </label>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  Timezone
                  <input value={timezone} onChange={(e) => setTimezone(e.target.value)} style={field} />
                </label>
                <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                  Meeting mode
                  <select
                    value={meetingMode}
                    onChange={(e) => setMeetingMode(e.target.value as '' | 'online' | 'offline')}
                    style={field}
                  >
                    <option value="">—</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                  </select>
                </label>
                {meetingMode === 'offline' ? (
                  <label style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gap: 4 }}>
                    Location
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      style={field}
                      placeholder="Address or place"
                    />
                  </label>
                ) : null}
              </div>
            )}

            {formError ? (
              <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--red)' }}>
                {formError}
              </p>
            ) : null}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="submit" style={btnPrimary} disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create task'}
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => {
                  resetCreate();
                  setShowCreate(false);
                }}
              >
                Cancel
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text3)' }}>
              Assignee defaults to you.
            </p>
          </form>
        ) : null}

        {isLoading ? <p style={{ color: 'var(--muted, var(--text2))' }}>Loading…</p> : null}
        {error ? (
          <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>
            {error instanceof Error ? error.message : 'Failed to load tasks'}
          </p>
        ) : null}

        {statusFilter === 'open' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`tasks-${g.key}`}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <h2
                    id={`tasks-${g.key}`}
                    style={{
                      margin: 0,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.7,
                      textTransform: 'uppercase',
                      color: g.key === 'overdue' ? 'var(--red)' : 'var(--text3)',
                      fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {g.label}
                  </h2>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{g.tasks.length}</span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      t={t}
                      completing={complete.isPending}
                      onComplete={(id) => complete.mutate(id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                t={t}
                completing={complete.isPending}
                onComplete={(id) => complete.mutate(id)}
              />
            ))}
          </ul>
        )}

        {!isLoading && tasks.length === 0 ? (
          <p style={{ color: 'var(--muted, var(--text3))' }}>No tasks match these filters.</p>
        ) : null}
      </OpsShell>
    </ModuleGuard>
  );
}
