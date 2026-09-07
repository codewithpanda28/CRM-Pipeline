import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { Express } from 'express';
import { openLiveTestDb } from './db';
import { assertSafeTestDatabaseUrl } from './safe-db';
import { seedIsolationFixtures, type IsolationFixtures } from './fixtures';
import { createLiveIsolationApp } from './app';

export interface LiveCtx {
  db: Kysely<Database>;
  app: Express;
  fx: IsolationFixtures;
}

let shared: LiveCtx | null = null;

/** Serial suite shares one migrated DB + fixtures (correctness over parallelism). */
export async function getLiveCtx(): Promise<LiveCtx> {
  if (shared) return shared;
  const url = process.env['DATABASE_URL_TEST'];
  assertSafeTestDatabaseUrl(url);
  const db = await openLiveTestDb(url);
  const fx = await seedIsolationFixtures(db);
  const app = createLiveIsolationApp(db);
  shared = { db, app, fx };
  return shared;
}

export async function destroyLiveCtx(): Promise<void> {
  if (shared?.db) await shared.db.destroy();
  shared = null;
}

export async function reseedLiveCtx(): Promise<LiveCtx> {
  const ctx = await getLiveCtx();
  ctx.fx = await seedIsolationFixtures(ctx.db);
  return ctx;
}
