/**
 * Document PDF artifacts API.
 * Parent mounts under /api/documents (auth required).
 */
import { Router, type Router as ExpressRouter, type RequestHandler } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { withUnitOfWork } from '../lib/domain-outbox';
import {
  downloadArtifact,
  enqueueRender,
  getArtifact,
  listArtifactsForSource,
  renderArtifactNow,
} from '../lib/documents';

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

const enqueueSchema = z.object({
  source_type: z.enum(['quote', 'invoice', 'credit_note', 'debit_note']),
  source_id: z.string().uuid(),
  render_idempotency_key: z.string().min(1).max(200).optional(),
  template_version: z.number().int().positive().optional(),
  /** When true, render PDF in-request so Generate/Download works without waiting on the worker. */
  sync: z.boolean().optional().default(true),
});

export function createDocumentsRouter(
  db: Kysely<Database>,
  requirePermission: (p: string) => RequestHandler,
): ExpressRouter {
  const router = Router();
  const view = requirePermission('documents:view');
  const generate = requirePermission('documents:generate');

  router.post('/render', generate, async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = enqueueSchema.parse(req.body);
      const result = await withUnitOfWork(db, async (trx) =>
        enqueueRender(trx, {
          workspaceId: auth.workspace.id,
          sourceType: body.source_type,
          sourceId: body.source_id,
          createdBy: auth.user.id,
          renderIdempotencyKey: body.render_idempotency_key,
          templateVersion: body.template_version,
        }),
      );

      if (body.sync) {
        const rendered = await renderArtifactNow(db, {
          workspaceId: auth.workspace.id,
          artifactId: result.artifactId,
        });
        return res.status(200).json({
          data: {
            id: result.artifactId,
            artifactId: result.artifactId,
            status: 'ready',
            outboxId: result.outboxId,
            deduped: result.deduped,
            placeholder: rendered.placeholder,
          },
          error: null,
        });
      }

      res.status(202).json({
        data: {
          id: result.artifactId,
          artifactId: result.artifactId,
          status: 'pending',
          outboxId: result.outboxId,
          deduped: result.deduped,
        },
        error: null,
      });
    } catch (e) {
      if (e instanceof Error && e.message.endsWith('_NOT_FOUND')) {
        return fail(res, 404, e.message, 'Source document not found');
      }
      next(e);
    }
  });

  router.get('/artifacts', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const sourceType = String(req.query['source_type'] ?? '');
      const sourceId = String(req.query['source_id'] ?? '');
      if (!sourceType || !sourceId) {
        return fail(res, 400, 'INVALID_INPUT', 'source_type and source_id required');
      }
      const data = await listArtifactsForSource(db, { workspaceId, sourceType, sourceId });
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/artifacts/:id', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const data = await getArtifact(db, {
        workspaceId,
        artifactId: req.params['id']!,
      });
      if (!data) return fail(res, 404, 'NOT_FOUND', 'Artifact not found');
      res.json({ data, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.get('/artifacts/:id/download', view, async (req, res, next) => {
    try {
      const workspaceId = (req as AuthenticatedRequest).workspace.id;
      const file = await downloadArtifact(db, {
        workspaceId,
        artifactId: req.params['id']!,
      });
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.send(file.bytes);
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === 'ARTIFACT_NOT_FOUND') return fail(res, 404, e.message, 'Not found');
        if (e.message === 'DOCUMENT_WORKSPACE_MISMATCH') {
          return fail(res, 403, e.message, 'Forbidden');
        }
        if (e.message === 'ARTIFACT_NOT_READY') {
          return fail(res, 409, e.message, 'Artifact not ready');
        }
      }
      next(e);
    }
  });

  return router;
}
