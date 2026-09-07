import { Queue, type JobsOptions } from 'bullmq';
import type {
  JobDefinition,
  JobHandle,
  JobQueue,
  QueueName,
  ScheduleSpec,
} from '../types';
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from '../types';
import { toBullmqPriority } from '../priorities';
import { resolveRetryPolicy } from '../retries';
import { redisConnectionFromUrl } from './connection';
import { jobRuntimeMetrics } from '../metrics';

export const JOB_DATA_VERSION = 1;

export interface BullmqJobData {
  v: typeof JOB_DATA_VERSION;
  name: string;
  tenantId: string | null;
  scope: 'tenant' | 'platform';
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  trace: JobDefinition['trace'];
}

function toJobData(def: JobDefinition): BullmqJobData {
  return {
    v: JOB_DATA_VERSION,
    name: def.name,
    tenantId: def.tenantId ?? null,
    scope: def.scope,
    payload: def.payload,
    idempotencyKey: def.idempotencyKey,
    trace: def.trace,
  };
}

function buildOptions(def: JobDefinition, delayMs?: number): JobsOptions {
  const retry = resolveRetryPolicy(def.retryPolicy);
  const timeoutMs = Math.min(
    Math.max(1_000, def.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    MAX_TIMEOUT_MS,
  );
  const opts: JobsOptions = {
    priority: toBullmqPriority(def.priority),
    attempts: retry.maxAttempts,
    backoff: {
      type: retry.backoff === 'fixed' ? 'fixed' : 'exponential',
      delay: retry.baseDelayMs,
    },
    removeOnComplete: { count: 1_000 },
    removeOnFail: { count: 5_000 },
    // BullMQ jobId must be unique; idempotencyKey prevents dup enqueue when set
    jobId: def.idempotencyKey
      ? def.idempotencyKey.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 128)
      : undefined,
  };
  if (delayMs != null && delayMs > 0) {
    opts.delay = delayMs;
  }
  // timeout via lockDuration is worker-side; store hint in data only
  void timeoutMs;
  return opts;
}

export interface BullMqJobQueueOptions {
  redisUrl: string;
  /** Queues to instantiate (only those needed this milestone). */
  queues: QueueName[];
  prefix?: string;
}

/**
 * BullMQ adapter behind JobQueue. Domain code must not import bullmq.
 */
export class BullMqJobQueue implements JobQueue {
  private readonly queues = new Map<QueueName, Queue>();
  private readonly prefix: string;

  constructor(opts: BullMqJobQueueOptions) {
    const connection = redisConnectionFromUrl(opts.redisUrl);
    this.prefix = opts.prefix ?? 'thinkaiq';
    for (const name of opts.queues) {
      this.queues.set(
        name,
        new Queue(name, {
          connection,
          prefix: this.prefix,
        }),
      );
    }
  }

  private queue(name: QueueName): Queue {
    const q = this.queues.get(name);
    if (!q) {
      throw new Error(`Queue "${name}" is not instantiated in this JobQueue`);
    }
    return q;
  }

  async enqueue(definition: JobDefinition): Promise<JobHandle> {
    return this.add(definition);
  }

  async schedule(definition: JobDefinition, when: ScheduleSpec): Promise<JobHandle> {
    if (when.kind === 'every') {
      await this.ensureRecurring(definition, { everyMs: when.everyMs }, when.schedulerId ?? definition.name);
      return {
        id: when.schedulerId ?? definition.name,
        queue: definition.queue,
        externalId: when.schedulerId ?? definition.name,
      };
    }
    if (when.kind === 'cron') {
      await this.ensureRecurring(definition, { cron: when.pattern }, when.schedulerId ?? definition.name);
      return {
        id: when.schedulerId ?? definition.name,
        queue: definition.queue,
        externalId: when.schedulerId ?? definition.name,
      };
    }
    const delayMs =
      when.kind === 'delay'
        ? when.delayMs
        : Math.max(0, when.at.getTime() - Date.now());
    return this.add(definition, delayMs);
  }

  async ensureRecurring(
    definition: JobDefinition,
    everyOrCron: { everyMs: number } | { cron: string },
    schedulerId: string,
  ): Promise<void> {
    if (definition.scope === 'tenant' && !definition.tenantId) {
      throw new Error('tenant-scoped JobDefinition requires tenantId');
    }
    const q = this.queue(definition.queue);
    const data = toJobData(definition);
    const opts = buildOptions(definition);
    // Repeatable jobs must not pin a static jobId (BullMQ generates occurrence ids).
    delete opts.jobId;

    const repeat =
      'everyMs' in everyOrCron
        ? { every: Math.max(1_000, everyOrCron.everyMs) }
        : { pattern: everyOrCron.cron };

    await q.upsertJobScheduler(
      schedulerId.replace(/[^a-zA-Z0-9-_:]/g, '_').slice(0, 128),
      repeat,
      {
        name: definition.name,
        data,
        opts,
      },
    );
    jobRuntimeMetrics.enqueued(definition.queue, definition.tenantId ?? undefined);
  }

  private async add(definition: JobDefinition, delayMs?: number): Promise<JobHandle> {
    if (definition.scope === 'tenant' && !definition.tenantId) {
      throw new Error('tenant-scoped JobDefinition requires tenantId');
    }

    const q = this.queue(definition.queue);
    const data = toJobData(definition);
    const opts = buildOptions(definition, delayMs);

    try {
      const job = await q.add(definition.name, data, opts);
      jobRuntimeMetrics.enqueued(definition.queue, definition.tenantId ?? undefined);
      return {
        id: String(job.id),
        queue: definition.queue,
        externalId: String(job.id),
      };
    } catch (err) {
      // Duplicate jobId → treat as already enqueued (idempotent)
      const msg = err instanceof Error ? err.message : String(err);
      if (/Job with the given.*already exists|already exists/i.test(msg) && definition.idempotencyKey) {
        const existingId = opts.jobId!;
        return {
          id: existingId,
          queue: definition.queue,
          externalId: existingId,
        };
      }
      throw err;
    }
  }

  async cancel(handle: JobHandle): Promise<void> {
    const q = this.queue(handle.queue);
    const job = await q.getJob(handle.externalId);
    if (job) {
      await job.remove();
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }

  /** Internal: metrics snapshot helpers for reconciler (not BullMQ types). */
  async getQueueCounts(name: QueueName): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const q = this.queue(name);
    const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
    };
  }
}
