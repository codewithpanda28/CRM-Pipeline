/**
 * Invoice domain — create/update draft/from-quote/issue/cancel/void + balance recompute.
 */
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';
import type { InvoiceStatus } from '@vencore/db';
import { getCustomerParty } from '../customer-parties';
import { normalizeCurrency, DEFAULT_CURRENCY, parseMoneyAmount, moneyToNumber, addMoney, subMoney } from '../crm-money';
import { computeDocumentTotals, type LineInput } from './tax';
import { allocateFinanceNumber } from './numbering';
import { appendFinanceDomainEvent } from './events';
import { postInvoiceIssued } from '../accounting/posting';
import { reverseJournal } from '../accounting/journals';
import { recordSecurityAudit } from '../security-audit';
import { getFinanceProfile } from './profile';
import { getQuote, getQuoteLines } from '../quotes';
import { buildBuyerSnapshots, buildSellerBrandingSnapshot } from './seller-branding';

export type InvoiceFail =
  | 'not_found'
  | 'validation'
  | 'party_invalid'
  | 'product_invalid'
  | 'not_draft'
  | 'immutable'
  | 'invalid_transition'
  | 'quote_not_found'
  | 'quote_not_accepted'
  | 'quote_invalid'
  | 'accounting_failed';

const OPEN_STATUSES: InvoiceStatus[] = ['issued', 'partially_paid', 'paid', 'overdue'];

export async function getInvoice(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; includeDeleted?: boolean },
) {
  let q = db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId);
  if (!opts.includeDeleted) q = q.where('deleted_at', 'is', null);
  return q.executeTakeFirst() ?? null;
}

export async function getInvoiceLines(db: DbOrTx, opts: { workspaceId: string; invoiceId: string }) {
  return db
    .selectFrom('invoice_line_items')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('invoice_id', '=', opts.invoiceId)
    .orderBy('position', 'asc')
    .execute();
}

async function loadLineProducts(
  db: DbOrTx,
  workspaceId: string,
  lines: LineInput[],
): Promise<{ ok: true; lines: LineInput[] } | { ok: false; fail: InvoiceFail }> {
  const out: LineInput[] = [];
  for (const line of lines) {
    if (!line.product_id) {
      if (!line.name_snapshot?.trim()) return { ok: false, fail: 'validation' };
      out.push({ ...line, _product: null });
      continue;
    }
    const product = await db
      .selectFrom('products')
      .selectAll()
      .where('id', '=', line.product_id)
      .where('workspace_id', '=', workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!product) return { ok: false, fail: 'product_invalid' };
    out.push({
      ...line,
      _product: {
        sku: product.sku,
        name: product.name,
        description: product.description,
        unit: product.unit,
        list_price: String(product.list_price),
      },
    });
  }
  return { ok: true, lines: out };
}

async function replaceInvoiceLines(
  db: DbOrTx,
  opts: { workspaceId: string; invoiceId: string; lines: ReturnType<typeof computeDocumentTotals>['lines'] },
) {
  await db
    .deleteFrom('invoice_line_items')
    .where('invoice_id', '=', opts.invoiceId)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  if (!opts.lines.length) return;

  await db
    .insertInto('invoice_line_items')
    .values(
      opts.lines.map((l) => ({
        workspace_id: opts.workspaceId,
        invoice_id: opts.invoiceId,
        position: l.position,
        product_id: l.product_id,
        sku_snapshot: l.sku_snapshot,
        name_snapshot: l.name_snapshot,
        description_snapshot: l.description_snapshot,
        unit_snapshot: l.unit_snapshot,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        discount_percent: l.discount_percent,
        taxable_amount: l.taxable_amount,
        tax_rate: l.tax_rate,
        tax_amount: l.tax_amount,
        line_total: l.line_total,
        tax_type: l.tax_type,
        tax_breakup: l.tax_breakup,
        hsn_sac: l.hsn_sac,
        custom_fields: l.custom_fields,
      })),
    )
    .execute();
}

function deriveInvoiceStatus(
  current: InvoiceStatus,
  amountDue: string,
  dueDate: Date | null,
): InvoiceStatus {
  if (current === 'void' || current === 'cancelled' || current === 'draft') return current;
  const due = moneyToNumber(amountDue);
  if (due <= 0) return 'paid';
  const paidSomething = due > 0 && current !== 'issued';
  if (dueDate && dueDate < new Date() && due > 0) {
    // keep overdue if past due
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dueDate < today) return 'overdue';
  }
  // Check if any payment made: if amount_due < total conceptually — caller passes remaining
  // We use partially_paid when amount_due > 0 and we've collected something.
  // Caller should pass hasPayments flag via comparing — we derive simply:
  if (current === 'paid' || current === 'partially_paid' || current === 'overdue' || current === 'issued') {
    // If still due and was issued/partial/overdue
    // partially_paid if amount_paid > 0 — handled by caller with amountPaid
  }
  return current === 'issued' || current === 'partially_paid' || current === 'overdue' || current === 'paid'
    ? current
    : 'issued';
}

/**
 * Recompute amount_paid / amount_due / status from payments + refunds + applied credit notes.
 * Locks invoice row with FOR UPDATE when called inside a payment TX.
 */
export async function recomputeInvoiceBalances(
  db: DbOrTx,
  opts: { workspaceId: string; invoiceId: string; lock?: boolean },
): Promise<{ ok: true; invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>> } | { ok: false; fail: InvoiceFail }> {
  let q = db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', opts.invoiceId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null);
  if (opts.lock) q = q.forUpdate();
  const invoice = await q.executeTakeFirst();
  if (!invoice) return { ok: false, fail: 'not_found' };

  if (invoice.status === 'void' || invoice.status === 'cancelled' || invoice.status === 'draft') {
    return { ok: true, invoice };
  }

  const payAgg = await sql<{ paid: string }>`
    SELECT COALESCE(SUM(amount), 0)::text AS paid
    FROM payments
    WHERE workspace_id = ${opts.workspaceId}::uuid
      AND invoice_id = ${opts.invoiceId}::uuid
      AND deleted_at IS NULL
      AND status IN ('succeeded', 'partially_refunded', 'refunded')
  `.execute(db);

  const refundAgg = await sql<{ refunded: string }>`
    SELECT COALESCE(SUM(amount), 0)::text AS refunded
    FROM payment_refunds
    WHERE workspace_id = ${opts.workspaceId}::uuid
      AND invoice_id = ${opts.invoiceId}::uuid
      AND status = 'succeeded'
  `.execute(db);

  const creditAgg = await sql<{ applied: string }>`
    SELECT COALESCE(SUM(applied_amount), 0)::text AS applied
    FROM credit_notes
    WHERE workspace_id = ${opts.workspaceId}::uuid
      AND invoice_id = ${opts.invoiceId}::uuid
      AND deleted_at IS NULL
      AND status = 'issued'
  `.execute(db);

  const grossPaid = parseMoneyAmount(payAgg.rows[0]?.paid ?? 0);
  const refunded = parseMoneyAmount(refundAgg.rows[0]?.refunded ?? 0);
  const credits = parseMoneyAmount(creditAgg.rows[0]?.applied ?? 0);
  // amount_paid = payments - refunds + applied credits (credits reduce amount_due)
  const amountPaid = addMoney(subMoney(grossPaid, refunded), credits);
  let amountDue = subMoney(String(invoice.total), amountPaid);
  if (moneyToNumber(amountDue) < 0) amountDue = '0.00';

  let status: InvoiceStatus = invoice.status;
  const prevStatus = invoice.status;
  if (moneyToNumber(amountDue) <= 0) {
    status = 'paid';
  } else if (moneyToNumber(amountPaid) > 0) {
    status = 'partially_paid';
  } else if (invoice.due_date) {
    const due = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    status = due < today ? 'overdue' : 'issued';
  } else {
    status = 'issued';
  }

  // silence unused
  void deriveInvoiceStatus;

  await db
    .updateTable('invoices')
    .set({
      amount_paid: amountPaid,
      amount_due: amountDue,
      status,
      updated_at: new Date(),
      ...(status === 'overdue' && !invoice.overdue_at ? { overdue_at: new Date() } : {}),
    })
    .where('id', '=', opts.invoiceId)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  if (status !== prevStatus) {
    const eventMap: Partial<Record<InvoiceStatus, Parameters<typeof appendFinanceDomainEvent>[1]['eventType']>> = {
      partially_paid: 'finance.invoice.partially_paid',
      paid: 'finance.invoice.paid',
      overdue: 'finance.invoice.overdue',
    };
    const et = eventMap[status];
    if (et) {
      await appendFinanceDomainEvent(db, {
        workspaceId: opts.workspaceId,
        aggregateType: 'invoice',
        aggregateId: opts.invoiceId,
        eventType: et,
        transitionKey: `${prevStatus}->${status}:${amountPaid}`,
        data: { invoice_id: opts.invoiceId, from_status: prevStatus, to_status: status, amount_paid: amountPaid, amount_due: amountDue },
      });
    }
  }

  const updated = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.invoiceId });
  return { ok: true, invoice: updated! };
}

export async function createInvoice(
  db: DbOrTx,
  input: {
    workspaceId: string;
    createdBy?: string | null;
    customer_party_id: string;
    contact_id?: string | null;
    company_id?: string | null;
    deal_id?: string | null;
    issue_date?: string;
    due_date?: string | null;
    currency?: string;
    discount_total?: unknown;
    place_of_supply?: string | null;
    place_of_supply_intra?: boolean | null;
    payment_terms?: string | null;
    notes?: string | null;
    terms?: string | null;
    custom_fields?: Record<string, unknown>;
    lines?: LineInput[];
  },
): Promise<
  | { ok: true; invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>; lines: Awaited<ReturnType<typeof getInvoiceLines>> }
  | { ok: false; fail: InvoiceFail }
> {
  const party = await getCustomerParty(db, { workspaceId: input.workspaceId, id: input.customer_party_id });
  if (!party || party.status === 'merged') return { ok: false, fail: 'party_invalid' };

  const loaded = await loadLineProducts(db, input.workspaceId, input.lines ?? []);
  if (!loaded.ok) return loaded;

  const totals = computeDocumentTotals(loaded.lines, {
    documentDiscount: input.discount_total,
    placeOfSupply: input.place_of_supply,
    placeOfSupplyIntra: input.place_of_supply_intra ?? null,
  });

  const profile = await getFinanceProfile(db, input.workspaceId);
  const { number } = await allocateFinanceNumber(
    db,
    input.workspaceId,
    'invoice',
    profile?.invoice_prefix,
  );

  const id = randomUUID();
  const currency = normalizeCurrency(input.currency ?? profile?.default_currency ?? DEFAULT_CURRENCY);
  const partySnapshot: Record<string, unknown> = {
    customer_party_id: party.id,
    party_type: party.party_type,
    display_name: party.display_name,
    contact_id: input.contact_id ?? null,
    company_id: input.company_id ?? null,
  };

  await db
    .insertInto('invoices')
    .values({
      id,
      workspace_id: input.workspaceId,
      invoice_number: number,
      status: 'draft',
      customer_party_id: party.id,
      contact_id: input.contact_id ?? null,
      company_id: input.company_id ?? null,
      deal_id: input.deal_id ?? null,
      issue_date: input.issue_date ? new Date(input.issue_date) : new Date(),
      due_date: input.due_date ? new Date(input.due_date) : null,
      currency,
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      taxable_amount: totals.taxable_amount,
      tax_amount: totals.tax_amount,
      total: totals.total,
      amount_paid: '0.00',
      amount_due: totals.total,
      tax_breakup: totals.tax_breakup,
      place_of_supply: input.place_of_supply ?? null,
      seller_gstin_snapshot: profile?.gstin ?? null,
      party_snapshot: partySnapshot,
      payment_terms: input.payment_terms ?? profile?.default_payment_terms ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      custom_fields: input.custom_fields ?? {},
      created_by: input.createdBy ?? null,
    })
    .execute();

  await replaceInvoiceLines(db, { workspaceId: input.workspaceId, invoiceId: id, lines: totals.lines });

  await appendFinanceDomainEvent(db, {
    workspaceId: input.workspaceId,
    aggregateType: 'invoice',
    aggregateId: id,
    eventType: 'finance.invoice.created',
    transitionKey: number,
    data: { invoice_id: id, invoice_number: number },
  });

  const invoice = await getInvoice(db, { workspaceId: input.workspaceId, id });
  const lines = await getInvoiceLines(db, { workspaceId: input.workspaceId, invoiceId: id });
  return { ok: true, invoice: invoice!, lines };
}

export async function updateDraftInvoice(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    patch: {
      contact_id?: string | null;
      company_id?: string | null;
      deal_id?: string | null;
      issue_date?: string;
      due_date?: string | null;
      currency?: string;
      discount_total?: unknown;
      place_of_supply?: string | null;
      place_of_supply_intra?: boolean | null;
      payment_terms?: string | null;
      notes?: string | null;
      terms?: string | null;
      custom_fields?: Record<string, unknown>;
      lines?: LineInput[];
    };
  },
): Promise<
  | { ok: true; invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>; lines: Awaited<ReturnType<typeof getInvoiceLines>> }
  | { ok: false; fail: InvoiceFail }
> {
  const invoice = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!invoice) return { ok: false, fail: 'not_found' };
  if (invoice.status !== 'draft') return { ok: false, fail: 'not_draft' };

  let totals = {
    subtotal: String(invoice.subtotal),
    discount_total: String(invoice.discount_total),
    taxable_amount: String(invoice.taxable_amount),
    tax_amount: String(invoice.tax_amount),
    total: String(invoice.total),
    tax_breakup: invoice.tax_breakup as Record<string, unknown>,
    lines: [] as ReturnType<typeof computeDocumentTotals>['lines'],
  };

  if (opts.patch.lines) {
    const loaded = await loadLineProducts(db, opts.workspaceId, opts.patch.lines);
    if (!loaded.ok) return loaded;
    totals = computeDocumentTotals(loaded.lines, {
      documentDiscount: opts.patch.discount_total ?? invoice.discount_total,
      placeOfSupply: opts.patch.place_of_supply ?? invoice.place_of_supply,
      placeOfSupplyIntra: opts.patch.place_of_supply_intra ?? null,
    });
    await replaceInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id, lines: totals.lines });
  } else if (opts.patch.discount_total !== undefined) {
    const existingLines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id });
    totals = computeDocumentTotals(
      existingLines.map((l) => ({
        product_id: l.product_id,
        sku_snapshot: l.sku_snapshot,
        name_snapshot: l.name_snapshot,
        description_snapshot: l.description_snapshot,
        unit_snapshot: l.unit_snapshot,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        discount_percent: l.discount_percent,
        tax_rate: l.tax_rate,
        tax_type: l.tax_type,
        tax_breakup: l.tax_breakup as Record<string, unknown>,
        hsn_sac: l.hsn_sac,
      })),
      {
        documentDiscount: opts.patch.discount_total,
        placeOfSupply: opts.patch.place_of_supply ?? invoice.place_of_supply,
        placeOfSupplyIntra: opts.patch.place_of_supply_intra ?? null,
      },
    );
    await replaceInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id, lines: totals.lines });
  }

  await db
    .updateTable('invoices')
    .set({
      ...(opts.patch.contact_id !== undefined ? { contact_id: opts.patch.contact_id } : {}),
      ...(opts.patch.company_id !== undefined ? { company_id: opts.patch.company_id } : {}),
      ...(opts.patch.deal_id !== undefined ? { deal_id: opts.patch.deal_id } : {}),
      ...(opts.patch.issue_date !== undefined ? { issue_date: new Date(opts.patch.issue_date) } : {}),
      ...(opts.patch.due_date !== undefined
        ? { due_date: opts.patch.due_date ? new Date(opts.patch.due_date) : null }
        : {}),
      ...(opts.patch.currency !== undefined ? { currency: normalizeCurrency(opts.patch.currency) } : {}),
      ...(opts.patch.lines || opts.patch.discount_total !== undefined
        ? {
            subtotal: totals.subtotal,
            discount_total: totals.discount_total,
            taxable_amount: totals.taxable_amount,
            tax_amount: totals.tax_amount,
            total: totals.total,
            amount_due: totals.total,
            tax_breakup: totals.tax_breakup,
          }
        : {}),
      ...(opts.patch.place_of_supply !== undefined ? { place_of_supply: opts.patch.place_of_supply } : {}),
      ...(opts.patch.payment_terms !== undefined ? { payment_terms: opts.patch.payment_terms } : {}),
      ...(opts.patch.notes !== undefined ? { notes: opts.patch.notes } : {}),
      ...(opts.patch.terms !== undefined ? { terms: opts.patch.terms } : {}),
      ...(opts.patch.custom_fields !== undefined ? { custom_fields: opts.patch.custom_fields } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  const updated = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id });
  return { ok: true, invoice: updated!, lines };
}

/** Idempotent: accepted quote → DRAFT invoice (D1). */
export async function createInvoiceFromQuote(
  db: DbOrTx,
  opts: { workspaceId: string; quoteId: string; createdBy?: string | null },
): Promise<
  | {
      ok: true;
      invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>;
      lines: Awaited<ReturnType<typeof getInvoiceLines>>;
      idempotent: boolean;
    }
  | { ok: false; fail: InvoiceFail }
> {
  const quote = await getQuote(db, { workspaceId: opts.workspaceId, id: opts.quoteId });
  if (!quote) return { ok: false, fail: 'quote_not_found' };
  if (quote.status !== 'accepted') return { ok: false, fail: 'quote_not_accepted' };

  const existing = await db
    .selectFrom('invoices')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('source_quote_id', '=', opts.quoteId)
    .where('source_quote_version', '=', quote.version)
    .where('deleted_at', 'is', null)
    .where('status', 'not in', ['void', 'cancelled'])
    .executeTakeFirst();

  if (existing) {
    const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: existing.id });
    return { ok: true, invoice: existing, lines, idempotent: true };
  }

  const quoteLines = await getQuoteLines(db, { workspaceId: opts.workspaceId, quoteId: opts.quoteId });
  const profile = await getFinanceProfile(db, opts.workspaceId);
  const { number } = await allocateFinanceNumber(db, opts.workspaceId, 'invoice', profile?.invoice_prefix);
  const id = randomUUID();

  try {
    await db
      .insertInto('invoices')
      .values({
        id,
        workspace_id: opts.workspaceId,
        invoice_number: number,
        status: 'draft',
        customer_party_id: quote.customer_party_id,
        contact_id: quote.contact_id,
        company_id: quote.company_id,
        source_quote_id: quote.id,
        source_quote_version: quote.version,
        deal_id: quote.deal_id,
        issue_date: new Date(),
        currency: quote.currency,
        subtotal: String(quote.subtotal),
        discount_total: String(quote.discount_total),
        taxable_amount: String(quote.taxable_amount),
        tax_amount: String(quote.tax_amount),
        total: String(quote.total),
        amount_paid: '0.00',
        amount_due: String(quote.total),
        tax_breakup: quote.tax_breakup as Record<string, unknown>,
        place_of_supply: quote.place_of_supply,
        seller_gstin_snapshot: profile?.gstin ?? null,
        party_snapshot: quote.party_snapshot as Record<string, unknown>,
        notes: quote.notes,
        terms: quote.terms,
        custom_fields: quote.custom_fields as Record<string, unknown>,
        created_by: opts.createdBy ?? null,
      })
      .execute();
  } catch (e: unknown) {
    // Race: unique partial index — re-fetch
    const raced = await db
      .selectFrom('invoices')
      .selectAll()
      .where('workspace_id', '=', opts.workspaceId)
      .where('source_quote_id', '=', opts.quoteId)
      .where('source_quote_version', '=', quote.version)
      .where('deleted_at', 'is', null)
      .where('status', 'not in', ['void', 'cancelled'])
      .executeTakeFirst();
    if (raced) {
      const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: raced.id });
      return { ok: true, invoice: raced, lines, idempotent: true };
    }
    throw e;
  }

  if (quoteLines.length) {
    await db
      .insertInto('invoice_line_items')
      .values(
        quoteLines.map((l) => ({
          workspace_id: opts.workspaceId,
          invoice_id: id,
          position: l.position,
          product_id: l.product_id,
          sku_snapshot: l.sku_snapshot,
          name_snapshot: l.name_snapshot,
          description_snapshot: l.description_snapshot,
          unit_snapshot: l.unit_snapshot,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
          discount_amount: String(l.discount_amount),
          discount_percent: l.discount_percent != null ? String(l.discount_percent) : null,
          taxable_amount: String(l.taxable_amount),
          tax_rate: l.tax_rate != null ? String(l.tax_rate) : null,
          tax_amount: String(l.tax_amount),
          line_total: String(l.line_total),
          tax_type: l.tax_type,
          tax_breakup: l.tax_breakup as Record<string, unknown>,
          hsn_sac: l.hsn_sac,
          custom_fields: l.custom_fields as Record<string, unknown>,
        })),
      )
      .execute();
  }

  await appendFinanceDomainEvent(db, {
    workspaceId: opts.workspaceId,
    aggregateType: 'invoice',
    aggregateId: id,
    eventType: 'finance.invoice.created',
    transitionKey: `from-quote:${opts.quoteId}:v${quote.version}`,
    data: {
      invoice_id: id,
      invoice_number: number,
      source_quote_id: opts.quoteId,
      source_quote_version: quote.version,
    },
  });

  const invoice = await getInvoice(db, { workspaceId: opts.workspaceId, id });
  const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: id });
  return { ok: true, invoice: invoice!, lines, idempotent: false };
}

export async function issueInvoice(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; actorId?: string | null },
): Promise<
  | { ok: true; invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>>; lines: Awaited<ReturnType<typeof getInvoiceLines>>; idempotent?: boolean }
  | { ok: false; fail: InvoiceFail }
> {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  if (!invoice) return { ok: false, fail: 'not_found' };
  if (invoice.status === 'issued' || invoice.status === 'partially_paid' || invoice.status === 'paid' || invoice.status === 'overdue') {
    const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id });
    return { ok: true, invoice, lines, idempotent: true };
  }
  if (invoice.status !== 'draft') return { ok: false, fail: 'invalid_transition' };

  let nextStatus: InvoiceStatus = 'issued';
  let overdueAt: Date | null = null;
  if (invoice.due_date) {
    const due = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due < today) {
      nextStatus = 'overdue';
      overdueAt = new Date();
    }
  }

  // Freeze World 2 tenant seller branding + enrich buyer snapshots at issue (immutable thereafter).
  const sellerBranding = await buildSellerBrandingSnapshot(db, { workspaceId: opts.workspaceId });
  const buyer = await buildBuyerSnapshots(db, {
    workspaceId: opts.workspaceId,
    customerPartyId: invoice.customer_party_id,
  });

  const result = await db
    .updateTable('invoices')
    .set({
      status: nextStatus,
      issued_at: new Date(),
      issued_by: opts.actorId ?? null,
      amount_due: String(invoice.total),
      amount_paid: '0.00',
      updated_at: new Date(),
      seller_branding_snapshot: sellerBranding,
      seller_gstin_snapshot: sellerBranding.gstin ?? invoice.seller_gstin_snapshot,
      party_snapshot: buyer.party_snapshot,
      buyer_gstin_snapshot: buyer.buyer_gstin_snapshot,
      billing_address_snapshot: buyer.billing_address_snapshot,
      ...(overdueAt ? { overdue_at: overdueAt } : {}),
    })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('status', '=', 'draft')
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) {
    const raced = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
    if (!raced) return { ok: false, fail: 'not_found' };
    if (raced.status === 'draft') return { ok: false, fail: 'invalid_transition' };
    const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id });
    return { ok: true, invoice: raced, lines, idempotent: true };
  }

  await appendFinanceDomainEvent(db, {
    workspaceId: opts.workspaceId,
    aggregateType: 'invoice',
    aggregateId: opts.id,
    eventType: 'finance.invoice.issued',
    transitionKey: `draft->${nextStatus}`,
    data: { invoice_id: opts.id },
  });
  if (nextStatus === 'overdue') {
    await appendFinanceDomainEvent(db, {
      workspaceId: opts.workspaceId,
      aggregateType: 'invoice',
      aggregateId: opts.id,
      eventType: 'finance.invoice.overdue',
      transitionKey: 'issued->overdue:on_issue',
      data: { invoice_id: opts.id },
    });
  }

  await postInvoiceIssued(db, {
    workspaceId: opts.workspaceId,
    invoiceId: opts.id,
    actorId: opts.actorId,
  }).then((posted) => {
    if (!posted.ok) {
      throw new Error(`ACCOUNTING_POST_FAILED:${posted.fail}`);
    }
  });
  await recordSecurityAudit(db as never, {
    tenant_id: opts.workspaceId,
    actor_type: 'user',
    actor_id: opts.actorId ?? null,
    action: 'finance.invoice.issue',
    entity_type: 'invoice',
    entity_id: opts.id,
  });

  const updated = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  const lines = await getInvoiceLines(db, { workspaceId: opts.workspaceId, invoiceId: opts.id });
  return { ok: true, invoice: updated!, lines };
}

export async function cancelInvoice(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; actorId?: string | null; reason?: string },
): Promise<
  | { ok: true; invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>> }
  | { ok: false; fail: InvoiceFail }
> {
  const invoice = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!invoice) return { ok: false, fail: 'not_found' };
  if (invoice.status !== 'draft') return { ok: false, fail: 'invalid_transition' };

  await db
    .updateTable('invoices')
    .set({
      status: 'cancelled',
      cancelled_at: new Date(),
      cancelled_by: opts.actorId ?? null,
      cancel_reason: opts.reason ?? null,
      updated_at: new Date(),
    })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  await appendFinanceDomainEvent(db, {
    workspaceId: opts.workspaceId,
    aggregateType: 'invoice',
    aggregateId: opts.id,
    eventType: 'finance.invoice.cancelled',
    transitionKey: 'draft->cancelled',
    data: { invoice_id: opts.id },
  });

  const updated = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  return { ok: true, invoice: updated! };
}

export async function voidInvoice(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; actorId?: string | null; reason?: string },
): Promise<
  | { ok: true; invoice: NonNullable<Awaited<ReturnType<typeof getInvoice>>> }
  | { ok: false; fail: InvoiceFail }
> {
  const invoice = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!invoice) return { ok: false, fail: 'not_found' };
  if (!['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
    return { ok: false, fail: 'invalid_transition' };
  }

  const result = await db
    .updateTable('invoices')
    .set({
      status: 'void',
      voided_at: new Date(),
      voided_by: opts.actorId ?? null,
      void_reason: opts.reason ?? null,
      amount_due: '0.00',
      updated_at: new Date(),
    })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('status', 'in', ['issued', 'partially_paid', 'overdue'])
    .executeTakeFirst();

  if (Number(result.numUpdatedRows ?? 0) === 0) {
    return { ok: false, fail: 'invalid_transition' };
  }

  const posted = await db
    .selectFrom('journal_entries')
    .select(['id'])
    .where('workspace_id', '=', opts.workspaceId)
    .where('posting_key', '=', `invoice.issued:${opts.id}`)
    .where('status', '=', 'posted')
    .executeTakeFirst();
  if (posted) {
    const rev = await reverseJournal(db, {
      workspaceId: opts.workspaceId,
      entryId: posted.id,
      actorId: opts.actorId,
      memo: `Void invoice ${invoice.invoice_number}`,
    });
    // Throw so withUnitOfWork rolls back void + reverse attempt together.
    if (!rev.ok) {
      throw new Error(`ACCOUNTING_REVERSE_FAILED:${rev.fail}`);
    }
  }

  await appendFinanceDomainEvent(db, {
    workspaceId: opts.workspaceId,
    aggregateType: 'invoice',
    aggregateId: opts.id,
    eventType: 'finance.invoice.voided',
    transitionKey: `${invoice.status}->void`,
    data: { invoice_id: opts.id },
  });

  await recordSecurityAudit(db as never, {
    tenant_id: opts.workspaceId,
    actor_type: 'user',
    actor_id: opts.actorId ?? null,
    action: 'finance.invoice.void',
    entity_type: 'invoice',
    entity_id: opts.id,
  });

  const updated = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  return { ok: true, invoice: updated! };
}

export async function softDeleteDraftInvoice(
  db: DbOrTx,
  opts: { workspaceId: string; id: string },
): Promise<{ ok: true } | { ok: false; fail: InvoiceFail }> {
  const invoice = await getInvoice(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!invoice) return { ok: false, fail: 'not_found' };
  if (invoice.status !== 'draft') return { ok: false, fail: 'not_draft' };

  await db
    .updateTable('invoices')
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();
  return { ok: true };
}
