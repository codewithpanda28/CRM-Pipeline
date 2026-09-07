/**
 * Quote domain service — create/update/lifecycle/revise with line snapshots.
 * Deal is never mutated. Pipeline automation is never triggered.
 */
import { randomUUID } from 'crypto';
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';
import type { QuoteStatus } from '@vencore/db';
import { ensureCustomerParty, getCustomerParty } from '../customer-parties';
import {
  normalizeCurrency,
  DEFAULT_CURRENCY,
} from '../crm-money';
import { computeDocumentTotals, type LineInput } from './totals';
import { onQuoteCreated, onQuoteUpdated, onQuoteLifecycle } from './events';

export type QuoteFail =
  | 'not_found'
  | 'deleted'
  | 'validation'
  | 'party_required'
  | 'party_invalid'
  | 'party_mismatch'
  | 'deal_invalid'
  | 'contact_invalid'
  | 'company_invalid'
  | 'product_invalid'
  | 'immutable'
  | 'invalid_transition'
  | 'not_draft';

const TERMINAL: QuoteStatus[] = ['accepted', 'rejected', 'expired', 'cancelled'];

export async function allocateQuoteNumber(
  db: DbOrTx,
  workspaceId: string,
): Promise<{ quote_number: string }> {
  // Atomic allocate: insert first row at 1, or increment existing under row lock via UPSERT.
  const row = await sql<{ next_value: number; prefix: string }>`
    INSERT INTO quote_number_sequences (workspace_id, next_value, prefix, updated_at)
    VALUES (${workspaceId}::uuid, 1, 'Q-', now())
    ON CONFLICT (workspace_id) DO UPDATE
      SET next_value = quote_number_sequences.next_value + 1,
          updated_at = now()
    RETURNING next_value, prefix
  `.execute(db);

  const allocated = row.rows[0];
  if (!allocated) throw new Error('quote number sequence allocate failed');
  return {
    quote_number: `${allocated.prefix}${String(allocated.next_value).padStart(4, '0')}`,
  };
}

export async function getQuote(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; includeDeleted?: boolean },
) {
  let q = db
    .selectFrom('quotes')
    .selectAll()
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId);
  if (!opts.includeDeleted) q = q.where('deleted_at', 'is', null);
  return q.executeTakeFirst() ?? null;
}

export async function getQuoteLines(db: DbOrTx, opts: { workspaceId: string; quoteId: string }) {
  return db
    .selectFrom('quote_line_items')
    .selectAll()
    .where('workspace_id', '=', opts.workspaceId)
    .where('quote_id', '=', opts.quoteId)
    .orderBy('position', 'asc')
    .execute();
}

async function loadLineProducts(
  db: DbOrTx,
  workspaceId: string,
  lines: LineInput[],
): Promise<{ ok: true; lines: LineInput[] } | { ok: false; fail: QuoteFail }> {
  const out: LineInput[] = [];
  for (const line of lines) {
    if (!line.product_id) {
      if (!line.name_snapshot?.trim()) {
        return { ok: false, fail: 'validation' };
      }
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

async function resolveParty(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    customer_party_id?: string | null;
    contact_id?: string | null;
    company_id?: string | null;
    ownerId?: string | null;
  },
): Promise<
  | { ok: true; partyId: string; contactId: string | null; companyId: string | null; snapshot: Record<string, unknown> }
  | { ok: false; fail: QuoteFail; message?: string }
> {
  let contactId = opts.contact_id ?? null;
  let companyId = opts.company_id ?? null;
  let partyId = opts.customer_party_id ?? null;

  if (partyId) {
    const party = await getCustomerParty(db, { workspaceId: opts.workspaceId, id: partyId });
    if (!party || party.status === 'merged') return { ok: false, fail: 'party_invalid' };
  } else if (companyId || contactId) {
    // O1: company > contact
    if (companyId) {
      const company = await db
        .selectFrom('companies')
        .selectAll()
        .where('id', '=', companyId)
        .where('workspace_id', '=', opts.workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!company) return { ok: false, fail: 'company_invalid' };
      const ensured = await ensureCustomerParty(db, {
        workspaceId: opts.workspaceId,
        partyType: 'company',
        partyId: companyId,
        displayName: company.name,
        primaryOwnerId: opts.ownerId,
      });
      if (!ensured.ok) return { ok: false, fail: 'party_invalid' };
      partyId = ensured.party.id;
    } else if (contactId) {
      const contact = await db
        .selectFrom('contacts')
        .selectAll()
        .where('id', '=', contactId)
        .where('workspace_id', '=', opts.workspaceId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!contact) return { ok: false, fail: 'contact_invalid' };
      const ensured = await ensureCustomerParty(db, {
        workspaceId: opts.workspaceId,
        partyType: 'contact',
        partyId: contactId,
        displayName: contact.name,
        primaryOwnerId: opts.ownerId ?? contact.owner_id,
      });
      if (!ensured.ok) return { ok: false, fail: 'party_invalid' };
      partyId = ensured.party.id;
      if (!companyId && contact.company_id) companyId = String(contact.company_id);
    }
  } else {
    return { ok: false, fail: 'party_required' };
  }

  if (contactId) {
    const c = await db
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', contactId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!c) return { ok: false, fail: 'contact_invalid' };
  }
  if (companyId) {
    const co = await db
      .selectFrom('companies')
      .selectAll()
      .where('id', '=', companyId)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!co) return { ok: false, fail: 'company_invalid' };
  }

  const party = await getCustomerParty(db, { workspaceId: opts.workspaceId, id: partyId! });
  if (!party) return { ok: false, fail: 'party_invalid' };

  const snapshot: Record<string, unknown> = {
    customer_party_id: party.id,
    party_type: party.party_type,
    display_name: party.display_name,
    contact_id: contactId,
    company_id: companyId,
  };

  return { ok: true, partyId: party.id, contactId, companyId, snapshot };
}

async function validateDeal(
  db: DbOrTx,
  opts: { workspaceId: string; dealId: string; partyId: string },
): Promise<{ ok: true } | { ok: false; fail: QuoteFail }> {
  const deal = await db
    .selectFrom('deals')
    .selectAll()
    .where('id', '=', opts.dealId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!deal) return { ok: false, fail: 'deal_invalid' };
  if (deal.customer_party_id && deal.customer_party_id !== opts.partyId) {
    return { ok: false, fail: 'party_mismatch' };
  }
  return { ok: true };
}

async function replaceLines(
  db: DbOrTx,
  opts: { workspaceId: string; quoteId: string; lines: ReturnType<typeof computeDocumentTotals>['lines'] },
) {
  await db
    .deleteFrom('quote_line_items')
    .where('quote_id', '=', opts.quoteId)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  if (!opts.lines.length) return;

  await db
    .insertInto('quote_line_items')
    .values(
      opts.lines.map((l) => ({
        workspace_id: opts.workspaceId,
        quote_id: opts.quoteId,
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

export interface CreateQuoteInput {
  workspaceId: string;
  createdBy: string | null;
  customer_party_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  deal_id?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  currency?: unknown;
  discount_total?: unknown;
  place_of_supply?: string | null;
  place_of_supply_intra?: boolean | null;
  notes?: string | null;
  terms?: string | null;
  custom_fields?: Record<string, unknown>;
  lines?: LineInput[];
}

export async function createQuote(db: DbOrTx, input: CreateQuoteInput) {
  const party = await resolveParty(db, {
    workspaceId: input.workspaceId,
    customer_party_id: input.customer_party_id,
    contact_id: input.contact_id,
    company_id: input.company_id,
    ownerId: input.createdBy,
  });
  if (!party.ok) return party;

  if (input.deal_id) {
    const d = await validateDeal(db, {
      workspaceId: input.workspaceId,
      dealId: input.deal_id,
      partyId: party.partyId,
    });
    if (!d.ok) return d;
  }

  const loaded = await loadLineProducts(db, input.workspaceId, input.lines ?? []);
  if (!loaded.ok) return loaded;

  const totals = computeDocumentTotals(loaded.lines, {
    documentDiscount: input.discount_total,
    placeOfSupply: input.place_of_supply,
    placeOfSupplyIntra: input.place_of_supply_intra ?? null,
  });

  const { quote_number } = await allocateQuoteNumber(db, input.workspaceId);
  const id = randomUUID();

  const row = await db
    .insertInto('quotes')
    .values({
      id,
      workspace_id: input.workspaceId,
      quote_number,
      version: 1,
      root_quote_id: id,
      supersedes_quote_id: null,
      status: 'draft',
      customer_party_id: party.partyId,
      contact_id: party.contactId,
      company_id: party.companyId,
      deal_id: input.deal_id ?? null,
      issue_date: input.issue_date ? new Date(input.issue_date) : new Date(),
      expiry_date: input.expiry_date ? new Date(input.expiry_date) : null,
      currency: normalizeCurrency(input.currency ?? DEFAULT_CURRENCY),
      subtotal: totals.subtotal,
      discount_total: totals.discount_total,
      taxable_amount: totals.taxable_amount,
      tax_amount: totals.tax_amount,
      total: totals.total,
      tax_breakup: totals.tax_breakup,
      place_of_supply: input.place_of_supply ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      party_snapshot: party.snapshot,
      custom_fields: input.custom_fields ?? {},
      created_by: input.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await replaceLines(db, { workspaceId: input.workspaceId, quoteId: id, lines: totals.lines });
  await onQuoteCreated(db, {
    workspaceId: input.workspaceId,
    quoteId: id,
    quoteNumber: quote_number,
    version: 1,
  });

  const lines = await getQuoteLines(db, { workspaceId: input.workspaceId, quoteId: id });
  return { ok: true as const, quote: row, lines };
}

export async function updateDraftQuote(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    patch: Partial<{
      contact_id: string | null;
      company_id: string | null;
      customer_party_id: string;
      deal_id: string | null;
      issue_date: string | null;
      expiry_date: string | null;
      currency: unknown;
      discount_total: unknown;
      place_of_supply: string | null;
      place_of_supply_intra: boolean | null;
      notes: string | null;
      terms: string | null;
      custom_fields: Record<string, unknown>;
      lines: LineInput[];
    }>;
  },
) {
  const quote = await getQuote(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!quote) return { ok: false as const, fail: 'not_found' as QuoteFail };
  if (quote.status !== 'draft') return { ok: false as const, fail: 'not_draft' as QuoteFail };

  let partyId = quote.customer_party_id;
  let contactId = quote.contact_id;
  let companyId = quote.company_id;
  let snapshot = quote.party_snapshot as Record<string, unknown>;

  if (
    opts.patch.customer_party_id !== undefined ||
    opts.patch.contact_id !== undefined ||
    opts.patch.company_id !== undefined
  ) {
    const party = await resolveParty(db, {
      workspaceId: opts.workspaceId,
      customer_party_id: opts.patch.customer_party_id ?? partyId,
      contact_id: opts.patch.contact_id !== undefined ? opts.patch.contact_id : contactId,
      company_id: opts.patch.company_id !== undefined ? opts.patch.company_id : companyId,
    });
    if (!party.ok) return party;
    partyId = party.partyId;
    contactId = party.contactId;
    companyId = party.companyId;
    snapshot = party.snapshot;
  }

  const dealId = opts.patch.deal_id !== undefined ? opts.patch.deal_id : quote.deal_id;
  if (dealId) {
    const d = await validateDeal(db, {
      workspaceId: opts.workspaceId,
      dealId,
      partyId,
    });
    if (!d.ok) return d;
  }

  let totals;
  if (opts.patch.lines) {
    const loaded = await loadLineProducts(db, opts.workspaceId, opts.patch.lines);
    if (!loaded.ok) return loaded;
    totals = computeDocumentTotals(loaded.lines, {
      documentDiscount: opts.patch.discount_total ?? quote.discount_total,
      placeOfSupply: opts.patch.place_of_supply ?? quote.place_of_supply,
      placeOfSupplyIntra: opts.patch.place_of_supply_intra ?? null,
    });
    await replaceLines(db, { workspaceId: opts.workspaceId, quoteId: opts.id, lines: totals.lines });
  } else if (opts.patch.discount_total !== undefined) {
    const existingLines = await getQuoteLines(db, { workspaceId: opts.workspaceId, quoteId: opts.id });
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
        custom_fields: l.custom_fields as Record<string, unknown>,
      })),
      {
        documentDiscount: opts.patch.discount_total,
        placeOfSupply: opts.patch.place_of_supply ?? quote.place_of_supply,
        placeOfSupplyIntra: opts.patch.place_of_supply_intra ?? null,
      },
    );
    await replaceLines(db, { workspaceId: opts.workspaceId, quoteId: opts.id, lines: totals.lines });
  }

  const values: Record<string, unknown> = {
    updated_at: new Date(),
    customer_party_id: partyId,
    contact_id: contactId,
    company_id: companyId,
    party_snapshot: snapshot,
    deal_id: dealId,
  };
  if (opts.patch.issue_date !== undefined) {
    values.issue_date = opts.patch.issue_date ? new Date(opts.patch.issue_date) : quote.issue_date;
  }
  if (opts.patch.expiry_date !== undefined) {
    values.expiry_date = opts.patch.expiry_date ? new Date(opts.patch.expiry_date) : null;
  }
  if (opts.patch.currency !== undefined) values.currency = normalizeCurrency(opts.patch.currency);
  if (opts.patch.place_of_supply !== undefined) values.place_of_supply = opts.patch.place_of_supply;
  if (opts.patch.notes !== undefined) values.notes = opts.patch.notes;
  if (opts.patch.terms !== undefined) values.terms = opts.patch.terms;
  if (opts.patch.custom_fields !== undefined) values.custom_fields = opts.patch.custom_fields;
  if (totals) {
    values.subtotal = totals.subtotal;
    values.discount_total = totals.discount_total;
    values.taxable_amount = totals.taxable_amount;
    values.tax_amount = totals.tax_amount;
    values.total = totals.total;
    values.tax_breakup = totals.tax_breakup;
  }

  const row = await db
    .updateTable('quotes')
    .set(values)
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirstOrThrow();

  await onQuoteUpdated(db, {
    workspaceId: opts.workspaceId,
    quoteId: opts.id,
    changeKey: `draft:${Date.now()}`,
  });

  const lines = await getQuoteLines(db, { workspaceId: opts.workspaceId, quoteId: opts.id });
  return { ok: true as const, quote: row, lines };
}

type LifecycleAction = 'send' | 'view' | 'accept' | 'reject' | 'cancel' | 'expire';

const TRANSITIONS: Record<
  LifecycleAction,
  { from: QuoteStatus[]; to: QuoteStatus }
> = {
  send: { from: ['draft'], to: 'sent' },
  view: { from: ['sent'], to: 'viewed' },
  accept: { from: ['sent', 'viewed'], to: 'accepted' },
  reject: { from: ['sent', 'viewed'], to: 'rejected' },
  cancel: { from: ['draft', 'sent', 'viewed'], to: 'cancelled' },
  expire: { from: ['sent', 'viewed'], to: 'expired' },
};

export async function transitionQuote(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    action: LifecycleAction;
    actorId: string | null;
    reason?: string | null;
  },
) {
  const quote = await getQuote(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!quote) return { ok: false as const, fail: 'not_found' as QuoteFail };

  const rule = TRANSITIONS[opts.action];
  if (!rule.from.includes(quote.status as QuoteStatus)) {
    return { ok: false as const, fail: 'invalid_transition' as QuoteFail };
  }

  const now = new Date();
  const values: Record<string, unknown> = {
    status: rule.to,
    updated_at: now,
  };

  if (opts.action === 'send') {
    values.sent_at = now;
    values.sent_by = opts.actorId;
  } else if (opts.action === 'view') {
    values.viewed_at = now;
  } else if (opts.action === 'accept') {
    values.accepted_at = now;
    values.accepted_by = opts.actorId;
  } else if (opts.action === 'reject') {
    values.rejected_at = now;
    values.rejected_by = opts.actorId;
    values.rejection_reason = opts.reason ?? null;
  } else if (opts.action === 'cancel') {
    values.cancelled_at = now;
    values.cancelled_by = opts.actorId;
    values.cancel_reason = opts.reason ?? null;
  } else if (opts.action === 'expire') {
    values.expired_at = now;
  }

  const row = await db
    .updateTable('quotes')
    .set(values)
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .where('status', 'in', rule.from)
    .where('deleted_at', 'is', null)
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    // Lost race or status changed under us
    return { ok: false as const, fail: 'invalid_transition' as QuoteFail };
  }

  if (opts.action === 'view') {
    await onQuoteUpdated(db, {
      workspaceId: opts.workspaceId,
      quoteId: opts.id,
      changeKey: `viewed:${now.toISOString()}`,
    });
  } else {
    const eventMap = {
      send: 'crm.quote.sent',
      accept: 'crm.quote.accepted',
      reject: 'crm.quote.rejected',
      cancel: 'crm.quote.cancelled',
      expire: 'crm.quote.expired',
    } as const;
    await onQuoteLifecycle(db, {
      workspaceId: opts.workspaceId,
      quoteId: opts.id,
      eventType: eventMap[opts.action as Exclude<LifecycleAction, 'view'>],
      fromStatus: quote.status,
      toStatus: rule.to,
    });
  }

  const lines = await getQuoteLines(db, { workspaceId: opts.workspaceId, quoteId: opts.id });
  return { ok: true as const, quote: row, lines };
}

export async function reviseQuote(
  db: DbOrTx,
  opts: { workspaceId: string; id: string; createdBy: string | null },
) {
  const quote = await getQuote(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!quote) return { ok: false as const, fail: 'not_found' as QuoteFail };
  if (quote.status !== 'sent' && quote.status !== 'viewed') {
    return { ok: false as const, fail: 'invalid_transition' as QuoteFail };
  }
  if (TERMINAL.includes(quote.status as QuoteStatus)) {
    return { ok: false as const, fail: 'immutable' as QuoteFail };
  }

  const oldLines = await getQuoteLines(db, { workspaceId: opts.workspaceId, quoteId: opts.id });
  const newId = randomUUID();
  const maxRow = await db
    .selectFrom('quotes')
    .select((eb) => eb.fn.max('version').as('max_version'))
    .where('workspace_id', '=', opts.workspaceId)
    .where('quote_number', '=', quote.quote_number)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  const newVersion = Number(maxRow?.max_version ?? quote.version) + 1;
  const rootId = quote.root_quote_id ?? quote.id;

  const row = await db
    .insertInto('quotes')
    .values({
      id: newId,
      workspace_id: opts.workspaceId,
      quote_number: quote.quote_number,
      version: newVersion,
      root_quote_id: rootId,
      supersedes_quote_id: quote.id,
      status: 'draft',
      customer_party_id: quote.customer_party_id,
      contact_id: quote.contact_id,
      company_id: quote.company_id,
      deal_id: quote.deal_id,
      issue_date: new Date(),
      expiry_date: quote.expiry_date,
      currency: quote.currency,
      subtotal: quote.subtotal,
      discount_total: quote.discount_total,
      taxable_amount: quote.taxable_amount,
      tax_amount: quote.tax_amount,
      total: quote.total,
      tax_breakup: quote.tax_breakup,
      place_of_supply: quote.place_of_supply,
      notes: quote.notes,
      terms: quote.terms,
      party_snapshot: quote.party_snapshot,
      custom_fields: quote.custom_fields,
      created_by: opts.createdBy,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (oldLines.length) {
    await db
      .insertInto('quote_line_items')
      .values(
        oldLines.map((l) => ({
          workspace_id: opts.workspaceId,
          quote_id: newId,
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

  await onQuoteCreated(db, {
    workspaceId: opts.workspaceId,
    quoteId: newId,
    quoteNumber: quote.quote_number,
    version: newVersion,
  });

  const lines = await getQuoteLines(db, { workspaceId: opts.workspaceId, quoteId: newId });
  return { ok: true as const, quote: row, lines };
}

export async function softDeleteQuote(
  db: DbOrTx,
  opts: { workspaceId: string; id: string },
) {
  const quote = await getQuote(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!quote) return { ok: false as const, fail: 'not_found' as QuoteFail };
  if (quote.status !== 'draft' && quote.status !== 'cancelled') {
    // allow soft-delete drafts and cancelled only for safety
    return { ok: false as const, fail: 'immutable' as QuoteFail };
  }
  await db
    .updateTable('quotes')
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();
  await onQuoteUpdated(db, {
    workspaceId: opts.workspaceId,
    quoteId: opts.id,
    changeKey: 'soft-delete',
  });
  return { ok: true as const };
}

export { computeDocumentTotals, computeLine } from './totals';
export * from './events';
