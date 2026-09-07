import { Worker, type Job, type Processor } from 'bullmq';
import type { QueueName } from '../types';
import type { BullmqJobData } from './adapter';
import { redisConnectionFromUrl } from './connection';
import { assertJobAllowed, type LoadTenantFn } from '../worker-gate';
import { isRetryableError, PermanentJobError } from '../retries';
import { jobRuntimeMetrics } from '../metrics';

export type JobHandler = (ctx: {
  name: string;
  tenantId: string | null;
  scope: 'tenant' | 'platform';
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  attempt: number;
  jobId: string;
  correlationId: string;
}) => Promise<void>;

export interface CreateWorkerOptions {
  redisUrl: string;
  queue: QueueName;
  concurrency?: number;
  prefix?: string;
  loadTenant: LoadTenantFn;
  handlers: Record<string, JobHandler>;
  allowLifecycleJobNames?: Set<string>;
  onRejected?: (info: {
    reason: string;
    code?: string;
    tenantId?: string | null;
    jobName: string;
  }) => void;
}

/**
 * BullMQ worker with tenant middleware. Domain handlers never see BullMQ types.
 */
export function createTenantAwareWorker(opts: CreateWorkerOptions): {
  worker: Worker;
  close: () => Promise<void>;
} {
  const connection = redisConnectionFromUrl(opts.redisUrl);
  const prefix = opts.prefix ?? 'thinkaiq';

  const processor: Processor = async (job: Job<BullmqJobData>) => {
    const started = Date.now();
    const data = job.data;
    const jobName = data.name || job.name;

    try {
      await assertJobAllowed(
        {
          name: jobName,
          tenantId: data.tenantId,
          scope: data.scope,
          payload: data.payload ?? {},
        },
        opts.loadTenant,
        { allowLifecycleJobNames: opts.allowLifecycleJobNames },
      );
    } catch (err) {
      const code = err instanceof PermanentJobError ? err.code : undefined;
      const reason = err instanceof Error ? err.message : String(err);
      jobRuntimeMetrics.rejected(data.tenantId ?? undefined, code);
      opts.onRejected?.({
        reason,
        code,
        tenantId: data.tenantId,
        jobName,
      });
      // Permanent rejection — do not retry
      if (err instanceof PermanentJobError) {
        return;
      }
      throw err;
    }

    const handler = opts.handlers[jobName];
    if (!handler) {
      throw new PermanentJobError(`No handler registered for job ${jobName}`, 'NO_HANDLER');
    }

    try {
      await handler({
        name: jobName,
        tenantId: data.tenantId,
        scope: data.scope,
        payload: data.payload ?? {},
        idempotencyKey: data.idempotencyKey,
        attempt: job.attemptsMade + 1,
        jobId: String(job.id),
        correlationId: data.trace?.correlationId ?? String(job.id),
      });
      jobRuntimeMetrics.completed(opts.queue, data.tenantId ?? undefined, Date.now() - started);
    } catch (err) {
      jobRuntimeMetrics.failed(opts.queue, data.tenantId ?? undefined, jobName);
      if (!isRetryableError(err)) {
        // Convert permanent to non-retry by returning after logging — BullMQ retries on throw
        if (err instanceof PermanentJobError) {
          opts.onRejected?.({
            reason: err.message,
            code: err.code,
            tenantId: data.tenantId,
            jobName,
          });
          return;
        }
      }
      throw err;
    }
  };

  const worker = new Worker(opts.queue, processor, {
    connection,
    prefix,
    concurrency: opts.concurrency ?? 5,
  });

  return {
    worker,
    close: async () => {
      await worker.close();
    },
  };
}
