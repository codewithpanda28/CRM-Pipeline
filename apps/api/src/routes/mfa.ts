/**
 * MFA enroll / verify / disable for workspace users.
 * Parent mounts under /api/mfa (auth required).
 */
import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  disableMfa,
  enrollMfa,
  verifyMfaEnrollment,
  verifyMfaToken,
} from '../lib/mfa';
import { recordSecurityAudit } from '../lib/security-audit';

function fail(res: import('express').Response, s: number, code: string, msg: string) {
  return res.status(s).json({ data: null, error: { code, message: msg } });
}

const tokenSchema = z.object({
  token: z.string().min(4).max(32),
});

export function createMfaRouter(db: Kysely<Database>): ExpressRouter {
  const router = Router();

  router.get('/status', async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const user = await db
        .selectFrom('users')
        .select(['mfa_enabled', 'mfa_enrolled_at'])
        .where('id', '=', auth.user.id)
        .where('workspace_id', '=', auth.workspace.id)
        .executeTakeFirst();
      res.json({
        data: {
          mfa_enabled: Boolean(user?.mfa_enabled),
          mfa_enrolled_at: user?.mfa_enrolled_at ?? null,
        },
        error: null,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post('/enroll', async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = z
        .object({
          current_token: z.string().min(4).max(32).optional(),
        })
        .parse(req.body ?? {});
      const result = await enrollMfa(db, {
        userId: auth.user.id,
        workspaceId: auth.workspace.id,
        email: auth.user.email,
        currentToken: body.current_token,
      });
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'mfa.enroll_started',
        entity_type: 'user',
        entity_id: auth.user.id,
        ip: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        meta: {},
      });
      res.status(201).json({
        data: {
          secret: result.secret,
          otpauth_url: result.otpauthUrl,
          recovery_codes: result.recoveryCodes,
        },
        error: null,
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'MFA_ALREADY_ENABLED') {
        return fail(res, 409, 'MFA_ALREADY_ENABLED', 'MFA already enabled — provide current_token to re-enroll');
      }
      if (e instanceof Error && e.message === 'MFA_INVALID') {
        return fail(res, 400, 'MFA_INVALID', 'Invalid MFA token');
      }
      next(e);
    }
  });

  router.post('/verify', async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = tokenSchema.parse(req.body);
      const ok = await verifyMfaEnrollment(db, {
        userId: auth.user.id,
        workspaceId: auth.workspace.id,
        token: body.token,
      });
      if (!ok) return fail(res, 400, 'MFA_INVALID', 'Invalid MFA token');
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'mfa.enrolled',
        entity_type: 'user',
        entity_id: auth.user.id,
        ip: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        meta: {},
      });
      res.json({ data: { mfa_enabled: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/challenge', async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = tokenSchema.parse(req.body);
      const ok = await verifyMfaToken(db, {
        userId: auth.user.id,
        workspaceId: auth.workspace.id,
        token: body.token,
      });
      if (!ok) return fail(res, 400, 'MFA_INVALID', 'Invalid MFA token');
      res.json({ data: { verified: true }, error: null });
    } catch (e) {
      next(e);
    }
  });

  router.post('/disable', async (req, res, next) => {
    try {
      const auth = req as AuthenticatedRequest;
      const body = tokenSchema.parse(req.body);
      const ok = await disableMfa(db, {
        userId: auth.user.id,
        workspaceId: auth.workspace.id,
        token: body.token,
      });
      if (!ok) return fail(res, 400, 'MFA_INVALID', 'Invalid MFA token');
      await recordSecurityAudit(db, {
        tenant_id: auth.workspace.id,
        actor_type: 'user',
        actor_id: auth.user.id,
        action: 'mfa.disabled',
        entity_type: 'user',
        entity_id: auth.user.id,
        ip: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
        meta: {},
      });
      res.json({ data: { mfa_enabled: false }, error: null });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
