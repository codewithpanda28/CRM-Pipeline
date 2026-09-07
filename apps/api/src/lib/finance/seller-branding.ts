/**
 * Build tenant seller branding snapshot for World 2 invoices.
 * Sources: tenant_finance_profiles + tenant_branding (never platform ThinkAIQ logo).
 */
import type { DbOrTx } from '@vencore/events';
import { getFinanceProfile } from './profile';

export type SellerBrandingSnapshot = {
  legal_name: string | null;
  trade_name: string | null;
  brand_name: string | null;
  gstin: string | null;
  tax_id: string | null;
  address: Record<string, unknown>;
  bank_details: Record<string, unknown>;
  logo_file_id: string | null;
  /** Optional resolvable URL if present on branding.theme — never platform logo. */
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  support_email: string | null;
  support_phone: string | null;
  payment_qr_url: string | null;
  payment_qr_label: string | null;
  default_terms: string | null;
  footer_note: string | null;
  snapshotted_at: string;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function optionalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('/platform/branding/')) return null;
  return s;
}

function optionalLogoUrl(theme: unknown): string | null {
  const t = asRecord(theme);
  return optionalUrl(t['logo_url'] ?? t['logoUrl']);
}

export async function buildSellerBrandingSnapshot(
  db: DbOrTx,
  opts: { workspaceId: string; tenantId?: string | null },
): Promise<SellerBrandingSnapshot> {
  const profile = await getFinanceProfile(db, opts.workspaceId);
  const tenantId = opts.tenantId ?? opts.workspaceId;
  const branding = await db
    .selectFrom('tenant_branding')
    .selectAll()
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  const legalName =
    profile?.legal_name?.trim() ||
    branding?.legal_name?.trim() ||
    branding?.brand_name?.trim() ||
    null;

  const address = asRecord(profile?.address);
  const meta = asRecord(profile?.metadata);
  const support = asRecord(branding?.support);
  const bank = asRecord(profile?.bank_details);
  const paymentQr = asRecord(meta['payment_qr'] ?? bank['payment_qr']);

  return {
    legal_name: legalName,
    trade_name: profile?.trade_name?.trim() || branding?.brand_name?.trim() || null,
    brand_name: branding?.brand_name?.trim() || profile?.trade_name?.trim() || legalName,
    gstin: profile?.gstin?.trim() || null,
    tax_id: profile?.tax_id?.trim() || null,
    address,
    bank_details: bank,
    logo_file_id: branding?.logo_file_id ?? null,
    logo_url: optionalLogoUrl(branding?.theme),
    primary_color: branding?.primary_color ?? null,
    secondary_color: branding?.secondary_color ?? null,
    email:
      (typeof address['email'] === 'string' && address['email']) ||
      (typeof meta['email'] === 'string' && meta['email']) ||
      null,
    phone:
      (typeof address['phone'] === 'string' && address['phone']) ||
      (typeof meta['phone'] === 'string' && meta['phone']) ||
      null,
    website: typeof address['website'] === 'string' ? address['website'] : null,
    support_email:
      (typeof support['email'] === 'string' && support['email']) ||
      (typeof meta['support_email'] === 'string' && meta['support_email']) ||
      null,
    support_phone:
      (typeof support['phone'] === 'string' && support['phone']) ||
      (typeof meta['support_phone'] === 'string' && meta['support_phone']) ||
      null,
    payment_qr_url: optionalUrl(paymentQr['url'] ?? paymentQr['qr_url'] ?? meta['payment_qr_url']),
    payment_qr_label:
      (typeof paymentQr['label'] === 'string' && paymentQr['label']) ||
      (typeof bank['upi_id'] === 'string' && bank['upi_id']) ||
      null,
    default_terms:
      (typeof meta['default_terms'] === 'string' && meta['default_terms']) ||
      (typeof meta['terms'] === 'string' && meta['terms']) ||
      null,
    footer_note:
      (typeof meta['footer_note'] === 'string' && meta['footer_note']) ||
      (typeof meta['invoice_footer'] === 'string' && meta['invoice_footer']) ||
      null,
    snapshotted_at: new Date().toISOString(),
  };
}

/** Enrich buyer party / GSTIN / billing address snapshots from live party at issue. */
export async function buildBuyerSnapshots(
  db: DbOrTx,
  opts: { workspaceId: string; customerPartyId: string },
): Promise<{
  party_snapshot: Record<string, unknown>;
  buyer_gstin_snapshot: string | null;
  billing_address_snapshot: Record<string, unknown>;
}> {
  const party = await db
    .selectFrom('customer_parties')
    .selectAll()
    .where('id', '=', opts.customerPartyId)
    .where('workspace_id', '=', opts.workspaceId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  if (!party) {
    return {
      party_snapshot: { customer_party_id: opts.customerPartyId },
      buyer_gstin_snapshot: null,
      billing_address_snapshot: {},
    };
  }

  const custom = asRecord(party.custom_fields);
  let email: string | null = typeof custom['email'] === 'string' ? custom['email'] : null;
  let phone: string | null = typeof custom['phone'] === 'string' ? custom['phone'] : null;
  let location: string | null = null;

  if (party.party_type === 'contact') {
    const contact = await db
      .selectFrom('contacts')
      .select(['email', 'phone'])
      .where('id', '=', party.party_id)
      .where('workspace_id', '=', opts.workspaceId)
      .executeTakeFirst();
    email = contact?.email ?? email;
    phone = contact?.phone ?? phone;
  } else {
    const company = await db
      .selectFrom('companies')
      .select(['location', 'website'])
      .where('id', '=', party.party_id)
      .where('workspace_id', '=', opts.workspaceId)
      .executeTakeFirst();
    location = company?.location ?? null;
  }

  const gstin =
    (typeof custom['gstin'] === 'string' && custom['gstin'].trim()) ||
    (typeof custom['GSTIN'] === 'string' && custom['GSTIN'].trim()) ||
    null;

  const billing =
    Object.keys(asRecord(custom['billing_address'])).length > 0
      ? asRecord(custom['billing_address'])
      : location
        ? { line1: location }
        : {};

  return {
    party_snapshot: {
      customer_party_id: party.id,
      party_type: party.party_type,
      display_name: party.display_name,
      contact_id: party.party_type === 'contact' ? party.party_id : null,
      company_id: party.party_type === 'company' ? party.party_id : null,
      email,
      phone,
    },
    buyer_gstin_snapshot: gstin,
    billing_address_snapshot: billing,
  };
}
