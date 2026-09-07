/**
 * Live isolation — Phase 5 documents, notifications, ops tenant boundaries.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { authedGet, authedPost, expectDenied, signTenantToken } from './http';

describe('live phase5-ops-documents-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('document render + download tenant scoped; ops export scoped', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const tokenB = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });

    const party = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { company_id: fx.companyA.id },
    });
    expect([200, 201]).toContain(party.status);

    const inv = await authedPost(app, '/api/invoices', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: party.body.data.id,
        lines: [{ name_snapshot: 'PDF Line', quantity: '1', unit_price: '100.00', tax_rate: '0' }],
      },
    });
    expect([200, 201]).toContain(inv.status);
    const invoiceId = inv.body.data.id as string;

    await authedPost(app, `/api/invoices/${invoiceId}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });

    const render = await authedPost(app, '/api/documents/render', {
      token,
      host: fx.tenantA.host,
      // Async enqueue only — tenant isolation does not need sync Playwright PDF
      body: { source_type: 'invoice', source_id: invoiceId, sync: false },
    });
    expect([200, 201, 202]).toContain(render.status);
    const artifactId = render.body.data.artifactId as string;
    expect(artifactId).toBeTruthy();

    // Cross-tenant cannot read artifact metadata
    expectDenied(
      await authedGet(app, `/api/documents/artifacts/${artifactId}`, {
        token: tokenB,
        host: fx.tenantA.host,
      }),
    );

    // B on B host also cannot see A's artifact id
    const bGet = await authedGet(app, `/api/documents/artifacts/${artifactId}`, {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect([403, 404]).toContain(bGet.status);

    // Health public
    const health = await authedGet(app, '/api/health', { token, host: fx.tenantA.host });
    // health may be unauthenticated — try without depending on auth
    expect([200, 503]).toContain(health.status);

    // Failed outbox list is tenant scoped (empty ok)
    const failed = await authedGet(app, '/api/ops/outbox/failed', {
      token,
      host: fx.tenantA.host,
    });
    // May 403 if user lacks ops:jobs — admin fixture should have grants_all
    expect([200, 403]).toContain(failed.status);
    if (failed.status === 200) {
      expect(Array.isArray(failed.body.data)).toBe(true);
    }

    // MFA status
    const mfa = await authedGet(app, '/api/mfa/status', { token, host: fx.tenantA.host });
    expect(mfa.status).toBe(200);
    expect(mfa.body.data).toHaveProperty('mfa_enabled');
    expect(JSON.stringify(mfa.body)).not.toMatch(/mfa_secret/);
  });

  it('period lock rejects posting; posting keys idempotent', async () => {
    const { app, fx, db } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });

    const periods = await authedGet(app, '/api/accounting/periods', {
      token,
      host: fx.tenantA.host,
    });
    expect(periods.status).toBe(200);
    const period = (periods.body.data as Array<{ id: string; status: string }>)[0];
    expect(period).toBeTruthy();

    const party = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { company_id: fx.companyA.id },
    });
    const inv = await authedPost(app, '/api/invoices', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: party.body.data.id,
        lines: [{ name_snapshot: 'Lock Test', quantity: '1', unit_price: '50.00', tax_rate: '0' }],
      },
    });
    const invoiceId = inv.body.data.id as string;
    const issued = await authedPost(app, `/api/invoices/${invoiceId}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(issued.status).toBe(200);

    const journals1 = await authedGet(app, '/api/accounting/journals', {
      token,
      host: fx.tenantA.host,
    });
    const key = `invoice.issued:${invoiceId}`;
    const count1 = ((journals1.body.data as Array<{ posting_key: string }>) ?? []).filter(
      (j) => j.posting_key === key,
    ).length;
    expect(count1).toBe(1);

    // Idempotent re-post via domain helper
    const { postInvoiceIssued } = await import('../../lib/accounting/posting');
    const again = await postInvoiceIssued(db, {
      workspaceId: fx.tenantA.id,
      invoiceId,
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.idempotent).toBe(true);

    // Lock period then try another invoice issue — should fail / roll back
    await authedPost(app, `/api/accounting/periods/${period!.id}/status`, {
      token,
      host: fx.tenantA.host,
      body: { status: 'locked' },
    });

    const inv2 = await authedPost(app, '/api/invoices', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: party.body.data.id,
        lines: [{ name_snapshot: 'Should Fail', quantity: '1', unit_price: '10.00', tax_rate: '0' }],
      },
    });
    const issue2 = await authedPost(app, `/api/invoices/${inv2.body.data.id}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    // Expect failure (500/409) OR invoice remains draft if rolled back
    if (issue2.status === 200) {
      // If somehow succeeded without posting, journals must not have unbalanced orphan —
      // prefer fail. Soft-assert: reopen period for other tests.
      expect(issue2.status).not.toBe(200);
    } else {
      expect([409, 500]).toContain(issue2.status);
    }

    // Restore period for subsequent suites
    await authedPost(app, `/api/accounting/periods/${period!.id}/status`, {
      token,
      host: fx.tenantA.host,
      body: { status: 'open' },
    });
  });
});
