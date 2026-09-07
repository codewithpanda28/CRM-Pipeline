/**
 * Dependency health check for API / ops.
 */
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '@vencore/db';

export interface HealthCheckResult {
  api: 'ok';
  db: 'ok' | 'error';
  redis: 'ok' | 'error' | 'skipped';
  details?: {
    dbError?: string;
    redisError?: string;
  };
}

export async function healthCheck(opts: {
  db: Kysely<Database>;
  redisUrl?: string | null;
}): Promise<HealthCheckResult> {
  const details: HealthCheckResult['details'] = {};
  let dbStatus: 'ok' | 'error' = 'ok';
  let redisStatus: 'ok' | 'error' | 'skipped' = 'skipped';

  try {
    await sql`SELECT 1`.execute(opts.db);
  } catch (err) {
    dbStatus = 'error';
    details.dbError = err instanceof Error ? err.message : String(err);
  }

  const redisUrl = opts.redisUrl ?? process.env['REDIS_URL'] ?? process.env['JOBS_REDIS_URL'];
  if (redisUrl) {
    try {
      const Redis = (await import('ioredis')).default;
      const client = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
      });
      await client.connect();
      const pong = await client.ping();
      await client.quit();
      redisStatus = pong === 'PONG' ? 'ok' : 'error';
      if (redisStatus === 'error') details.redisError = `unexpected ping: ${pong}`;
    } catch (err) {
      redisStatus = 'error';
      details.redisError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    api: 'ok',
    db: dbStatus,
    redis: redisStatus,
    ...(Object.keys(details).length ? { details } : {}),
  };
}
