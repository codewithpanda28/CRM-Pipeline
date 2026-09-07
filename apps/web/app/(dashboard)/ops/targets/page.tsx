'use client';

import { useMemo, useState } from 'react';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import {
  useOpsTargets,
  useOpsPeriods,
  useCreatePeriod,
  useClosePeriod,
  useCreateTarget,
  useOpsEmployees,
} from '@/modules/ops/lib/hooks';

export default function OpsTargetsPage() {
  const periods = useOpsPeriods();
  const periodList = (periods.data?.data ?? []) as any[];
  const [periodId, setPeriodId] = useState('');
  const effectivePeriodId = periodId || periodList[0]?.id || '';
  const { data, isLoading } = useOpsTargets(
    effectivePeriodId ? { period_id: effectivePeriodId } : undefined,
  );
  const rows = data?.data ?? [];
  const createPeriod = useCreatePeriod();
  const closePeriod = useClosePeriod();
  const createTarget = useCreateTarget();
  const employees = useOpsEmployees();
  const selected = useMemo(
    () => periodList.find((p) => p.id === effectivePeriodId),
    [periodList, effectivePeriodId],
  );

  const [metric, setMetric] = useState('leads.created');
  const [goal, setGoal] = useState('10');
  const [employeeId, setEmployeeId] = useState('');

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title="Targets"
        subtitle="Goal vs actual from live CRM/Finance/task data. Closed periods use snapshots."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              value={effectivePeriodId}
              onChange={(e) => setPeriodId(e.target.value)}
              style={selectStyle}
            >
              {periodList.length === 0 ? <option value="">No periods</option> : null}
              {periodList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.granularity} · {String(p.period_start).slice(0, 10)} · {p.status}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => createPeriod.mutate({ granularity: 'monthly' })}
              style={btn}
            >
              New monthly period
            </button>
            {selected?.status === 'open' && effectivePeriodId ? (
              <button
                type="button"
                onClick={() => closePeriod.mutate(effectivePeriodId)}
                style={btn}
              >
                Close period
              </button>
            ) : null}
          </div>
        }
      >
        {selected?.status === 'closed' ? (
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>
            Snapshot state — values are frozen from achievement_snapshots.
          </p>
        ) : null}

        {selected?.status === 'open' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!effectivePeriodId || !employeeId) return;
              createTarget.mutate({
                period_id: effectivePeriodId,
                metric_key: metric,
                subject_type: 'employee',
                subject_id: employeeId,
                goal_value: Number(goal),
              });
            }}
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}
          >
            <select value={metric} onChange={(e) => setMetric(e.target.value)} style={selectStyle}>
              <option value="leads.created">leads.created</option>
              <option value="deals.won">deals.won</option>
              <option value="tasks.completed">tasks.completed</option>
              <option value="followups.completed">followups.completed</option>
              <option value="revenue.won">revenue.won</option>
              <option value="collections.received">collections.received</option>
            </select>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              style={selectStyle}
            >
              <option value="">Employee…</option>
              {(employees.data?.data ?? []).map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.display_name}
                </option>
              ))}
            </select>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              type="number"
              min={0}
              style={{ ...selectStyle, width: 80 }}
            />
            <button type="submit" style={btnPrimary}>
              Add target
            </button>
          </form>
        ) : null}

        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text2)' }}>
                <th style={{ padding: '8px 4px' }}>Metric</th>
                <th style={{ padding: '8px 4px' }}>Subject</th>
                <th style={{ padding: '8px 4px' }}>Goal</th>
                <th style={{ padding: '8px 4px' }}>Actual</th>
                <th style={{ padding: '8px 4px' }}>%</th>
                <th style={{ padding: '8px 4px' }}>Period</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t: any) => (
                <tr
                  key={t.id}
                  style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 80%, transparent)' }}
                >
                  <td style={{ padding: '10px 4px' }}>{t.metric_key}</td>
                  <td style={{ padding: '10px 4px' }}>{t.subject_type}</td>
                  <td style={{ padding: '10px 4px' }}>{t.goal_value}</td>
                  <td style={{ padding: '10px 4px' }}>{t.actual_value}</td>
                  <td style={{ padding: '10px 4px', fontWeight: 600 }}>
                    {t.pct_achieved == null ? '—' : `${Math.round(Number(t.pct_achieved))}%`}
                    <div
                      style={{
                        marginTop: 4,
                        height: 4,
                        borderRadius: 2,
                        background: 'color-mix(in srgb, var(--border) 60%, transparent)',
                        overflow: 'hidden',
                        maxWidth: 80,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, Number(t.pct_achieved) || 0))}%`,
                          background: 'var(--accent)',
                        }}
                      />
                    </div>
                  </td>
                  <td style={{ padding: '10px 4px', color: 'var(--text2)' }}>
                    {t.from_snapshot ? 'snapshot' : 'live'} · {t.period_status} · {t.granularity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isLoading && rows.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>No targets for this period yet.</p>
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
