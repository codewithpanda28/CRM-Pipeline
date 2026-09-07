import type { JobDefinition, JobHandle, JobQueue, ScheduleSpec } from './types';

/** In-memory JobQueue for unit tests — no Redis. */
export class MemoryJobQueue implements JobQueue {
  readonly jobs: Array<{ definition: JobDefinition; handle: JobHandle }> = [];
  failEnqueue = false;
  enqueueCalls = 0;

  async enqueue(definition: JobDefinition): Promise<JobHandle> {
    this.enqueueCalls += 1;
    if (this.failEnqueue) {
      throw new Error('REDIS_UNAVAILABLE');
    }
    const handle: JobHandle = {
      id: `mem-${this.jobs.length + 1}`,
      queue: definition.queue,
      externalId: definition.idempotencyKey ?? `mem-${this.jobs.length + 1}`,
    };
    this.jobs.push({ definition, handle });
    return handle;
  }

  async schedule(definition: JobDefinition, _when: ScheduleSpec): Promise<JobHandle> {
    return this.enqueue(definition);
  }

  async ensureRecurring(
    definition: JobDefinition,
    _everyOrCron: { everyMs: number } | { cron: string },
    schedulerId: string,
  ): Promise<void> {
    await this.enqueue({
      ...definition,
      idempotencyKey: definition.idempotencyKey ?? `sched:${schedulerId}`,
    });
  }

  async cancel(_handle: JobHandle): Promise<void> {
    /* no-op */
  }

  async close(): Promise<void> {
    /* no-op */
  }
}
