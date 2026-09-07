/**
 * Client-side My Tasks work-queue groups.
 * Preserves existing urgency order within each group (caller should pass sortMyTasks order).
 */
export type MyTasksGroupKey = 'overdue' | 'today' | 'high' | 'upcoming' | 'no_deadline';

export type MyTasksGroupable = {
  id: string;
  status: string;
  status_business?: string;
  priority?: string | null;
  due?: string | Date | null;
  due_at?: string | Date | null;
  scheduling_mode?: string | null;
  start_at?: string | Date | null;
  end_at?: string | Date | null;
};

export const MY_TASKS_GROUP_ORDER: MyTasksGroupKey[] = [
  'overdue',
  'today',
  'high',
  'upcoming',
  'no_deadline',
];

export const MY_TASKS_GROUP_LABELS: Record<MyTasksGroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today / Time-bound',
  high: 'High priority',
  upcoming: 'Upcoming',
  no_deadline: 'No deadline',
};

const OPEN = new Set(['todo', 'open', 'in_progress']);
const HIGH = new Set(['URGENT', 'HIGH']);

function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function isOpen(t: MyTasksGroupable): boolean {
  const s = t.status_business ?? t.status;
  return OPEN.has(s);
}

export function classifyMyTaskGroup(t: MyTasksGroupable, now = new Date()): MyTasksGroupKey | null {
  if (!isOpen(t)) return null;

  const nowMs = now.getTime();
  const dayStart = startOfLocalDay(now);
  const dayEnd = dayStart + 86_400_000;
  const start = toMs(t.start_at);
  const due = toMs(t.due_at) ?? toMs(t.due) ?? toMs(t.end_at);
  const timeBound = t.scheduling_mode === 'time_bound';

  const overdue =
    (due != null && due < nowMs) ||
    (start != null && start < nowMs) ||
    (toMs(t.end_at) != null && toMs(t.end_at)! < nowMs);
  if (overdue) return 'overdue';

  const inToday = (ms: number | null) => ms != null && ms >= dayStart && ms < dayEnd;
  if (inToday(due) || inToday(start) || (timeBound && inToday(start))) {
    return 'today';
  }

  if (!timeBound && HIGH.has(String(t.priority ?? '').toUpperCase()) && due == null && start == null) {
    return 'high';
  }

  if (due != null || start != null) return 'upcoming';
  return 'no_deadline';
}

export function groupMyTasks<T extends MyTasksGroupable>(
  tasks: T[],
  now = new Date(),
): Array<{ key: MyTasksGroupKey; label: string; tasks: T[] }> {
  const buckets: Record<MyTasksGroupKey, T[]> = {
    overdue: [],
    today: [],
    high: [],
    upcoming: [],
    no_deadline: [],
  };

  for (const t of tasks) {
    const key = classifyMyTaskGroup(t, now);
    if (key) buckets[key].push(t);
  }

  return MY_TASKS_GROUP_ORDER.filter((k) => buckets[k].length > 0).map((key) => ({
    key,
    label: MY_TASKS_GROUP_LABELS[key],
    tasks: buckets[key],
  }));
}
