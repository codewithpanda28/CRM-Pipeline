/**
 * Vendors CRUD (AP parties — not CustomerParty).
 */
import { randomUUID } from 'crypto';
import type { DbOrTx } from '@vencore/events';
import type { VendorStatus } from '@vencore/db';
import { allocateFinanceNumber } from './numbering';

export type VendorFail = 'not_found' | 'validation';

export async function getVendor(db: DbOrTx, opts: { workspaceId: string; id: string }) {
  return (
    (await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', opts.id)
      .where('workspace_id', '=', opts.workspaceId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()) ?? null
  );
}

export async function createVendor(
  db: DbOrTx,
  input: {
    workspaceId: string;
    createdBy?: string | null;
    display_name: string;
    legal_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: Record<string, unknown>;
    gstin?: string | null;
    tax_id?: string | null;
    payment_terms?: string | null;
    bank_details?: Record<string, unknown>;
    notes?: string | null;
    custom_fields?: Record<string, unknown>;
  },
): Promise<{ ok: true; vendor: NonNullable<Awaited<ReturnType<typeof getVendor>>> } | { ok: false; fail: VendorFail }> {
  if (!input.display_name?.trim()) return { ok: false, fail: 'validation' };
  const { number } = await allocateFinanceNumber(db, input.workspaceId, 'vendor');
  const id = randomUUID();
  await db
    .insertInto('vendors')
    .values({
      id,
      workspace_id: input.workspaceId,
      vendor_number: number,
      display_name: input.display_name.trim(),
      legal_name: input.legal_name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? {},
      gstin: input.gstin ?? null,
      tax_id: input.tax_id ?? null,
      payment_terms: input.payment_terms ?? null,
      bank_details: input.bank_details ?? {},
      notes: input.notes ?? null,
      custom_fields: input.custom_fields ?? {},
      created_by: input.createdBy ?? null,
    })
    .execute();
  const vendor = await getVendor(db, { workspaceId: input.workspaceId, id });
  return { ok: true, vendor: vendor! };
}

export async function updateVendor(
  db: DbOrTx,
  opts: {
    workspaceId: string;
    id: string;
    patch: Partial<{
      display_name: string;
      legal_name: string | null;
      email: string | null;
      phone: string | null;
      address: Record<string, unknown>;
      gstin: string | null;
      tax_id: string | null;
      payment_terms: string | null;
      bank_details: Record<string, unknown>;
      status: VendorStatus;
      notes: string | null;
      custom_fields: Record<string, unknown>;
    }>;
  },
): Promise<{ ok: true; vendor: NonNullable<Awaited<ReturnType<typeof getVendor>>> } | { ok: false; fail: VendorFail }> {
  const existing = await getVendor(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!existing) return { ok: false, fail: 'not_found' };
  if (opts.patch.display_name !== undefined && !opts.patch.display_name.trim()) {
    return { ok: false, fail: 'validation' };
  }

  await db
    .updateTable('vendors')
    .set({
      ...(opts.patch.display_name !== undefined ? { display_name: opts.patch.display_name.trim() } : {}),
      ...(opts.patch.legal_name !== undefined ? { legal_name: opts.patch.legal_name } : {}),
      ...(opts.patch.email !== undefined ? { email: opts.patch.email } : {}),
      ...(opts.patch.phone !== undefined ? { phone: opts.patch.phone } : {}),
      ...(opts.patch.address !== undefined ? { address: opts.patch.address } : {}),
      ...(opts.patch.gstin !== undefined ? { gstin: opts.patch.gstin } : {}),
      ...(opts.patch.tax_id !== undefined ? { tax_id: opts.patch.tax_id } : {}),
      ...(opts.patch.payment_terms !== undefined ? { payment_terms: opts.patch.payment_terms } : {}),
      ...(opts.patch.bank_details !== undefined ? { bank_details: opts.patch.bank_details } : {}),
      ...(opts.patch.status !== undefined ? { status: opts.patch.status } : {}),
      ...(opts.patch.notes !== undefined ? { notes: opts.patch.notes } : {}),
      ...(opts.patch.custom_fields !== undefined ? { custom_fields: opts.patch.custom_fields } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();

  const vendor = await getVendor(db, { workspaceId: opts.workspaceId, id: opts.id });
  return { ok: true, vendor: vendor! };
}

export async function softDeleteVendor(
  db: DbOrTx,
  opts: { workspaceId: string; id: string },
): Promise<{ ok: true } | { ok: false; fail: VendorFail }> {
  const existing = await getVendor(db, { workspaceId: opts.workspaceId, id: opts.id });
  if (!existing) return { ok: false, fail: 'not_found' };
  await db
    .updateTable('vendors')
    .set({ deleted_at: new Date(), updated_at: new Date() })
    .where('id', '=', opts.id)
    .where('workspace_id', '=', opts.workspaceId)
    .execute();
  return { ok: true };
}
