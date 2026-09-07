import type { JobPriority } from './types';

/** BullMQ: lower number = higher priority. */
const PRIORITY_MAP: Record<JobPriority, number> = {
  critical: 1,
  high: 5,
  normal: 10,
  bulk: 20,
};

export function toBullmqPriority(priority: JobPriority = 'normal'): number {
  return PRIORITY_MAP[priority] ?? PRIORITY_MAP.normal;
}
