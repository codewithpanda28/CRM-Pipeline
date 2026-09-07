export { MemoryJobQueue } from './memory-queue';
export * from './types';
export * from './priorities';
export * from './retries';
export * from './worker-gate';
export * from './metrics';
export * from './contract';
export { BullMqJobQueue, type BullMqJobQueueOptions, type BullmqJobData, JOB_DATA_VERSION } from './bullmq/adapter';
export { createTenantAwareWorker, type JobHandler, type CreateWorkerOptions } from './bullmq/worker';
export { redisConnectionFromUrl, assertJobsRedisUrl } from './bullmq/connection';
export { assertSafeUrl, SsrfError } from './security/ssrf';

/** Resolve JOBS_RUNTIME with bullmq as the target default. */
export function resolveJobsRuntime(
  raw: string | undefined,
): 'bullmq' | 'legacy' {
  const v = (raw ?? 'bullmq').toLowerCase();
  return v === 'legacy' ? 'legacy' : 'bullmq';
}
