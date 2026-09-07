'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import { useAuth } from '@/modules/shared/lib/AuthContext';
import {
  useOpsDprMe,
  useDprMutation,
  useOpsTargets,
  useOpsTasks,
  useOpsEmployeeMe,
} from '@/modules/ops/lib/hooks';

type SnapshotLine = {
  key: string;
  label: string;
  value: number;
  source?: string;
  unit?: string;
};

type TargetRow = {
  id?: string;
  metric_key: string;
  subject_type: string;
  subject_id: string | null;
  goal_value: number;
  granularity?: string;
  period_start?: string | Date;
  period_end?: string | Date;
  period_status?: string;
};

const GRAN_RANK: Record<string, number> = { daily: 0, weekly: 1, monthly: 2 };

function dayKey(v: unknown): string {
  if (!v) return '';
  return String(v).slice(0, 10);
}

function coversReportDate(t: TargetRow, reportDate: string): boolean {
  const start = dayKey(t.period_start);
  const end = dayKey(t.period_end);
  if (!start || !end || !reportDate) return false;
  return start <= reportDate && reportDate <= end;
}

function remaining(goal: number, actual: number): number {
  return Math.max(goal - actual, 0);
}

function pctAchieved(goal: number, actual: number): number | null {
  if (!Number.isFinite(goal) || goal <= 0) return null;
  return Math.round((actual / goal) * 10000) / 100;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft — not submitted';
    case 'submitted':
      return 'Submitted — awaiting manager review';
    case 'reviewed':
      return 'Reviewed (approved)';
    case 'returned':
      return 'Returned — revise and resubmit';
    default:
      return status;
  }
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  textTransform: 'uppercase',
  color: 'var(--text2)',
  letterSpacing: '0.04em',
  margin: '0 0 8px',
  fontWeight: 650,
};

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 14,
  marginBottom: 16,
  background: 'var(--surface)',
};

export default function OpsDprPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useOpsDprMe();
  const mut = useDprMutation();
  const me = useOpsEmployeeMe();
  const targetsQ = useOpsTargets();
  const tasksQ = useOpsTasks();
  const entry = data?.data;
  const [notes, setNotes] = useState('');

  const lines = (entry?.system_snapshot?.lines ?? []) as SnapshotLine[];
  const overlay = (entry?.manual_overlay ?? {}) as {
    notes?: string;
    adjustments?: Record<string, number>;
  };
  const reportDate = dayKey(entry?.report_date);
  const employeeId = entry?.employee_id ? String(entry.employee_id) : null;

  const whoName =
    me.data?.data?.display_name ??
    user?.name ??
    user?.email ??
    (employeeId ? `Employee ${employeeId.slice(0, 8)}` : '—');

  const employeeTargets = useMemo(() => {
    const all = (targetsQ.data?.data ?? []) as TargetRow[];
    if (!employeeId || !reportDate) return [] as TargetRow[];
    return all.filter(
      (t) =>
        t.subject_type === 'employee' &&
        t.subject_id === employeeId &&
        coversReportDate(t, reportDate),
    );
  }, [targetsQ.data?.data, employeeId, reportDate]);

  const targetByMetric = useMemo(() => {
    const map = new Map<string, TargetRow>();
    for (const t of employeeTargets) {
      const prev = map.get(t.metric_key);
      const rank = GRAN_RANK[String(t.granularity ?? '')] ?? 9;
      const prevRank = prev ? GRAN_RANK[String(prev.granularity ?? '')] ?? 9 : 99;
      if (!prev || rank < prevRank) map.set(t.metric_key, t);
    }
    return map;
  }, [employeeTargets]);

  const pendingTasks = useMemo(() => {
    const tasks = tasksQ.data?.data ?? [];
    return tasks.filter((t) => {
      const st = String(t.status_business ?? t.status ?? '').toLowerCase();
      return st === 'open' || st === 'in_progress' || st === 'todo';
    });
  }, [tasksQ.data?.data]);

  const activityLines = lines.filter(
    (l) =>
      l.key === 'activities.call' ||
      l.key === 'activities.meeting' ||
      l.key === 'tasks.completed' ||
      l.key === 'followups.completed',
  );

  const metricLines = lines.filter(
    (l) =>
      l.key !== 'activities.call' &&
      l.key !== 'activities.meeting',
  );

  const adjustments = overlay.adjustments ?? {};
  const hasAdjustments = Object.keys(adjustments).length > 0;

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Daily Performance Report"
        subtitle="System-derived metrics for today. Submit for manager review."
        actions={
          <Link href="/ops/dpr/inbox" style={{ fontSize: 13, color: 'var(--text2)' }}>
            Manager inbox →
          </Link>
        }
      >
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Could not load DPR.</p> : null}
        {entry ? (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                Date · {reportDate || String(entry.report_date).slice(0, 10)}
              </span>
              <span
                style={{
                  fontSize: 12,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                  fontWeight: 600,
                }}
              >
                {entry.status}
              </span>
              {entry.status === 'draft' || entry.status === 'returned' ? (
                <>
                  <button type="button" onClick={() => mut.refresh.mutate(entry.id)} style={btn}>
                    Refresh metrics
                  </button>
                  <button type="button" onClick={() => mut.submit.mutate(entry.id)} style={btnPrimary}>
                    Submit
                  </button>
                </>
              ) : null}
            </div>

            <section style={card}>
              <h3 style={sectionTitle}>Who</h3>
              <div style={{ fontSize: 16, fontWeight: 650, color: 'var(--text)' }}>{whoName}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                Report date {reportDate || '—'}
                {entry.system_snapshot?.timezone ? ` · ${entry.system_snapshot.timezone}` : ''}
              </div>
            </section>

            <section style={card}>
              <h3 style={sectionTitle}>Manager status</h3>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>{statusLabel(String(entry.status))}</div>
              {entry.submitted_at ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  Submitted {new Date(String(entry.submitted_at)).toLocaleString()}
                </div>
              ) : null}
              {entry.reviewed_at ? (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                  Reviewed {new Date(String(entry.reviewed_at)).toLocaleString()}
                </div>
              ) : null}
              {entry.review_comment ? (
                <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text2)' }}>
                  Manager comment: {String(entry.review_comment)}
                </p>
              ) : null}
            </section>

            <section style={card}>
              <h3 style={sectionTitle}>What / How much · Target · Achievement</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {metricLines.map((l) => {
                  const target = targetByMetric.get(l.key);
                  const goal = target ? Number(target.goal_value) : null;
                  const actual = Number(l.value);
                  const pct = goal != null ? pctAchieved(goal, actual) : null;
                  const rem = goal != null ? remaining(goal, actual) : null;
                  const isCollections = l.key === 'collections.received';
                  return (
                    <li
                      key={l.key}
                      style={{
                        padding: '10px 0',
                        borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                        fontSize: 14,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>
                          {l.label}
                          {isCollections ? (
                            <span style={{ fontWeight: 400, color: 'var(--text3)', marginLeft: 6 }}>
                              (tenant-wide)
                            </span>
                          ) : null}
                        </span>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{actual}</strong>
                      </div>
                      {target && goal != null ? (
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
                          Target {goal}
                          {target.granularity && target.granularity !== 'daily'
                            ? ` (${target.granularity} goal)`
                            : ''}
                          {' · '}Actual {actual}
                          {' · '}Remaining {rem}
                          {' · '}Achievement {pct == null ? '—' : `${Math.round(pct)}%`}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
                          Actual {actual} · No target set
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {metricLines.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No system metrics yet.</p>
              ) : null}
            </section>

            <section style={card}>
              <h3 style={sectionTitle}>Today&apos;s activity</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {activityLines.map((l) => (
                  <li
                    key={l.key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                      fontSize: 14,
                    }}
                  >
                    <span>{l.label}</span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{l.value}</strong>
                  </li>
                ))}
              </ul>
              {activityLines.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No activity counts in snapshot.</p>
              ) : null}
              {overlay.notes ? (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 650, color: 'var(--text3)', marginBottom: 4 }}>
                    Manual note
                  </div>
                  {overlay.notes}
                </div>
              ) : null}
              {hasAdjustments ? (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)' }}>
                  <div style={{ fontWeight: 650, marginBottom: 4 }}>Manual adjustments</div>
                  {Object.entries(adjustments).map(([k, v]) => (
                    <div key={k}>
                      {k}: {v}
                    </div>
                  ))}
                </div>
              ) : null}
            </section>

            <section style={card}>
              <h3 style={sectionTitle}>Pending</h3>
              {tasksQ.isLoading ? <p style={{ color: 'var(--text2)', fontSize: 13 }}>Loading tasks…</p> : null}
              {!tasksQ.isLoading && pendingTasks.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)' }}>No open tasks in your queue.</p>
              ) : null}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {pendingTasks.slice(0, 12).map((t) => (
                  <li
                    key={t.id}
                    style={{
                      padding: '8px 0',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{t.title}</div>
                    <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 2 }}>
                      {t.status}
                      {t.priority ? ` · ${t.priority}` : ''}
                      {t.due_at || t.due
                        ? ` · due ${new Date(String(t.due_at ?? t.due)).toLocaleString()}`
                        : ''}
                    </div>
                  </li>
                ))}
              </ul>
              {pendingTasks.length > 12 ? (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text3)' }}>
                  +{pendingTasks.length - 12} more — see <Link href="/ops/tasks">My Tasks</Link>
                </p>
              ) : (
                <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                  <Link href="/ops/tasks">Open My Tasks</Link>
                </p>
              )}
            </section>

            {(entry.status === 'draft' || entry.status === 'returned') && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={sectionTitle}>Manual notes</h3>
                <textarea
                  defaultValue={overlay.notes ?? ''}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{
                    width: '100%',
                    marginTop: 8,
                    padding: 8,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 13,
                    boxSizing: 'border-box',
                    background: 'var(--bg)',
                    color: 'var(--text)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => mut.overlay.mutate({ id: entry.id, notes: notes || overlay.notes })}
                  style={{ ...btn, marginTop: 8 }}
                >
                  Save notes
                </button>
              </div>
            )}

            {overlay.notes && entry.status !== 'draft' && entry.status !== 'returned' ? (
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                Notes (as submitted): {overlay.notes}
              </p>
            ) : null}
          </>
        ) : null}
      </OpsShell>
    </ModuleGuard>
  );
}

const btn: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  cursor: 'pointer',
  color: 'var(--text)',
};
const btnPrimary: React.CSSProperties = {
  ...btn,
  border: 'none',
  background: 'var(--nav-fg)',
  color: 'var(--nav-bg)',
};
