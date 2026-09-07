/**
 * Credit notes — when invoice_id set, auto-apply to invoice balance (D2).
 */
import { randomUUID } from 'crypto';
import type { DbOrTx } from '@vencore/events';
import { getCustomerParty } from '../customer-parties';
import { normalizeCurrency, DEFAULT_CURRENCY, moneyToNumber, parseMoneyAmount, subMoney } from '../crm-money';
import { computeDocumentTotals, type LineInput } from './tax';
import { allocateFinanceNumber } from './numbering';
import { appendFinanceDomainEvent } from './events';
import { postCreditNote } from '../accounting/posting';
import { recordSecurityAudit } from '../security-audit';
import { getFinanceProfile } from './profile';
import { recomputeInvoiceBalances } from './invoices';

export type CreditNoteFail =
  | 'not_found'
  | 'validation'
  | 'party_invalid'
  | 'invoice_not_found'
  | 'invoice_party_mismatch';

export async function getCreditNote(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('credit_notes')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

export async function getCreditNoteLines(db: DbOrTx, opts: { workspaceId: string; creditNoteId: string }) {
  return db
    .selectFrom('credit_note_line_items')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('credit_note_id', '=', opts.creditNoteId)
    .orderBy('position', 'asc')
    .execute();
}

export async function createCreditNote(
  db: DbOrTx,
  input: {
    workspaceId: string;
    createdBy?: string | null;
    customer_party_id: string;
    invoice_id?: string | null;
    currency?: string;
    place_of_supply?: string | null;
    place_of_supply_intra?: boolean | null;
    reason?: string | null;
    notes?: string | null;
    lines?: LineInput[];
  },
): Promise<
  | { ok: true; creditNote: NonNullable<Awaited<ReturnType<typeof getCreditNote>>>; lines: Awaited<ReturnType<typeof getCreditNoteLines>> }
  | { ok: false; fail: CreditNoteFail }
> {
  const party = await getCustomerParty(db, { workspaceId: input.workspaceId, id: input.customer_party_id });
  if (!party || party.status === 'merged') return { ok: false, fail: 'party_invalid' };

  let invoiceId = input.invoice_id ?? null;
  let invoiceDue = '0.00';
  if (invoiceId) {
    const inv = await db
      .selectFrom('invoices')
      .selectAll()
      .where('id', '=', invoiceId)
      .where('workspace_id', '=', input.workspaceId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (!inv) return { ok: false, fail: 'invoice_not_found' };
    if (inv.customer_party_id !== party.id) return { ok: false, fail: 'invoice_party_mismatch' };
    if (['void', 'cancelled', 'draft'].includes(inv.status)) {
      return { ok: false, fail: 'validation' };
    }
    invoiceDue = String(inv.amount_due);
  }

  const totals = computeDocumentTotals(input.lines ?? [], {
    placeOfSupply: input.place_of_supply,
    placeOfSupplyIntra: input.place_of_supply_intra ?? null,
  });
  if (!totals.lines.length || moneyToNumber(totals.total) <= 0) {
    return { ok: false, fail: 'validation' };
  }

  const profile = await getFinanceProfile(db, input.workspaceId);
  const { number } = await allocateFinanceNumber(
    db,
    input.workspaceId,
    'credit_note',
    profile?.credit_note_prefix,
  );
  const id = randomUUID();

  // D2: linked CN applies up to remaining amount_due; remainder stays unapplied
  let applied = '0.00';
  let unapplied = totals.total;
  if (invoiceId) {
    const dueNum = moneyToNumber(parseMoneyAmount(invoiceDue));
    const totalNum = moneyToNumber(totals.total);
    applied = parseMoneyAmount(Math.min(dueNum, totalNum));
    unapplied = subMoney(totals.total, applied);
  }

  await db
    .insertInto('credit_notes')
    .values({
      id,
      workspace_id: input.workspaceId,
      credit_note_number: number,
      status: 'issued',
      customer_party_id: party.id,
      invoice_id: invoiceId,
      currency: normalizeCurrency(input.currency ?? DEFAULT_CURRENCY),
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      taxable_amount: totals.taxable_amount,
      tax_amount: totals.tax_amount,
      total: totals.total,
      applied_amount: applied,
      unapplied_amount: unapplied,
      tax_breakup: totals.tax_breakup,
      place_of_supply: input.place_of_supply ?? null,
      party_snapshot: {
        customer_party_id: party.id,
        display_name: party.display_name,
        party_type: party.party_type,
      },
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .execute();

  await db
    .insertInto('credit_note_line_items')
    .values(
      totals.lines.map((l) => ({
        workspace_id: input.workspaceId,
        credit_note_id: id,
        position: l.position,
        product_id: l.product_id,
        sku_snapshot: l.sku_snapshot,
        name_snapshot: l.name_snapshot,
        description_snapshot: l.description_snapshot,
        unit_snapshot: l.unit_snapshot,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: l.discount_amount,
        taxable_amount: l.taxable_amount,
        tax_rate: l.tax_rate,
        tax_amount: l.tax_amount,
        line_total: l.line_total,
        tax_type: l.tax_type,
        tax_breakup: l.tax_breakup,
        hsn_sac: l.hsn_sac,
      })),
    )
    .execute();

  await appendFinanceDomainEvent(db, {
    workspaceId: input.workspaceId,
    aggregateType: 'credit_note',
    aggregateId: id,
    eventType: 'finance.credit_note.created',
    transitionKey: number,
    data: {
      credit_note_id: id,
      credit_note_number: number,
      invoice_id: invoiceId,
      applied_amount: applied,
      unapplied_amount: unapplied,
      total: totals.total,
    },
  });

  await postCreditNote(db, {
    workspaceId: input.workspaceId,
    creditNoteId: id,
    actorId: input.createdBy,
  }).then((r) => {
    if (!r.ok) throw new Error(`ACCOUNTING_POST_FAILED:${r.fail}`);
  });
  await recordSecurityAudit(db as never, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.createdBy ?? null,
    action: 'finance.credit_note.create',
    entity_type: 'credit_note',
    entity_id: id,
  });

  if (invoiceId && moneyToNumber(parseMoneyAmount(applied)) > 0) {
    await recomputeInvoiceBalances(db, { workspaceId: input.workspaceId, invoiceId });
  }

  const creditNote = await getCreditNote(db, { workspaceId: input.workspaceId, id });
  const lines = await getCreditNoteLines(db, { workspaceId: input.workspaceId, creditNoteId: id });
  return { ok: true, creditNote: creditNote!, lines };
}
