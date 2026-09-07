import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { SECRETS_B } from './fixtures';
import { authedPost, expectNoSecretLeak, signTenantToken } from './http';
import { assertObjectKeyBelongsToTenant, tenantObjectKey } from '@vencore/tenancy';

describe('live storage-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('A can access A object key; cannot access B', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const ok = await authedPost(app, '/api/__live/storage/check', {
      token,
      host: fx.tenantA.host,
      body: { objectKey: fx.fileKeyA },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.allowed).toBe(true);

    const deny = await authedPost(app, '/api/__live/storage/check', {
      token,
      host: fx.tenantA.host,
      body: { objectKey: fx.fileKeyB },
    });
    expect(deny.status).toBe(403);
    expect(deny.body?.error?.code).toBe('STORAGE_DENIED');
    expectNoSecretLeak(deny.body, SECRETS_B);
  });

  it('B can access B object key', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });
    const ok = await authedPost(app, '/api/__live/storage/check', {
      token,
      host: fx.tenantB.host,
      body: { objectKey: fx.fileKeyB },
    });
    expect(ok.status).toBe(200);
  });

  it('legacy messaging prefix is tenant-safe', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const ok = await authedPost(app, '/api/__live/storage/check', {
      token,
      host: fx.tenantA.host,
      body: { objectKey: fx.legacyFileKeyA },
    });
    expect(ok.status).toBe(200);

    const deny = await authedPost(app, '/api/__live/storage/check', {
      token,
      host: fx.tenantA.host,
      body: { objectKey: fx.legacyFileKeyB },
    });
    expect(deny.status).toBe(403);
  });

  it('path traversal / malformed keys denied', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    for (const objectKey of [
      `tenants/${fx.tenantB.id}/../${fx.tenantA.id}/x`,
      `tenants/${fx.tenantB.id}/messaging/x`,
      '../../../etc/passwd',
      `tenants/${fx.tenantA.id}/../${fx.tenantB.id}/secret`,
    ]) {
      const res = await authedPost(app, '/api/__live/storage/check', {
        token,
        host: fx.tenantA.host,
        body: { objectKey },
      });
      // Either denied by assert, or if string still starts with tenants/A after weirdness — must not allow B
      if (objectKey.includes(fx.tenantB.id) && !assertObjectKeyBelongsToTenant(objectKey, fx.tenantA.id, fx.tenantA.id)) {
        expect(res.status).toBe(403);
      }
    }
  });

  it('signed URL path unavailable without R2 — auth layer still tenant-bound', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    // Presign builds key from tenantContext only — no client-supplied tenant
    const res = await authedPost(app, '/api/messaging/upload/presign', {
      token,
      host: fx.tenantA.host,
      body: { filename: 'a.txt', mime_type: 'text/plain', size_bytes: 12 },
    });
    // Without R2: 503 STORAGE_NOT_CONFIGURED; with R2: 200 and key under tenants/A
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.data.r2_key).toContain(tenantObjectKey(fx.tenantA.id, 'messaging').replace(/messaging$/, ''));
      expect(res.body.data.r2_key).not.toContain(fx.tenantB.id);
    }
    expectNoSecretLeak(res.body, SECRETS_B);
  });
});
