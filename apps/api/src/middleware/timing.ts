/**
 * Lightweight request timing — no secrets.
 * Sets Server-Timing + X-Auth-Ms / X-Total-Ms before the response is sent.
 */
import type { Request, Response, NextFunction } from 'express';

export interface RequestTiming {
  startedAt: number;
  authMs?: number;
  dbMs?: number;
  handlerMs?: number;
  txMs?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      timing?: RequestTiming;
    }
  }
}

export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.timing = { startedAt: Date.now() };
  const origEnd = res.end.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).end = (...args: unknown[]) => {
    const t = req.timing;
    if (t && !res.headersSent) {
      const totalMs = Date.now() - t.startedAt;
      const parts: string[] = [`total;dur=${totalMs}`];
      if (t.authMs != null) parts.push(`auth;dur=${t.authMs}`);
      if (t.dbMs != null) parts.push(`db;dur=${t.dbMs}`);
      if (t.handlerMs != null) parts.push(`handler;dur=${t.handlerMs}`);
      if (t.txMs != null) parts.push(`tx;dur=${t.txMs}`);
      try {
        res.setHeader('Server-Timing', parts.join(', '));
        res.setHeader('X-Total-Ms', String(totalMs));
        if (t.authMs != null) res.setHeader('X-Auth-Ms', String(t.authMs));
      } catch {
        // ignore
      }
    }
    return origEnd(...(args as Parameters<typeof res.end>));
  };
  next();
}

export function markAuthMs(req: Request, authMs: number): void {
  if (!req.timing) req.timing = { startedAt: Date.now() };
  req.timing.authMs = authMs;
}
