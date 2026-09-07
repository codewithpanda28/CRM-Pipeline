import { Router, type Router as ExpressRouter } from 'express';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { RequestHandler } from 'express';

/** Minimal platform-only surfaces — Super Admin UI deferred. */
export function createPlatformRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/tenants', async (_req, res, next) => {
    try {
      const rows = await db
        .selectFrom('tenants')
        .select(['id', 'slug', 'display_name', 'status', 'created_at'])
        .orderBy('created_at', 'asc')
        .execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/outbox', async (req, res, next) => {
    try {
      const tenantId = typeof req.query['tenant_id'] === 'string' ? req.query['tenant_id'] : undefined;
      let q = db
        .selectFrom('outbox_events')
        .select(['id', 'tenant_id', 'event_type', 'status', 'aggregate_id', 'occurred_at'])
        .orderBy('occurred_at', 'desc')
        .limit(100);
      if (tenantId) q = q.where('tenant_id', '=', tenantId);
      const rows = await q.execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/security-audit', async (req, res, next) => {
    try {
      const tenantId = typeof req.query['tenant_id'] === 'string' ? req.query['tenant_id'] : undefined;
      let q = db
        .selectFrom('security_audit_events')
        .select(['id', 'tenant_id', 'actor_type', 'actor_id', 'action', 'created_at'])
        .orderBy('created_at', 'desc')
        .limit(100);
      if (tenantId) q = q.where('tenant_id', '=', tenantId);
      const rows = await q.execute();
      res.json({ data: rows, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}

export function mountPlatformRouter(
  db: Kysely<Database>,
  requirePlatformAdmin: RequestHandler,
): ExpressRouter {
  const router = Router();
  router.use(requirePlatformAdmin);
  router.use(createPlatformRouter(db));
  return router;
}
