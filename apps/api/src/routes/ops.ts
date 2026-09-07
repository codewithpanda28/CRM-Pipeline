/**
 * Ops: tenant export, failed outbox list/replay, health.
 *
 * Mount notes for parent:
 * - createHealthRouter(db) → GET /  mounted at /api/health (public-ish)
 * - createOpsRouter(db, requirePermission) → mounted at /api/ops (auth)
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  healthCheck,
  listFailedOutbox,
  replayOutbox,
  runTenantExportJob,
} from '../lib/ops';
import { requireMfaForPrivileged } from '../lib/mfa';
import { recordSecurityAudit } from '../lib/security-audit';

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

/** Public-ish health — no auth. Mount at /api/health */
export function createHealthRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();
  router.get('/', async (_req, res, next) => {
    try {
      const data = await healthCheck({
        db,
        redisUrl: process.env['REDIS_URL'] ?? process.env['JOBS_REDIS_URL'] ?? null,
      });
      const ok = data.db === 'ok';
      res.status(ok ? 200 : 503).json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });
  return router;
}

export function createOpsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const exportPerm = requirePermission('ops:export');
  const jobsPerm = requirePermission('ops:jobs');
  const mfa = requireMfaForPrivileged(db);

  // Also expose health under /ops/health for authenticated dashboards
  router.get('/health', async (_req, res, next) => {
    try {
      const data = await healthCheck({
        db,
        redisUrl: process.env['REDIS_URL'] ?? process.env['JOBS_REDIS_URL'] ?? null,
      });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/export', exportPerm, mfa, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const result = await runTenantExportJob(db, {
        workspaceId: auth.workspace.id,
        requestedBy: auth.user.id,
      });
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'ops.tenant_export',
        entity_type: 'tenant_export_job',
        entity_id: result.jobId,
        ip: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        meta: { storage_key: result.storageKey, byte_size: result.byteSize },
      });
      res.status(201).json({ data: result, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/outbox/failed', jobsPerm, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const limit = Math.min(Number(req.query['limit'] ?? 50) || 50, 200);
      const data = await listFailedOutbox(db, {
        tenantId: auth.workspace.id,
        limit,
      });
      // Operator-readable projection
      const projected = data.map((row) => ({
        id: row.id,
        what: row.event_type,
        when: row.occurred_at,
        tenant: row.tenant_id,
        job: row.job_name,
        error: row.last_error,
        retry_count: row.attempts,
        status: row.status,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
      }));
      res.json({ data: projected, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/outbox/replay', jobsPerm, mfa, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          ids: z.array(z.string().uuid()).min(1).max(100),
        })
        .parse(req.body);
      const data = await replayOutbox(db, {
        ids: body.ids,
        tenantId: auth.workspace.id,
      });
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'ops.outbox_replay',
        entity_type: 'outbox_events',
        entity_id: null,
        ip: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        meta: { ids: body.ids, replayed: data.replayed },
      });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
