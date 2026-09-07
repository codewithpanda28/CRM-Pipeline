/**
 * Live isolation — Phase 5 accounting posting + tenant boundary.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getLiveCtx } from './setup';
import { authedGet, authedPost, expectDenied, signTenantToken } from './http';

describe('live accounting-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('invoice issue posts balanced journal; cross-tenant denied', async () => {
    const { app, fx } = await getLiveCtx();
    const token = signTenantToken({ userId: fx.userA.id, tenantId: fx.tenantA.id });
    const tokenB = signTenantToken({ userId: fx.userB.id, tenantId: fx.tenantB.id });

    const party = await authedPost(app, '/api/customer-parties', {
      token,
      host: fx.tenantA.host,
      body: { company_id: fx.companyA.id },
    });
    expect([200, 201]).toContain(party.status);
    const partyId = party.body.data.id as string;

    const inv = await authedPost(app, '/api/invoices', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        place_of_supply_intra: true,
        lines: [
          {
            name_snapshot: 'GL Line',
            quantity: '1',
            unit_price: '1000.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect([200, 201]).toContain(inv.status);
    const invoiceId = inv.body.data.id as string;

    const issued = await authedPost(app, `/api/invoices/${invoiceId}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(issued.status).toBe(200);

    const accounts = await authedGet(app, '/api/accounting/accounts', {
      token,
      host: fx.tenantA.host,
    });
    expect(accounts.status).toBe(200);
    expect(Array.isArray(accounts.body.data)).toBe(true);
    expect(accounts.body.data.length).toBeGreaterThanOrEqual(5);

    const journals = await authedGet(app, '/api/accounting/journals', {
      token,
      host: fx.tenantA.host,
    });
    expect(journals.status).toBe(200);
    const entries = journals.body.data as Array<{ id: string; posting_key: string; status: string }>;
    const posted = entries.find((e) => e.posting_key === `invoice.issued:${invoiceId}`);
    expect(posted).toBeTruthy();
    expect(posted!.status).toBe('posted');

    const tb = await authedGet(app, '/api/accounting/reports/trial-balance', {
      token,
      host: fx.tenantA.host,
    });
    expect(tb.status).toBe(200);
    expect(tb.body.data.balanced).toBe(true);
    expect(String(tb.body.data.disclaimer)).toMatch(/Management accounting/i);

    // Cross-tenant: B cannot see A's journal posting key
    const bJournals = await authedGet(app, '/api/accounting/journals', {
      token: tokenB,
      host: fx.tenantB.host,
    });
    expect(bJournals.status).toBe(200);
    const bEntries = (bJournals.body.data ?? []) as Array<{ posting_key: string }>;
    expect(bEntries.some((e) => e.posting_key === `invoice.issued:${invoiceId}`)).toBe(false);

    // Host spoof with B token on A host should deny
    expectDenied(
      await authedGet(app, `/api/accounting/journals/${posted!.id}`, {
        token: tokenB,
        host: fx.tenantA.host,
      }),
    );
  });
});
