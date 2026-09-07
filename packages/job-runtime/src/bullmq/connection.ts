import type { ConnectionOptions } from 'bullmq';

/** Build BullMQ connection from Redis URL. Do not expose BullMQ types outside this package. */
export function redisConnectionFromUrl(redisUrl: string): ConnectionOptions {
  const u = new URL(redisUrl);
  const db = u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) || 0 : 0;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    db,
    maxRetriesPerRequest: null,
  };
}

export function assertJobsRedisUrl(redisUrl: string | undefined): asserts redisUrl is string {
  if (!redisUrl?.trim()) {
    throw new Error('REDIS_URL is required when JOBS_RUNTIME=bullmq');
  }
}
