/**
 * Hard guards so queue/outbox integration tests never touch production Redis/Postgres.
 */
export function assertSafeQueueTestEnv(): {
  databaseUrl: string;
  redisUrl: string;
} {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('QUEUE_TEST_GUARD: NODE_ENV must be "test"');
  }
  if (process.env['ALLOW_LIVE_QUEUE_TESTS'] !== '1') {
    throw new Error('QUEUE_TEST_GUARD: set ALLOW_LIVE_QUEUE_TESTS=1');
  }

  const databaseUrl = process.env['DATABASE_URL_TEST'];
  if (!databaseUrl) {
    throw new Error('QUEUE_TEST_GUARD: DATABASE_URL_TEST required');
  }
  if (process.env['DATABASE_URL'] && databaseUrl === process.env['DATABASE_URL']) {
    throw new Error('QUEUE_TEST_GUARD: DATABASE_URL_TEST must not equal DATABASE_URL');
  }

  const dbParsed = new URL(databaseUrl);
  const dbHost = dbParsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', 'db'].includes(dbHost)) {
    throw new Error(`QUEUE_TEST_GUARD: DB host "${dbHost}" not allowed`);
  }
  const dbName = dbParsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/(isolation_test|_test)$/i.test(dbName)) {
    throw new Error(`QUEUE_TEST_GUARD: DB name "${dbName}" must end with _test or isolation_test`);
  }

  const redisUrl =
    process.env['REDIS_URL_TEST'] ?? 'redis://127.0.0.1:6379/15';
  const redisParsed = new URL(redisUrl);
  const rHost = redisParsed.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1', 'redis'].includes(rHost)) {
    throw new Error(`QUEUE_TEST_GUARD: Redis host "${rHost}" not allowed`);
  }
  const redisDb = redisParsed.pathname.replace(/^\//, '') || '0';
  if (redisDb === '0' && !process.env['REDIS_URL_TEST']?.includes('/15')) {
    // Prefer non-zero DB index for tests when using default
  }
  if (process.env['REDIS_URL'] && redisUrl === process.env['REDIS_URL'] && !/_test|\/15/.test(redisUrl)) {
    throw new Error('QUEUE_TEST_GUARD: REDIS_URL_TEST must be dedicated (e.g. .../15)');
  }

  return { databaseUrl, redisUrl };
}
