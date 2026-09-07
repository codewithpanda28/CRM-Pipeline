import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import type { SmtpConfig } from '@vencore/config';
import { z } from 'zod';
import { logger } from '../lib/logger';
import { getEnabledModuleIds, resolveUserPermissions } from '../middleware/permission';
import { createRateLimiter, generateResetToken, hashToken } from '../lib/rate-limit';
import { recordSecurityAudit } from '../lib/security-audit';
import { switchTenantMembership } from '../middleware/auth';

const loginSchema = z.object({
  // Accept any x@y — self-hosted setups often use local domains without TLDs
  email: z.string().min(3).includes('@'),
  password: z.string().min(1),
});

const switchTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  password: z.string().min(8),
});

export function createAuthRouter(
  db: Kysely<Database>,
  jwtSecret: string,
  smtp: SmtpConfig | null | undefined,
  appUrl: string,
): Router {
  const router = Router();
  const loginLimiter = createRateLimiter({
    name: 'login',
    windowMs: 15 * 60 * 1000,
    max: 20,
    keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  });

  // POST /api/auth/login
  router.post('/login', loginLimiter, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }
    const { email, password } = parsed.data;

    try {
      const user = await db
        .selectFrom('users')
        .where('email', '=', email)
        .selectAll()
        .executeTakeFirst();

      // Always run bcrypt.compare to prevent timing-based email enumeration
      const DUMMY_HASH = '$2b$12$invalidhashpadding0000000000000000000000000000000000000';
      const valid = user
        ? await bcrypt.compare(password, user.password_hash)
        : await bcrypt.compare(password, DUMMY_HASH);

      if (!user || !valid) {
        res.status(401).json({ data: null, error: { code: 'INVALID_CREDENTIALS' } });
        return;
      }

      await db
        .updateTable('users')
        .set({ last_login_at: new Date() })
        .where('id', '=', user.id)
        .execute();

      const activeTenantId = user.workspace_id;
      const token = jwt.sign(
        {
          sub: user.id,
          workspaceId: activeTenantId,
          active_tenant_id: activeTenantId,
          sv: user.session_version ?? 1,
        },
        jwtSecret,
        { expiresIn: '24h' },
      );

      res.cookie('vencore_token', token, {
        httpOnly: true,
        secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });

      await recordSecurityAudit(db, {
        tenant_id: activeTenantId,
        actor_type: 'user',
        actor_id: user.id,
        action: 'auth.login_success',
        ip: req.ip ?? null,
        user_agent: req.get('user-agent') ?? null,
      });

      // Resolve access up-front so the client has the correct admin/permission
      // state immediately after login (rather than relying on a follow-up /api/me).
      const enabled = await getEnabledModuleIds(db, user.workspace_id);
      const resolved = await resolveUserPermissions(db, user.id, user.workspace_id, enabled);

      res.json({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          token,
          theme: user.theme,
          isAdmin: resolved.superuser,
          permissions: [...resolved.permissions],
        },
        error: null,
      });
    } catch (err) {
      logger.error({ err }, 'POST /login error');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // GET /api/auth/ws-token — exchange session cookie for a short-lived WS-only token
  // Used by browser when opening cross-origin WebSocket (cookie SameSite blocks cross-site send)
  router.get('/ws-token', (req, res) => {
    const cookieToken = req.cookies['vencore_token'] as string | undefined;
    if (!cookieToken) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    let payload: { sub: string; workspaceId: string };
    try {
      payload = jwt.verify(cookieToken, jwtSecret) as { sub: string; workspaceId: string };
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    const wsToken = jwt.sign(
      { sub: payload.sub, workspaceId: payload.workspaceId },
      jwtSecret,
      { expiresIn: '30s' },
    );
    res.json({ data: { token: wsToken }, error: null });
  });

  // POST /api/auth/switch-tenant — membership-validated active tenant change
  router.post('/switch-tenant', async (req, res) => {
    const token = (req.cookies['vencore_token'] as string | undefined)
      || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined);
    if (!token) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    let payload: { sub: string; sv?: number };
    try {
      payload = jwt.verify(token, jwtSecret) as { sub: string; sv?: number };
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    const parsed = switchTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }
    const result = await switchTenantMembership(db, payload.sub, parsed.data.tenantId, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    if (!result.ok) {
      res.status(403).json({ data: null, error: { code: result.code } });
      return;
    }
    const user = await db.selectFrom('users').where('id', '=', payload.sub).selectAll().executeTakeFirst();
    if (!user) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    const newToken = jwt.sign(
      {
        sub: user.id,
        workspaceId: result.tenantId,
        active_tenant_id: result.tenantId,
        sv: user.session_version ?? 1,
      },
      jwtSecret,
      { expiresIn: '24h' },
    );
    res.cookie('vencore_token', newToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ data: { tenantId: result.tenantId, token: newToken }, error: null });
  });

  // POST /api/auth/logout
  router.post('/logout', async (req, res) => {
    const token = req.cookies['vencore_token'] as string | undefined;
    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret) as { sub: string };
        const u = await db
          .selectFrom('users')
          .where('id', '=', payload.sub)
          .select(['session_version'])
          .executeTakeFirst();
        if (u) {
          await db
            .updateTable('users')
            .set({ session_version: (u.session_version ?? 1) + 1 })
            .where('id', '=', payload.sub)
            .execute();
        }
      } catch {
        /* ignore */
      }
    }
    res.clearCookie('vencore_token', {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
      sameSite: 'lax',
      path: '/',
    });
    res.json({ data: null, error: null });
  });

  // GET /api/auth/me
  router.get('/me', async (req, res) => {
    const token = req.cookies['vencore_token'] as string | undefined;
    if (!token) {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    let payload: { sub: string };
    try {
      payload = jwt.verify(token, jwtSecret) as { sub: string };
    } catch {
      res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
      return;
    }

    try {
      const user = await db
        .selectFrom('users')
        .where('id', '=', payload.sub)
        .select(['id', 'name', 'email', 'workspace_id'])
        .executeTakeFirst();

      if (!user) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }

      res.json({ data: user, error: null });
    } catch (err) {
      logger.error({ err }, 'GET /me db error');
      res.status(500).json({ data: null, error: { code: 'INTERNAL_ERROR' } });
    }
  });

  // POST /api/auth/forgot
  router.post('/forgot', async (req, res) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    if (!smtp) {
      res.status(503).json({ data: null, error: { code: 'SMTP_NOT_CONFIGURED' } });
      return;
    }

    const user = await db
      .selectFrom('users')
      .where('email', '=', parsed.data.email)
      .select(['id', 'email', 'name'])
      .executeTakeFirst();

    // Always return 200 to prevent email enumeration
    if (!user) {
      res.json({ data: null, error: null });
      return;
    }

    const { raw, hash } = generateResetToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db
      .updateTable('users')
      .set({
        password_reset_token: null, // stop storing plaintext
        password_reset_token_hash: hash,
        password_reset_expires_at: expires,
      })
      .where('id', '=', user.id)
      .execute();

    // Send email
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.password },
      });

      await transporter.sendMail({
        from: smtp.from,
        to: user.email,
        subject: 'ThinkAIQ CRM password reset',
        text: `Reset your ThinkAIQ CRM password: ${appUrl}/reset-password?token=${raw}\n\nExpires in 1 hour.`,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to send password reset email');
    }

    res.json({ data: null, error: null });
  });

  // POST /api/auth/reset/:token
  router.post('/reset/:token', async (req, res) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ data: null, error: { code: 'INVALID_INPUT' } });
      return;
    }

    const tokenHash = hashToken(req.params['token']!);
    let user = await db
      .selectFrom('users')
      .where('password_reset_token_hash', '=', tokenHash)
      .where('password_reset_expires_at', '>', new Date())
      .select(['id', 'session_version'])
      .executeTakeFirst();

    // Dual-read legacy plaintext column during migration window
    if (!user) {
      user = await db
        .selectFrom('users')
        .where('password_reset_token', '=', req.params['token']!)
        .where('password_reset_expires_at', '>', new Date())
        .select(['id', 'session_version'])
        .executeTakeFirst();
    }

    if (!user) {
      res.status(400).json({ data: null, error: { code: 'INVALID_OR_EXPIRED_TOKEN' } });
      return;
    }

    const hash = await bcrypt.hash(parsed.data.password, 12);
    await db
      .updateTable('users')
      .set({
        password_hash: hash,
        password_reset_token: null,
        password_reset_token_hash: null,
        password_reset_expires_at: null,
        session_version: (user.session_version ?? 1) + 1,
      })
      .where('id', '=', user.id)
      .execute();

    res.json({ data: null, error: null });
  });

  return router;
}
