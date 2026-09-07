import { createDb, migrate, type Database } from '@vencore/db';
import { sql, type Kysely } from 'kysely';
import { Pool } from 'pg';
import { assertSafeTestDatabaseUrl, adminUrlFor } from './safe-db';

export async function ensureTestDatabase(databaseUrl: string): Promise<void> {
  assertSafeTestDatabaseUrl(databaseUrl);
  const { adminUrl, dbName } = adminUrlFor(databaseUrl);
  const pool = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const exists = await pool.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await pool.query(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await pool.end();
  }
}

export async function openLiveTestDb(databaseUrl: string): Promise<Kysely<Database>> {
  assertSafeTestDatabaseUrl(databaseUrl);
  await ensureTestDatabase(databaseUrl);
  const db = createDb(databaseUrl);
  const { error, results } = await migrate(db as never);
  if (error) {
    await db.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
  results?.forEach((r: { status: string; migrationName: string }) => {
    if (r.status === 'Error') console.error('migration failed', r.migrationName);
  });
  return db;
}

/** Wipe tenant-owned / fixture tables for deterministic reseed. */
export async function resetLiveFixtureTables(db: Kysely<Database>): Promise<void> {
  await sql`
    TRUNCATE TABLE
      outbox_events,
      security_audit_events,
      webhook_deliveries,
      webhook_subscriptions,
      api_keys,
      message_attachments,
      messages,
      channel_members,
      channels,
      notifications,
      contact_tag_links,
      contact_tags,
      activities,
      tasks,
      deal_migration_traces,
      deals,
      leads,
      lead_conversion_links,
      customer_party_merge_events,
      customer_parties,
      quote_line_items,
      quotes,
      quote_number_sequences,
      products,
      invoice_line_items,
      invoices,
      payment_refunds,
      payments,
      credit_note_line_items,
      credit_notes,
      debit_note_line_items,
      debit_notes,
      expenses,
      vendors,
      recurring_invoice_runs,
      recurring_invoice_schedules,
      finance_number_sequences,
      tenant_finance_profiles,
      pipeline_items,
      pipeline_stages,
      pipelines,
      projects,
      servers,
      contact_tag_links,
      contacts,
      companies,
      tenant_job_controls,
      tenant_branding,
      tenant_settings,
      tenant_domains,
      tenant_memberships,
      user_session_roles,
      user_roles,
      role_permissions,
      role_inheritance,
      roles,
      workspace_modules,
      platform_users,
      users,
      tenants,
      workspaces
    RESTART IDENTITY CASCADE
  `.execute(db);
}
