import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Session bootstrap/teardown — must work even with a stale vencore_token cookie. */
const CSRF_EXEMPT_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/setup',
];

/**
 * CSRF for cookie-authenticated browser requests.
 * Bearer Authorization is exempt (API clients).
 * Double-submit: cookie `vencore_csrf` must match header `x-csrf-token`.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const enforce =
    process.env['CSRF_ENFORCE'] === 'true' ||
    (process.env['NODE_ENV'] === 'production' && process.env['CSRF_ENFORCE'] !== 'false');
  if (!enforce) {
    next();
    return;
  }
  if (SAFE.has(req.method.toUpperCase())) {
    next();
    return;
  }
  const path = (req.originalUrl || req.url || '').split('?')[0] ?? '';
  if (CSRF_EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }
  // Only enforce when session cookie present
  if (!req.cookies?.['vencore_token']) {
    next();
    return;
  }
  const cookieToken = req.cookies?.['vencore_csrf'] as string | undefined;
  const headerToken = req.headers['x-csrf-token'] as string | undefined;
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ data: null, error: { code: 'CSRF_REJECTED' } });
    return;
  }
  next();
}

export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction): void {
  if (!req.cookies?.['vencore_csrf']) {
    const token = crypto.randomBytes(24).toString('hex');
    res.cookie('vencore_csrf', token, {
      httpOnly: false,
      secure: process.env['NODE_ENV'] === 'production' && process.env['COOKIE_SECURE'] !== 'false',
      sameSite: 'lax',
      path: '/',
    });
  }
  next();
}
