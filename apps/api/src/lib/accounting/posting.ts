/**
 * Posting adapters — commercial Finance events → GL journals.
 * Never mutates invoices/payments/CN/DN/expenses.
 */
import type { DbOrTx } from '@vencore/events';
import { moneyToNumber } from '../crm-money';
import { getControlAccount } from './accounts';
import { postJournal, type JournalFail } from './journals';

function todayIso(d?: Date | string | null): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export async function postInvoiceIssued(
  db: DbOrTx,
  opts: { workspaceId: string; invoiceId: string; actorId?: string | null },
): Promise<{ ok: true; idempotent?: boolean } | { ok: false; fail: JournalFail }> {
  const inv = await db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', opts.invoiceId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!inv) return { ok: false, fail: 'not_found' };
  if (!['issued', 'partially_paid', 'paid', 'overdue'].includes(inv.status)) {
    return { ok: true, idempotent: true };
  }

  const ar = await getControlAccount(db, opts.workspaceId, 'accounts_receivable');
  const revenue = await getControlAccount(db, opts.workspaceId, 'revenue');
  const tax = await getControlAccount(db, opts.workspaceId, 'tax_payable');

  const total = String(inv.total);
  const taxAmt = String(inv.tax_amount);
  const revenueAmt = String(inv.taxable_amount ?? inv.subtotal);

  const lines = [
    {
      account_id: ar.id,
      debit: total,
      credit: '0.00',
      description: `AR ${inv.invoice_number}`,
      party_type: 'customer_party',
      party_id: inv.customer_party_id,
    },
    {
      account_id: revenue.id,
      debit: '0.00',
      credit: revenueAmt,
      description: `Revenue ${inv.invoice_number}`,
    },
  ];
  if (moneyToNumber(taxAmt) > 0) {
    lines.push({
      account_id: tax.id,
      debit: '0.00',
      credit: taxAmt,
      description: `Tax ${inv.invoice_number}`,
    });
  }

  const res = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: todayIso(inv.issue_date),
    memo: `Invoice issued ${inv.invoice_number}`,
    sourceType: 'invoice',
    sourceId: inv.id,
    postingKey: `invoice.issued:${inv.id}`,
    currency: inv.currency,
    actorId: opts.actorId,
    lines,
  });
  if (!res.ok) return res;
  return { ok: true, idempotent: res.idempotent };
}

export async function postPaymentReceived(
  db: DbOrTx,
  opts: { workspaceId: string; paymentId: string; actorId?: string | null },
): Promise<{ ok: true; idempotent?: boolean } | { ok: false; fail: JournalFail }> {
  const pay = await db
    .selectFrom('payments')
    .selectAll()
    .where('id', '=', opts.paymentId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!pay) return { ok: false, fail: 'not_found' };

  const bankKey = pay.method === 'cash' ? 'cash' : 'bank';
  const cash = await getControlAccount(db, opts.workspaceId, bankKey);
  const ar = await getControlAccount(db, opts.workspaceId, 'accounts_receivable');

  const inv = await db
    .selectFrom('invoices')
    .select(['customer_party_id', 'invoice_number'])
    .where('id', '=', pay.invoice_id)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();

  const res = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: todayIso(pay.payment_date),
    memo: `Payment ${pay.payment_number}`,
    sourceType: 'payment',
    sourceId: pay.id,
    postingKey: `payment.received:${pay.id}`,
    currency: pay.currency,
    actorId: opts.actorId,
    lines: [
      {
        account_id: cash.id,
        debit: String(pay.amount),
        credit: '0.00',
        description: `Payment ${pay.payment_number}`,
      },
      {
        account_id: ar.id,
        debit: '0.00',
        credit: String(pay.amount),
        description: `AR clear ${inv?.invoice_number ?? pay.invoice_id}`,
        party_type: 'customer_party',
        party_id: inv?.customer_party_id ?? null,
      },
    ],
  });
  if (!res.ok) return res;
  return { ok: true, idempotent: res.idempotent };
}

export async function postPaymentRefund(
  db: DbOrTx,
  opts: { workspaceId: string; refundId: string; actorId?: string | null },
): Promise<{ ok: true; idempotent?: boolean } | { ok: false; fail: JournalFail }> {
  const refund = await db
    .selectFrom('payment_refunds')
    .selectAll()
    .where('id', '=', opts.refundId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!refund) return { ok: false, fail: 'not_found' };

  const pay = await db
    .selectFrom('payments')
    .selectAll()
    .where('id', '=', refund.payment_id)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!pay) return { ok: false, fail: 'not_found' };

  const bankKey = pay.method === 'cash' ? 'cash' : 'bank';
  const cash = await getControlAccount(db, opts.workspaceId, bankKey);
  const ar = await getControlAccount(db, opts.workspaceId, 'accounts_receivable');

  const res = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: todayIso(refund.refund_date ?? refund.created_at),
    memo: `Refund ${refund.id}`,
    sourceType: 'payment_refund',
    sourceId: refund.id,
    postingKey: `payment.refunded:${refund.id}`,
    currency: pay.currency,
    actorId: opts.actorId,
    lines: [
      {
        account_id: ar.id,
        debit: String(refund.amount),
        credit: '0.00',
        description: 'Refund restores AR',
      },
      {
        account_id: cash.id,
        debit: '0.00',
        credit: String(refund.amount),
        description: 'Refund from cash/bank',
      },
    ],
  });
  if (!res.ok) return res;
  return { ok: true, idempotent: res.idempotent };
}

export async function postCreditNote(
  db: DbOrTx,
  opts: { workspaceId: string; creditNoteId: string; actorId?: string | null },
): Promise<{ ok: true; idempotent?: boolean } | { ok: false; fail: JournalFail }> {
  const cn = await db
    .selectFrom('credit_notes')
    .selectAll()
    .where('id', '=', opts.creditNoteId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!cn) return { ok: false, fail: 'not_found' };

  const ar = await getControlAccount(db, opts.workspaceId, 'accounts_receivable');
  const revenue = await getControlAccount(db, opts.workspaceId, 'revenue');
  const tax = await getControlAccount(db, opts.workspaceId, 'tax_payable');

  const taxAmt = String(cn.tax_amount);
  const revAmt = String(cn.taxable_amount ?? cn.subtotal);
  const total = String(cn.total);

  const lines = [
    {
      account_id: revenue.id,
      debit: revAmt,
      credit: '0.00',
      description: `CN revenue ${cn.credit_note_number}`,
    },
    ...(moneyToNumber(taxAmt) > 0
      ? [
          {
            account_id: tax.id,
            debit: taxAmt,
            credit: '0.00',
            description: `CN tax ${cn.credit_note_number}`,
          },
        ]
      : []),
    {
      account_id: ar.id,
      debit: '0.00',
      credit: total,
      description: `CN AR ${cn.credit_note_number}`,
      party_type: 'customer_party',
      party_id: cn.customer_party_id,
    },
  ];

  const res = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: todayIso(cn.issue_date ?? cn.created_at),
    memo: `Credit note ${cn.credit_note_number}`,
    sourceType: 'credit_note',
    sourceId: cn.id,
    postingKey: `credit_note.created:${cn.id}`,
    currency: cn.currency,
    actorId: opts.actorId,
    lines,
  });
  if (!res.ok) return res;
  return { ok: true, idempotent: res.idempotent };
}

export async function postDebitNote(
  db: DbOrTx,
  opts: { workspaceId: string; debitNoteId: string; actorId?: string | null },
): Promise<{ ok: true; idempotent?: boolean } | { ok: false; fail: JournalFail }> {
  const dn = await db
    .selectFrom('debit_notes')
    .selectAll()
    .where('id', '=', opts.debitNoteId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!dn) return { ok: false, fail: 'not_found' };

  const ar = await getControlAccount(db, opts.workspaceId, 'accounts_receivable');
  const revenue = await getControlAccount(db, opts.workspaceId, 'revenue');
  const tax = await getControlAccount(db, opts.workspaceId, 'tax_payable');

  const taxAmt = String(dn.tax_amount);
  const revAmt = String(dn.taxable_amount ?? dn.subtotal);
  const total = String(dn.total);

  const lines = [
    {
      account_id: ar.id,
      debit: total,
      credit: '0.00',
      description: `DN AR ${dn.debit_note_number}`,
      party_type: 'customer_party',
      party_id: dn.customer_party_id,
    },
    {
      account_id: revenue.id,
      debit: '0.00',
      credit: revAmt,
      description: `DN revenue ${dn.debit_note_number}`,
    },
    ...(moneyToNumber(taxAmt) > 0
      ? [
          {
            account_id: tax.id,
            debit: '0.00',
            credit: taxAmt,
            description: `DN tax ${dn.debit_note_number}`,
          },
        ]
      : []),
  ];

  const res = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: todayIso(dn.issue_date ?? dn.created_at),
    memo: `Debit note ${dn.debit_note_number}`,
    sourceType: 'debit_note',
    sourceId: dn.id,
    postingKey: `debit_note.created:${dn.id}`,
    currency: dn.currency,
    actorId: opts.actorId,
    lines,
  });
  if (!res.ok) return res;
  return { ok: true, idempotent: res.idempotent };
}

export async function postExpense(
  db: DbOrTx,
  opts: { workspaceId: string; expenseId: string; actorId?: string | null },
): Promise<{ ok: true; idempotent?: boolean } | { ok: false; fail: JournalFail }> {
  const exp = await db
    .selectFrom('expenses')
    .selectAll()
    .where('id', '=', opts.expenseId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!exp) return { ok: false, fail: 'not_found' };

  const expenseAcct = await getControlAccount(db, opts.workspaceId, 'expense');
  const unpaid = String(exp.payment_status ?? '') === 'unpaid';
  const creditAcct = await getControlAccount(
    db,
    opts.workspaceId,
    unpaid && exp.vendor_id ? 'accounts_payable' : 'bank',
  );

  const amount = String(exp.total ?? exp.amount);

  const res = await postJournal(db, {
    workspaceId: opts.workspaceId,
    entryDate: todayIso(exp.expense_date ?? exp.created_at),
    memo: `Expense ${exp.expense_number}`,
    sourceType: 'expense',
    sourceId: exp.id,
    postingKey: `expense.created:${exp.id}`,
    currency: exp.currency,
    actorId: opts.actorId,
    lines: [
      {
        account_id: expenseAcct.id,
        debit: amount,
        credit: '0.00',
        description: exp.notes ?? exp.category ?? exp.expense_number,
      },
      {
        account_id: creditAcct.id,
        debit: '0.00',
        credit: amount,
        description: `Expense credit ${exp.expense_number}`,
        party_type: exp.vendor_id ? 'vendor' : null,
        party_id: exp.vendor_id,
      },
    ],
  });
  if (!res.ok) return res;
  return { ok: true, idempotent: res.idempotent };
}

/** Dispatch from finance.record outbox payload (idempotent catch-up). */
export async function handleFinancePostingEvent(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    eventType: string;
    data: Record<string, unknown>;
  },
): Promise<void> {
  const data = opts.data;
  const fail = (res: { ok: true } | { ok: false; fail: string }) => {
    if (!res.ok) throw new Error(`ACCOUNTING_POST_FAILED:${res.fail}`);
  };

  switch (opts.eventType) {
    case 'finance.invoice.issued':
      fail(
        await postInvoiceIssued(db, {
          workspaceId: opts.workspaceId,
          invoiceId: String(data['invoice_id'] ?? data['aggregate_id'] ?? ''),
        }),
      );
      break;
    case 'finance.invoice.voided': {
      const invoiceId = String(data['invoice_id'] ?? data['aggregate_id'] ?? '');
      const posted = await db
        .selectFrom('journal_entries')
        .select(['id'])
        .where('workspace_id', '=', opts.workspaceId)
        .where('posting_key', '=', `invoice.issued:${invoiceId}`)
        .where('status', '=', 'posted')
        .executeTakeFirst();
      if (posted) {
        const { reverseJournal } = await import('./journals');
        const rev = await reverseJournal(db, {
          workspaceId: opts.workspaceId,
          entryId: posted.id,
          memo: `Void catch-up ${invoiceId}`,
        });
        if (!rev.ok && rev.fail !== 'already_reversed') {
          throw new Error(`ACCOUNTING_REVERSE_FAILED:${rev.fail}`);
        }
      }
      break;
    }
    case 'finance.payment.received':
      fail(
        await postPaymentReceived(db, {
          workspaceId: opts.workspaceId,
          paymentId: String(data['payment_id'] ?? ''),
        }),
      );
      break;
    case 'finance.payment.refunded':
      fail(
        await postPaymentRefund(db, {
          workspaceId: opts.workspaceId,
          refundId: String(data['refund_id'] ?? ''),
        }),
      );
      break;
    case 'finance.credit_note.created':
      fail(
        await postCreditNote(db, {
          workspaceId: opts.workspaceId,
          creditNoteId: String(data['credit_note_id'] ?? ''),
        }),
      );
      break;
    case 'finance.debit_note.created':
      fail(
        await postDebitNote(db, {
          workspaceId: opts.workspaceId,
          debitNoteId: String(data['debit_note_id'] ?? ''),
        }),
      );
      break;
    case 'finance.expense.created':
      fail(
        await postExpense(db, {
          workspaceId: opts.workspaceId,
          expenseId: String(data['expense_id'] ?? ''),
        }),
      );
      break;
    default:
      break;
  }
}
