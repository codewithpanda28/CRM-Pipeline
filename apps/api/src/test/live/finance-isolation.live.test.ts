import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { getLiveCtx } from './setup';
import {
  authedGet,
  authedPatch,
  authedPost,
  expectDenied,
  signTenantToken,
} from './http';

describe('live finance-isolation', () => {
  beforeAll(async () => {
    await getLiveCtx();
  }, 120_000);

  it('from-quote → issue → pay → cross-tenant deny + 360 finance', async () => {
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

    const quote = await authedPost(app, '/api/quotes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        place_of_supply_intra: true,
        lines: [
          {
            name_snapshot: 'Finance Live Line',
            quantity: '1',
            unit_price: '1000.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect(quote.status).toBe(201);
    const quoteId = quote.body.data.id as string;

    // Non-accepted quote cannot convert
    const early = await authedPost(app, `/api/invoices/from-quote/${quoteId}`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(early.status).toBe(409);

    await authedPost(app, `/api/quotes/${quoteId}/send`, { token, host: fx.tenantA.host, body: {} });
    const accepted = await authedPost(app, `/api/quotes/${quoteId}/accept`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(accepted.status).toBe(200);

    const fromQuote = await authedPost(app, `/api/invoices/from-quote/${quoteId}`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect([200, 201]).toContain(fromQuote.status);
    expect(fromQuote.body.data.status).toBe('draft');
    expect(fromQuote.body.data.total).toBe('1180.00');
    expect(fromQuote.body.data.source_quote_id).toBe(quoteId);
    expect(fromQuote.body.data.customer_party_id).toBe(partyId);
    const invoiceId = fromQuote.body.data.id as string;

    // Concurrent/repeated from-quote idempotent
    const [again1, again2] = await Promise.all([
      authedPost(app, `/api/invoices/from-quote/${quoteId}`, {
        token,
        host: fx.tenantA.host,
        body: {},
      }),
      authedPost(app, `/api/invoices/from-quote/${quoteId}`, {
        token,
        host: fx.tenantA.host,
        body: {},
      }),
    ]);
    expect(again1.status).toBe(200);
    expect(again2.status).toBe(200);
    expect(again1.body.data.id).toBe(invoiceId);
    expect(again2.body.data.id).toBe(invoiceId);

    expectDenied(
      await authedGet(app, `/api/invoices/${invoiceId}`, { token: tokenB, host: fx.tenantB.host }),
    );

    // Status PATCH blocked
    const badPatch = await authedPatch(app, `/api/invoices/${invoiceId}`, {
      token,
      host: fx.tenantA.host,
      body: { status: 'paid' },
    });
    expect(badPatch.status).toBe(400);

    const issued = await authedPost(app, `/api/invoices/${invoiceId}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe('issued');
    // Tenant seller branding frozen at issue (World 2) — never platform ThinkAIQ logo path
    const branding = issued.body.data.seller_branding_snapshot as Record<string, unknown> | undefined;
    expect(branding).toBeTruthy();
    expect(branding?.snapshotted_at).toBeTruthy();
    if (typeof branding?.logo_url === 'string') {
      expect(String(branding.logo_url)).not.toContain('/platform/branding/');
    }

    // Issued invoice commercial edit blocked
    const editIssued = await authedPatch(app, `/api/invoices/${invoiceId}`, {
      token,
      host: fx.tenantA.host,
      body: { notes: 'hack' },
    });
    expect([409, 400]).toContain(editIssued.status);

    // Repeated issue is safe
    const reIssue = await authedPost(app, `/api/invoices/${invoiceId}/issue`, {
      token,
      host: fx.tenantA.host,
      body: {},
    });
    expect(reIssue.status).toBe(200);

    // Overpayment rejected
    const over = await authedPost(app, '/api/payments', {
      token,
      host: fx.tenantA.host,
      body: { invoice_id: invoiceId, amount: '99999.00', method: 'cash' },
    });
    expect(over.status).toBe(409);

    // Concurrent partial payments must not overpay
    const [p1, p2] = await Promise.all([
      authedPost(app, '/api/payments', {
        token,
        host: fx.tenantA.host,
        body: { invoice_id: invoiceId, amount: '700.00', method: 'upi', currency: 'INR' },
      }),
      authedPost(app, '/api/payments', {
        token,
        host: fx.tenantA.host,
        body: { invoice_id: invoiceId, amount: '700.00', method: 'bank', currency: 'INR' },
      }),
    ]);
    const okPays = [p1, p2].filter((r) => r.status === 201);
    const rejectedPays = [p1, p2].filter((r) => r.status === 409);
    expect(okPays.length).toBeGreaterThanOrEqual(1);
    // At least one may succeed; if both succeed remaining must still be valid
    const afterConcurrent = await authedGet(app, `/api/invoices/${invoiceId}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(afterConcurrent.status).toBe(200);
    expect(Number(afterConcurrent.body.data.amount_due)).toBeGreaterThanOrEqual(0);
    expect(Number(afterConcurrent.body.data.amount_paid)).toBeLessThanOrEqual(
      Number(afterConcurrent.body.data.total) + 0.001,
    );
    // Together cannot exceed total
    expect(Number(afterConcurrent.body.data.amount_paid)).toBeLessThanOrEqual(1180.001);

    // Finish payment if needed
    const dueNow = Number(afterConcurrent.body.data.amount_due);
    if (dueNow > 0) {
      const payRest = await authedPost(app, '/api/payments', {
        token,
        host: fx.tenantA.host,
        body: { invoice_id: invoiceId, amount: dueNow.toFixed(2), method: 'bank' },
      });
      expect(payRest.status).toBe(201);
      expect(payRest.body.data.invoice.status).toBe('paid');
      expect(payRest.body.data.invoice.amount_due).toBe('0.00');
    }

    const paidInv = await authedGet(app, `/api/invoices/${invoiceId}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(paidInv.body.data.status).toBe('paid');

    // Refund against a payment
    const pays = await authedGet(app, `/api/payments?invoice_id=${invoiceId}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(pays.status).toBe(200);
    const paymentId = pays.body.data[0].id as string;
    const refundAmt = '50.00';
    const refund = await authedPost(app, `/api/payments/${paymentId}/refund`, {
      token,
      host: fx.tenantA.host,
      body: { amount: refundAmt, reason: 'closeout test' },
    });
    expect([200, 201]).toContain(refund.status);

    const afterRefund = await authedGet(app, `/api/invoices/${invoiceId}`, {
      token,
      host: fx.tenantA.host,
    });
    expect(Number(afterRefund.body.data.amount_due)).toBeGreaterThan(0);

    // Excess refund rejected
    const hugeRefund = await authedPost(app, `/api/payments/${paymentId}/refund`, {
      token,
      host: fx.tenantA.host,
      body: { amount: '99999.00' },
    });
    expect(hugeRefund.status).toBe(409);

    // Credit note (linked) after reopen via refund
    const cn = await authedPost(app, '/api/credit-notes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        invoice_id: invoiceId,
        place_of_supply_intra: true,
        lines: [
          {
            name_snapshot: 'Credit adjustment',
            quantity: '1',
            unit_price: '10.00',
            tax_rate: '0',
            tax_type: 'none',
          },
        ],
      },
    });
    expect(cn.status).toBe(201);

    const dn = await authedPost(app, '/api/debit-notes', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        invoice_id: invoiceId,
        place_of_supply_intra: true,
        lines: [
          {
            name_snapshot: 'Extra charge',
            quantity: '1',
            unit_price: '5.00',
            tax_rate: '0',
            tax_type: 'none',
          },
        ],
      },
    });
    expect(dn.status).toBe(201);

    expectDenied(
      await authedGet(app, `/api/credit-notes/${cn.body.data.id}`, {
        token: tokenB,
        host: fx.tenantB.host,
      }),
    );

    const vendor = await authedPost(app, '/api/vendors', {
      token,
      host: fx.tenantA.host,
      body: { display_name: `Vendor ${randomUUID().slice(0, 8)}` },
    });
    expect(vendor.status).toBe(201);

    const expense = await authedPost(app, '/api/expenses', {
      token,
      host: fx.tenantA.host,
      body: {
        vendor_id: vendor.body.data.id,
        amount: '250.00',
        tax_amount: '45.00',
        category: 'ops',
      },
    });
    expect(expense.status).toBe(201);
    expect(expense.body.data.total).toBe('295.00');

    expectDenied(
      await authedGet(app, `/api/expenses/${expense.body.data.id}`, {
        token: tokenB,
        host: fx.tenantB.host,
      }),
    );

    const aging = await authedGet(app, '/api/finance/reports/ar-aging', {
      token,
      host: fx.tenantA.host,
    });
    expect(aging.status).toBe(200);

    const sales = await authedGet(app, '/api/finance/reports/sales', {
      token,
      host: fx.tenantA.host,
    });
    expect(sales.status).toBe(200);

    const tax = await authedGet(app, '/api/finance/reports/tax', {
      token,
      host: fx.tenantA.host,
    });
    expect(tax.status).toBe(200);

    const view360 = await authedGet(app, `/api/customer-parties/${partyId}/360`, {
      token,
      host: fx.tenantA.host,
    });
    expect(view360.status).toBe(200);
    expect(view360.body.data.extensions.finance.available).toBe(true);
    expect(
      view360.body.data.extensions.finance.invoices.some((i: { id: string }) => i.id === invoiceId),
    ).toBe(true);
    expect(view360.body.data.extensions.finance.payments.length).toBeGreaterThanOrEqual(1);

    // Recurring schedule + idempotent generate
    const schedule = await authedPost(app, '/api/finance/recurring', {
      token,
      host: fx.tenantA.host,
      body: {
        customer_party_id: partyId,
        cadence: 'monthly',
        next_run_at: new Date().toISOString(),
        line_template: [
          {
            name_snapshot: 'Recurring fee',
            quantity: '1',
            unit_price: '100.00',
            tax_rate: '18',
            tax_type: 'gst',
          },
        ],
      },
    });
    expect([200, 201]).toContain(schedule.status);
    const scheduleId = schedule.body.data.id as string;

    const gen1 = await authedPost(app, '/api/finance/recurring/generate', {
      token,
      host: fx.tenantA.host,
      body: { schedule_id: scheduleId },
    });
    expect(gen1.status).toBe(200);
    const gen2 = await authedPost(app, '/api/finance/recurring/generate', {
      token,
      host: fx.tenantA.host,
      body: { schedule_id: scheduleId },
    });
    expect(gen2.status).toBe(200);

    expectDenied(
      await authedGet(app, `/api/finance/recurring/${scheduleId}`, {
        token: tokenB,
        host: fx.tenantB.host,
      }),
    );

    // Silence unused when both concurrent payments reject edge
    void rejectedPays;
  }, 120_000);
});
