/**
 * Payment + refund domain — FOR UPDATE invoice lock, balance recompute.
 */
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';
import type { PaymentMethod } from '@vencore/db';
import { parseMoneyAmount, moneyToNumber, addMoney, subMoney } from '../crm-money';
import { allocateFinanceNumber } from './numbering';
import { appendFinanceDomainEvent } from './events';
import { getFinanceProfile } from './profile';
import { recomputeInvoiceBalances } from './invoices';
import { postPaymentReceived, postPaymentRefund } from '../accounting/posting';
import { recordSecurityAudit } from '../security-audit';
import { recordCommissionHookBestEffort } from '../business-ops/commission-hooks';

export type PaymentFail =
  | 'not_found'
  | 'invoice_not_found'
  | 'currency_mismatch'
  | 'amount_exceeds_due'
  | 'invoice_not_open'
  | 'refund_exceeds'
  | 'validation';

export async function getPayment(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('payments')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

export async function createPayment(
  db: DbOrTx,
  input: {
    workspaceId: string;
    invoiceId: string;
    amount: unknown;
    currency?: string;
    payment_date?: string;
    method?: PaymentMethod;
    reference?: string | null;
    gateway_provider?: string | null;
    notes?: string | null;
    receivedBy?: string | null;
  },
): Promise<
  | { ok: true; payment: NonNullable<Awaited<ReturnType<typeof getPayment>>>; invoice: unknown }
  | { ok: false; fail: PaymentFail; message?: string }
> {
  const amount = parseMoneyAmount(input.amount);
  if (moneyToNumber(amount) <= 0) return { ok: false, fail: 'validation' };

  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', input.invoiceId)
    .where('workspace_id', '=', input.workspaceId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();

  if (!invoice) return { ok: false, fail: 'invoice_not_found' };
  if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
    return { ok: false, fail: 'invoice_not_open' };
  }

  const currency = (input.currency ?? invoice.currency).toUpperCase();
  if (currency !== String(invoice.currency).toUpperCase()) {
    return { ok: false, fail: 'currency_mismatch' };
  }

  if (moneyToNumber(amount) > moneyToNumber(String(invoice.amount_due))) {
    return { ok: false, fail: 'amount_exceeds_due' };
  }

  const profile = await getFinanceProfile(db, input.workspaceId);
  const { number } = await allocateFinanceNumber(db, input.workspaceId, 'payment', profile?.payment_prefix);
  const id = randomUUID();

  await db
    .insertInto('payments')
    .values({
      id,
      workspace_id: input.workspaceId,
      payment_number: number,
      invoice_id: invoice.id,
      customer_party_id: invoice.customer_party_id,
      amount,
      currency,
      payment_date: input.payment_date ? new Date(input.payment_date) : new Date(),
      method: input.method ?? 'other',
      reference: input.reference ?? null,
      gateway_provider: input.gateway_provider ?? null,
      status: 'succeeded',
      notes: input.notes ?? null,
      received_by: input.receivedBy ?? null,
    })
    .execute();

  await appendFinanceDomainEvent(db, {
    workspaceId: input.workspaceId,
    aggregateType: 'payment',
    aggregateId: id,
    eventType: 'finance.payment.received',
    transitionKey: number,
    data: {
      payment_id: id,
      payment_number: number,
      invoice_id: invoice.id,
      amount,
      currency,
    },
  });

  await postPaymentReceived(db, {
    workspaceId: input.workspaceId,
    paymentId: id,
    actorId: input.receivedBy,
  }).then((r) => {
    if (!r.ok) throw new Error(`ACCOUNTING_POST_FAILED:${r.fail}`);
  });
  await recordSecurityAudit(db as never, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.receivedBy ?? null,
    action: 'finance.payment.create',
    entity_type: 'payment',
    entity_id: id,
  });

  const recomputed = await recomputeInvoiceBalances(db, {
    workspaceId: input.workspaceId,
    invoiceId: invoice.id,
    lock: false,
  });

  const payment = await getPayment(db, { workspaceId: input.workspaceId, id });

  // Ops commission hook — best-effort, never blocks payment path
  try {
    let ownerUserId: string | null = input.receivedBy ?? null;
    if (invoice.deal_id) {
      const deal = await db
        .selectFrom('deals')
        .select('owner_id')
        .where('id', '=', invoice.deal_id)
        .where('workspace_id', '=', input.workspaceId)
        .executeTakeFirst();
      if (deal?.owner_id) ownerUserId = deal.owner_id;
    } else if (invoice.created_by) {
      ownerUserId = invoice.created_by;
    }
    recordCommissionHookBestEffort(db as never, {
      workspaceId: input.workspaceId,
      eventType: 'payment.succeeded',
      sourceType: 'payment',
      sourceId: id,
      ownerUserId,
      meta: {
        invoice_id: invoice.id,
        payment_number: number,
        // display refs only — no commission amount
      },
    });
  } catch {
    // never fail payment
  }

  return {
    ok: true,
    payment: payment!,
    invoice: recomputed.ok ? recomputed.invoice : invoice,
  };
}

export async function refundPayment(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    paymentId: string;
    amount: unknown;
    reason?: string | null;
    createdBy?: string | null;
  },
): Promise<
  | { ok: true; refund: unknown; payment: NonNullable<Awaited<ReturnType<typeof getPayment>>> }
  | { ok: false; fail: PaymentFail }
> {
  const payment = await db
    .selectFrom('payments')
    .selectAll()
    .where('id', '=', opts.paymentId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();

  if (!payment) return { ok: false, fail: 'not_found' };
  if (!['succeeded', 'partially_refunded'].includes(payment.status)) {
    return { ok: false, fail: 'validation' };
  }

  const refundAmount = parseMoneyAmount(opts.amount);
  if (moneyToNumber(refundAmount) <= 0) return { ok: false, fail: 'validation' };

  const prior = await sql<{ refunded: string }>`
    SELECT COALESCE(SUM(amount), 0)::text AS refunded
    FROM payment_refunds
    WHERE workspace_id = ${opts.workspaceId}::uuid
      AND payment_id = ${opts.paymentId}::uuid
      AND status = 'succeeded'
  `.execute(db);

  const priorRefunded = parseMoneyAmount(prior.rows[0]?.refunded ?? 0);
  const remaining = subMoney(String(payment.amount), priorRefunded);
  if (moneyToNumber(refundAmount) > moneyToNumber(remaining)) {
    return { ok: false, fail: 'refund_exceeds' };
  }

  // Lock invoice
  await db
    .selectFrom('invoices')
    .select('id')
    .where('id', '=', payment.invoice_id)
    .where('workspace_id', '=', opts.workspaceId)
    .forUpdate()
    .executeTakeFirst();

  const refundId = randomUUID();
  await db
    .insertInto('payment_refunds')
    .values({
      id: refundId,
      workspace_id: opts.workspaceId,
      payment_id: payment.id,
      invoice_id: payment.invoice_id,
      amount: refundAmount,
      currency: payment.currency,
      reason: opts.reason ?? null,
      status: 'succeeded',
      created_by: opts.createdBy ?? null,
    })
    .execute();

  const newPrior = addMoney(priorRefunded, refundAmount);
  const payStatus =
    moneyToNumber(newPrior) >= moneyToNumber(String(payment.amount))
      ? 'refunded'
      : 'partially_refunded';

  await db
    .updateTable('payments')
    .set({ status: payStatus, updated_at: new Date() })
    .where('id', '=', payment.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  await appendFinanceDomainEvent(db, {
    workspaceId: opts.workspaceId,
    aggregateType: 'payment',
    aggregateId: payment.id,
    eventType: 'finance.payment.refunded',
    transitionKey: `${refundId}:${refundAmount}`,
    data: {
      payment_id: payment.id,
      refund_id: refundId,
      amount: refundAmount,
      invoice_id: payment.invoice_id,
    },
  });

  await postPaymentRefund(db, {
    workspaceId: opts.workspaceId,
    refundId,
    actorId: opts.createdBy,
  }).then((r) => {
    if (!r.ok) throw new Error(`ACCOUNTING_POST_FAILED:${r.fail}`);
  });
  await recordSecurityAudit(db as never, {
    tenant_id: opts.workspaceId,
    actor_type: 'user',
    actor_id: opts.createdBy ?? null,
    action: 'finance.payment.refund',
    entity_type: 'payment_refund',
    entity_id: refundId,
  });

  await recomputeInvoiceBalances(db, {
    workspaceId: opts.workspaceId,
    invoiceId: payment.invoice_id,
  });

  const updated = await getPayment(db, { workspaceId: opts.workspaceId, id: payment.id });
  const refund = await db
    .selectFrom('payment_refunds')
    .selectAll()
    .where('id', '=', refundId)
    .executeTakeFirst();

  return { ok: true, refund, payment: updated! };
}
