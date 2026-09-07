/**
 * Tenant data export — JSON blob of core CRM + Finance + document metadata.
 */
import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';
import { putDocumentBytes } from '../documents/storage';
import { tenantObjectKey } from '@vencore/tenancy';

export async function exportTenantData(
  db: Kysely<Database>,
  workspaceId: string,
): Promise<{
  export: Record<string, unknown>;
  json: string;
  byteSize: number;
  sha256: string;
}> {
  const [
    contacts,
    companies,
    leads,
    deals,
    parties,
    products,
    quotes,
    invoices,
    payments,
    expenses,
    vendors,
    journals,
    documentArtifacts,
  ] = await Promise.all([
    db.selectFrom('contacts').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('companies').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('leads').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('deals').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('customer_parties').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('products').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('quotes').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('invoices').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('payments').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('expenses').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('vendors').selectAll().where('workspace_id', '=', workspaceId).where('deleted_at', 'is', null).execute(),
    db.selectFrom('journal_entries').selectAll().where('workspace_id', '=', workspaceId).execute(),
    db
      .selectFrom('document_artifacts')
      .select([
        'id',
        'doc_type',
        'source_type',
        'source_id',
        'status',
        'storage_key',
        'sha256',
        'byte_size',
        'created_at',
        'ready_at',
      ])
      .where('workspace_id', '=', workspaceId)
      .execute(),
  ]);

  const exportPayload = {
    exported_at: new Date().toISOString(),
    workspace_id: workspaceId,
    contacts,
    companies,
    leads,
    deals,
    parties,
    products,
    quotes,
    invoices,
    payments,
    expenses,
    vendors,
    journals,
    document_metadata: documentArtifacts,
  };

  const json = JSON.stringify(exportPayload, null, 2);
  const buf = Buffer.from(json, 'utf8');
  const sha256 = createHash('sha256').update(buf).digest('hex');

  return {
    export: exportPayload,
    json,
    byteSize: buf.byteLength,
    sha256,
  };
}

export async function runTenantExportJob(
  db: Kysely<Database>,
  opts: { workspaceId: string; requestedBy?: string | null },
): Promise<{ jobId: string; storageKey: string; sha256: string; byteSize: number }> {
  const job = await db
    .insertInto('tenant_export_jobs')
    .values({
      workspace_id: opts.workspaceId,
      status: 'running',
      requested_by: opts.requestedBy ?? null,
      include_scopes: [
        'contacts',
        'companies',
        'leads',
        'deals',
        'parties',
        'products',
        'quotes',
        'invoices',
        'payments',
        'expenses',
        'vendors',
        'journals',
        'document_metadata',
      ],
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  try {
    const result = await exportTenantData(db, opts.workspaceId);
    const yyyy = String(new Date().getUTCFullYear());
    const mm = String(new Date().getUTCMonth() + 1).padStart(2, '0');
    const storageKey = tenantObjectKey(opts.workspaceId, 'exports', yyyy, mm, `${job.id}.json`);
    await putDocumentBytes(storageKey, Buffer.from(result.json, 'utf8'), 'application/json');

    await db
      .updateTable('tenant_export_jobs')
      .set({
        status: 'ready',
        storage_key: storageKey,
        byte_size: result.byteSize,
        sha256: result.sha256,
        completed_at: new Date(),
        updated_at: new Date(),
      })
      .where('id', '=', job.id)
      .execute();

    return {
      jobId: job.id,
      storageKey,
      sha256: result.sha256,
      byteSize: result.byteSize,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .updateTable('tenant_export_jobs')
      .set({
        status: 'failed',
        error_message: msg.slice(0, 2000),
        updated_at: new Date(),
      })
      .where('id', '=', job.id)
      .execute();
    throw err;
  }
}
