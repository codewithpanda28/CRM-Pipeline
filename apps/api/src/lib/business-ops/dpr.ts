/**
 * DPR system snapshot derivation — reuses R1 metric calculators + activity counts.
 * Day boundaries use tenant_settings.timezone when set; otherwise UTC.
 */
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { CALCULATOR_VERSION, TARGET_METRICS, calculateMetricActual } from './metrics';

export type DprStatus = 'draft' | 'submitted' | 'reviewed' | 'returned';

export const MUTABLE_DPR_STATUSES: DprStatus[] = ['draft', 'returned'];

export function isDprMutable(status: string): boolean {
  return MUTABLE_DPR_STATUSES.includes(status as DprStatus);
}

export interface DprSystemLine {
  key: string;
  label: string;
  value: number;
  source: 'system';
  unit?: 'count' | 'currency';
}

export interface DprSystemSnapshot {
  lines: DprSystemLine[];
  computed_at: string;
  report_date: string;
  period_start: string;
  period_end: string;
  calculator_version: string;
  timezone: string;
}

/** Validate IANA timezone; return null if missing/invalid → UTC fallback callers. */
export function normalizeTimezone(tz: string | null | undefined): string | null {
  if (!tz || !String(tz).trim()) return null;
  const value = String(tz).trim();
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return null;
  }
}

/**
 * Read existing tenant profile timezone from tenant_settings (not a new setting).
 * workspace_id === tenant_id in this product.
 */
export async function resolveTenantTimezone(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom('tenant_settings')
    .select('timezone')
    .where('tenant_id', '=', workspaceId)
    .executeTakeFirst();
  return normalizeTimezone(row?.timezone ?? null);
}

/** Offset ms such that localWallAsUtcMs - offset ≈ utcInstant (handles DST via sample instant). */
function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(instant)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

function addCalendarDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return dt.toISOString().slice(0, 10);
}

/** UTC instant for local midnight of YYYY-MM-DD in IANA zone. */
export function zonedMidnightUtc(dateStr: string, timeZone: string): Date {
  const noonUtc = new Date(`${dateStr}T12:00:00.000Z`);
  const offset = getTimeZoneOffsetMs(noonUtc, timeZone);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0) - offset);
}

/**
 * Calendar day window [start, end) for report_date.
 * With timezone: local midnights in that zone.
 * Without: UTC midnights (fallback).
 */
export function dprDayWindow(
  reportDate: string,
  timeZone?: string | null,
): { start: Date; end: Date; timezone: string } {
  const tz = normalizeTimezone(timeZone);
  if (!tz) {
    const start = new Date(`${reportDate}T00:00:00.000Z`);
    return { start, end: new Date(start.getTime() + 86400000), timezone: 'UTC' };
  }
  const start = zonedMidnightUtc(reportDate, tz);
  const end = zonedMidnightUtc(addCalendarDays(reportDate, 1), tz);
  return { start, end, timezone: tz };
}

/** YYYY-MM-DD for an instant in tenant TZ (or UTC). */
export function reportDateForInstant(instant: Date = new Date(), timeZone?: string | null): string {
  const tz = normalizeTimezone(timeZone);
  if (!tz) return instant.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const d = parts.find((p) => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** @deprecated prefer reportDateForInstant — kept for call-site clarity */
export function utcReportDate(d = new Date()): string {
  return reportDateForInstant(d, null);
}

async function countActivities(
  db: Kysely<Database>,
  workspaceId: string,
  userId: string,
  type: 'call' | 'meeting',
  start: Date,
  end: Date,
): Promise<number> {
  const row = await db
    .selectFrom('activities')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('workspace_id', '=', workspaceId)
    .where('user_id', '=', userId)
    .where('type', '=', type)
    .where('created_at', '>=', start)
    .where('created_at', '<', end)
    .executeTakeFirst();
  return Number(row?.c ?? 0);
}

export async function buildDprSystemSnapshot(
  db: Kysely<Database>,
  opts: {
    workspaceId: string;
    employeeId: string;
    userId: string;
    reportDate: string;
    timeZone?: string | null;
  },
): Promise<DprSystemSnapshot> {
  const { start, end, timezone } = dprDayWindow(opts.reportDate, opts.timeZone);
  const lines: DprSystemLine[] = [];

  for (const m of TARGET_METRICS) {
    const value = await calculateMetricActual(db, m.key, {
      workspaceId: opts.workspaceId,
      subjectType: 'employee',
      subjectId: opts.employeeId,
      periodStart: start,
      periodEnd: end,
    });
    lines.push({
      key: m.key,
      label: m.label,
      value,
      source: 'system',
      unit: m.unit,
    });
  }

  const calls = await countActivities(db, opts.workspaceId, opts.userId, 'call', start, end);
  const meetings = await countActivities(db, opts.workspaceId, opts.userId, 'meeting', start, end);
  lines.push(
    { key: 'activities.call', label: 'Calls', value: calls, source: 'system', unit: 'count' },
    { key: 'activities.meeting', label: 'Meetings', value: meetings, source: 'system', unit: 'count' },
  );

  return {
    lines,
    computed_at: new Date().toISOString(),
    report_date: opts.reportDate,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    calculator_version: CALCULATOR_VERSION,
    timezone,
  };
}

export function mergeManualOverlay(
  current: Record<string, unknown>,
  patch: { notes?: string | null; adjustments?: Record<string, number> },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current };
  if (patch.notes !== undefined) next.notes = patch.notes;
  if (patch.adjustments !== undefined) {
    next.adjustments = {
      ...(typeof current.adjustments === 'object' && current.adjustments ? current.adjustments : {}),
      ...patch.adjustments,
    };
  }
  next.updated_at = new Date().toISOString();
  return next;
}
