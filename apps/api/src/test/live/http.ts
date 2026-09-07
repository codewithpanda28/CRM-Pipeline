import jwt from 'jsonwebtoken';
import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';
import { LIVE_JWT_SECRET } from './app';

export function signTenantToken(opts: {
  userId: string;
  tenantId: string;
  sessionVersion?: number;
}): string {
  return jwt.sign(
    {
      sub: opts.userId,
      workspaceId: opts.tenantId,
      active_tenant_id: opts.tenantId,
      sv: opts.sessionVersion ?? 1,
    },
    LIVE_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

export function signPlatformToken(opts: { platformUserId: string }): string {
  return jwt.sign(
    { sub: opts.platformUserId, realm: 'platform' },
    LIVE_JWT_SECRET,
    { expiresIn: '1h' },
  );
}

type AuthOpts = { token: string; host: string; body?: unknown };

function withHost(req: request.Test, host: string) {
  return req.set('X-Forwarded-Host', host).set('Host', host);
}

export function authedGet(app: Express, path: string, opts: { token: string; host: string }) {
  return withHost(
    request(app).get(path).set('Authorization', `Bearer ${opts.token}`),
    opts.host,
  );
}

export function authedPost(app: Express, path: string, opts: AuthOpts) {
  return withHost(
    request(app).post(path).set('Authorization', `Bearer ${opts.token}`).send(opts.body ?? {}),
    opts.host,
  );
}

export function authedPatch(app: Express, path: string, opts: AuthOpts) {
  return withHost(
    request(app).patch(path).set('Authorization', `Bearer ${opts.token}`).send(opts.body ?? {}),
    opts.host,
  );
}

export function authedDelete(app: Express, path: string, opts: { token: string; host: string }) {
  return withHost(
    request(app).delete(path).set('Authorization', `Bearer ${opts.token}`),
    opts.host,
  );
}

export function apiKeyGet(app: Express, path: string, rawKey: string) {
  return request(app).get(path).set('Authorization', `Bearer ${rawKey}`);
}

export function apiKeyPost(app: Express, path: string, rawKey: string, body?: unknown) {
  return request(app).post(path).set('Authorization', `Bearer ${rawKey}`).send(body ?? {});
}

export function expectDenied(res: { status: number; body: unknown }) {
  expect([403, 404]).toContain(res.status);
}

export function expectNoSecretLeak(body: unknown, secrets: string[]) {
  const raw = JSON.stringify(body ?? {});
  for (const s of secrets) {
    expect(raw).not.toContain(s);
  }
}

export function expectNoId(body: unknown, id: string) {
  expect(JSON.stringify(body ?? {})).not.toContain(id);
}
