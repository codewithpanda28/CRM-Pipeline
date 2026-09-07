/**
 * Phase 3A.4 — Products + Quotes (greenfield expand).
 *
 * PRODUCTION PRODUCT DATA = NONE
 * PRODUCTION QUOTE DATA = NONE
 *
 * Does NOT create Finance/invoice tables, deal_line_items, or PDF artifacts.
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      kind TEXT NOT NULL
        CHECK (kind IN ('product', 'service', 'package', 'plan')),
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NULL,
      category TEXT NULL,
      unit TEXT NOT NULL DEFAULT 'each',
      list_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      cost NUMERIC(18, 2) NULL,
      tax_category_code TEXT NULL,
      tax_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      billing_model TEXT NULL
        CHECK (billing_model IS NULL OR billing_model IN ('one_time', 'recurring', 'usage')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS products_workspace_sku_uidx
    ON products (workspace_id, sku)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS products_workspace_active_idx
    ON products (workspace_id, is_active, kind)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS quote_number_sequences (
      workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      next_value INTEGER NOT NULL DEFAULT 1,
      prefix TEXT NOT NULL DEFAULT 'Q-',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS quotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      quote_number TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      root_quote_id UUID NULL REFERENCES quotes(id) ON DELETE SET NULL,
      supersedes_quote_id UUID NULL REFERENCES quotes(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
          'draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'
        )),
      customer_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
      company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
      deal_id UUID NULL REFERENCES deals(id) ON DELETE SET NULL,
      issue_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      expiry_date DATE NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      place_of_supply TEXT NULL,
      notes TEXT NULL,
      terms TEXT NULL,
      party_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      sent_at TIMESTAMPTZ NULL,
      sent_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      viewed_at TIMESTAMPTZ NULL,
      accepted_at TIMESTAMPTZ NULL,
      accepted_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      rejected_at TIMESTAMPTZ NULL,
      rejected_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      rejection_reason TEXT NULL,
      cancelled_at TIMESTAMPTZ NULL,
      cancelled_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      cancel_reason TEXT NULL,
      expired_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS quotes_workspace_number_version_uidx
    ON quotes (workspace_id, quote_number, version)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS quotes_workspace_status_idx
    ON quotes (workspace_id, status)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS quotes_workspace_party_idx
    ON quotes (workspace_id, customer_party_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS quotes_workspace_deal_idx
    ON quotes (workspace_id, deal_id)
    WHERE deleted_at IS NULL AND deal_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS quote_line_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
      sku_snapshot TEXT NULL,
      name_snapshot TEXT NOT NULL,
      description_snapshot TEXT NULL,
      unit_snapshot TEXT NOT NULL DEFAULT 'each',
      quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
      unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_percent NUMERIC(8, 4) NULL,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_rate NUMERIC(8, 4) NULL,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_type TEXT NULL,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      hsn_sac TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS quote_line_items_quote_idx
    ON quote_line_items (workspace_id, quote_id, position)
  `.execute(db);

  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT wm.workspace_id, 'crm:products', wm.enabled
    FROM workspace_modules wm
    WHERE wm.module_id = 'crm'
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT wm.workspace_id, 'crm:quotes', wm.enabled
    FROM workspace_modules wm
    WHERE wm.module_id = 'crm'
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS quote_line_items`.execute(db);
  await sql`DROP TABLE IF EXISTS quotes`.execute(db);
  await sql`DROP TABLE IF EXISTS quote_number_sequences`.execute(db);
  await sql`DROP TABLE IF EXISTS products`.execute(db);
}
