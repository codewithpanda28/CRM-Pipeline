import type { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { ServerStatus, DbEngine, InfraDatabaseStatus, WebsiteStatus, FieldType } from '@vencore/types';

export interface TenantTable {
  id: string;
  display_name: string;
  legal_name: string | null;
  slug: string;
  status: 'provisioning' | 'active' | 'suspended' | 'archived' | 'deleting';
  status_reason: string | null;
  plan_id: string | null;
  trial_ends_at: Date | null;
  suspended_at: Date | null;
  archived_at: Date | null;
  provisioned_at: Date | null;
  parent_tenant_id: string | null;
  reseller_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface TenantMembershipTable {
  id: Generated<string>;
  tenant_id: string;
  user_id: string;
  status: 'invited' | 'active' | 'disabled';
  is_owner: Generated<boolean>;
  invited_by: string | null;
  joined_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantDomainTable {
  id: Generated<string>;
  tenant_id: string;
  host: string;
  type: 'tenant_subdomain' | 'custom';
  is_primary: Generated<boolean>;
  verification_status: Generated<string>;
  verification_token: string | null;
  ssl_status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantSettingsTable {
  tenant_id: string;
  locale: string | null;
  timezone: string | null;
  settings: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantBrandingTable {
  tenant_id: string;
  brand_name: string | null;
  legal_name: string | null;
  logo_file_id: string | null;
  favicon_file_id: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  typography: Generated<Record<string, unknown>>;
  theme: Generated<Record<string, unknown>>;
  login: Generated<Record<string, unknown>>;
  support: Generated<Record<string, unknown>>;
  email_from_name: string | null;
  email_from_address: string | null;
  version: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TenantJobControlsTable {
  tenant_id: string;
  jobs_paused: Generated<boolean>;
  pause_reason: string | null;
  paused_by: string | null;
  paused_at: Date | null;
  updated_at: Generated<Date>;
}

export interface PlatformUserTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  name: string;
  status: Generated<string>;
  mfa_enabled: Generated<boolean>;
  mfa_secret_encrypted: string | null;
  mfa_recovery_codes_hash: Generated<unknown>;
  mfa_enrolled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SecurityAuditEventTable {
  id: Generated<string>;
  tenant_id: string | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface OutboxEventTable {
  id: Generated<string>;
  tenant_id: string | null;
  event_type: string;
  aggregate_type: string | null;
  aggregate_id: string | null;
  payload: Generated<Record<string, unknown>>;
  occurred_at: Generated<Date>;
  available_at: Generated<Date>;
  status: Generated<'pending' | 'publishing' | 'published' | 'failed' | 'dead'>;
  attempts: Generated<number>;
  published_at: Date | null;
  dedupe_key: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  last_error: string | null;
  job_name: string | null;
  job_handle: string | null;
  locked_until: Date | null;
  locked_by: string | null;
}

export interface WorkspaceTable {
  id: Generated<string>;
  name: string;
  domain: string | null;
  seat_count: Generated<number>;
  contact_count: Generated<number>;
  server_count: Generated<number>;
  db_count: Generated<number>;
  plugin_data_sharing: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  email: string;
  password_hash: string;
  password_reset_token: string | null;
  /** Phase 2A: hashed reset token (preferred). Legacy plaintext column kept for dual-read. */
  password_reset_token_hash: string | null;
  password_reset_expires_at: Date | null;
  /** Bump to revoke all sessions (JWT should carry matching version when issued). */
  session_version: Generated<number>;
  is_active: Generated<boolean>;
  theme: Generated<'light' | 'dark'>;
  last_login_at: Date | null;
  mfa_enabled: Generated<boolean>;
  mfa_secret_encrypted: string | null;
  mfa_recovery_codes_hash: Generated<unknown>;
  mfa_enrolled_at: Date | null;
  created_at: Generated<Date>;
}

export interface CompanyTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  industry: string | null;
  location: string | null;
  employee_count: number | null;
  website: string | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ContactTable {
  id: Generated<string>;
  workspace_id: string;
  company_id: string | null;
  owner_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: Generated<'prospect' | 'customer' | 'cold' | 'churned'>;
  last_contacted_at: Date | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Canonical CRM Lead (Phase 3A.2). */
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'converted'
  | 'unqualified'
  | 'lost'
  | 'abandoned';

export type LeadRating = 'hot' | 'warm' | 'cold';

export interface LeadTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  alternate_phone: string | null;
  company_name: string | null;
  website: string | null;
  source: string | null;
  status: Generated<LeadStatus>;
  rating: LeadRating | null;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  notes: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  converted_at: Date | null;
  converted_by: string | null;
  lost_reason: string | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type LeadConversionEntityType = 'contact' | 'company' | 'deal' | 'customer_party';
export type LeadConversionAction = 'created' | 'reused';

export interface LeadConversionLinkTable {
  id: Generated<string>;
  workspace_id: string;
  lead_id: string;
  entity_type: LeadConversionEntityType;
  entity_id: string;
  action: LeadConversionAction;
  created_at: Generated<Date>;
}

/** Canonical CRM Deal (Phase 3A.1). Money as decimal string (NUMERIC). */
export interface DealTable {
  id: Generated<string>;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  owner_id: string;
  /** NUMERIC(18,2) — never use JS float for persistence math */
  amount: Generated<string>;
  currency: Generated<string>;
  probability: Generated<number>;
  expected_close_at: Date | null;
  source: string | null;
  primary_contact_id: string | null;
  company_id: string | null;
  /** Extension column — FK activated in 3A.3 Step 2A; integrity validates tenant party. */
  customer_party_id: string | null;
  status: Generated<'open' | 'won' | 'lost' | 'abandoned'>;
  won_at: Date | null;
  lost_at: Date | null;
  lost_reason: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  source_pipeline_item_id: string | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DealMigrationTraceTable {
  id: Generated<string>;
  workspace_id: string;
  deal_id: string;
  source_pipeline_item_id: string;
  mapping: Generated<Record<string, unknown>>;
  status: Generated<'migrated' | 'skipped' | 'failed'>;
  error: string | null;
  created_at: Generated<Date>;
}

/** Canonical commercial party (Phase 3A.3). Role over Contact or Company — not a second identity model. */
export type CustomerPartyType = 'contact' | 'company';
export type CustomerPartyStatus = 'active' | 'inactive' | 'merged';

export interface CustomerPartyTable {
  id: Generated<string>;
  workspace_id: string;
  party_type: CustomerPartyType;
  party_id: string;
  display_name: string;
  status: Generated<CustomerPartyStatus>;
  primary_owner_id: string | null;
  merged_into_id: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Auditable merge log — written only by explicit admin merge (Step later). */
export interface CustomerPartyMergeEventTable {
  id: Generated<string>;
  workspace_id: string;
  from_party_id: string;
  into_party_id: string;
  actor_user_id: string | null;
  reason: string;
  snapshot: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
}

/** Canonical catalog (Phase 3A.4). Money as decimal string (NUMERIC). */
export type ProductKind = 'product' | 'service' | 'package' | 'plan';
export type ProductBillingModel = 'one_time' | 'recurring' | 'usage';

export interface ProductTable {
  id: Generated<string>;
  workspace_id: string;
  kind: ProductKind;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  /** NUMERIC(18,2) */
  list_price: Generated<string>;
  currency: Generated<string>;
  cost: string | null;
  tax_category_code: string | null;
  tax_metadata: Generated<Record<string, unknown>>;
  billing_model: ProductBillingModel | null;
  is_active: Generated<boolean>;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export type QuoteStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export interface QuoteNumberSequenceTable {
  workspace_id: string;
  next_value: Generated<number>;
  prefix: Generated<string>;
  updated_at: Generated<Date>;
}

export interface QuoteTable {
  id: Generated<string>;
  workspace_id: string;
  quote_number: string;
  version: Generated<number>;
  root_quote_id: string | null;
  supersedes_quote_id: string | null;
  status: Generated<QuoteStatus>;
  customer_party_id: string;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  issue_date: Generated<Date>;
  expiry_date: Date | null;
  currency: Generated<string>;
  subtotal: Generated<string>;
  discount_total: Generated<string>;
  taxable_amount: Generated<string>;
  tax_amount: Generated<string>;
  total: Generated<string>;
  tax_breakup: Generated<Record<string, unknown>>;
  place_of_supply: string | null;
  notes: string | null;
  terms: string | null;
  party_snapshot: Generated<Record<string, unknown>>;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  sent_at: Date | null;
  sent_by: string | null;
  viewed_at: Date | null;
  accepted_at: Date | null;
  accepted_by: string | null;
  rejected_at: Date | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  expired_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface QuoteLineItemTable {
  id: Generated<string>;
  workspace_id: string;
  quote_id: string;
  position: Generated<number>;
  product_id: string | null;
  sku_snapshot: string | null;
  name_snapshot: string;
  description_snapshot: string | null;
  unit_snapshot: string;
  /** NUMERIC(18,4) */
  quantity: Generated<string>;
  unit_price: Generated<string>;
  discount_amount: Generated<string>;
  discount_percent: string | null;
  taxable_amount: Generated<string>;
  tax_rate: string | null;
  tax_amount: Generated<string>;
  line_total: Generated<string>;
  tax_type: string | null;
  tax_breakup: Generated<Record<string, unknown>>;
  hsn_sac: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// ─── Phase 4 Finance ─────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'bank' | 'upi' | 'card' | 'gateway' | 'other';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';
export type PaymentRefundStatus = 'pending' | 'succeeded' | 'failed';
export type CreditNoteStatus = 'draft' | 'issued' | 'void' | 'cancelled';
export type DebitNoteStatus = 'draft' | 'issued' | 'void' | 'cancelled';
export type VendorStatus = 'active' | 'inactive';
export type ExpensePaymentStatus = 'unpaid' | 'paid' | 'partial';
export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringScheduleStatus = 'active' | 'paused' | 'cancelled';
export type RecurringRunStatus = 'created' | 'skipped' | 'failed';
export type FinanceSeriesKey =
  | 'invoice'
  | 'credit_note'
  | 'debit_note'
  | 'payment'
  | 'expense'
  | 'vendor';

export interface TenantFinanceProfileTable {
  workspace_id: string;
  legal_name: string | null;
  trade_name: string | null;
  gstin: string | null;
  tax_id: string | null;
  address: Generated<Record<string, unknown>>;
  bank_details: Generated<Record<string, unknown>>;
  default_currency: Generated<string>;
  default_tax_scheme: Generated<'none' | 'in_gst' | 'vat' | 'other'>;
  default_payment_terms: string | null;
  place_of_supply_default: string | null;
  invoice_prefix: Generated<string>;
  credit_note_prefix: Generated<string>;
  debit_note_prefix: Generated<string>;
  payment_prefix: Generated<string>;
  expense_prefix: Generated<string>;
  metadata: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FinanceNumberSequenceTable {
  workspace_id: string;
  series_key: string;
  next_value: Generated<number>;
  prefix: string;
  updated_at: Generated<Date>;
}

export interface InvoiceTable {
  id: Generated<string>;
  workspace_id: string;
  invoice_number: string;
  status: Generated<InvoiceStatus>;
  customer_party_id: string;
  contact_id: string | null;
  company_id: string | null;
  source_quote_id: string | null;
  source_quote_version: number | null;
  deal_id: string | null;
  issue_date: Generated<Date>;
  due_date: Date | null;
  currency: Generated<string>;
  subtotal: Generated<string>;
  discount_total: Generated<string>;
  taxable_amount: Generated<string>;
  tax_amount: Generated<string>;
  total: Generated<string>;
  amount_paid: Generated<string>;
  amount_due: Generated<string>;
  tax_breakup: Generated<Record<string, unknown>>;
  place_of_supply: string | null;
  billing_address_snapshot: Generated<Record<string, unknown>>;
  shipping_address_snapshot: Record<string, unknown> | null;
  buyer_gstin_snapshot: string | null;
  seller_gstin_snapshot: string | null;
  party_snapshot: Generated<Record<string, unknown>>;
  /** Frozen at issue: tenant legal identity + logo refs for document/PDF (World 2). */
  seller_branding_snapshot: Generated<Record<string, unknown>>;
  payment_terms: string | null;
  notes: string | null;
  terms: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  issued_at: Date | null;
  issued_by: string | null;
  voided_at: Date | null;
  voided_by: string | null;
  void_reason: string | null;
  cancelled_at: Date | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  overdue_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface InvoiceLineItemTable {
  id: Generated<string>;
  workspace_id: string;
  invoice_id: string;
  position: Generated<number>;
  product_id: string | null;
  sku_snapshot: string | null;
  name_snapshot: string;
  description_snapshot: string | null;
  unit_snapshot: string;
  quantity: Generated<string>;
  unit_price: Generated<string>;
  discount_amount: Generated<string>;
  discount_percent: string | null;
  taxable_amount: Generated<string>;
  tax_rate: string | null;
  tax_amount: Generated<string>;
  line_total: Generated<string>;
  tax_type: string | null;
  tax_breakup: Generated<Record<string, unknown>>;
  hsn_sac: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PaymentTable {
  id: Generated<string>;
  workspace_id: string;
  payment_number: string;
  invoice_id: string;
  customer_party_id: string;
  amount: string;
  currency: string;
  payment_date: Generated<Date>;
  method: Generated<PaymentMethod>;
  reference: string | null;
  gateway_provider: string | null;
  status: Generated<PaymentStatus>;
  notes: string | null;
  received_by: string | null;
  reconciled_at: Date | null;
  metadata: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface PaymentRefundTable {
  id: Generated<string>;
  workspace_id: string;
  payment_id: string;
  invoice_id: string;
  amount: string;
  currency: string;
  refund_date: Generated<Date>;
  reason: string | null;
  status: Generated<PaymentRefundStatus>;
  created_by: string | null;
  metadata: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CreditNoteTable {
  id: Generated<string>;
  workspace_id: string;
  credit_note_number: string;
  status: Generated<CreditNoteStatus>;
  customer_party_id: string;
  invoice_id: string | null;
  issue_date: Generated<Date>;
  currency: Generated<string>;
  subtotal: Generated<string>;
  discount_total: Generated<string>;
  taxable_amount: Generated<string>;
  tax_amount: Generated<string>;
  total: Generated<string>;
  applied_amount: Generated<string>;
  unapplied_amount: Generated<string>;
  tax_breakup: Generated<Record<string, unknown>>;
  place_of_supply: string | null;
  party_snapshot: Generated<Record<string, unknown>>;
  reason: string | null;
  notes: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface CreditNoteLineItemTable {
  id: Generated<string>;
  workspace_id: string;
  credit_note_id: string;
  position: Generated<number>;
  product_id: string | null;
  sku_snapshot: string | null;
  name_snapshot: string;
  description_snapshot: string | null;
  unit_snapshot: string;
  quantity: Generated<string>;
  unit_price: Generated<string>;
  discount_amount: Generated<string>;
  taxable_amount: Generated<string>;
  tax_rate: string | null;
  tax_amount: Generated<string>;
  line_total: Generated<string>;
  tax_type: string | null;
  tax_breakup: Generated<Record<string, unknown>>;
  hsn_sac: string | null;
  created_at: Generated<Date>;
}

export interface DebitNoteTable {
  id: Generated<string>;
  workspace_id: string;
  debit_note_number: string;
  status: Generated<DebitNoteStatus>;
  customer_party_id: string;
  invoice_id: string | null;
  issue_date: Generated<Date>;
  currency: Generated<string>;
  subtotal: Generated<string>;
  discount_total: Generated<string>;
  taxable_amount: Generated<string>;
  tax_amount: Generated<string>;
  total: Generated<string>;
  tax_breakup: Generated<Record<string, unknown>>;
  place_of_supply: string | null;
  party_snapshot: Generated<Record<string, unknown>>;
  reason: string | null;
  notes: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface DebitNoteLineItemTable {
  id: Generated<string>;
  workspace_id: string;
  debit_note_id: string;
  position: Generated<number>;
  product_id: string | null;
  sku_snapshot: string | null;
  name_snapshot: string;
  description_snapshot: string | null;
  unit_snapshot: string;
  quantity: Generated<string>;
  unit_price: Generated<string>;
  discount_amount: Generated<string>;
  taxable_amount: Generated<string>;
  tax_rate: string | null;
  tax_amount: Generated<string>;
  line_total: Generated<string>;
  tax_type: string | null;
  tax_breakup: Generated<Record<string, unknown>>;
  hsn_sac: string | null;
  created_at: Generated<Date>;
}

export interface VendorTable {
  id: Generated<string>;
  workspace_id: string;
  vendor_number: string | null;
  display_name: string;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  address: Generated<Record<string, unknown>>;
  gstin: string | null;
  tax_id: string | null;
  payment_terms: string | null;
  bank_details: Generated<Record<string, unknown>>;
  status: Generated<VendorStatus>;
  notes: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface ExpenseTable {
  id: Generated<string>;
  workspace_id: string;
  expense_number: string;
  vendor_id: string | null;
  category: string | null;
  expense_date: Generated<Date>;
  due_date: Date | null;
  amount: Generated<string>;
  tax_amount: Generated<string>;
  total: Generated<string>;
  currency: Generated<string>;
  tax_breakup: Generated<Record<string, unknown>>;
  payment_status: Generated<ExpensePaymentStatus>;
  receipt_ref: string | null;
  notes: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface RecurringInvoiceScheduleTable {
  id: Generated<string>;
  workspace_id: string;
  customer_party_id: string;
  contact_id: string | null;
  company_id: string | null;
  status: Generated<RecurringScheduleStatus>;
  cadence: RecurringCadence;
  next_run_at: Date;
  currency: Generated<string>;
  place_of_supply: string | null;
  payment_terms: string | null;
  notes: string | null;
  terms: string | null;
  line_template: Generated<unknown[]>;
  party_snapshot: Generated<Record<string, unknown>>;
  metadata: Generated<Record<string, unknown>>;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  deleted_at: Date | null;
}

export interface RecurringInvoiceRunTable {
  id: Generated<string>;
  workspace_id: string;
  schedule_id: string;
  period_key: string;
  invoice_id: string | null;
  status: Generated<RecurringRunStatus>;
  error_message: string | null;
  created_at: Generated<Date>;
}

export type BusinessTaskType =
  | 'follow_up'
  | 'call'
  | 'demo'
  | 'meeting'
  | 'payment_follow_up'
  | 'onboarding'
  | 'renewal'
  | 'support'
  | 'internal'
  | 'other';

export type BusinessTaskPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

/** Includes legacy `todo` for pre–Round-1 rows. */
export type BusinessTaskStatus = 'todo' | 'open' | 'in_progress' | 'done' | 'cancelled';

export interface TaskTable {
  id: Generated<string>;
  workspace_id: string;
  assignee_id: string;
  contact_id: string | null;
  record_id: string | null;
  title: string;
  due_date: Date | null;
  status: Generated<BusinessTaskStatus>;
  /** Business Ops Round 1 extensions */
  task_type: Generated<BusinessTaskType>;
  priority: Generated<BusinessTaskPriority>;
  assigned_by_id: string | null;
  due_at: Date | null;
  body: string | null;
  related_lead_id: string | null;
  related_customer_party_id: string | null;
  related_deal_id: string | null;
  related_quote_id: string | null;
  related_invoice_id: string | null;
  recurrence_rule_id: string | null;
  reminder_at: Date | null;
  completed_at: Date | null;
  completion_outcome: string | null;
  /** Round A — unbounded (default) vs time_bound (meetings/slots). */
  scheduling_mode: Generated<'unbounded' | 'time_bound'>;
  start_at: Date | null;
  end_at: Date | null;
  duration_minutes: number | null;
  timezone: string | null;
  meeting_mode: 'online' | 'offline' | null;
  location: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type CrmRecordEntityType = 'lead' | 'customer_party' | 'deal';

export type CrmFieldType =
  | 'text'
  | 'long_text'
  | 'number'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'phone'
  | 'email'
  | 'url'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'
  | 'user_ref';

export interface CrmRecordSectionTable {
  id: Generated<string>;
  workspace_id: string;
  entity_type: CrmRecordEntityType;
  section_key: string;
  label: string;
  position: Generated<number>;
  archived_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CrmFieldDefinitionTable {
  id: Generated<string>;
  workspace_id: string;
  entity_type: CrmRecordEntityType;
  section_id: string | null;
  field_key: string;
  label: string;
  field_type: CrmFieldType;
  required: Generated<boolean>;
  default_json: Record<string, unknown> | null;
  validation_json: Record<string, unknown> | null;
  position: Generated<number>;
  searchable: Generated<boolean>;
  archived_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CrmFieldOptionTable {
  id: Generated<string>;
  workspace_id: string;
  field_id: string;
  option_value: string;
  label: string;
  position: Generated<number>;
  archived_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CrmFieldValueTable {
  id: Generated<string>;
  workspace_id: string;
  entity_type: CrmRecordEntityType;
  entity_id: string;
  field_key: string;
  value_json: unknown | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type OrgEntityStatus = 'active' | 'inactive';

export interface DepartmentTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  status: Generated<OrgEntityStatus>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TeamTable {
  id: Generated<string>;
  workspace_id: string;
  department_id: string;
  name: string;
  status: Generated<OrgEntityStatus>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EmployeeProfileTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  employee_code: string | null;
  display_name: string;
  designation: string | null;
  primary_department_id: string | null;
  primary_team_id: string | null;
  manager_employee_id: string | null;
  joined_on: Date | null;
  status: Generated<OrgEntityStatus>;
  work_email: string | null;
  work_phone: string | null;
  commission_eligible: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TeamMemberTable {
  workspace_id: string;
  team_id: string;
  employee_id: string;
  is_primary: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface EmployeeReportingHistoryTable {
  id: Generated<string>;
  workspace_id: string;
  employee_id: string;
  from_manager_id: string | null;
  to_manager_id: string | null;
  effective_at: Date;
  changed_by: string | null;
  created_at: Generated<Date>;
}

export interface BusinessTaskRecurrenceRuleTable {
  id: Generated<string>;
  workspace_id: string;
  task_id: string | null;
  frequency: 'daily' | 'weekly' | 'monthly';
  interval_n: Generated<number>;
  next_run_at: Date | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TargetMetricTable {
  metric_key: string;
  label: string;
  description: string | null;
  unit: Generated<'count' | 'currency'>;
  calculator_version: Generated<string>;
  active: Generated<boolean>;
}

export type TargetPeriodGranularity = 'daily' | 'weekly' | 'monthly';
export type TargetPeriodStatus = 'open' | 'closed';
export type TargetSubjectType = 'employee' | 'team' | 'department' | 'tenant';

export interface TargetPeriodTable {
  id: Generated<string>;
  workspace_id: string;
  granularity: TargetPeriodGranularity;
  period_start: Date;
  period_end: Date;
  status: Generated<TargetPeriodStatus>;
  closed_at: Date | null;
  closed_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TargetTable {
  id: Generated<string>;
  workspace_id: string;
  period_id: string;
  metric_key: string;
  subject_type: TargetSubjectType;
  subject_id: string | null;
  goal_value: string;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AchievementSnapshotTable {
  id: Generated<string>;
  workspace_id: string;
  target_id: string;
  period_id: string;
  metric_key: string;
  subject_type: string;
  subject_id: string | null;
  goal_value: string;
  actual_value: string;
  remaining: string | null;
  pct_achieved: string | null;
  calculator_version: Generated<string>;
  closed_at: Generated<Date>;
  snapshot: Generated<Record<string, unknown>>;
}

export type DprEntryStatus = 'draft' | 'submitted' | 'reviewed' | 'returned';

export interface DprEntryTable {
  id: Generated<string>;
  workspace_id: string;
  employee_id: string;
  report_date: Date;
  status: Generated<DprEntryStatus>;
  system_snapshot: Generated<Record<string, unknown>>;
  manual_overlay: Generated<Record<string, unknown>>;
  calculator_version: Generated<string>;
  submitted_at: Date | null;
  submitted_by: string | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  review_comment: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DprReviewEventTable {
  id: Generated<string>;
  workspace_id: string;
  dpr_entry_id: string;
  from_status: string;
  to_status: string;
  actor_user_id: string | null;
  comment: string | null;
  created_at: Generated<Date>;
}

export type OpsCommissionHookEventType = 'deal.won' | 'payment.succeeded';

export interface OpsCommissionHookEventTable {
  id: Generated<string>;
  workspace_id: string;
  employee_id: string;
  event_type: OpsCommissionHookEventType;
  source_type: string;
  source_id: string;
  status: Generated<'recorded'>;
  meta: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface ActivityTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string | null;
  contact_id: string | null;
  record_id: string | null;
  type: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  /** Round B — timeline display time (defaults to created_at). */
  occurred_at: Date | null;
  heading: string | null;
  created_at: Generated<Date>;
}

export interface AlertTable {
  id: Generated<string>;
  workspace_id: string;
  resource_type: 'server' | 'database' | 'website' | 'crm' | 'projects';
  resource_id: string | null;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  metric_type: string | null;
  acknowledged: Generated<boolean>;
  acknowledged_by: string | null;
  resolved: Generated<boolean>;
  resolved_at: Date | null;
  created_at: Generated<Date>;
}

export interface ServerTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  region: string | null;
  ip_address: string | null;
  agent_token_hash: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  uptime_seconds: number | null;
  load_avg_1m: number | null;
  net_in_bytes: number | null;
  net_out_bytes: number | null;
  ssh_port: Generated<number>;
  status: Generated<ServerStatus>;
  last_ping_at: string | null;
  hostname: string | null;
  os: string | null;
  arch: string | null;
  kernel: string | null;
  agent_version: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface InfraDatabaseTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  engine: DbEngine;
  version: string | null;
  host: string | null;
  port: number | null;
  db_user: string | null;
  db_password: string | null;
  database_name: string | null;
  use_ssl: Generated<boolean>;
  storage_gb: number | null;
  connection_count: number | null;
  replication_lag_s: number | null;
  memory_used_mb: number | null;
  connected_clients: number | null;
  uptime_seconds: number | null;
  status: Generated<InfraDatabaseStatus>;
  last_checked_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WebsiteTable {
  id: Generated<string>;
  workspace_id: string;
  url: string;
  label: string | null;
  host: string | null;
  response_ms: number | null;
  uptime_pct_30d: number | null;
  ssl_expiry_date: string | null;
  status: Generated<WebsiteStatus>;
  last_checked_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface MetricsSnapshotTable {
  id: Generated<string>;
  server_id: string;
  workspace_id: string;
  cpu_pct: number;
  mem_pct: number;
  disk_pct: number;
  load_avg_1m: number;
  net_in_bytes: number;
  net_out_bytes: number;
  recorded_at: Generated<string>;
}

export interface MetricsRollupTable {
  id: Generated<string>;
  server_id: string;
  workspace_id: string;
  granularity: 'hour' | 'day';
  bucket: string;
  cpu_avg: number;
  cpu_max: number;
  mem_avg: number;
  mem_max: number;
  disk_avg: number;
  disk_max: number;
  load_avg_1m_avg: number;
  net_in_bytes_sum: number;
  net_out_bytes_sum: number;
  sample_count: number;
}

export interface AlertThresholdTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string | null;
  cpu_pct: Generated<number>;
  mem_pct: Generated<number>;
  disk_pct: Generated<number>;
  response_ms: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface WorkspaceSshKeypairTable {
  id: Generated<string>;
  workspace_id: string;
  public_key: string;
  encrypted_private_key: string;
  iv: string;
  ssh_user: Generated<string>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface SshCommandLogTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string;
  user_id: string;
  command: string;
  exit_code: number | null;
  created_at: Generated<string>;
}

export interface PipelineTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: Generated<boolean>;
  position: Generated<number>;
  view: Generated<string>;          // 'kanban' | 'table' | 'list'
  table_columns: string[] | null;   // jsonb, null = use default columns
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PipelineStageTable {
  id: Generated<string>;
  pipeline_id: string;
  name: string;
  color: Generated<string>;
  position: Generated<number>;
  is_won: Generated<boolean>;
  is_lost: Generated<boolean>;
  /** Optional default applied to deal.probability when entering this stage (Round A). */
  default_probability: number | null;
  archived_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PipelineFieldTable {
  id: Generated<string>;
  pipeline_id: string;
  label: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'user' | 'checkbox' | 'url';
  options: Record<string, unknown>[] | null;
  position: Generated<number>;
  required: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface PipelineItemTable {
  id: Generated<string>;
  pipeline_id: string;
  stage_id: string;
  workspace_id: string;
  position: Generated<number>;
  field_values: Generated<Record<string, unknown>>;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PipelineAutomationTable {
  id: Generated<string>;
  pipeline_id: string;
  name: string;
  trigger_type: 'stage_changed' | 'field_changed' | 'item_created' | 'date_approaching';
  trigger_conditions: Generated<Record<string, unknown>>;
  action_type: 'notify_assignee' | 'assign_user' | 'move_stage';
  action_params: Generated<Record<string, unknown>>;
  enabled: Generated<boolean>;
  last_fired_at: Date | null;
  created_at: Generated<Date>;
}

export interface PipelineActivityTable {
  id: Generated<string>;
  item_id: string;
  pipeline_id: string;
  workspace_id: string;
  user_id: string | null;
  event_type: string;
  payload: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface StageFieldTable {
  id: Generated<string>;
  stage_id: string;
  name: string;
  field_type: FieldType;
  is_required: Generated<boolean>;
  options: string[] | null;  // jsonb
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DealFieldValueTable {
  id: Generated<string>;
  deal_id: string;
  field_id: string;
  value: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemGroupTable {
  id: Generated<string>;
  pipeline_id: string;
  workspace_id: string;
  name: string;
  color: string | null;
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface GroupStageTable {
  id: Generated<string>;
  group_id: string;
  name: string;
  color: string | null;
  position: Generated<number>;
  is_won: Generated<boolean>;
  is_lost: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemTable {
  id: Generated<string>;
  workspace_id: string;
  group_id: string;
  stage_id: string;
  title: string;
  value: number | null;
  owner_id: string;
  contact_id: string | null;
  company_id: string | null;
  converted_from_id: string | null;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemFieldTable {
  id: Generated<string>;
  group_id: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  required: Generated<boolean>;
  position: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ItemFieldValueTable {
  id: Generated<string>;
  item_id: string;
  field_id: string;
  value: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WebhookSubscriptionTable {
  id: Generated<string>;
  workspace_id: string;
  target_url: string;
  event: string;
  secret: string;
  created_at: Generated<string>;
}

export interface WebhookDeliveryTable {
  id: Generated<string>;
  subscription_id: string;
  event: string;
  payload: unknown;
  status: Generated<string>;
  attempts: Generated<number>;
  next_attempt_at: Generated<string>;
  last_error: string | null;
  created_at: Generated<string>;
  delivered_at: string | null;
}

export interface ApiKeyTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  key_hash: string;
  prefix: string;
  scope: string;
  last_used_at: Date | null;
  created_at: Generated<Date>;
}

export interface NotificationTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  resource_type: string | null;
  resource_id: string | null;
  read: Generated<boolean>;
  severity: Generated<string>;
  delivery_key: string | null;
  created_at: Generated<Date>;
}

export interface InstanceMetaTable {
  id: Generated<number>;
  latest_version: string | null;
  release_url: string | null;
  last_checked_at: Date | null;
  notified_version: string | null;
}

export interface EmailAccountTable {
  id: Generated<string>;
  user_id: string;
  workspace_id: string;
  provider: 'gmail' | 'imap';
  email: string;
  display_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  gmail_history_id: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_pass: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_pass: string | null;
  use_ssl: Generated<boolean>;
  sync_status: Generated<'idle' | 'syncing' | 'error'>;
  sync_error: string | null;
  last_synced_at: string | null;
  gmail_watch_expiry: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface EmailTable {
  id: Generated<string>;
  account_id: string;
  workspace_id: string;
  user_id: string;
  message_id: string;
  thread_id: string | null;
  subject: string | null;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  snippet: string | null;
  folder: Generated<'inbox' | 'sent' | 'drafts' | 'trash' | 'spam'>;
  is_read: Generated<boolean>;
  is_starred: Generated<boolean>;
  sent_at: string;
  synced_at: Generated<string>;
  contact_id: string | null;
  deal_id: string | null;
}

export interface PushTokenTable {
  id: Generated<string>;
  user_id: string;
  workspace_id: string;
  token: string;
  platform: string;
  preferences: Generated<Record<string, boolean>>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RecordTypeTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  icon: Generated<string>;
  color: Generated<string>;
  position: Generated<number>;
  auto_number_enabled: Generated<boolean>;
  auto_number_prefix: Generated<string>;
  auto_number_format: Generated<string>;
  auto_number_sequence: Generated<number>;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RecordTypeFieldTable {
  id: Generated<string>;
  record_type_id: string;
  label: string;
  field_type: FieldType;
  options: unknown | null;
  is_required: Generated<boolean>;
  position: Generated<number>;
  created_at: Generated<string>;
}

export interface RecordTypePermissionTable {
  id: Generated<string>;
  record_type_id: string;
  role_id: string;
  can_view: Generated<boolean>;
  can_create: Generated<boolean>;
  can_edit: Generated<boolean>;
  can_delete: Generated<boolean>;
}

export interface StageRequiredFieldTable {
  stage_id: string;
  field_id: string;
}

export interface PipelineRecordTable {
  id: Generated<string>;
  workspace_id: string;
  record_type_id: string;
  pipeline_id: string;
  stage_id: string;
  record_number: string | null;
  name: string;
  contact_id: string | null;
  company_id: string | null;
  owner_id: string;
  deleted_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface RecordFieldValueTable {
  id: Generated<string>;
  record_id: string;
  field_id: string;
  value: unknown;
}

export interface ConversionTemplateTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  source_type_id: string;
  target_type_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  position: Generated<number>;
  created_at: Generated<string>;
}

export interface ConversionFieldMappingTable {
  id: Generated<string>;
  template_id: string;
  source_field_id: string | null;
  source_builtin: string | null;
  target_field_id: string | null;
  target_builtin: string | null;
}

export interface RecordConversionTable {
  id: Generated<string>;
  source_record_id: string;
  target_record_id: string;
  template_id: string;
  converted_by: string;
  converted_at: Generated<string>;
}

export interface CalendarEventTable {
  id: Generated<string>;
  workspace_id: string;
  title: string;
  description: string | null;
  category: 'holiday' | 'company_event' | 'meeting' | 'other';
  color: string | null;
  start_date: string;
  end_date: string | null;
  all_day: Generated<boolean>;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SystemSettingsTable {
  key: string;
  value: Record<string, unknown>;
  updated_at: Generated<Date>;
}

export interface WorkspaceImapConfigTable {
  workspace_id: string;
  imap_host: string;
  imap_port: number;
  smtp_host: string;
  smtp_port: number;
  use_ssl: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeploymentTable {
  id: Generated<string>;
  workspace_id: string;
  server_id: string | null;
  name: string | null;
  environment: string | null;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  source: 'webhook' | 'agent' | 'manual';
  started_at: Generated<Date>;
  finished_at: Date | null;
  duration_s: number | null;
  git_commit: string | null;
  git_branch: string | null;
  git_tag: string | null;
  git_message: string | null;
  git_author: string | null;
  meta: Record<string, unknown> | null;
  created_at: Generated<Date>;
}

export type Deployment = Selectable<DeploymentTable>;
export type NewDeployment = Insertable<DeploymentTable>;
export type DeploymentUpdate = Updateable<DeploymentTable>;

export interface WorkspaceModuleTable {
  id: Generated<string>;
  workspace_id: string;
  module_id: string;
  enabled: Generated<boolean>;
  updated_at: Generated<Date>;
  updated_by: string | null;
}

export interface WorkspacePluginTable {
  id: Generated<string>;
  workspace_id: string;
  plugin_id: string;
  name: string;
  version: string;
  manifest: Record<string, unknown>;
  enabled: Generated<boolean>;
  installed_at: Generated<Date>;
  pricing_type: Generated<'free' | 'paid'>;
  license_key: string | null;
  source: Generated<'local' | 'marketplace'>;
  platform_plugin_id: string | null;
  license_status: 'active' | 'grace' | 'expired' | 'revoked' | 'bound_elsewhere' | 'not_found' | null;
  license_checked_at: Date | null;
}

export interface PluginStorageTable {
  id: Generated<string>;
  workspace_id: string;
  key: string;
  value: unknown;
  updated_at: Generated<Date>;
}

export interface PluginFilesTable {
  id: Generated<string>;
  workspace_id: string;
  plugin_id: string;
  name: string;
  mime: string;
  size: number;
  r2_key: string;
  created_at: Generated<Date>;
}

export interface PluginSettingsTable {
  id: Generated<string>;
  workspace_id: string;
  plugin_id: string;
  key: string;
  value: unknown;
  encrypted: Generated<boolean>;
  updated_at: Generated<Date>;
}

export interface PluginCronJobTable {
  id: Generated<string>;
  workspace_id: string;
  plugin_id: string;
  job_name: string;
  schedule: string;
  last_run_at: Date | null;
  next_run_at: Date;
  enabled: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface PluginHubRecordTable {
  id: Generated<string>;
  workspace_id: string;
  contract: string;
  provider_plugin_id: string;
  external_id: string;
  data: unknown;
  deleted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkspaceSidebarGroupTable {
  id: Generated<string>;
  workspace_id: string;
  label: string;
  position: number;
  is_default: Generated<boolean>;
  item_keys: string[]; // jsonb
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkspaceContractProviderTable {
  id: Generated<string>;
  workspace_id: string;
  contract_group: string;
  active_provider_id: string;
  status: Generated<'active' | 'pending_selection'>;
  previous_provider_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PluginHubSettingTable {
  id: Generated<string>;
  workspace_id: string;
  plugin_id: string;
  domain: string;
  key: string;
  value: unknown;
  shared: Generated<boolean>;
  updated_at: Generated<Date>;
}

export interface UserSidebarPrefsTable {
  user_id: string;
  workspace_id: string;
  pinned_keys: string[]; // jsonb
  collapsed_group_keys: string[]; // jsonb
  updated_at: Generated<Date>;
}

export interface PluginNotificationTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  plugin_id: string;
  title: string;
  body: string | null;
  type: Generated<string>;
  read: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface UserPermissionTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  permission: string;
  granted: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface RoleTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  description: string | null;
  color: Generated<string>;
  is_system: Generated<boolean>;
  grants_all: Generated<boolean>;
  is_default: Generated<boolean>;
  max_members: number | null;
  rank: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserRoleTable {
  id: Generated<string>;
  workspace_id: string;
  role_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface RolePermissionTable {
  id: Generated<string>;
  workspace_id: string;
  role_id: string;
  permission: string;
  created_at: Generated<Date>;
}

export interface RoleInheritanceTable {
  parent_role_id: string;
  child_role_id: string;
}

export interface SsdSetTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  cardinality: number;
}

export interface SsdSetRoleTable {
  set_id: string;
  role_id: string;
}

export interface DsdSetTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  cardinality: number;
}

export interface DsdSetRoleTable {
  set_id: string;
  role_id: string;
}

export interface UserSessionRoleTable {
  user_id: string;
  role_id: string;
  active: Generated<boolean>;
}

export interface InviteRoleTable {
  invite_id: string;
  role_id: string;
}

export interface MigrationDiscardedGrantTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  permission: string;
  discarded_at: Generated<Date>;
}

export interface InviteTable {
  id: Generated<string>;
  workspace_id: string;
  email: string;
  token: string;
  invited_by: string;
  role: Generated<string>;
  expires_at: Date;
  accepted_at: Date | null;
  created_at: Generated<Date>;
}

export interface DashboardTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  created_by: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DashboardLayoutTable {
  id: Generated<string>;
  dashboard_id: string;
  widget_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  min_w: number | null;
  min_h: number | null;
  permission_key: string | null;
  config: Generated<Record<string, unknown>>;
  created_at: Generated<Date>;
}

export interface DashboardGroupAssignmentTable {
  dashboard_id: string;
  role_id: string;
}

export interface ProjectTable {
  id: Generated<string>
  workspace_id: string
  name: string
  description: string | null
  color: string | null
  status: Generated<'ACTIVE' | 'ARCHIVED' | 'DELETED'>
  health: Generated<'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'>
  start_date: Date | null
  end_date: Date | null
  created_by: string
  // CRM hook links
  contact_id: string | null
  company_id: string | null
  source_item_id: string | null
  deal_id: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ProjectTaskStatusTable {
  id: Generated<string>
  project_id: string
  name: string
  color: string
  position: Generated<number>
  is_done: Generated<boolean>
}

export interface ProjectTaskTable {
  id: Generated<string>
  project_id: string
  parent_id: string | null
  status_id: string
  title: string
  description: string | null
  priority: Generated<'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'>
  due_date: Date | null
  start_date: Date | null
  estimated_minutes: number | null
  client_visible: Generated<boolean>
  position: Generated<number>
  created_by: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ProjectTaskAssigneeTable {
  task_id: string
  user_id: string
}

export interface ProjectTaskDependencyTable {
  task_id: string
  depends_on_task_id: string
  type: Generated<string>
}

export interface TaskLabelTable {
  id: Generated<string>
  project_id: string
  name: string
  color: string
}

export interface ProjectTaskLabelAssignmentTable {
  task_id: string
  label_id: string
}

export interface CustomFieldTable {
  id: Generated<string>
  project_id: string
  name: string
  field_type: string
  options: unknown | null
  created_at: Generated<Date>
}

export interface CustomFieldValueTable {
  task_id: string
  custom_field_id: string
  value: string | null
}

export interface ProjectTaskChecklistTable {
  id: Generated<string>
  task_id: string
  title: string
  is_done: Generated<boolean>
  position: Generated<number>
}

export interface TimeLogTable {
  id: Generated<string>
  task_id: string
  user_id: string
  minutes: number
  logged_at: Generated<Date>
  note: string | null
}

export interface ProjectTaskAttachmentTable {
  id: Generated<string>
  task_id: string
  filename: string
  url: string
  size_bytes: number | null
  is_deliverable: Generated<boolean>
  uploaded_by: string
  uploaded_at: Generated<Date>
}

export interface ProjectTaskCommentTable {
  id: Generated<string>
  task_id: string
  user_id: string | null
  portal_session_id: string | null
  body: string
  parent_id: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface MilestoneTable {
  id: Generated<string>
  project_id: string
  name: string
  description: string | null
  due_date: Date
  status: Generated<string>
  client_visible: Generated<boolean>
  position: Generated<number>
}

export interface MilestoneTaskTable {
  milestone_id: string
  task_id: string
}

export interface SprintTable {
  id: Generated<string>
  project_id: string
  name: string
  start_date: Date
  end_date: Date
  status: Generated<string>
  goal: string | null
  velocity: number | null
}

export interface SprintTaskTable {
  sprint_id: string
  task_id: string
  points: number | null
}

export interface RecurringTaskRuleTable {
  id: Generated<string>
  project_id: string
  title: string
  description: string | null
  status_id: string | null
  priority: Generated<string>
  assignee_ids: string[] | null
  frequency: string
  interval: Generated<number>
  next_run_at: Date
  is_active: Generated<boolean>
  created_by: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ProjectMemberTable {
  id: Generated<string>
  project_id: string
  user_id: string
  role: Generated<string>
  joined_at: Generated<Date>
}

export interface PortalAccessTable {
  id: Generated<string>
  project_id: string
  label: string
  token: string
  password_hash: string | null
  is_active: Generated<boolean>
  last_accessed: Date | null
  created_by: string
  created_at: Generated<Date>
}

export interface ClientPortalSessionTable {
  id: Generated<string>
  portal_id: string
  ip: string | null
  user_agent: string | null
  started_at: Generated<Date>
  last_seen: Generated<Date>
}

export interface ApprovalRequestTable {
  id: Generated<string>
  project_id: string
  portal_id: string
  task_id: string | null
  milestone_id: string | null
  attachment_id: string | null
  recipient_email: string | null
  status: Generated<string>
  note: string | null
  responded_at: Date | null
  created_at: Generated<Date>
}

export interface CrossModuleSettingTable {
  id: Generated<string>
  workspace_id: string
  setting_key: string
  enabled: Generated<boolean>
  config: Record<string, unknown> | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface AutomationRuleTable {
  id: Generated<string>
  project_id: string
  name: string
  is_active: Generated<boolean>
  trigger: unknown
  actions: unknown
  created_by: string
  created_at: Generated<Date>
}

export interface AutomationLogTable {
  id: Generated<string>
  rule_id: string
  triggered_at: Generated<Date>
  success: boolean
  detail: string | null
}

export interface ProjectDocTable {
  id: Generated<string>
  project_id: string
  title: string
  content: unknown | null
  created_by: string
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface ProjectTemplateTable {
  id: Generated<string>
  workspace_id: string
  name: string
  description: string | null
  is_public: Generated<boolean>
  template_data: unknown
  created_by: string
  created_at: Generated<Date>
}

export interface ContactTagTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  color: Generated<string>;
  created_at: Generated<Date>;
}

export interface ContactTagLinkTable {
  contact_id: string;
  tag_id: string;
  created_at: Generated<Date>;
}

/** Phase 5 — double-entry chart of accounts */
export interface AccountTable {
  id: Generated<string>;
  workspace_id: string;
  code: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  is_control: Generated<boolean>;
  control_key: string | null;
  is_system: Generated<boolean>;
  is_active: Generated<boolean>;
  parent_id: string | null;
  description: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountingPeriodTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'soft_closed' | 'locked';
  closed_at: Date | null;
  closed_by: string | null;
  locked_at: Date | null;
  locked_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntryTable {
  id: Generated<string>;
  workspace_id: string;
  entry_number: string;
  entry_date: string;
  period_id: string;
  status: 'draft' | 'posted' | 'reversed';
  memo: string | null;
  source_type: string;
  source_id: string | null;
  posting_key: string;
  currency: Generated<string>;
  posted_at: Date | null;
  posted_by: string | null;
  reversed_by_entry_id: string | null;
  reverses_entry_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalLineTable {
  id: Generated<string>;
  workspace_id: string;
  journal_entry_id: string;
  line_no: number;
  account_id: string;
  description: string | null;
  debit: Generated<string>;
  credit: Generated<string>;
  party_type: string | null;
  party_id: string | null;
  created_at: Generated<Date>;
}

export interface DocumentTemplateTable {
  id: Generated<string>;
  workspace_id: string | null;
  doc_type: 'quote' | 'invoice' | 'credit_note' | 'debit_note';
  version: Generated<number>;
  name: string;
  engine: Generated<string>;
  body_html: string;
  locale: Generated<string>;
  paper_size: Generated<string>;
  status: 'draft' | 'published' | 'archived';
  is_system: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DocumentArtifactTable {
  id: Generated<string>;
  workspace_id: string;
  doc_type: 'quote' | 'invoice' | 'credit_note' | 'debit_note';
  source_type: string;
  source_id: string;
  template_id: string | null;
  template_version: number;
  status: 'pending' | 'rendering' | 'ready' | 'failed';
  mime_type: Generated<string>;
  storage_key: string | null;
  sha256: string | null;
  byte_size: number | null;
  page_count: number | null;
  branding_snapshot: Generated<unknown>;
  snapshot_payload: Generated<unknown>;
  error_message: string | null;
  render_idempotency_key: string;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  ready_at: Date | null;
}

export interface NotificationDeliveryTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  event_type: string;
  channel: 'in_app' | 'email';
  severity: Generated<string>;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  notification_id: string | null;
  delivery_key: string;
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  error_message: string | null;
  attempts: Generated<number>;
  delivered_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ReminderRunTable {
  id: Generated<string>;
  workspace_id: string;
  reminder_type: string;
  resource_type: string;
  resource_id: string;
  fire_key: string;
  fired_at: Generated<Date>;
}

export interface TenantExportJobTable {
  id: Generated<string>;
  workspace_id: string;
  status: 'pending' | 'running' | 'ready' | 'failed';
  requested_by: string | null;
  storage_key: string | null;
  byte_size: number | null;
  sha256: string | null;
  error_message: string | null;
  include_scopes: Generated<unknown>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  completed_at: Date | null;
}

export interface ModuleEventSettingsTable {
  workspace_id: string;
  module_id: string;
  activity_on: Generated<boolean>;
  alerts_on: Generated<boolean>;
  updated_at: Generated<Date>;
}

export interface NotificationPreferencesTable {
  workspace_id: string;
  channel: string;
  severity: string;
  enabled: Generated<boolean>;
  updated_at: Generated<Date>;
}

export interface InfraDbThresholdTable {
  id: Generated<string>;
  workspace_id: string;
  database_id: string | null;
  connection_count_max: number | null;
  replication_lag_s_max: number | null;
  storage_gb_max: number | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export type ChannelType = 'channel' | 'dm' | 'group_dm';
export type ChannelMemberRole = 'owner' | 'member';

export interface ChannelTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  type: Generated<ChannelType>;
  is_private: Generated<boolean>;
  topic: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}

export interface InfraDbQueryHistoryTable {
  id: Generated<string>;
  workspace_id: string;
  database_id: string;
  user_id: string;
  engine: string;
  query_text: string;
  query_type: 'sql' | 'mongo';
  executed_at: Generated<string>;
  row_count: number | null;
  duration_ms: number | null;
}

export interface ChannelMemberTable {
  channel_id: string;
  user_id: string;
  role: Generated<ChannelMemberRole>;
  joined_at: Generated<string>;
}

export interface MessageTable {
  id: Generated<string>;
  channel_id: string;
  workspace_id: string;
  user_id: string | null;
  body: string;
  parent_message_id: string | null;
  thread_count: Generated<number>;
  mention_user_ids: string[] | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: Generated<string>;
}

export interface MessageReactionTable {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Generated<string>;
}

export interface MessageAttachmentTable {
  id: Generated<string>;
  message_id: string;
  workspace_id: string;
  r2_key: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
  created_at: Generated<string>;
}

export interface ChannelReadStateTable {
  channel_id: string;
  user_id: string;
  last_read_message_id: string | null;
}

export interface HookProviderTable {
  id: Generated<string>;
  workspace_id: string;
  provider_id: string;
  name: string;
  source: 'builtin' | 'plugin';
  enabled: Generated<boolean>;
  meta: Record<string, unknown> | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkspaceHookConfigTable {
  id: Generated<string>;
  workspace_id: string;
  module_id: string;
  feature_id: string;
  provider_id: string | null;
  config: Record<string, unknown> | null;
  enabled: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Phase 6 Round 1 — Automation engine (ADR-027). */
export interface WorkflowTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  description: string | null;
  status: Generated<'draft' | 'published' | 'archived'>;
  current_draft_version_id: string | null;
  current_published_version_id: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowVersionTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string;
  version_number: number;
  state: Generated<'draft' | 'published' | 'superseded'>;
  graph: Generated<Record<string, unknown>>;
  schema_hash: string;
  published_at: Date | null;
  published_by: string | null;
  created_at: Generated<Date>;
}

export interface WorkflowTriggerTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string;
  workflow_version_id: string;
  event_name: string;
  filter: Record<string, unknown> | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface WorkflowRunTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string;
  workflow_version_id: string;
  status: Generated<
    | 'queued'
    | 'running'
    | 'waiting'
    | 'awaiting_approval'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'dead_lettered'
  >;
  trigger_event_id: string | null;
  trigger_event_name: string | null;
  trigger_payload: Generated<Record<string, unknown>>;
  correlation_id: string | null;
  causation_id: string | null;
  run_key: string;
  pause_reason: string | null;
  error: Record<string, unknown> | null;
  started_at: Date | null;
  finished_at: Date | null;
  run_timeout_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AutomationApprovalTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_id: string;
  workflow_version_id: string;
  workflow_run_id: string;
  workflow_run_step_id: string | null;
  action_type: string;
  requested_payload_snapshot: Record<string, unknown>;
  payload_hash: string;
  requester_type: string;
  requester_id: string;
  approver_type: string | null;
  approver_id: string | null;
  status: Generated<'pending' | 'authorized' | 'rejected' | 'expired' | 'revoked'>;
  decision: string | null;
  reason: string | null;
  comment: string | null;
  requested_at: Generated<Date>;
  decided_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
  audit_link_id: string | null;
  idempotency_key: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowRunStepTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_run_id: string;
  node_id: string;
  step_type: 'condition' | 'branch' | 'delay' | 'approval' | 'action';
  status: Generated<
    | 'pending'
    | 'ready'
    | 'running'
    | 'waiting'
    | 'awaiting_approval'
    | 'succeeded'
    | 'failed'
    | 'skipped'
    | 'cancelled'
  >;
  attempt: Generated<number>;
  step_key: string;
  input_snapshot: Generated<Record<string, unknown>>;
  output_snapshot: Record<string, unknown> | null;
  approval_id: string | null;
  error: Record<string, unknown> | null;
  scheduled_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  step_timeout_at: Date | null;
  parent_step_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkflowRunStepAttemptTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_run_step_id: string;
  attempt_number: number;
  status: string;
  error: Record<string, unknown> | null;
  worker_id: string | null;
  job_handle: string | null;
  started_at: Generated<Date>;
  finished_at: Date | null;
}

export interface AutomationApprovalEventTable {
  id: Generated<string>;
  tenant_id: string;
  approval_id: string;
  event_type:
    | 'requested'
    | 'authorized'
    | 'rejected'
    | 'expired'
    | 'revoked'
    | 'validation_failed';
  actor_type: string;
  actor_id: string | null;
  at: Generated<Date>;
  detail: Generated<Record<string, unknown>>;
}

export interface AutomationDeadLetterTable {
  id: Generated<string>;
  tenant_id: string;
  workflow_run_id: string;
  workflow_run_step_id: string | null;
  reason: string;
  last_error: Record<string, unknown> | null;
  attempts: Generated<number>;
  created_at: Generated<Date>;
  resolved_at: Date | null;
  resolved_by: string | null;
}

export interface AutomationUsageCounterTable {
  tenant_id: string;
  period_start: Date;
  runs_started: Generated<number>;
  runs_completed: Generated<number>;
  runs_failed: Generated<number>;
  steps_executed: Generated<number>;
  actions_class_a: Generated<number>;
  actions_class_b: Generated<number>;
  approvals_requested: Generated<number>;
  approvals_authorized: Generated<number>;
  updated_at: Generated<Date>;
}

export interface AutomationUsageEventTable {
  id: Generated<string>;
  tenant_id: string;
  dedupe_key: string;
  counter_name: string;
  created_at: Generated<Date>;
}

export interface Database {
  tenants: TenantTable;
  tenant_memberships: TenantMembershipTable;
  tenant_domains: TenantDomainTable;
  tenant_settings: TenantSettingsTable;
  tenant_branding: TenantBrandingTable;
  tenant_job_controls: TenantJobControlsTable;
  platform_users: PlatformUserTable;
  security_audit_events: SecurityAuditEventTable;
  outbox_events: OutboxEventTable;
  workspaces: WorkspaceTable;
  users: UserTable;
  companies: CompanyTable;
  contacts: ContactTable;
  contact_tags: ContactTagTable;
  contact_tag_links: ContactTagLinkTable;
  deals: DealTable;
  deal_migration_traces: DealMigrationTraceTable;
  leads: LeadTable;
  lead_conversion_links: LeadConversionLinkTable;
  customer_parties: CustomerPartyTable;
  customer_party_merge_events: CustomerPartyMergeEventTable;
  products: ProductTable;
  quote_number_sequences: QuoteNumberSequenceTable;
  quotes: QuoteTable;
  quote_line_items: QuoteLineItemTable;
  tenant_finance_profiles: TenantFinanceProfileTable;
  finance_number_sequences: FinanceNumberSequenceTable;
  invoices: InvoiceTable;
  invoice_line_items: InvoiceLineItemTable;
  payments: PaymentTable;
  payment_refunds: PaymentRefundTable;
  credit_notes: CreditNoteTable;
  credit_note_line_items: CreditNoteLineItemTable;
  debit_notes: DebitNoteTable;
  debit_note_line_items: DebitNoteLineItemTable;
  vendors: VendorTable;
  expenses: ExpenseTable;
  recurring_invoice_schedules: RecurringInvoiceScheduleTable;
  recurring_invoice_runs: RecurringInvoiceRunTable;
  accounts: AccountTable;
  accounting_periods: AccountingPeriodTable;
  journal_entries: JournalEntryTable;
  journal_lines: JournalLineTable;
  document_templates: DocumentTemplateTable;
  document_artifacts: DocumentArtifactTable;
  notification_deliveries: NotificationDeliveryTable;
  reminder_runs: ReminderRunTable;
  tenant_export_jobs: TenantExportJobTable;
  tasks: TaskTable;
  crm_record_sections: CrmRecordSectionTable;
  crm_field_definitions: CrmFieldDefinitionTable;
  crm_field_options: CrmFieldOptionTable;
  crm_field_values: CrmFieldValueTable;
  departments: DepartmentTable;
  teams: TeamTable;
  employee_profiles: EmployeeProfileTable;
  team_members: TeamMemberTable;
  employee_reporting_history: EmployeeReportingHistoryTable;
  business_task_recurrence_rules: BusinessTaskRecurrenceRuleTable;
  target_metrics: TargetMetricTable;
  target_periods: TargetPeriodTable;
  targets: TargetTable;
  achievement_snapshots: AchievementSnapshotTable;
  dpr_entries: DprEntryTable;
  dpr_review_events: DprReviewEventTable;
  ops_commission_hook_events: OpsCommissionHookEventTable;
  activities: ActivityTable;
  alerts: AlertTable;
  servers: ServerTable;
  infra_databases: InfraDatabaseTable;
  websites: WebsiteTable;
  metrics_snapshots: MetricsSnapshotTable;
  metrics_rollups: MetricsRollupTable;
  alert_thresholds: AlertThresholdTable;
  deployments: DeploymentTable;
  workspace_ssh_keypairs: WorkspaceSshKeypairTable;
  ssh_command_log: SshCommandLogTable;
  pipelines: PipelineTable;
  pipeline_stages: PipelineStageTable;
  pipeline_fields: PipelineFieldTable;
  pipeline_items: PipelineItemTable;
  pipeline_automations: PipelineAutomationTable;
  pipeline_activity: PipelineActivityTable;
  stage_fields: StageFieldTable;
  deal_field_values: DealFieldValueTable;
  item_groups: ItemGroupTable;
  group_stages: GroupStageTable;
  items: ItemTable;
  item_fields: ItemFieldTable;
  item_field_values: ItemFieldValueTable;
  webhook_subscriptions: WebhookSubscriptionTable;
  webhook_deliveries: WebhookDeliveryTable;
  api_keys: ApiKeyTable;
  notifications: NotificationTable;
  email_accounts: EmailAccountTable;
  emails: EmailTable;
  push_tokens: PushTokenTable;
  record_types: RecordTypeTable;
  record_type_fields: RecordTypeFieldTable;
  record_type_permissions: RecordTypePermissionTable;
  stage_required_fields: StageRequiredFieldTable;
  pipeline_records: PipelineRecordTable;
  record_field_values: RecordFieldValueTable;
  conversion_templates: ConversionTemplateTable;
  conversion_field_mappings: ConversionFieldMappingTable;
  record_conversions: RecordConversionTable;
  calendar_events: CalendarEventTable;
  system_settings: SystemSettingsTable;
  workspace_imap_config: WorkspaceImapConfigTable;
  workspace_modules: WorkspaceModuleTable;
  workspace_plugins: WorkspacePluginTable;
  plugin_storage: PluginStorageTable;
  plugin_files: PluginFilesTable;
  plugin_settings: PluginSettingsTable;
  plugin_cron_jobs: PluginCronJobTable;
  plugin_hub_records: PluginHubRecordTable;
  plugin_hub_settings: PluginHubSettingTable;
  workspace_contract_providers: WorkspaceContractProviderTable;
  plugin_notifications: PluginNotificationTable;
  user_permissions: UserPermissionTable;
  roles: RoleTable;
  user_roles: UserRoleTable;
  role_permissions: RolePermissionTable;
  role_inheritance: RoleInheritanceTable;
  ssd_sets: SsdSetTable;
  ssd_set_roles: SsdSetRoleTable;
  dsd_sets: DsdSetTable;
  dsd_set_roles: DsdSetRoleTable;
  user_session_roles: UserSessionRoleTable;
  invite_roles: InviteRoleTable;
  migration_discarded_grants: MigrationDiscardedGrantTable;
  invites: InviteTable;
  dashboards: DashboardTable;
  dashboard_layouts: DashboardLayoutTable;
  dashboard_group_assignments: DashboardGroupAssignmentTable;
  projects: ProjectTable
  cross_module_settings: CrossModuleSettingTable
  project_task_statuses: ProjectTaskStatusTable
  project_tasks: ProjectTaskTable
  project_task_assignees: ProjectTaskAssigneeTable
  project_task_dependencies: ProjectTaskDependencyTable
  task_labels: TaskLabelTable
  project_task_label_assignments: ProjectTaskLabelAssignmentTable
  custom_fields: CustomFieldTable
  custom_field_values: CustomFieldValueTable
  project_task_checklists: ProjectTaskChecklistTable
  time_logs: TimeLogTable
  project_task_attachments: ProjectTaskAttachmentTable
  project_task_comments: ProjectTaskCommentTable
  milestones: MilestoneTable
  milestone_tasks: MilestoneTaskTable
  sprints: SprintTable
  sprint_tasks: SprintTaskTable
  recurring_task_rules: RecurringTaskRuleTable
  project_members: ProjectMemberTable
  portal_access: PortalAccessTable
  client_portal_sessions: ClientPortalSessionTable
  approval_requests: ApprovalRequestTable
  automation_rules: AutomationRuleTable
  automation_logs: AutomationLogTable
  workflows: WorkflowTable;
  workflow_versions: WorkflowVersionTable;
  workflow_triggers: WorkflowTriggerTable;
  workflow_runs: WorkflowRunTable;
  workflow_run_steps: WorkflowRunStepTable;
  workflow_run_step_attempts: WorkflowRunStepAttemptTable;
  automation_approvals: AutomationApprovalTable;
  automation_approval_events: AutomationApprovalEventTable;
  automation_dead_letters: AutomationDeadLetterTable;
  automation_usage_counters: AutomationUsageCounterTable;
  automation_usage_events: AutomationUsageEventTable;
  project_docs: ProjectDocTable
  project_templates: ProjectTemplateTable
  module_event_settings: ModuleEventSettingsTable;
  notification_preferences: NotificationPreferencesTable;
  infra_db_thresholds: InfraDbThresholdTable;
  infra_db_query_history: InfraDbQueryHistoryTable;
  channels: ChannelTable
  channel_members: ChannelMemberTable
  messages: MessageTable
  message_reactions: MessageReactionTable
  message_attachments: MessageAttachmentTable
  channel_read_state: ChannelReadStateTable
  hook_providers: HookProviderTable;
  workspace_hook_configs: WorkspaceHookConfigTable;
  instance_meta: InstanceMetaTable;
  workspace_sidebar_groups: WorkspaceSidebarGroupTable;
  user_sidebar_prefs: UserSidebarPrefsTable;
}

// Convenience types
export type Tenant = Selectable<TenantTable>;
export type TenantMembership = Selectable<TenantMembershipTable>;
export type TenantDomain = Selectable<TenantDomainTable>;
export type TenantBranding = Selectable<TenantBrandingTable>;
export type PlatformUser = Selectable<PlatformUserTable>;
export type SecurityAuditEvent = Selectable<SecurityAuditEventTable>;
export type OutboxEvent = Selectable<OutboxEventTable>;

export type Workspace = Selectable<WorkspaceTable>;
export type NewWorkspace = Insertable<WorkspaceTable>;
export type WorkspaceUpdate = Updateable<WorkspaceTable>;

export type User = Selectable<UserTable>;
export type NewUser = Insertable<UserTable>;
export type UserUpdate = Updateable<UserTable>;

export type Company = Selectable<CompanyTable>;
export type NewCompany = Insertable<CompanyTable>;
export type CompanyUpdate = Updateable<CompanyTable>;

export type Contact = Selectable<ContactTable>;
export type NewContact = Insertable<ContactTable>;
export type ContactUpdate = Updateable<ContactTable>;

export type ContactTag = Selectable<ContactTagTable>;
export type NewContactTag = Insertable<ContactTagTable>;

export type ContactTagLink = Selectable<ContactTagLinkTable>;
export type NewContactTagLink = Insertable<ContactTagLinkTable>;

export type Deal = Selectable<DealTable>;
export type NewDeal = Insertable<DealTable>;
export type DealUpdate = Updateable<DealTable>;

export type Lead = Selectable<LeadTable>;
export type NewLead = Insertable<LeadTable>;
export type LeadUpdate = Updateable<LeadTable>;

export type LeadConversionLink = Selectable<LeadConversionLinkTable>;
export type NewLeadConversionLink = Insertable<LeadConversionLinkTable>;

export type Pipeline = Selectable<PipelineTable>;
export type NewPipeline = Insertable<PipelineTable>;
export type PipelineUpdate = Updateable<PipelineTable>;

export type PipelineStage = Selectable<PipelineStageTable>;
export type NewPipelineStage = Insertable<PipelineStageTable>;
export type PipelineStageUpdate = Updateable<PipelineStageTable>;

export type StageField = Selectable<StageFieldTable>;
export type NewStageField = Insertable<StageFieldTable>;
export type StageFieldUpdate = Updateable<StageFieldTable>;

export type DealFieldValue = Selectable<DealFieldValueTable>;
export type NewDealFieldValue = Insertable<DealFieldValueTable>;

export type Task = Selectable<TaskTable>;
export type NewTask = Insertable<TaskTable>;
export type TaskUpdate = Updateable<TaskTable>;

export type Activity = Selectable<ActivityTable>;
export type NewActivity = Insertable<ActivityTable>;

export type Alert = Selectable<AlertTable>;
export type NewAlert = Insertable<AlertTable>;

export type Server = Selectable<ServerTable>;
export type NewServer = Insertable<ServerTable>;
export type ServerUpdate = Updateable<ServerTable>;
export type InfraDatabase = Selectable<InfraDatabaseTable>;
export type NewInfraDatabase = Insertable<InfraDatabaseTable>;
export type InfraDatabaseUpdate = Updateable<InfraDatabaseTable>;
export type Website = Selectable<WebsiteTable>;
export type NewWebsite = Insertable<WebsiteTable>;
export type WebsiteUpdate = Updateable<WebsiteTable>;
export type MetricsSnapshot = Selectable<MetricsSnapshotTable>;
export type NewMetricsSnapshot = Insertable<MetricsSnapshotTable>;
export type MetricsRollup = Selectable<MetricsRollupTable>;
export type NewMetricsRollup = Insertable<MetricsRollupTable>;
export type AlertThreshold = Selectable<AlertThresholdTable>;
export type NewAlertThreshold = Insertable<AlertThresholdTable>;
export type AlertThresholdUpdate = Updateable<AlertThresholdTable>;

export type ItemGroup = Selectable<ItemGroupTable>;
export type NewItemGroup = Insertable<ItemGroupTable>;
export type ItemGroupUpdate = Updateable<ItemGroupTable>;

export type GroupStage = Selectable<GroupStageTable>;
export type NewGroupStage = Insertable<GroupStageTable>;
export type GroupStageUpdate = Updateable<GroupStageTable>;

export type Item = Selectable<ItemTable>;
export type NewItem = Insertable<ItemTable>;
export type ItemUpdate = Updateable<ItemTable>;

export type ItemField = Selectable<ItemFieldTable>;
export type NewItemField = Insertable<ItemFieldTable>;
export type ItemFieldUpdate = Updateable<ItemFieldTable>;

export type ItemFieldValue = Selectable<ItemFieldValueTable>;
export type NewItemFieldValue = Insertable<ItemFieldValueTable>;
export type ItemFieldValueUpdate = Updateable<ItemFieldValueTable>;

export type Dashboard = Selectable<DashboardTable>;
export type NewDashboard = Insertable<DashboardTable>;
export type DashboardLayout = Selectable<DashboardLayoutTable>;
export type NewDashboardLayout = Insertable<DashboardLayoutTable>;
export type DashboardLayoutUpdate = Updateable<DashboardLayoutTable>;
export type DashboardGroupAssignment = Selectable<DashboardGroupAssignmentTable>;
export type NewDashboardGroupAssignment = Insertable<DashboardGroupAssignmentTable>;

export type WorkspaceSshKeypair = Selectable<WorkspaceSshKeypairTable>;
export type NewWorkspaceSshKeypair = Insertable<WorkspaceSshKeypairTable>;
export type SshCommandLog = Selectable<SshCommandLogTable>;
export type NewSshCommandLog = Insertable<SshCommandLogTable>;

export type WebhookSubscription = Selectable<WebhookSubscriptionTable>;
export type NewWebhookSubscription = Insertable<WebhookSubscriptionTable>;
export type WebhookSubscriptionUpdate = Updateable<WebhookSubscriptionTable>;
export type WebhookDelivery = Selectable<WebhookDeliveryTable>;
export type NewWebhookDelivery = Insertable<WebhookDeliveryTable>;
export type WebhookDeliveryUpdate = Updateable<WebhookDeliveryTable>;

export type ApiKey = Selectable<ApiKeyTable>;
export type NewApiKey = Insertable<ApiKeyTable>;
export type ApiKeyUpdate = Updateable<ApiKeyTable>;

export type Notification = Selectable<NotificationTable>;
export type NewNotification = Insertable<NotificationTable>;
export type NotificationUpdate = Updateable<NotificationTable>;

export type EmailAccount = Selectable<EmailAccountTable>;
export type NewEmailAccount = Insertable<EmailAccountTable>;
export type EmailAccountUpdate = Updateable<EmailAccountTable>;
export type Email = Selectable<EmailTable>;
export type NewEmail = Insertable<EmailTable>;
export type EmailUpdate = Updateable<EmailTable>;

export type PushToken = Selectable<PushTokenTable>;
export type NewPushToken = Insertable<PushTokenTable>;
export type PushTokenUpdate = Updateable<PushTokenTable>;

export type RecordType = Selectable<RecordTypeTable>;
export type NewRecordType = Insertable<RecordTypeTable>;
export type RecordTypeUpdate = Updateable<RecordTypeTable>;

export type RecordTypeField = Selectable<RecordTypeFieldTable>;
export type NewRecordTypeField = Insertable<RecordTypeFieldTable>;
export type RecordTypeFieldUpdate = Updateable<RecordTypeFieldTable>;

export type RecordTypePermission = Selectable<RecordTypePermissionTable>;
export type NewRecordTypePermission = Insertable<RecordTypePermissionTable>;
export type RecordTypePermissionUpdate = Updateable<RecordTypePermissionTable>;

export type StageRequiredField = Selectable<StageRequiredFieldTable>;
export type NewStageRequiredField = Insertable<StageRequiredFieldTable>;

export type PipelineRecord = Selectable<PipelineRecordTable>;
export type NewPipelineRecord = Insertable<PipelineRecordTable>;
export type PipelineRecordUpdate = Updateable<PipelineRecordTable>;

export type RecordFieldValue = Selectable<RecordFieldValueTable>;
export type NewRecordFieldValue = Insertable<RecordFieldValueTable>;
export type RecordFieldValueUpdate = Updateable<RecordFieldValueTable>;

export type ConversionTemplate = Selectable<ConversionTemplateTable>;
export type NewConversionTemplate = Insertable<ConversionTemplateTable>;
export type ConversionTemplateUpdate = Updateable<ConversionTemplateTable>;

export type ConversionFieldMapping = Selectable<ConversionFieldMappingTable>;
export type NewConversionFieldMapping = Insertable<ConversionFieldMappingTable>;
export type ConversionFieldMappingUpdate = Updateable<ConversionFieldMappingTable>;

export type RecordConversion = Selectable<RecordConversionTable>;
export type NewRecordConversion = Insertable<RecordConversionTable>;

export type CalendarEvent = Selectable<CalendarEventTable>;
export type NewCalendarEvent = Insertable<CalendarEventTable>;
export type CalendarEventUpdate = Updateable<CalendarEventTable>;

export type WorkspaceImapConfig = Selectable<WorkspaceImapConfigTable>;
export type NewWorkspaceImapConfig = Insertable<WorkspaceImapConfigTable>;
export type WorkspaceImapConfigUpdate = Updateable<WorkspaceImapConfigTable>;

export type WorkspaceModule = Selectable<WorkspaceModuleTable>;
export type NewWorkspaceModule = Insertable<WorkspaceModuleTable>;
export type WorkspaceModuleUpdate = Updateable<WorkspaceModuleTable>;

export type WorkspacePlugin = Selectable<WorkspacePluginTable>;
export type NewWorkspacePlugin = Insertable<WorkspacePluginTable>;
export type WorkspacePluginUpdate = Updateable<WorkspacePluginTable>;

export type UserPermission = Selectable<UserPermissionTable>;
export type NewUserPermission = Insertable<UserPermissionTable>;
export type UserPermissionUpdate = Updateable<UserPermissionTable>;

export type Role = Selectable<RoleTable>;
export type NewRole = Insertable<RoleTable>;
export type RoleUpdate = Updateable<RoleTable>;

export type UserRole = Selectable<UserRoleTable>;
export type NewUserRole = Insertable<UserRoleTable>;

export type RolePermission = Selectable<RolePermissionTable>;
export type NewRolePermission = Insertable<RolePermissionTable>;

export type RoleInheritance = Selectable<RoleInheritanceTable>;
export type NewRoleInheritance = Insertable<RoleInheritanceTable>;

export type SsdSet = Selectable<SsdSetTable>;
export type NewSsdSet = Insertable<SsdSetTable>;
export type SsdSetRole = Selectable<SsdSetRoleTable>;
export type NewSsdSetRole = Insertable<SsdSetRoleTable>;

export type DsdSet = Selectable<DsdSetTable>;
export type NewDsdSet = Insertable<DsdSetTable>;
export type DsdSetRole = Selectable<DsdSetRoleTable>;
export type NewDsdSetRole = Insertable<DsdSetRoleTable>;

export type UserSessionRole = Selectable<UserSessionRoleTable>;
export type NewUserSessionRole = Insertable<UserSessionRoleTable>;

export type InviteRole = Selectable<InviteRoleTable>;
export type NewInviteRole = Insertable<InviteRoleTable>;

export type MigrationDiscardedGrant = Selectable<MigrationDiscardedGrantTable>;
export type NewMigrationDiscardedGrant = Insertable<MigrationDiscardedGrantTable>;

export type Invite = Selectable<InviteTable>;
export type NewInvite = Insertable<InviteTable>;

export type Project = Selectable<ProjectTable>
export type ProjectTaskStatus = Selectable<ProjectTaskStatusTable>
export type ProjectTask = Selectable<ProjectTaskTable>
export type ProjectMember = Selectable<ProjectMemberTable>
export type Milestone = Selectable<MilestoneTable>
export type Sprint = Selectable<SprintTable>
export type RecurringTaskRule = Selectable<RecurringTaskRuleTable>
export type NewRecurringTaskRule = Insertable<RecurringTaskRuleTable>
export type RecurringTaskRuleUpdate = Updateable<RecurringTaskRuleTable>

export type PortalAccess = Selectable<PortalAccessTable>
export type ClientPortalSession = Selectable<ClientPortalSessionTable>
export type ApprovalRequest = Selectable<ApprovalRequestTable>
export type CrossModuleSetting = Selectable<CrossModuleSettingTable>
export type NewCrossModuleSetting = Insertable<CrossModuleSettingTable>
export type CrossModuleSettingUpdate = Updateable<CrossModuleSettingTable>
export type AutomationRule = Selectable<AutomationRuleTable>
export type ProjectDoc = Selectable<ProjectDocTable>
export type ProjectTemplate = Selectable<ProjectTemplateTable>

export type InfraDbThreshold = Selectable<InfraDbThresholdTable>;
export type NewInfraDbThreshold = Insertable<InfraDbThresholdTable>;
export type InfraDbThresholdUpdate = Updateable<InfraDbThresholdTable>;

export type InfraDbQueryHistory = Selectable<InfraDbQueryHistoryTable>;
export type NewInfraDbQueryHistory = Insertable<InfraDbQueryHistoryTable>;

export type Channel = Selectable<ChannelTable>;
export type NewChannel = Insertable<ChannelTable>;
export type ChannelUpdate = Updateable<ChannelTable>;

export type ChannelMember = Selectable<ChannelMemberTable>;
export type NewChannelMember = Insertable<ChannelMemberTable>;

export type Message = Selectable<MessageTable>;
export type NewMessage = Insertable<MessageTable>;
export type MessageUpdate = Updateable<MessageTable>;

export type MessageReaction = Selectable<MessageReactionTable>;
export type NewMessageReaction = Insertable<MessageReactionTable>;

export type MessageAttachment = Selectable<MessageAttachmentTable>;
export type NewMessageAttachment = Insertable<MessageAttachmentTable>;

export type ChannelReadState = Selectable<ChannelReadStateTable>;
export type NewChannelReadState = Insertable<ChannelReadStateTable>;

export type HookProvider = Selectable<HookProviderTable>;
export type NewHookProvider = Insertable<HookProviderTable>;
export type HookProviderUpdate = Updateable<HookProviderTable>;

export type WorkspaceHookConfig = Selectable<WorkspaceHookConfigTable>;
export type NewWorkspaceHookConfig = Insertable<WorkspaceHookConfigTable>;
export type WorkspaceHookConfigUpdate = Updateable<WorkspaceHookConfigTable>;
