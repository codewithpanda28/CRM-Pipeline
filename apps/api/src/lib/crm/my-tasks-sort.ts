/**
 * My Tasks sort — Round B employee work queue.
 * Order: overdue → time-bound soon → high priority unbounded → nearest deadline → lower/no date.
 * Never drops lower-priority tasks from the open list.
 */
export type MyTaskSortable = {
  id: string;
  status: string;
  priority?: string | null;
  due?: string | Date | null;
  due_at?: string | Date | null;
  scheduling_mode?: string | null;
  start_at?: string | Date | null;
  end_at?: string | Date | null;
};

const OPEN = new Set(['todo', 'open', 'in_progress']);
const HIGH = new Set(['URGENT', 'HIGH']);

function toMs(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function effectiveDue(t: MyTaskSortable): number | null {
  return toMs(t.due_at) ?? toMs(t.due) ?? toMs(t.end_at) ?? toMs(t.start_at);
}

export function isOpenTaskStatus(status: string): boolean {
  return OPEN.has(status);
}

export function sortMyTasks<T extends MyTaskSortable>(tasks: T[], now = new Date()): T[] {
  const nowMs = now.getTime();
  const soonMs = nowMs + 2 * 60 * 60 * 1000; // next 2h

  function bucket(t: T): number {
    if (!isOpenTaskStatus(t.status)) return 90;
    const start = toMs(t.start_at);
    const due = effectiveDue(t);
    const timeBound = t.scheduling_mode === 'time_bound';

    const overdue =
      (due != null && due < nowMs) || (start != null && start < nowMs);
    if (overdue) return 0;

    if (timeBound && start != null && start >= nowMs && start <= soonMs) return 1;

    if (!timeBound && HIGH.has(String(t.priority ?? '').toUpperCase())) return 2;

    if (due != null || start != null) return 3;

    return 4;
  }

  return [...tasks].sort((a, b) => {
    const ba = bucket(a);
    const bb = bucket(b);
    if (ba !== bb) return ba - bb;

    const da = effectiveDue(a) ?? toMs(a.start_at) ?? Number.POSITIVE_INFINITY;
    const db = effectiveDue(b) ?? toMs(b.start_at) ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;

    const pa = String(a.priority ?? '');
    const pb = String(b.priority ?? '');
    if (pa !== pb) return pa.localeCompare(pb);

    return a.id.localeCompare(b.id);
  });
}
