import { describe, it, expect } from 'vitest';
import { validateTaskScheduling } from './task-scheduling';

describe('validateTaskScheduling', () => {
  it('allows unbounded without start', () => {
    const r = validateTaskScheduling({ scheduling_mode: 'unbounded' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values['scheduling_mode']).toBe('unbounded');
  });

  it('requires start + timezone + end/duration for time_bound', () => {
    expect(validateTaskScheduling({ scheduling_mode: 'time_bound' }).ok).toBe(false);
    expect(
      validateTaskScheduling({
        scheduling_mode: 'time_bound',
        start_at: '2026-09-07T10:00:00.000Z',
      }).ok,
    ).toBe(false);
    const ok = validateTaskScheduling({
      scheduling_mode: 'time_bound',
      start_at: '2026-09-07T10:00:00.000Z',
      duration_minutes: 30,
      timezone: 'Asia/Kolkata',
    });
    expect(ok.ok).toBe(true);
  });

  it('requires location for offline meeting', () => {
    const r = validateTaskScheduling({
      scheduling_mode: 'time_bound',
      start_at: '2026-09-07T10:00:00.000Z',
      duration_minutes: 30,
      timezone: 'UTC',
      meeting_mode: 'offline',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCATION_REQUIRED');
  });
});
