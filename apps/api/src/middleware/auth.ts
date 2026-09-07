import crypto from 'crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import {
  type TenantContext,
  type TenantStatus,
  TenantContextError,
  assertTenantAllowsRequest,
  bodyTenantOverrideAttempt,
  canRunBusinessJobs,
  classifyHost,
  normalizeHost,
  pickRequestHost,
  type HostResolutionConfig,
} from '@vencore/tenancy';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { User, Workspace } from '@vencore/db';
import { getEnabledModuleIds, resolveUserPermissions } from './permission';
import { recordSecurityAudit } from '../lib/security-audit';
import { markAuthMs } from './timing';

export interface AuthenticatedRequest extends Request {
  user: User;
  workspace: Workspace;
  isAdmin: boolean;
  permissions: Set<string>;
  tenantContext: TenantContext;
}

interface JwtPayload {
  sub: string;
  role?: 'admin' | 'member';
  workspaceId?: string;
  active_tenant_id?: string;
  sv?: number; // session_version
}

function defaultHostConfig(): HostResolutionConfig {
  const base = (process.env['PLATFORM_BASE_DOMAIN'] || 'thinkaiq.com').toLowerCase();
  const platformHosts = (process.env['PLATFORM_HOSTS'] || `localhost,127.0.0.1,app.${base},api.${base},admin.${base}`)
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return {
    platformBaseDomain: base,
    platformHosts,
    trustProxy: process.env['TRUST_PROXY'] === 'true',
  };
}

async function resolveTenantIdFromHost(
  db: Kysely<Database>,
  host: string | null,
  cfg: HostResolutionConfig,
): Promise<{ tenantId: string | null; host: string | null; kind: string }> {
  if (!host) return { tenantId: null, host: null, kind: 'missing' };
  const classified = classifyHost(host, cfg);
  if (classified.kind === 'platform') {
    return { tenantId: null, host, kind: 'platform' };
  }
  if (classified.kind === 'unknown') {
    throw new TenantContextError('Unknown host', 'UNKNOWN_HOST');
  }
  if (classified.kind === 'tenant_subdomain') {
    const bySlug = await db
      .selectFrom('tenants')
      .where('slug', '=', classified.slug)
      .select(['id'])
      .executeTakeFirst();
    if (bySlug) return { tenantId: bySlug.id, host, kind: 'tenant_subdomain' };
    const byDomain = await db
      .selectFrom('tenant_domains')
      .where('host', '=', host)
      .where('verification_status', '=', 'active')
      .select(['tenant_id'])
      .executeTakeFirst();
    if (byDomain) return { tenantId: byDomain.tenant_id, host, kind: 'tenant_subdomain' };
    throw new TenantContextError('Unknown host', 'UNKNOWN_HOST');
  }
  // custom_domain
  const row = await db
    .selectFrom('tenant_domains')
    .where('host', '=', host)
    .where('verification_status', '=', 'active')
    .select(['tenant_id'])
    .executeTakeFirst();
  if (!row) throw new TenantContextError('Unknown host', 'UNKNOWN_HOST');
  return { tenantId: row.tenant_id, host, kind: 'custom_domain' };
}

export function createRequireAuth(db: Kysely<Database>, jwtSecret: string) {
  const hostCfg = defaultHostConfig();

  return async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const authStarted = Date.now();
    try {
      if (bodyTenantOverrideAttempt(req.body)) {
        // Never authorize from body — strip is not enough; reject mutating confusion
        // Allow presence only on non-authz paths; for authenticated APIs we reject.
        res.status(400).json({
          data: null,
          error: { code: 'BODY_TENANT_REJECTED', message: 'tenantId in body is not allowed' },
        });
        return;
      }

      const authHeader = req.headers.authorization;
      const token =
        authHeader?.startsWith('Bearer ')
          ? authHeader.slice(7)
          : (req.cookies?.['vencore_token'] as string | undefined);
      if (!token) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }

      let payload: JwtPayload;
      try {
        payload = jwt.verify(token, jwtSecret) as JwtPayload;
      } catch {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }

      const user = await db
        .selectFrom('users')
        .where('id', '=', payload.sub)
        .selectAll()
        .executeTakeFirst();

      if (!user) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }

      if (!user.is_active) {
        res.status(401).json({ data: null, error: { code: 'ACCOUNT_DISABLED' } });
        return;
      }

      if (
        typeof payload.sv === 'number' &&
        typeof user.session_version === 'number' &&
        payload.sv !== user.session_version
      ) {
        res.status(401).json({ data: null, error: { code: 'SESSION_REVOKED' } });
        return;
      }

      const host = pickRequestHost(req.headers as Record<string, string | string[] | undefined>, hostCfg.trustProxy);
      let hostTenantId: string | null = null;
      let resolvedHost: string | null = host;
      try {
        const resolved = await resolveTenantIdFromHost(db, host, hostCfg);
        hostTenantId = resolved.tenantId;
        resolvedHost = resolved.host;
        // On platform hosts without tenant, fall through to JWT/membership
        if (resolved.kind === 'unknown') {
          res.status(400).json({ data: null, error: { code: 'UNKNOWN_HOST' } });
          return;
        }
      } catch (e) {
        if (e instanceof TenantContextError && e.code === 'UNKNOWN_HOST') {
          // Compat: if no tenancy tables populated yet / localhost without domain rows,
          // allow legacy single-workspace when host is platform-like.
          if (host && !hostCfg.platformHosts.includes(host) && host !== 'localhost' && host !== '127.0.0.1') {
            res.status(400).json({ data: null, error: { code: 'UNKNOWN_HOST' } });
            return;
          }
        } else {
          throw e;
        }
      }

      let activeTenantId =
        hostTenantId ||
        payload.active_tenant_id ||
        payload.workspaceId ||
        user.workspace_id;

      if (hostTenantId && payload.active_tenant_id && payload.active_tenant_id !== hostTenantId) {
        res.status(403).json({ data: null, error: { code: 'HOST_JWT_MISMATCH' } });
        return;
      }
      if (hostTenantId) {
        activeTenantId = hostTenantId;
      }

      // Prefer active membership; fall back to legacy workspace_id dual-read
      let membership = await db
        .selectFrom('tenant_memberships')
        .where('tenant_id', '=', activeTenantId)
        .where('user_id', '=', user.id)
        .where('status', '=', 'active')
        .selectAll()
        .executeTakeFirst();

      if (!membership && user.workspace_id === activeTenantId) {
        // Pre-migration / missing backfill path — treat legacy binding as membership
        membership = {
          id: `legacy:${user.id}`,
          tenant_id: activeTenantId,
          user_id: user.id,
          status: 'active',
          is_owner: true,
          invited_by: null,
          joined_at: user.created_at,
          created_at: user.created_at,
          updated_at: user.created_at,
        };
      }

      if (!membership || membership.status !== 'active') {
        res.status(403).json({ data: null, error: { code: 'MEMBERSHIP_REQUIRED' } });
        return;
      }

      const tenant = await db
        .selectFrom('tenants')
        .where('id', '=', activeTenantId)
        .selectAll()
        .executeTakeFirst();

      const tenantStatus: TenantStatus = (tenant?.status as TenantStatus) || 'active';

      try {
        assertTenantAllowsRequest(tenantStatus, req.method, {
          allowLifecycle: req.path?.includes('/auth/') || req.path?.includes('/billing/'),
        });
      } catch (e) {
        if (e instanceof TenantContextError) {
          res.status(403).json({ data: null, error: { code: e.code } });
          return;
        }
        throw e;
      }

      // Dual-read: workspace id === tenant id when backfilled
      const workspace = await db
        .selectFrom('workspaces')
        .where('id', '=', activeTenantId)
        .selectAll()
        .executeTakeFirst();

      if (!workspace) {
        res.status(500).json({ data: null, error: { code: 'WORKSPACE_NOT_FOUND' } });
        return;
      }

      const enabled = await getEnabledModuleIds(db, workspace.id);
      const resolved = await resolveUserPermissions(db, user.id, workspace.id, enabled);

      const requestId =
        (req.headers['x-request-id'] as string | undefined) || crypto.randomUUID();
      const correlationId =
        (req.headers['x-correlation-id'] as string | undefined) || requestId;

      const tenantContext: TenantContext = {
        tenantId: activeTenantId,
        workspaceId: workspace.id,
        principal: { type: 'user', id: user.id },
        membership: {
          id: membership.id,
          status: 'active',
          isOwner: Boolean(membership.is_owner),
        },
        permissions: resolved.permissions,
        source: 'browser',
        requestId,
        correlationId,
        tenantStatus,
        resolvedHost,
      };

      (req as AuthenticatedRequest).user = user;
      (req as AuthenticatedRequest).workspace = workspace;
      (req as AuthenticatedRequest).isAdmin = resolved.superuser;
      (req as AuthenticatedRequest).permissions = resolved.permissions;
      (req as AuthenticatedRequest).tenantContext = tenantContext;
      markAuthMs(req, Date.now() - authStarted);
      next();
    } catch (err) {
      markAuthMs(req, Date.now() - authStarted);
      next(err);
    }
  };
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { user, isAdmin } = req as AuthenticatedRequest;
  if (!user || !isAdmin) {
    res.status(403).json({ data: null, error: { code: 'FORBIDDEN' } });
    return;
  }
  next();
}

/** Require platform principal — never conflate with tenant admin. */
export function createRequirePlatformAdmin(db: Kysely<Database>, jwtSecret: string) {
  return async function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      const token =
        authHeader?.startsWith('Bearer ')
          ? authHeader.slice(7)
          : (req.cookies?.['thinkaiq_platform_token'] as string | undefined);
      if (!token) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }
      let payload: { sub: string; realm?: string };
      try {
        payload = jwt.verify(token, jwtSecret) as { sub: string; realm?: string };
      } catch {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }
      if (payload.realm !== 'platform') {
        res.status(403).json({ data: null, error: { code: 'PLATFORM_REQUIRED' } });
        return;
      }
      const admin = await db
        .selectFrom('platform_users')
        .where('id', '=', payload.sub)
        .where('status', '=', 'active')
        .selectAll()
        .executeTakeFirst();
      if (!admin) {
        res.status(401).json({ data: null, error: { code: 'UNAUTHORIZED' } });
        return;
      }
      (req as Request & { platformUser: typeof admin }).platformUser = admin;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export async function switchTenantMembership(
  db: Kysely<Database>,
  userId: string,
  targetTenantId: string,
  meta?: { ip?: string; userAgent?: string },
): Promise<{ ok: true; tenantId: string } | { ok: false; code: string }> {
  const membership = await db
    .selectFrom('tenant_memberships')
    .where('user_id', '=', userId)
    .where('tenant_id', '=', targetTenantId)
    .where('status', '=', 'active')
    .selectAll()
    .executeTakeFirst();
  if (!membership) {
    await recordSecurityAudit(db, {
      tenant_id: targetTenantId,
      actor_type: 'user',
      actor_id: userId,
      action: 'auth.tenant_switch_denied',
      ip: meta?.ip ?? null,
      user_agent: meta?.userAgent ?? null,
      meta: {},
    });
    return { ok: false, code: 'MEMBERSHIP_REQUIRED' };
  }
  await recordSecurityAudit(db, {
    tenant_id: targetTenantId,
    actor_type: 'user',
    actor_id: userId,
    action: 'auth.tenant_switched',
    ip: meta?.ip ?? null,
    user_agent: meta?.userAgent ?? null,
    meta: {},
  });
  return { ok: true, tenantId: targetTenantId };
}

export function tenantIdFromRequest(req: Request): string {
  const ctx = (req as AuthenticatedRequest).tenantContext;
  if (!ctx?.tenantId) {
    throw new TenantContextError('Missing TenantContext', 'MISSING_TENANT_CONTEXT');
  }
  return ctx.tenantId;
}

export { canRunBusinessJobs, normalizeHost };
