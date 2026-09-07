/**
 * Period window helpers — half-open [start, end).
 */
export type PeriodGranularity = 'daily' | 'weekly' | 'monthly';

export function periodWindow(
  granularity: PeriodGranularity,
  anchor: Date = new Date(),
): { period_start: Date; period_end: Date } {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();
  const d = anchor.getUTCDate();

  if (granularity === 'daily') {
    const start = new Date(Date.UTC(y, m, d));
    const end = new Date(Date.UTC(y, m, d + 1));
    return { period_start: start, period_end: end };
  }

  if (granularity === 'weekly') {
    // ISO-like: week starts Monday UTC
    const day = anchor.getUTCDay(); // 0 Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(Date.UTC(y, m, d + mondayOffset));
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 7);
    return { period_start: start, period_end: end };
  }

  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 1));
  return { period_start: start, period_end: end };
}

export function assertPeriodOpen(status: string): void {
  if (status !== 'open') {
    const err = new Error('TARGET_PERIOD_CLOSED');
    (err as Error & { code: string }).code = 'TARGET_PERIOD_CLOSED';
    throw err;
  }
}
