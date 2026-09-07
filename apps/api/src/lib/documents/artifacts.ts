/**
 * Build frozen document render snapshots from quote / invoice / CN / DN.
 */
import type { DbOrTx } from '@vencore/events';
import type {
  BrandingSnapshot,
  DocumentDocType,
  DocumentLine,
  DocumentRenderContext,
  DocumentTotals,
} from '@vencore/documents';
import { buildSellerBrandingSnapshot } from '../finance/seller-branding';

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isoDate(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function mapLines(
  rows: Array<{
    position: number;
    name_snapshot: string;
    description_snapshot: string | null;
    hsn_sac: string | null;
    quantity: string;
    unit_snapshot: string;
    unit_price: string;
    discount_amount?: string | null;
    tax_rate: string | null;
    tax_amount: string;
    line_total: string;
    tax_breakup?: unknown;
  }>,
): DocumentLine[] {
  return rows.map((r) => ({
    position: r.position,
    name: r.name_snapshot,
    description: r.description_snapshot,
    hsnSac: r.hsn_sac,
    quantity: r.quantity,
    unit: r.unit_snapshot,
    unitPrice: r.unit_price,
    discountAmount: r.discount_amount ?? undefined,
    taxRate: r.tax_rate,
    taxAmount: r.tax_amount,
    lineTotal: r.line_total,
    taxBreakup: asRecord(r.tax_breakup),
  }));
}

async function resolveBranding(
  db: DbOrTx,
  workspaceId: string,
  frozen: unknown,
): Promise<BrandingSnapshot> {
  const snap = asRecord(frozen);
  if (Object.keys(snap).length > 0) {
    // Strip any accidental platform logo paths
    if (typeof snap['logo_url'] === 'string' && String(snap['logo_url']).includes('/platform/branding/')) {
      snap['logo_url'] = null;
    }
    return snap as BrandingSnapshot;
  }
  return buildSellerBrandingSnapshot(db, { workspaceId });
}

export type SnapshotSourceType = 'quote' | 'invoice' | 'credit_note' | 'debit_note';

export async function buildDocumentSnapshot(
  db: DbOrTx,
  opts: { workspaceId: string; sourceType: SnapshotSourceType; sourceId: string },
): Promise<{
  docType: DocumentDocType;
  context: DocumentRenderContext;
  brandingSnapshot: BrandingSnapshot;
  snapshotPayload: Record<string, unknown>;
}> {
  const { workspaceId, sourceType, sourceId } = opts;

  if (sourceType === 'invoice') {
    const inv = await db
      .selectFrom('invoices')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', sourceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!inv) throw new Error('INVOICE_NOT_FOUND');
    const lines = await db
      .selectFrom('invoice_line_items')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('invoice_id', '=', sourceId)
      .orderBy('position', 'asc')
      .execute();
    const branding = await resolveBranding(db, workspaceId, inv.seller_branding_snapshot);
    const totals: DocumentTotals = {
      subtotal: inv.subtotal,
      discountTotal: inv.discount_total,
      taxableAmount: inv.taxable_amount,
      taxAmount: inv.tax_amount,
      total: inv.total,
      amountPaid: inv.amount_paid,
      amountDue: inv.amount_due,
      currency: inv.currency,
    };
    const context: DocumentRenderContext = {
      docType: 'invoice',
      documentNumber: inv.invoice_number,
      issueDate: isoDate(inv.issue_date) ?? '',
      dueDate: isoDate(inv.due_date),
      brandingSnapshot: branding,
      partySnapshot: asRecord(inv.party_snapshot),
      lines: mapLines(lines),
      totals,
      taxBreakup: asRecord(inv.tax_breakup),
      placeOfSupply: inv.place_of_supply,
      notes: inv.notes,
      terms: inv.terms,
    };
    return {
      docType: 'invoice',
      context,
      brandingSnapshot: branding,
      snapshotPayload: { context, invoice_id: inv.id, status: inv.status },
    };
  }

  if (sourceType === 'quote') {
    const q = await db
      .selectFrom('quotes')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', sourceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!q) throw new Error('QUOTE_NOT_FOUND');
    const lines = await db
      .selectFrom('quote_line_items')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('quote_id', '=', sourceId)
      .orderBy('position', 'asc')
      .execute();
    const branding = await resolveBranding(db, workspaceId, null);
    const totals: DocumentTotals = {
      subtotal: q.subtotal,
      discountTotal: q.discount_total,
      taxableAmount: q.taxable_amount,
      taxAmount: q.tax_amount,
      total: q.total,
      currency: q.currency,
    };
    const context: DocumentRenderContext = {
      docType: 'quote',
      documentNumber: q.quote_number,
      issueDate: isoDate(q.issue_date) ?? '',
      expiryDate: isoDate(q.expiry_date),
      brandingSnapshot: branding,
      partySnapshot: asRecord(q.party_snapshot),
      lines: mapLines(lines),
      totals,
      taxBreakup: asRecord(q.tax_breakup),
      placeOfSupply: q.place_of_supply,
      notes: q.notes,
      terms: q.terms,
    };
    return {
      docType: 'quote',
      context,
      brandingSnapshot: branding,
      snapshotPayload: { context, quote_id: q.id, status: q.status, version: q.version },
    };
  }

  if (sourceType === 'credit_note') {
    const cn = await db
      .selectFrom('credit_notes')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', sourceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!cn) throw new Error('CREDIT_NOTE_NOT_FOUND');
    const lines = await db
      .selectFrom('credit_note_line_items')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('credit_note_id', '=', sourceId)
      .orderBy('position', 'asc')
      .execute();
    const branding = await resolveBranding(db, workspaceId, null);
    const totals: DocumentTotals = {
      subtotal: cn.subtotal,
      discountTotal: cn.discount_total,
      taxableAmount: cn.taxable_amount,
      taxAmount: cn.tax_amount,
      total: cn.total,
      currency: cn.currency,
    };
    const context: DocumentRenderContext = {
      docType: 'credit_note',
      documentNumber: cn.credit_note_number,
      issueDate: isoDate(cn.issue_date) ?? '',
      brandingSnapshot: branding,
      partySnapshot: asRecord(cn.party_snapshot),
      lines: mapLines(lines),
      totals,
      taxBreakup: asRecord(cn.tax_breakup),
      placeOfSupply: cn.place_of_supply,
      notes: cn.notes,
      reason: cn.reason,
    };
    return {
      docType: 'credit_note',
      context,
      brandingSnapshot: branding,
      snapshotPayload: { context, credit_note_id: cn.id, status: cn.status },
    };
  }

  const dn = await db
    .selectFrom('debit_notes')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('id', '=', sourceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!dn) throw new Error('DEBIT_NOTE_NOT_FOUND');
  const lines = await db
    .selectFrom('debit_note_line_items')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('debit_note_id', '=', sourceId)
    .orderBy('position', 'asc')
    .execute();
  const branding = await resolveBranding(db, workspaceId, null);
  const totals: DocumentTotals = {
    subtotal: dn.subtotal,
    discountTotal: dn.discount_total,
    taxableAmount: dn.taxable_amount,
    taxAmount: dn.tax_amount,
    total: dn.total,
    currency: dn.currency,
  };
  const context: DocumentRenderContext = {
    docType: 'debit_note',
    documentNumber: dn.debit_note_number,
    issueDate: isoDate(dn.issue_date) ?? '',
    brandingSnapshot: branding,
    partySnapshot: asRecord(dn.party_snapshot),
    lines: mapLines(lines),
    totals,
    taxBreakup: asRecord(dn.tax_breakup),
    placeOfSupply: dn.place_of_supply,
    notes: dn.notes,
    reason: dn.reason,
  };
  return {
    docType: 'debit_note',
    context,
    brandingSnapshot: branding,
    snapshotPayload: { context, debit_note_id: dn.id, status: dn.status },
  };
}
