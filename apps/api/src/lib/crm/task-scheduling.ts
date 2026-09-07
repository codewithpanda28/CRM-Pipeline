/**
 * Round A — CRM task scheduling validation (unbounded vs time_bound).
 * SoR: tasks table only (not project_tasks).
 */
import { z } from 'zod';

export const schedulingModeSchema = z.enum(['unbounded', 'time_bound']);
export const meetingModeSchema = z.enum(['online', 'offline']);

export const taskSchedulingFieldsSchema = z.object({
  scheduling_mode: schedulingModeSchema.optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  duration_minutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  timezone: z.string().min(1).max(64).nullable().optional(),
  meeting_mode: meetingModeSchema.nullable().optional(),
  location: z.string().max(500).nullable().optional(),
});

export type TaskSchedulingInput = z.infer<typeof taskSchedulingFieldsSchema>;

export function validateTaskScheduling(
  input: TaskSchedulingInput,
): { ok: true; values: Record<string, unknown> } | { ok: false; code: string; message: string } {
  const mode = input.scheduling_mode ?? 'unbounded';

  if (mode === 'unbounded') {
    return {
      ok: true,
      values: {
        scheduling_mode: 'unbounded',
        start_at: null,
        end_at: null,
        duration_minutes: null,
        timezone: input.timezone ?? null,
        meeting_mode: null,
        location: null,
      },
    };
  }

  if (!input.start_at) {
    return { ok: false, code: 'START_REQUIRED', message: 'time_bound tasks require start_at' };
  }
  if (!input.timezone) {
    return { ok: false, code: 'TIMEZONE_REQUIRED', message: 'time_bound tasks require timezone' };
  }

  const start = new Date(input.start_at);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, code: 'INVALID_START', message: 'start_at is invalid' };
  }

  let endAt: Date | null = input.end_at ? new Date(input.end_at) : null;
  let duration = input.duration_minutes ?? null;

  if (endAt && Number.isNaN(endAt.getTime())) {
    return { ok: false, code: 'INVALID_END', message: 'end_at is invalid' };
  }
  if (!endAt && duration == null) {
    return {
      ok: false,
      code: 'END_OR_DURATION_REQUIRED',
      message: 'time_bound tasks require end_at or duration_minutes',
    };
  }
  if (endAt && duration == null) {
    duration = Math.max(1, Math.round((endAt.getTime() - start.getTime()) / 60000));
  }
  if (!endAt && duration != null) {
    endAt = new Date(start.getTime() + duration * 60000);
  }
  if (endAt && endAt.getTime() <= start.getTime()) {
    return { ok: false, code: 'INVALID_RANGE', message: 'end_at must be after start_at' };
  }

  const meetingMode = input.meeting_mode ?? null;
  if (meetingMode === 'offline' && !input.location?.trim()) {
    return {
      ok: false,
      code: 'LOCATION_REQUIRED',
      message: 'offline meetings require location',
    };
  }

  return {
    ok: true,
    values: {
      scheduling_mode: 'time_bound',
      start_at: start,
      end_at: endAt,
      duration_minutes: duration,
      timezone: input.timezone,
      meeting_mode: meetingMode,
      location: meetingMode === 'offline' ? (input.location ?? null) : (input.location ?? null),
    },
  };
}
