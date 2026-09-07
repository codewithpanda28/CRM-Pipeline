import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

type Bucket = { count: number; resetAt: number };

/**
 * Distributed-capable rate limiter.
 * Uses Redis when REDIS_URL + ioredis available; else in-memory (documented limitation for multi-replica).
 */
export function createRateLimiter(opts: {
  name: string;
  windowMs: number;
  max: number;
  redis?: { incr: (k: string) => Promise<number>; pexpire: (k: string, ms: number) => Promise<unknown> } | null;
  keyFn: (req: Request) => string;
}) {
  const memory = new Map<string, Bucket>();

  return async function rateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = `rl:${opts.name}:${opts.keyFn(req)}`;
    try {
      if (opts.redis) {
        const n = await opts.redis.incr(key);
        if (n === 1) await opts.redis.pexpire(key, opts.windowMs);
        if (n > opts.max) {
          res.status(429).json({ data: null, error: { code: 'RATE_LIMITED' } });
          return;
        }
        next();
        return;
      }
    } catch {
      // fall through to memory
    }

    const now = Date.now();
    let b = memory.get(key);
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + opts.windowMs };
      memory.set(key, b);
    }
    b.count += 1;
    if (b.count > opts.max) {
      res.status(429).json({ data: null, error: { code: 'RATE_LIMITED' } });
      return;
    }
    next();
  };
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: hashToken(raw) };
}
