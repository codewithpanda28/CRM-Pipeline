/**
 * Phase 4 — Finance commercial MVP (World 2: tenant → customers/vendors).
 *
 * PRODUCTION FINANCE DATA = NONE (greenfield).
 * Does NOT create platform billing, COA/journals, vendor_bills, or PDF tables.
 * Does NOT add quotes.converted_invoice_id (D5).
 */
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tenant_finance_profiles (
      workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
      legal_name TEXT NULL,
      trade_name TEXT NULL,
      gstin TEXT NULL,
      tax_id TEXT NULL,
      address JSONB NOT NULL DEFAULT '{}'::jsonb,
      bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      default_currency CHAR(3) NOT NULL DEFAULT 'INR',
      default_tax_scheme TEXT NOT NULL DEFAULT 'in_gst'
        CHECK (default_tax_scheme IN ('none', 'in_gst', 'vat', 'other')),
      default_payment_terms TEXT NULL,
      place_of_supply_default TEXT NULL,
      invoice_prefix TEXT NOT NULL DEFAULT 'INV-',
      credit_note_prefix TEXT NOT NULL DEFAULT 'CN-',
      debit_note_prefix TEXT NOT NULL DEFAULT 'DN-',
      payment_prefix TEXT NOT NULL DEFAULT 'PAY-',
      expense_prefix TEXT NOT NULL DEFAULT 'EXP-',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS finance_number_sequences (
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      series_key TEXT NOT NULL,
      next_value INTEGER NOT NULL DEFAULT 1,
      prefix TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, series_key)
    )
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
          'draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled'
        )),
      customer_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
      company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
      source_quote_id UUID NULL REFERENCES quotes(id) ON DELETE SET NULL,
      source_quote_version INTEGER NULL,
      deal_id UUID NULL REFERENCES deals(id) ON DELETE SET NULL,
      issue_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      due_date DATE NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(18, 2) NOT NULL DEFAULT 0,
      amount_due NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      place_of_supply TEXT NULL,
      billing_address_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      shipping_address_snapshot JSONB NULL,
      buyer_gstin_snapshot TEXT NULL,
      seller_gstin_snapshot TEXT NULL,
      party_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      payment_terms TEXT NULL,
      notes TEXT NULL,
      terms TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      issued_at TIMESTAMPTZ NULL,
      issued_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      voided_at TIMESTAMPTZ NULL,
      voided_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      void_reason TEXT NULL,
      cancelled_at TIMESTAMPTZ NULL,
      cancelled_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      cancel_reason TEXT NULL,
      overdue_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_workspace_number_uidx
    ON invoices (workspace_id, invoice_number)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS invoices_workspace_source_quote_uidx
    ON invoices (workspace_id, source_quote_id, source_quote_version)
    WHERE source_quote_id IS NOT NULL
      AND deleted_at IS NULL
      AND status NOT IN ('void', 'cancelled')
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS invoices_workspace_status_idx
    ON invoices (workspace_id, status)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS invoices_workspace_party_idx
    ON invoices (workspace_id, customer_party_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS invoices_workspace_due_idx
    ON invoices (workspace_id, due_date)
    WHERE deleted_at IS NULL AND amount_due > 0
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
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
    CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx
    ON invoice_line_items (workspace_id, invoice_id, position)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      payment_number TEXT NOT NULL,
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
      customer_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      amount NUMERIC(18, 2) NOT NULL,
      currency CHAR(3) NOT NULL,
      payment_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      method TEXT NOT NULL DEFAULT 'other'
        CHECK (method IN ('cash', 'bank', 'upi', 'card', 'gateway', 'other')),
      reference TEXT NULL,
      gateway_provider TEXT NULL,
      status TEXT NOT NULL DEFAULT 'succeeded'
        CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
      notes TEXT NULL,
      received_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      reconciled_at TIMESTAMPTZ NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS payments_workspace_number_uidx
    ON payments (workspace_id, payment_number)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS payments_workspace_invoice_idx
    ON payments (workspace_id, invoice_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS payments_workspace_party_idx
    ON payments (workspace_id, customer_party_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS payment_refunds (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
      amount NUMERIC(18, 2) NOT NULL,
      currency CHAR(3) NOT NULL,
      refund_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      reason TEXT NULL,
      status TEXT NOT NULL DEFAULT 'succeeded'
        CHECK (status IN ('pending', 'succeeded', 'failed')),
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS payment_refunds_payment_idx
    ON payment_refunds (workspace_id, payment_id)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS credit_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      credit_note_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued'
        CHECK (status IN ('draft', 'issued', 'void', 'cancelled')),
      customer_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL,
      issue_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      applied_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      unapplied_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      place_of_supply TEXT NULL,
      party_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason TEXT NULL,
      notes TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_workspace_number_uidx
    ON credit_notes (workspace_id, credit_note_number)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS credit_notes_workspace_invoice_idx
    ON credit_notes (workspace_id, invoice_id)
    WHERE deleted_at IS NULL AND invoice_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS credit_notes_workspace_party_idx
    ON credit_notes (workspace_id, customer_party_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS credit_note_line_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
      sku_snapshot TEXT NULL,
      name_snapshot TEXT NOT NULL,
      description_snapshot TEXT NULL,
      unit_snapshot TEXT NOT NULL DEFAULT 'each',
      quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
      unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_rate NUMERIC(8, 4) NULL,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_type TEXT NULL,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      hsn_sac TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS credit_note_line_items_cn_idx
    ON credit_note_line_items (workspace_id, credit_note_id, position)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS debit_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      debit_note_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'issued'
        CHECK (status IN ('draft', 'issued', 'void', 'cancelled')),
      customer_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL,
      issue_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      subtotal NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      place_of_supply TEXT NULL,
      party_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason TEXT NULL,
      notes TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS debit_notes_workspace_number_uidx
    ON debit_notes (workspace_id, debit_note_number)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS debit_notes_workspace_party_idx
    ON debit_notes (workspace_id, customer_party_id)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS debit_note_line_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      debit_note_id UUID NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      product_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
      sku_snapshot TEXT NULL,
      name_snapshot TEXT NOT NULL,
      description_snapshot TEXT NULL,
      unit_snapshot TEXT NOT NULL DEFAULT 'each',
      quantity NUMERIC(18, 4) NOT NULL DEFAULT 1,
      unit_price NUMERIC(18, 2) NOT NULL DEFAULT 0,
      discount_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      taxable_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_rate NUMERIC(8, 4) NULL,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      line_total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_type TEXT NULL,
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      hsn_sac TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS debit_note_line_items_dn_idx
    ON debit_note_line_items (workspace_id, debit_note_id, position)
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS vendors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      vendor_number TEXT NULL,
      display_name TEXT NOT NULL,
      legal_name TEXT NULL,
      email TEXT NULL,
      phone TEXT NULL,
      address JSONB NOT NULL DEFAULT '{}'::jsonb,
      gstin TEXT NULL,
      tax_id TEXT NULL,
      payment_terms TEXT NULL,
      bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive')),
      notes TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS vendors_workspace_number_uidx
    ON vendors (workspace_id, vendor_number)
    WHERE deleted_at IS NULL AND vendor_number IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS vendors_workspace_name_idx
    ON vendors (workspace_id, display_name)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      expense_number TEXT NOT NULL,
      vendor_id UUID NULL REFERENCES vendors(id) ON DELETE SET NULL,
      category TEXT NULL,
      expense_date DATE NOT NULL DEFAULT (CURRENT_DATE),
      due_date DATE NULL,
      amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tax_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
      total NUMERIC(18, 2) NOT NULL DEFAULT 0,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      tax_breakup JSONB NOT NULL DEFAULT '{}'::jsonb,
      payment_status TEXT NOT NULL DEFAULT 'unpaid'
        CHECK (payment_status IN ('unpaid', 'paid', 'partial')),
      receipt_ref TEXT NULL,
      notes TEXT NULL,
      custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS expenses_workspace_number_uidx
    ON expenses (workspace_id, expense_number)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS expenses_workspace_vendor_idx
    ON expenses (workspace_id, vendor_id)
    WHERE deleted_at IS NULL AND vendor_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS expenses_workspace_status_idx
    ON expenses (workspace_id, payment_status)
    WHERE deleted_at IS NULL
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS recurring_invoice_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      customer_party_id UUID NOT NULL REFERENCES customer_parties(id) ON DELETE RESTRICT,
      contact_id UUID NULL REFERENCES contacts(id) ON DELETE SET NULL,
      company_id UUID NULL REFERENCES companies(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'cancelled')),
      cadence TEXT NOT NULL
        CHECK (cadence IN ('weekly', 'monthly', 'quarterly', 'yearly')),
      next_run_at TIMESTAMPTZ NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      place_of_supply TEXT NULL,
      payment_terms TEXT NULL,
      notes TEXT NULL,
      terms TEXT NULL,
      line_template JSONB NOT NULL DEFAULT '[]'::jsonb,
      party_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ NULL
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS recurring_schedules_due_idx
    ON recurring_invoice_schedules (workspace_id, next_run_at)
    WHERE deleted_at IS NULL AND status = 'active'
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS recurring_invoice_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      schedule_id UUID NOT NULL REFERENCES recurring_invoice_schedules(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'skipped', 'failed')),
      error_message TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (schedule_id, period_key)
    )
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS recurring_runs_workspace_idx
    ON recurring_invoice_runs (workspace_id, schedule_id)
  `.execute(db);

  // Enable finance module + submodules for existing workspaces
  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT w.id, 'finance', true
    FROM workspaces w
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);

  await sql`
    INSERT INTO workspace_modules (workspace_id, module_id, enabled)
    SELECT w.id, v.module_id, true
    FROM workspaces w
    CROSS JOIN (VALUES
      ('finance:invoices'),
      ('finance:payments'),
      ('finance:expenses'),
      ('finance:vendors'),
      ('finance:reports')
    ) AS v(module_id)
    ON CONFLICT (workspace_id, module_id) DO NOTHING
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE IF EXISTS recurring_invoice_runs`.execute(db);
  await sql`DROP TABLE IF EXISTS recurring_invoice_schedules`.execute(db);
  await sql`DROP TABLE IF EXISTS expenses`.execute(db);
  await sql`DROP TABLE IF EXISTS vendors`.execute(db);
  await sql`DROP TABLE IF EXISTS debit_note_line_items`.execute(db);
  await sql`DROP TABLE IF EXISTS debit_notes`.execute(db);
  await sql`DROP TABLE IF EXISTS credit_note_line_items`.execute(db);
  await sql`DROP TABLE IF EXISTS credit_notes`.execute(db);
  await sql`DROP TABLE IF EXISTS payment_refunds`.execute(db);
  await sql`DROP TABLE IF EXISTS payments`.execute(db);
  await sql`DROP TABLE IF EXISTS invoice_line_items`.execute(db);
  await sql`DROP TABLE IF EXISTS invoices`.execute(db);
  await sql`DROP TABLE IF EXISTS finance_number_sequences`.execute(db);
  await sql`DROP TABLE IF EXISTS tenant_finance_profiles`.execute(db);
}
