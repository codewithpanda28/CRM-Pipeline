'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import {
  useOpsPerformance,
  useOpsPeriods,
  useOpsEmployees,
  useOpsTeams,
  useOpsDepartments,
} from '@/modules/ops/lib/hooks';

const METRIC_LABELS: Record<string, string> = {
  'leads.created': 'Leads added',
  'leads.contacted': 'Leads contacted',
  'leads.qualified': 'Leads qualified',
  'demos.completed': 'Demos',
  'proposals.sent': 'Proposals sent',
  'deals.won': 'Deals won',
  'revenue.won': 'Revenue won',
  'collections.received': 'Collections (tenant-wide)',
  'tasks.completed': 'Tasks completed',
  'followups.completed': 'Follow-ups completed',
  'activities.call': 'Calls',
  'activities.meeting': 'Meetings',
};

function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key.replace(/\./g, ' · ');
}

function pctBand(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(Number(pct))) return '—';
  const n = Number(pct);
  if (n >= 100) return 'On track';
  if (n >= 70) return 'At risk';
  return 'Behind';
}

export default function OpsPerformancePage() {
  const [granularity, setGranularity] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const periods = useOpsPeriods();
  const [periodId, setPeriodId] = useState<string>('');
  const employees = useOpsEmployees();
  const teams = useOpsTeams();
  const departments = useOpsDepartments();
  const { data, isLoading, error } = useOpsPerformance({
    granularity,
    period_id: periodId || undefined,
  });
  const summary = data?.data;
  const targets = (summary?.targets ?? []) as Array<{
    target_id: string;
    metric_key: string;
    subject_type: string;
    subject_id: string | null;
    goal_value: number;
    actual_value: number;
    remaining: number;
    pct_achieved: number | null;
    from_snapshot?: boolean;
    prior?: { pct_achieved?: number | null } | null;
  }>;
  const periodList = (periods.data?.data ?? []) as Array<{
    id: string;
    granularity: string;
    period_start: string;
    status: string;
  }>;

  const nameMaps = useMemo(() => {
    const emp = new Map<string, string>();
    for (const e of employees.data?.data ?? []) {
      if (e?.id) emp.set(String(e.id), String(e.display_name ?? e.id));
    }
    const team = new Map<string, string>();
    for (const t of teams.data?.data ?? []) {
      if (t?.id) team.set(String(t.id), String(t.name ?? t.id));
    }
    const dept = new Map<string, string>();
    for (const d of departments.data?.data ?? []) {
      if (d?.id) dept.set(String(d.id), String(d.name ?? d.id));
    }
    return { emp, team, dept };
  }, [employees.data?.data, teams.data?.data, departments.data?.data]);

  function subjectLabel(type: string, id: string | null): string {
    if (type === 'tenant' || !id) return 'Company';
    if (type === 'employee') return nameMaps.emp.get(id) ?? `Employee · ${id.slice(0, 8)}`;
    if (type === 'team') return nameMaps.team.get(id) ?? `Team · ${id.slice(0, 8)}`;
    if (type === 'department') return nameMaps.dept.get(id) ?? `Department · ${id.slice(0, 8)}`;
    return `${type}${id ? ` · ${id.slice(0, 8)}` : ''}`;
  }

  function subjectHref(type: string, id: string | null): string {
    return `/ops/performance/${type}/${id ?? 'tenant'}`;
  }

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Performance"
        subtitle="Goal vs actual by subject. Open periods are live; closed periods use snapshots."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value as 'daily' | 'weekly' | 'monthly')}
              style={selectStyle}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              style={selectStyle}
            >
              <option value="">Latest {granularity}</option>
              {periodList
                .filter((p) => p.granularity === granularity)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {String(p.period_start).slice(0, 10)} · {p.status}
                  </option>
                ))}
            </select>
          </div>
        }
      >
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        {error ? <p style={{ color: 'var(--red)' }}>Could not load performance.</p> : null}
        {summary?.period ? (
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
            Period {String(summary.period.period_start).slice(0, 10)} →{' '}
            {String(summary.period.period_end).slice(0, 10)} · {summary.period.status}
            {summary.note ? ` · ${summary.note}` : ''}
          </p>
        ) : null}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text2)' }}>
                <th style={{ padding: '8px 4px' }}>Metric</th>
                <th style={{ padding: '8px 4px' }}>Subject</th>
                <th style={{ padding: '8px 4px' }}>Goal</th>
                <th style={{ padding: '8px 4px' }}>Actual</th>
                <th style={{ padding: '8px 4px' }}>Remaining</th>
                <th style={{ padding: '8px 4px' }}>%</th>
                <th style={{ padding: '8px 4px' }}>Status</th>
                <th style={{ padding: '8px 4px' }}>Prior %</th>
                <th style={{ padding: '8px 4px' }}>Source</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => {
                const label = subjectLabel(t.subject_type, t.subject_id);
                const clickable = t.subject_type === 'employee' || t.subject_type === 'team' || t.subject_type === 'department' || t.subject_type === 'tenant';
                return (
                  <tr
                    key={t.target_id}
                    style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 80%, transparent)' }}
                  >
                    <td style={{ padding: '10px 4px' }}>{metricLabel(t.metric_key)}</td>
                    <td style={{ padding: '10px 4px' }}>
                      {clickable ? (
                        <Link
                          href={subjectHref(t.subject_type, t.subject_id)}
                          style={{ color: 'var(--text)', fontWeight: 500 }}
                        >
                          {label}
                        </Link>
                      ) : (
                        label
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t.subject_type}</div>
                    </td>
                    <td style={{ padding: '10px 4px' }}>{t.goal_value}</td>
                    <td style={{ padding: '10px 4px' }}>{t.actual_value}</td>
                    <td style={{ padding: '10px 4px' }}>{t.remaining}</td>
                    <td style={{ padding: '10px 4px', fontWeight: 600 }}>
                      {t.pct_achieved == null ? '—' : `${Math.round(Number(t.pct_achieved))}%`}
                    </td>
                    <td style={{ padding: '10px 4px', color: 'var(--text2)' }}>
                      {pctBand(t.pct_achieved)}
                    </td>
                    <td style={{ padding: '10px 4px', color: 'var(--text2)' }}>
                      {t.prior?.pct_achieved == null
                        ? '—'
                        : `${Math.round(Number(t.prior.pct_achieved))}%`}
                    </td>
                    <td style={{ padding: '10px 4px', color: 'var(--text2)' }}>
                      {t.from_snapshot ? 'snapshot' : 'live'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!isLoading && targets.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>
            No targets for this period. Configure them under{' '}
            <Link href="/ops/targets">Targets</Link>.
          </p>
        ) : null}
      </OpsShell>
    </ModuleGuard>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 13,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};
