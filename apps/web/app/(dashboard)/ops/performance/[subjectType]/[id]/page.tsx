'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ModuleGuard } from '@/modules/shared/components/ModuleGuard';
import { OpsShell } from '@/modules/ops/components/OpsShell';
import {
  useOpsPerformance,
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
};

function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key.replace(/\./g, ' · ');
}

export default function OpsPerformanceSubjectPage() {
  const params = useParams();
  const type = typeof params.subjectType === 'string' ? params.subjectType : 'employee';
  const id = typeof params.id === 'string' ? params.id : undefined;
  const subjectId = id === 'tenant' ? undefined : id;
  const employees = useOpsEmployees();
  const teams = useOpsTeams();
  const departments = useOpsDepartments();
  const { data, isLoading } = useOpsPerformance({
    subject_type: type,
    subject_id: subjectId,
    granularity: 'monthly',
  });
  const targets = (data?.data?.targets ?? []) as Array<{
    target_id: string;
    metric_key: string;
    goal_value: number;
    actual_value: number;
    pct_achieved: number | null;
  }>;

  const title = useMemo(() => {
    if (type === 'tenant' || !subjectId) return 'Company';
    if (type === 'employee') {
      const e = (employees.data?.data ?? []).find((x: { id: string }) => x.id === subjectId);
      return e?.display_name ?? `Employee · ${subjectId.slice(0, 8)}`;
    }
    if (type === 'team') {
      const t = (teams.data?.data ?? []).find((x: { id: string }) => x.id === subjectId);
      return t?.name ?? `Team · ${subjectId.slice(0, 8)}`;
    }
    if (type === 'department') {
      const d = (departments.data?.data ?? []).find((x: { id: string }) => x.id === subjectId);
      return d?.name ?? `Department · ${subjectId.slice(0, 8)}`;
    }
    return `${type}${subjectId ? ` · ${subjectId.slice(0, 8)}` : ''}`;
  }, [type, subjectId, employees.data?.data, teams.data?.data, departments.data?.data]);

  return (
    <ModuleGuard moduleId="ops">
      <OpsShell
        title={`Performance · ${title}`}
        subtitle={subjectId ? `${type} detail` : 'Company detail'}
      >
        <p style={{ margin: '0 0 16px', fontSize: 13 }}>
          <Link href="/ops/performance" style={{ color: 'var(--text2)' }}>
            ← All subjects
          </Link>
        </p>
        {isLoading ? <p style={{ color: 'var(--text2)' }}>Loading…</p> : null}
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {targets.map((t) => (
            <li
              key={t.target_id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
                fontSize: 14,
              }}
            >
              <span>{metricLabel(t.metric_key)}</span>
              <span>
                {t.actual_value} / {t.goal_value}
              </span>
              <strong>
                {t.pct_achieved == null ? '—' : `${Math.round(Number(t.pct_achieved))}%`}
              </strong>
            </li>
          ))}
        </ul>
        {!isLoading && targets.length === 0 ? (
          <p style={{ color: 'var(--text2)' }}>No targets for this subject in the latest monthly period.</p>
        ) : null}
      </OpsShell>
    </ModuleGuard>
  );
}
