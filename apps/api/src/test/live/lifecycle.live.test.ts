import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getLiveCtx, reseedLiveCtx } from './setup';
import {
  authedGet,
  authedPost,
  authedPatch,
  expectDenied,
  signTenantToken,
} from './http';

describe('live lifecycle', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  afterAll(async () => {
    await reseedLiveCtx();
  }, 120_000);

  async function setStatus(status: string) {
    const { db, fx } = await getLiveCtx();
    await db.updateTable('tenants').set({ status }).where('id', '=', fx.tenantA.id).execute();
  }

  it('suspended: GET allowed, mutation blocked', async () => {
    const { app, fx } = await getLiveCtx();
    await setStatus('suspended');
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const read = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(read.status).toBe(200);

    const write = await authedPatch(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
      body: { name: 'Nope' },
    });
    expect(write.status).toBe(403);
    expect(write.body?.error?.code).toBe('MUTATION_BLOCKED');

    // API key mutations also blocked
    const { apiKeyPost } = await import('./http');
    const v1 = await apiKeyPost(app, '/v1/contacts', fx.apiKeyA.raw, {
      name: 'Nope',
      email: 'suspended@isolation.test',
    });
    expect(v1.status).toBe(403);
  });

  it('archived: normal access denied', async () => {
    const { app, fx } = await getLiveCtx();
    await setStatus('archived');
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('TENANT_NOT_ACTIVE');
  });

  it('deleting: normal access denied', async () => {
    const { app, fx } = await getLiveCtx();
    await setStatus('deleting');
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('TENANT_NOT_ACTIVE');
  });

  it('provisioning: blocked', async () => {
    const { app, fx } = await getLiveCtx();
    await setStatus('provisioning');
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedGet(app, `/api/contacts/${fx.contactA.id}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe('TENANT_NOT_ACTIVE');
  });

  it('active: restore mutations', async () => {
    const { app, fx } = await getLiveCtx();
    await setStatus('active');
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const res = await authedPost(app, '/api/contacts', {
      token,
      host: fx.tenantA.host,
      body: { name: 'Lifecycle OK', email: 'lifecycle-ok@isolation.test' },
    });
    expect(res.status).toBe(201);
  });
});
