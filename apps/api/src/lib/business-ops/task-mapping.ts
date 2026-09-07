/** Business task status / type mapping — CRM tasks compatibility layer. */

export const BUSINESS_TASK_TYPES = [
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

export type BusinessTaskType = (typeof BUSINESS_TASK_TYPES)[number];

export const BUSINESS_TASK_PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;
export type BusinessTaskPriority = (typeof BUSINESS_TASK_PRIORITIES)[number];

export const BUSINESS_TASK_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type BusinessTaskStatus = (typeof BUSINESS_TASK_STATUSES)[number];

/** Map stored DB status (including legacy todo) → product status. */
export function mapStoredToBusinessStatus(stored: string): BusinessTaskStatus {
  if (stored === 'todo') return 'open';
  if (stored === 'open' || stored === 'in_progress' || stored === 'done' || stored === 'cancelled') {
    return stored;
  }
  return 'open';
}

/** Map product / API input → stored status (never write legacy todo for new writes). */
export function mapBusinessToStoredStatus(input: string): BusinessTaskStatus | 'todo' {
  if (input === 'todo') return 'open';
  if (input === 'open' || input === 'in_progress' || input === 'done' || input === 'cancelled') {
    return input;
  }
  return 'open';
}

/** Legacy CRM clients expect todo|done. */
export function toLegacyTodoDone(stored: string): 'todo' | 'done' {
  const biz = mapStoredToBusinessStatus(stored);
  return biz === 'done' || biz === 'cancelled' ? 'done' : 'todo';
}

export function isOpenBusinessStatus(stored: string): boolean {
  const s = mapStoredToBusinessStatus(stored);
  return s === 'open' || s === 'in_progress';
}

export function computeTargetPct(goal: number, actual: number): number | null {
  if (!Number.isFinite(goal) || goal <= 0) return null;
  return Math.round((actual / goal) * 10000) / 100;
}

export function computeRemaining(goal: number, actual: number): number {
  return Math.max(goal - actual, 0);
}

/** Simple recurrence: next due from frequency. */
export function nextDueFromFrequency(
  from: Date,
  frequency: 'daily' | 'weekly' | 'monthly',
  interval = 1,
): Date {
  const d = new Date(from.getTime());
  if (frequency === 'daily') {
    d.setUTCDate(d.getUTCDate() + interval);
  } else if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7 * interval);
  } else {
    d.setUTCMonth(d.getUTCMonth() + interval);
  }
  return d;
}
