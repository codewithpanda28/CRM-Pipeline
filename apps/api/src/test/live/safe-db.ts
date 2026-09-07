/**
 * Hard guards so live isolation tests never touch production databases.
 */
export function assertSafeTestDatabaseUrl(url: string | undefined): asserts url is string {
  if (process.env['NODE_ENV'] !== 'test') {
    throw new Error('LIVE_DB_GUARD: NODE_ENV must be "test"');
  }
  if (process.env['ALLOW_LIVE_DB_TESTS'] !== '1') {
    throw new Error('LIVE_DB_GUARD: set ALLOW_LIVE_DB_TESTS=1 to run live Postgres isolation tests');
  }
  if (!url) {
    throw new Error('LIVE_DB_GUARD: DATABASE_URL_TEST is required (never use DATABASE_URL)');
  }
  if (process.env['DATABASE_URL'] && url === process.env['DATABASE_URL']) {
    throw new Error('LIVE_DB_GUARD: DATABASE_URL_TEST must not equal DATABASE_URL');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('LIVE_DB_GUARD: DATABASE_URL_TEST is not a valid URL');
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'db']);
  if (!allowedHosts.has(host)) {
    throw new Error(`LIVE_DB_GUARD: host "${host}" is not allowed for live tests`);
  }

  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0] ?? '';
  if (!/(isolation_test|_test)$/i.test(dbName)) {
    throw new Error(
      `LIVE_DB_GUARD: database name "${dbName}" must end with isolation_test or _test`,
    );
  }

  const blocked = ['prod', 'production', 'staging', 'live'];
  const lower = url.toLowerCase();
  for (const b of blocked) {
    if (lower.includes(`.${b}.`) || lower.includes(`-${b}-`) || lower.includes(`_${b}_`)) {
      throw new Error(`LIVE_DB_GUARD: URL looks production-like (matched "${b}")`);
    }
  }
}

export function adminUrlFor(databaseUrl: string): { adminUrl: string; dbName: string } {
  const u = new URL(databaseUrl);
  const dbName = u.pathname.replace(/^\//, '').split('?')[0]!;
  u.pathname = '/postgres';
  return { adminUrl: u.toString(), dbName };
}
