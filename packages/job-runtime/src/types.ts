/** Logical queues — not one queue per tenant (ADR-015). */
export const QUEUE_NAMES = [
  'automation',
  'webhooks',
  'notifications',
  'documents',
  'integrations',
  'ai',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export type JobPriority = 'critical' | 'high' | 'normal' | 'bulk';

export type JobScope = 'tenant' | 'platform';

export type BackoffKind = 'exponential' | 'fixed';

export interface JobRetryPolicy {
  maxAttempts: number;
  backoff: BackoffKind;
  /** Base delay in ms before first retry (exponential grows from this). */
  baseDelayMs: number;
  /** Cap on backoff delay. */
  maxDelayMs: number;
  /** 0–1 fraction of delay randomized as jitter. */
  jitterRatio: number;
}

export interface JobTrace {
  correlationId: string;
  causationId?: string;
  workflowRunId?: string;
  stepId?: string;
}

export interface JobDefinition {
  name: string;
  /** Required for scope=tenant. Null/omitted only when scope=platform. */
  tenantId?: string | null;
  scope: JobScope;
  queue: QueueName;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: JobPriority;
  retryPolicy?: Partial<JobRetryPolicy>;
  timeoutMs?: number;
  trace: JobTrace;
}

export interface JobHandle {
  id: string;
  queue: QueueName;
  externalId: string;
}

export type ScheduleSpec =
  | { kind: 'delay'; delayMs: number }
  | { kind: 'runAt'; at: Date }
  | { kind: 'every'; everyMs: number; schedulerId?: string }
  | { kind: 'cron'; pattern: string; schedulerId?: string };

export interface JobQueue {
  enqueue(definition: JobDefinition): Promise<JobHandle>;
  schedule(definition: JobDefinition, when: ScheduleSpec): Promise<JobHandle>;
  /** Idempotent upsert of a recurring JobScheduler (BullMQ). */
  ensureRecurring(
    definition: JobDefinition,
    everyOrCron: { everyMs: number } | { cron: string },
    schedulerId: string,
  ): Promise<void>;
  cancel(handle: JobHandle): Promise<void>;
  close(): Promise<void>;
}

/** Safe capped defaults — user/job input cannot exceed these. */
export const DEFAULT_RETRY_POLICY: JobRetryPolicy = {
  maxAttempts: 5,
  backoff: 'exponential',
  baseDelayMs: 2_000,
  maxDelayMs: 15 * 60_000,
  jitterRatio: 0.2,
};

export const MAX_RETRY_ATTEMPTS = 10;
export const MAX_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_TIMEOUT_MS = 60_000;
