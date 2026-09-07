/**
 * Performance summary — open periods live; closed periods use achievement_snapshots.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { calculateMetricActual, type TargetSubjectType } from './metrics';
import { computeRemaining, computeTargetPct } from './task-mapping';
import { getEmployeeByUserId } from './hierarchy';

export interface PerformanceRow {
  target_id: string;
  metric_key: string;
  subject_type: string;
  subject_id: string | null;
  goal_value: number;
  actual_value: number;
  remaining: number;
  pct_achieved: number | null;
  from_snapshot: boolean;
  period_id: string;
  period_status: string;
  granularity: string;
  period_start: Date;
  period_end: Date;
  prior?: {
    goal_value: number;
    actual_value: number;
    pct_achieved: number | null;
    period_id: string;
  } | null;
}

export async function buildPerformanceRows(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    periodId?: string | null;
    granularity?: 'daily' | 'weekly' | 'monthly' | null;
    subjectType?: TargetSubjectType | null;
    subjectId?: string | null;
    /** When set, filter targets to these employee/team/dept ids + tenant if allowed */
    allowedSubjects?: Array<{ type: string; id: string | null }> | null;
    includePrior?: boolean;
  },
): Promise<{ period: Record<string, unknown> | null; targets: PerformanceRow[] }> {
  let periodQuery = db
    .selectFrom('target_periods')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId);

  if (opts.periodId) {
    periodQuery = periodQuery.where('id', '=', opts.periodId);
  } else {
    if (opts.granularity) {
      periodQuery = periodQuery.where('granularity', '=', opts.granularity);
    } else {
      periodQuery = periodQuery.where('granularity', '=', 'monthly');
    }
    periodQuery = periodQuery.orderBy('period_start', 'desc');
  }

  const period = await periodQuery.executeTakeFirst();
  if (!period) return { period: null, targets: [] };

  let tq = db
    .selectFrom('targets as t')
    .selectAll('t')
    .where('t.workspace_id', '=', opts.workspaceId)
    .where('t.period_id', '=', period.id);

  if (opts.subjectType) {
    tq = tq.where('t.subject_type', '=', opts.subjectType);
  }
  if (opts.subjectId) {
    tq = tq.where('t.subject_id', '=', opts.subjectId);
  }

  let targets = await tq.execute();

  if (opts.allowedSubjects) {
    targets = targets.filter((row) =>
      opts.allowedSubjects!.some(
        (a) => a.type === row.subject_type && a.id === row.subject_id,
      ),
    );
  }

  const rows: PerformanceRow[] = [];

  for (const row of targets) {
    let actual: number;
    let fromSnapshot = false;
    if (period.status === 'closed') {
      const snap = await db
        .selectFrom('achievement_snapshots')
        .selectAll()
        .where('target_id', '=', row.id)
        .where('workspace_id', '=', opts.workspaceId)
        .executeTakeFirst();
      actual = Number(snap?.actual_value ?? 0);
      fromSnapshot = !!snap;
    } else {
      actual = await calculateMetricActual(db, row.metric_key, {
        workspaceId: opts.workspaceId,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        periodStart: period.period_start,
        periodEnd: period.period_end,
      });
    }
    const goal = Number(row.goal_value);
    const perf: PerformanceRow = {
      target_id: row.id,
      metric_key: row.metric_key,
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      goal_value: goal,
      actual_value: actual,
      remaining: computeRemaining(goal, actual),
      pct_achieved: computeTargetPct(goal, actual),
      from_snapshot: fromSnapshot,
      period_id: period.id,
      period_status: period.status,
      granularity: period.granularity,
      period_start: period.period_start,
      period_end: period.period_end,
      prior: null,
    };

    if (opts.includePrior) {
      const priorPeriod = await db
        .selectFrom('target_periods')
        .selectAll()
        .where('workspace_id', '=', opts.workspaceId)
        .where('granularity', '=', period.granularity)
        .where('period_end', '<=', period.period_start)
        .orderBy('period_end', 'desc')
        .executeTakeFirst();
      if (priorPeriod) {
        let priorQ = db
          .selectFrom('targets')
          .selectAll()
          .where('workspace_id', '=', opts.workspaceId)
          .where('period_id', '=', priorPeriod.id)
          .where('metric_key', '=', row.metric_key)
          .where('subject_type', '=', row.subject_type);
        priorQ =
          row.subject_id === null
            ? priorQ.where('subject_id', 'is', null)
            : priorQ.where('subject_id', '=', row.subject_id);
        const priorTarget = await priorQ.executeTakeFirst();
        if (priorTarget) {
          const snap = await db
            .selectFrom('achievement_snapshots')
            .selectAll()
            .where('target_id', '=', priorTarget.id)
            .executeTakeFirst();
          if (snap) {
            const pGoal = Number(snap.goal_value);
            const pActual = Number(snap.actual_value);
            perf.prior = {
              goal_value: pGoal,
              actual_value: pActual,
              pct_achieved: computeTargetPct(pGoal, pActual),
              period_id: priorPeriod.id,
            };
          }
        }
      }
    }

    rows.push(perf);
  }

  return {
    period: {
      id: period.id,
      granularity: period.granularity,
      period_start: period.period_start,
      period_end: period.period_end,
      status: period.status,
    },
    targets: rows,
  };
}

export async function resolveAllowedPerformanceSubjects(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    userId: string;
    isAdmin: boolean;
    permissions: Set<string>;
    requestedSubjectType?: string | null;
  },
): Promise<{
  allowed: Array<{ type: string; id: string | null }> | null;
  defaultSubject: { type: TargetSubjectType; id: string | null } | null;
}> {
  const self = await getEmployeeByUserId(db, opts.workspaceId, opts.userId);

  if (opts.isAdmin || opts.permissions.has('ops.performance.view_company')) {
    return {
      allowed: null,
      defaultSubject: self
        ? { type: 'employee', id: self.id }
        : { type: 'tenant', id: null },
    };
  }

  const allowed: Array<{ type: string; id: string | null }> = [];
  if (self && (opts.permissions.has('ops.performance.view_own') || opts.permissions.has('ops.targets.view_own'))) {
    allowed.push({ type: 'employee', id: self.id });
  }
  if (opts.permissions.has('ops.performance.view_team') && self?.primary_team_id) {
    allowed.push({ type: 'team', id: self.primary_team_id });
  }
  if (opts.permissions.has('ops.performance.view_department') && self?.primary_department_id) {
    allowed.push({ type: 'department', id: self.primary_department_id });
  }

  return {
    allowed,
    defaultSubject: self ? { type: 'employee', id: self.id } : null,
  };
}
