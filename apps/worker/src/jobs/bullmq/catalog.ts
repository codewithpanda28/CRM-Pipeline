/**
 * Job catalog — single source for schedulers + handlers (Task 4).
 * Operational sweeps use direct BullMQ recurring (not outbox) — documented.
 */
import type { JobDefinition, QueueName } from '@vencore/job-runtime';

export interface RecurringJobSpec {
  name: string;
  queue: QueueName;
  scope: 'platform';
  everyMs?: number;
  /** UTC cron — preferred for daily midnight jobs */
  cron?: string;
  schedulerId: string;
  /** Where the handler runs */
  consumer: 'worker' | 'api';
  retryPolicy?: JobDefinition['retryPolicy'];
  priority?: JobDefinition['priority'];
  /** Why not outbox */
  scheduleRationale: string;
}

export const RECURRING_JOBS: RecurringJobSpec[] = [
  {
    name: 'website.check',
    queue: 'integrations',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:website.check',
    consumer: 'worker',
    priority: 'normal',
    retryPolicy: { maxAttempts: 3, baseDelayMs: 5_000 },
    scheduleRationale: 'Operational probe sweep — not a domain event',
  },
  {
    name: 'infra.alert.eval',
    queue: 'notifications',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:infra.alert.eval',
    consumer: 'worker',
    scheduleRationale: 'Infra threshold sweep',
  },
  {
    name: 'infra.db.health',
    queue: 'integrations',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:infra.db.health',
    consumer: 'worker',
    scheduleRationale: 'Infra health probe',
  },
  {
    name: 'infra.server.staleness',
    queue: 'notifications',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:infra.server.staleness',
    consumer: 'worker',
    scheduleRationale: 'Infra staleness sweep',
  },
  {
    name: 'pm.due.soon',
    queue: 'notifications',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:pm.due.soon',
    consumer: 'worker',
    scheduleRationale: 'PM activity note sweep',
  },
  {
    name: 'pm.overdue.scan',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:pm.overdue.scan',
    consumer: 'worker',
    scheduleRationale: 'Log-only overdue count',
  },
  {
    name: 'pm.health.recalc',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:pm.health.recalc',
    consumer: 'worker',
    scheduleRationale: 'Project health recompute',
  },
  {
    name: 'pm.sprint.rollover',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:pm.sprint.rollover',
    consumer: 'worker',
    scheduleRationale: 'Sprint lifecycle sweep',
  },
  {
    name: 'pipeline.reminder',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:pipeline.reminder',
    consumer: 'worker',
    scheduleRationale: 'Date-approaching automation sweep',
  },
  {
    name: 'system.update.check',
    queue: 'integrations',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:system.update.check',
    consumer: 'worker',
    priority: 'bulk',
    scheduleRationale: 'Platform maintenance (internally throttled to 6h)',
  },
  {
    name: 'metrics.rollup',
    queue: 'automation',
    scope: 'platform',
    everyMs: 15 * 60_000,
    schedulerId: 'sched:metrics.rollup',
    consumer: 'api',
    scheduleRationale: 'Metrics retention/rollup — operational',
  },
  {
    name: 'hub.retention.purge',
    queue: 'documents',
    scope: 'platform',
    cron: '0 3 * * *',
    schedulerId: 'sched:hub.retention',
    consumer: 'api',
    scheduleRationale: 'Tombstone purge — operational',
  },
  {
    name: 'plugin.cron.fire',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:plugin.cron',
    consumer: 'api',
    scheduleRationale: 'Requires in-process plugin sandbox (API)',
  },
  {
    name: 'license.check',
    queue: 'integrations',
    scope: 'platform',
    everyMs: 30 * 60_000,
    schedulerId: 'sched:license.check',
    consumer: 'api',
    scheduleRationale: 'Marketplace poll + plugin runtime disable (API)',
  },
  {
    name: 'reminders.native',
    queue: 'notifications',
    scope: 'platform',
    everyMs: 15 * 60_000,
    schedulerId: 'sched:reminders.native',
    consumer: 'api',
    scheduleRationale: 'Native invoice/task/quote reminders — not automation engine',
  },
  {
    name: 'tasks.due.notify',
    queue: 'notifications',
    scope: 'platform',
    cron: '0 0 * * *',
    schedulerId: 'sched:tasks.due.notify',
    consumer: 'api',
    scheduleRationale: 'Daily due/overdue CRM tasks — uses API push/alert libs',
  },
  {
    name: 'pm.due.alert',
    queue: 'notifications',
    scope: 'platform',
    cron: '5 0 * * *',
    schedulerId: 'sched:pm.due.alert',
    consumer: 'api',
    scheduleRationale: 'Daily PM overdue/milestone alerts',
  },
  {
    name: 'pm.recurring.generate',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60 * 60_000,
    schedulerId: 'sched:pm.recurring',
    consumer: 'api',
    scheduleRationale: 'Materialize recurring rules — uses API activity logger',
  },
  {
    name: 'automation.approval.timeout',
    queue: 'automation',
    scope: 'platform',
    everyMs: 60_000,
    schedulerId: 'sched:automation.approval.timeout',
    consumer: 'worker',
    scheduleRationale: 'Expire pending ADR-027 approvals — engine v2',
  },
];

export function platformJobDefinition(spec: RecurringJobSpec): JobDefinition {
  const hour = new Date().toISOString().slice(0, 13);
  return {
    name: spec.name,
    scope: 'platform',
    tenantId: null,
    queue: spec.queue,
    payload: { scheduled: true },
    idempotencyKey: undefined,
    priority: spec.priority ?? 'normal',
    retryPolicy: spec.retryPolicy ?? { maxAttempts: 3, baseDelayMs: 2_000, backoff: 'exponential' },
    trace: { correlationId: `${spec.schedulerId}:${hour}` },
  };
}

export const QUEUES_FOR_WORKER: QueueName[] = [
  'webhooks',
  'integrations',
  'notifications',
  'automation',
  'documents',
];

export const QUEUES_FOR_API: QueueName[] = [
  'integrations',
  'notifications',
  'automation',
  'documents',
];
