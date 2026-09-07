/**
 * Debit notes — additional charge to customer.
 */
import { randomUUID } from 'crypto';
import type { DbOrTx } from '@vencore/events';
import { getCustomerParty } from '../customer-parties';
import { normalizeCurrency, DEFAULT_CURRENCY, moneyToNumber } from '../crm-money';
import { computeDocumentTotals, type LineInput } from './tax';
import { allocateFinanceNumber } from './numbering';
import { appendFinanceDomainEvent } from './events';
import { postDebitNote } from '../accounting/posting';
import { recordSecurityAudit } from '../security-audit';
import { getFinanceProfile } from './profile';

export type DebitNoteFail =
  | 'not_found'
  | 'validation'
  | 'party_invalid'
  | 'invoice_not_found';

export async function getDebitNote(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('debit_notes')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

export async function getDebitNoteLines(db: DbOrTx, opts: { workspaceId: string; debitNoteId: string }) {
  return db
    .selectFrom('debit_note_line_items')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('debit_note_id', '=', opts.debitNoteId)
    .orderBy('position', 'asc')
    .execute();
}

export async function createDebitNote(
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
  | { ok: true; debitNote: NonNullable<Awaited<ReturnType<typeof getDebitNote>>>; lines: Awaited<ReturnType<typeof getDebitNoteLines>> }
  | { ok: false; fail: DebitNoteFail }
> {
  const party = await getCustomerParty(db, { workspaceId: input.workspaceId, id: input.customer_party_id });
  if (!party || party.status === 'merged') return { ok: false, fail: 'party_invalid' };

  if (input.invoice_id) {
    const inv = await db
      .selectFrom('invoices')
      .select('id')
      .where('id', '=', input.invoice_id)
      .where('workspace_id', '=', input.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!inv) return { ok: false, fail: 'invoice_not_found' };
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
    'debit_note',
    profile?.debit_note_prefix,
  );
  const id = randomUUID();

  await db
    .insertInto('debit_notes')
    .values({
      id,
      workspace_id: input.workspaceId,
      debit_note_number: number,
      status: 'issued',
      customer_party_id: party.id,
      invoice_id: input.invoice_id ?? null,
      currency: normalizeCurrency(input.currency ?? DEFAULT_CURRENCY),
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      taxable_amount: totals.taxable_amount,
      tax_amount: totals.tax_amount,
      total: totals.total,
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
    .insertInto('debit_note_line_items')
    .values(
      totals.lines.map((l) => ({
        workspace_id: input.workspaceId,
        debit_note_id: id,
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
    aggregateType: 'debit_note',
    aggregateId: id,
    eventType: 'finance.debit_note.created',
    transitionKey: number,
    data: { debit_note_id: id, debit_note_number: number, invoice_id: input.invoice_id ?? null },
  });

  await postDebitNote(db, {
    workspaceId: input.workspaceId,
    debitNoteId: id,
    actorId: input.createdBy,
  }).then((r) => {
    if (!r.ok) throw new Error(`ACCOUNTING_POST_FAILED:${r.fail}`);
  });
  await recordSecurityAudit(db as never, {
    tenant_id: input.workspaceId,
    actor_type: 'user',
    actor_id: input.createdBy ?? null,
    action: 'finance.debit_note.create',
    entity_type: 'debit_note',
    entity_id: id,
  });

  const debitNote = await getDebitNote(db, { workspaceId: input.workspaceId, id });
  const lines = await getDebitNoteLines(db, { workspaceId: input.workspaceId, debitNoteId: id });
  return { ok: true, debitNote: debitNote!, lines };
}
