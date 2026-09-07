/**
 * Extensible target metric registry + calculators.
 * Derives from CRM / Finance / activities / business tasks — no duplicate counters.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export const CALCULATOR_VERSION = '1';

export type TargetSubjectType = 'employee' | 'team' | 'department' | 'tenant';

export interface MetricDef {
  key: string;
  label: string;
  description: string;
  unit: 'count' | 'currency';
}

export const TARGET_METRICS: readonly MetricDef[] = [
  { key: 'leads.created', label: 'Leads added', description: 'Leads created in period', unit: 'count' },
  { key: 'leads.contacted', label: 'Leads contacted', description: 'Leads in contacted+ status or call activity', unit: 'count' },
  { key: 'leads.qualified', label: 'Leads qualified', description: 'Leads marked qualified/converted', unit: 'count' },
  { key: 'demos.completed', label: 'Demos', description: 'Demo tasks completed', unit: 'count' },
  { key: 'proposals.sent', label: 'Proposals sent', description: 'Quotes sent in period', unit: 'count' },
  { key: 'deals.won', label: 'Deals won', description: 'Deals won in period', unit: 'count' },
  { key: 'revenue.won', label: 'Revenue won', description: 'Sum of won deal amounts', unit: 'currency' },
  { key: 'collections.received', label: 'Collections', description: 'Payments received', unit: 'currency' },
  { key: 'tasks.completed', label: 'Tasks completed', description: 'Business tasks completed', unit: 'count' },
  { key: 'followups.completed', label: 'Follow-ups completed', description: 'Follow-up/call tasks completed', unit: 'count' },
] as const;

export function getMetricDef(key: string): MetricDef | undefined {
  return TARGET_METRICS.find((m) => m.key === key);
}

export interface MetricScope {
  workspaceId: string;
  subjectType: TargetSubjectType;
  /** user ids for employee/team/dept; empty = whole tenant */
  ownerUserIds: string[] | null;
  periodStart: Date;
  periodEnd: Date;
}

async function resolveOwnerUserIds(
  db: Kysely<Database>,
  workspaceId: string,
  subjectType: TargetSubjectType,
  subjectId: string | null,
): Promise<string[] | null> {
  if (subjectType === 'tenant' || !subjectId) return null;

  if (subjectType === 'employee') {
    const emp = await db
      .selectFrom('employee_profiles')
      .select('user_id')
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', subjectId)
      .executeTakeFirst();
    return emp ? [emp.user_id] : [];
  }

  if (subjectType === 'team') {
    const members = await db
      .selectFrom('team_members as tm')
      .innerJoin('employee_profiles as ep', 'ep.id', 'tm.employee_id')
      .select('ep.user_id')
      .where('tm.workspace_id', '=', workspaceId)
      .where('tm.team_id', '=', subjectId)
      .execute();
    return members.map((m) => m.user_id);
  }

  if (subjectType === 'department') {
    const members = await db
      .selectFrom('employee_profiles')
      .select('user_id')
      .where('workspace_id', '=', workspaceId)
      .where('primary_department_id', '=', subjectId)
      .where('status', '=', 'active')
      .execute();
    return members.map((m) => m.user_id);
  }

  return null;
}

function applyOwnerFilter<T extends { where: (...args: any[]) => T }>(
  q: T,
  column: string,
  ownerUserIds: string[] | null,
): T {
  if (ownerUserIds === null) return q;
  if (ownerUserIds.length === 0) {
    // Impossible match
    return q.where(column as any, '=', '00000000-0000-0000-0000-000000000000');
  }
  return q.where(column as any, 'in', ownerUserIds);
}

export async function calculateMetricActual(
  db: Kysely<Database>,
  metricKey: string,
  scope: {
    workspaceId: string;
    subjectType: TargetSubjectType;
    subjectId: string | null;
    periodStart: Date;
    periodEnd: Date;
  },
): Promise<number> {
  const ownerUserIds = await resolveOwnerUserIds(
    db,
    scope.workspaceId,
    scope.subjectType,
    scope.subjectId,
  );
  const { workspaceId, periodStart, periodEnd } = scope;

  switch (metricKey) {
    case 'leads.created': {
      let q = db
        .selectFrom('leads')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('created_at', '>=', periodStart)
        .where('created_at', '<', periodEnd)
        .where('deleted_at', 'is', null);
      q = applyOwnerFilter(q, 'owner_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'leads.contacted': {
      let q = db
        .selectFrom('leads')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('updated_at', '>=', periodStart)
        .where('updated_at', '<', periodEnd)
        .where('deleted_at', 'is', null)
        .where('status', 'in', ['contacted', 'qualified', 'converted']);
      q = applyOwnerFilter(q, 'owner_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'leads.qualified': {
      let q = db
        .selectFrom('leads')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('updated_at', '>=', periodStart)
        .where('updated_at', '<', periodEnd)
        .where('deleted_at', 'is', null)
        .where('status', 'in', ['qualified', 'converted']);
      q = applyOwnerFilter(q, 'owner_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'demos.completed': {
      let q = db
        .selectFrom('tasks')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('task_type', '=', 'demo')
        .where('status', '=', 'done')
        .where('completed_at', '>=', periodStart)
        .where('completed_at', '<', periodEnd);
      q = applyOwnerFilter(q, 'assignee_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'proposals.sent': {
      let q = db
        .selectFrom('quotes')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('sent_at', '>=', periodStart)
        .where('sent_at', '<', periodEnd)
        .where('deleted_at', 'is', null);
      if (ownerUserIds !== null) {
        if (ownerUserIds.length === 0) return 0;
        q = q.where('created_by', 'in', ownerUserIds);
      }
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'deals.won': {
      let q = db
        .selectFrom('deals')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('status', '=', 'won')
        .where('won_at', '>=', periodStart)
        .where('won_at', '<', periodEnd)
        .where('deleted_at', 'is', null);
      q = applyOwnerFilter(q, 'owner_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'revenue.won': {
      let q = db
        .selectFrom('deals')
        .select((eb) => eb.fn.sum<string>('amount').as('s'))
        .where('workspace_id', '=', workspaceId)
        .where('status', '=', 'won')
        .where('won_at', '>=', periodStart)
        .where('won_at', '<', periodEnd)
        .where('deleted_at', 'is', null);
      q = applyOwnerFilter(q, 'owner_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.s ?? 0);
    }
    case 'collections.received': {
      const row = await db
        .selectFrom('payments')
        .select((eb) => eb.fn.sum<string>('amount').as('s'))
        .where('workspace_id', '=', workspaceId)
        .where('payment_date', '>=', periodStart)
        .where('payment_date', '<', periodEnd)
        .where('deleted_at', 'is', null)
        .where('status', '=', 'succeeded')
        .executeTakeFirst();
      return Number(row?.s ?? 0);
    }
    case 'tasks.completed': {
      let q = db
        .selectFrom('tasks')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('completed_at', '>=', periodStart)
        .where('completed_at', '<', periodEnd);
      q = applyOwnerFilter(q, 'assignee_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    case 'followups.completed': {
      let q = db
        .selectFrom('tasks')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('workspace_id', '=', workspaceId)
        .where('task_type', 'in', ['follow_up', 'call', 'payment_follow_up'])
        .where('completed_at', '>=', periodStart)
        .where('completed_at', '<', periodEnd);
      q = applyOwnerFilter(q, 'assignee_id', ownerUserIds);
      const row = await q.executeTakeFirst();
      return Number(row?.c ?? 0);
    }
    default:
      return 0;
  }
}
