import { describe, expect, it } from 'vitest';
import {
  isDprMutable,
  mergeManualOverlay,
  dprDayWindow,
  utcReportDate,
  reportDateForInstant,
  normalizeTimezone,
  zonedMidnightUtc,
} from './dpr';

describe('dpr helpers', () => {
  it('mutable only for draft/returned', () => {
    expect(isDprMutable('draft')).toBe(true);
    expect(isDprMutable('returned')).toBe(true);
    expect(isDprMutable('submitted')).toBe(false);
    expect(isDprMutable('reviewed')).toBe(false);
  });

  it('merges overlay notes and adjustments without dropping prior keys', () => {
    const merged = mergeManualOverlay(
      { notes: 'old', adjustments: { 'leads.created': 1 } },
      { notes: 'new', adjustments: { 'deals.won': 2 } },
    );
    expect(merged.notes).toBe('new');
    expect(merged.adjustments).toEqual({ 'leads.created': 1, 'deals.won': 2 });
  });

  it('builds UTC day window when timezone absent/invalid', () => {
    const { start, end, timezone } = dprDayWindow('2026-09-06');
    expect(timezone).toBe('UTC');
    expect(start.toISOString()).toBe('2026-09-06T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-07T00:00:00.000Z');
    expect(dprDayWindow('2026-09-06', 'Not/AZone').timezone).toBe('UTC');
    expect(normalizeTimezone('')).toBeNull();
    expect(normalizeTimezone('Asia/Kolkata')).toBe('Asia/Kolkata');
  });

  it('Asia/Kolkata day boundary: local midnight → prior UTC evening', () => {
    const { start, end, timezone } = dprDayWindow('2026-09-06', 'Asia/Kolkata');
    expect(timezone).toBe('Asia/Kolkata');
    // IST = UTC+5:30 → 2026-09-06 00:00 IST = 2026-09-05 18:30 UTC
    expect(start.toISOString()).toBe('2026-09-05T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-09-06T18:30:00.000Z');
    expect(zonedMidnightUtc('2026-09-06', 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-05T18:30:00.000Z',
    );
  });

  it('date-boundary: instant just before Kolkata midnight is prior local date', () => {
    // 2026-09-05 18:29:59 UTC is still 2026-09-05 in Kolkata (23:59:59)
    const before = new Date('2026-09-05T18:29:59.000Z');
    expect(reportDateForInstant(before, 'Asia/Kolkata')).toBe('2026-09-05');
    // 2026-09-05 18:30:00 UTC is 2026-09-06 00:00 IST
    const at = new Date('2026-09-05T18:30:00.000Z');
    expect(reportDateForInstant(at, 'Asia/Kolkata')).toBe('2026-09-06');
  });

  it('UTC fallback for reportDateForInstant / utcReportDate', () => {
    expect(utcReportDate(new Date('2026-09-06T15:00:00Z'))).toBe('2026-09-06');
    expect(reportDateForInstant(new Date('2026-09-06T15:00:00Z'), null)).toBe('2026-09-06');
  });
});
