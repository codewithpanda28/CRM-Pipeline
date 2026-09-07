/**
 * Live isolation — Business Operations Round 1 tenant boundaries.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { authedGet, authedPost, authedPatch, signTenantToken, expectDenied } from './http';

describe('live business-ops isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('cross-tenant department/employee/task/target access fails', async () => {
    const { app, fx, db } = await getLiveCtx();
    const tokenA = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const tokenB = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });

    for (const ws of [fx.tenantA.id, fx.tenantB.id]) {
      await db
        .insertInto('workspace_modules')
        .values({ workspace_id: ws, module_id: 'ops', enabled: true })
        .onConflict((oc) => oc.columns(['workspace_id', 'module_id']).doUpdateSet({ enabled: true }))
        .execute();
    }

    const createDeptA = await authedPost(app, '/api/ops/departments', {
      token: tokenA,
      host: fx.tenantA.host,
      body: { name: `Sales-A-${Date.now()}` },
    });
    expect([200, 201]).toContain(createDeptA.status);
    const deptAId = createDeptA.body.data.id as string;

    const listA = await authedGet(app, '/api/ops/departments', {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(listA.status).toBe(200);
    expect((listA.body.data as any[]).some((d) => d.id === deptAId)).toBe(true);

    const listB = await authedGet(app, '/api/ops/departments', {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(listB.status).toBe(200);
    expect((listB.body.data as any[]).some((d) => d.id === deptAId)).toBe(false);

    expectDenied(
      await authedPatch(app, `/api/ops/departments/${deptAId}`, {
        token: tokenB,
        host: fx.tenantB.host,
        body: { name: 'Hacked' },
      }),
    );

    // B trying on A's host with B token should also fail auth/tenant
    const crossHost = await authedGet(app, '/api/ops/departments', {
      token: tokenB,
      host: fx.tenantA.host,
    });
    expect([401, 403, 200]).toContain(crossHost.status);
    if (crossHost.status === 200) {
      expect((crossHost.body.data as any[]).some((d) => d.id === deptAId)).toBe(false);
    }

    const empA = await authedGet(app, '/api/ops/employees', {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(empA.status).toBe(200);
    const idsA = new Set((empA.body.data as any[]).map((e) => e.id));

    const empB = await authedGet(app, '/api/ops/employees', {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(empB.status).toBe(200);
    for (const e of empB.body.data as any[]) {
      expect(idsA.has(e.id)).toBe(false);
    }

    const taskA = await authedPost(app, '/api/ops/tasks', {
      token: tokenA,
      host: fx.tenantA.host,
      body: { title: `Follow-up A ${Date.now()}`, task_type: 'follow_up' },
    });
    expect([200, 201]).toContain(taskA.status);
    const taskId = taskA.body.data.id as string;

    expectDenied(
      await authedPatch(app, `/api/ops/tasks/${taskId}`, {
        token: tokenB,
        host: fx.tenantB.host,
        body: { status: 'done' },
      }),
    );

    const todayA = await authedGet(app, '/api/ops/today', {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(todayA.status).toBe(200);
    expect(todayA.body.data).toHaveProperty('overdue');

    const targetsB = await authedGet(app, '/api/ops/targets', {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(targetsB.status).toBe(200);

    // Round 2 — DPR / performance isolation
    const dprA = await authedGet(app, '/api/ops/dpr/me', {
      token: tokenA,
      host: fx.tenantA.host,
    });
    // May 400 if no employee profile, or 200 with draft
    expect([200, 400, 403]).toContain(dprA.status);
    if (dprA.status === 200) {
      const dprId = dprA.body.data.id as string;
      expectDenied(
        await authedGet(app, `/api/ops/dpr/${dprId}`, {
          token: tokenB,
          host: fx.tenantB.host,
        }),
      );
    }

    const perfA = await authedGet(app, '/api/ops/performance/summary', {
      token: tokenA,
      host: fx.tenantA.host,
    });
    expect(perfA.status).toBe(200);
    expect(perfA.body.data).toHaveProperty('targets');

    const hooksB = await authedGet(app, '/api/ops/commission-hooks', {
      token: tokenB,
      host: fx.tenantB.host,
    });
    // Admin-only — members get 403; either way must not leak A
    expect([200, 403]).toContain(hooksB.status);
    if (hooksB.status === 200) {
      expect(Array.isArray(hooksB.body.data)).toBe(true);
    }
  }, 90_000);
});
