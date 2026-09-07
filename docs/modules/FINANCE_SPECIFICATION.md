# FINANCE_SPECIFICATION.md — ThinkAIQ

## 1. Purpose

Finance is a major business module: quotes/estimates, orders, invoicing, recurring invoices, payments, credit/debit notes, refunds, AR/AP, expenses, vendors, India-ready GST, and financial reporting.

Tax calculation must be **configuration-driven**. This is **tenant customer billing** — never mixed with ThinkAIQ platform SaaS billing ([ADR-003](../decisions/ADR-003-platform-vs-tenant-billing.md)).

Module code: `finance` · Priority: **P1**  
Autonomy: invoice reminders, overdue escalation, and payment follow-up tasks should be automation-first ([MASTER_PRINCIPLES.md](../product/MASTER_PRINCIPLES.md)).

---

## 2. Dashboard KPIs

Revenue · Expenses · Profit · Receivables · Payables · Cash Flow · Overdue amounts · Margins

Role-scoped. Visual charts/trends preferred over endless KPI cards ([REPORTING_ANALYTICS.md](./REPORTING_ANALYTICS.md)).

---

## 3. Per-tenant invoice engine

Every tenant generates **its own** invoices using that tenant’s:

Business name · Logo · Address · GSTIN · Tax details · Bank details · Payment details · Invoice numbering · Branding

Tenant A data must never mix with Tenant B. PDFs render from tenant branding + line items.

### Document types

Quotes · Estimates · Orders · Invoices · Recurring invoices · Credit notes · Debit notes

### Invoice features

Create, edit, duplicate, preview, PDF, send (email/WhatsApp), track status, payment recording, audit history.

Statuses: Draft · Sent · Viewed · Partially Paid · Paid · Overdue · Cancelled

Numbering: unique per tenant (and optionally per FY/series) — configurable + automatic.

Supports: tax calc · CGST/SGST/IGST · HSN/SAC · place of supply · discounts · partial payments · refunds · credit/debit notes.

### Financial history integrity

Do **not** allow posted financial history to disappear via unsafe hard-delete. Prefer void/cancel + credit notes; soft-delete only where policy allows; full audit trail required.

---

## 4. Payments

Fields: invoice, amount, date, method, transaction/reference, account, notes.

Supports: full, partial, multiple payments, refunds.

Methods configurable: Cash, Bank, UPI, Card, Payment gateway, Other.

---

## 5. Accounts Receivable

Dashboard: total outstanding, due today, overdue, aging buckets:

Current · 1–30 · 31–60 · 61–90 · 90+

Automated reminders: before due, on due, after due (scheduler + automation).

---

## 6. Accounts Payable / Vendors

Vendor bills: vendor, bill number, date, due date, amount, tax, paid amount, balance, status.

Vendor profile: name, contact, company, GSTIN, address, payment terms, bank details, bills, payments, documents.

---

## 7. Expenses

Category, vendor, amount, date, payment method, receipt, attachment, notes.

One-time · recurring · approval workflow.

---

## 8. GST & tax

India-ready fields: GSTIN, HSN/SAC, CGST, SGST, IGST, Place of supply.

**Architecture rule:** tax rules engine is configurable (rate tables, applicability rules). Do not bury CGST/SGST-only logic as the only path — support rule packs (India GST pack first).

---

## 9. Financial reports

Sales register · Purchase register · Invoice · Payment · Outstanding · Expense · Revenue · P&L · Cash Flow · Receivables · Payables · Tax summary

Custom date ranges + export (CSV/Excel where appropriate). Permission controlled.

---

## 10. User flows

### Invoice lifecycle

Draft → Send (PDF + email/WhatsApp) → Viewed → Payments → Paid / Overdue handling → Cancel (constrained)

### Record payment

1. Select invoice → amount ≤ balance
2. Method + reference
3. Update invoice status
4. Emit `payment.received`
5. Metering/reporting update

---

## 11. Business rules

- Immutable posted numbers: prefer credit notes / adjustments over silent edits after Paid (policy)
- Overdue computed by scheduler daily
- Multi-tax lines on invoice items
- Partial payments maintain running balance
- Refunds create negative payment ledger entries linked to original

---

## 12. Data model (summary)

`estimates`, `orders`, `invoices`, `invoice_line_items`, `recurring_invoice_schedules`, `payments`, `payment_methods`, `chart_accounts` (lightweight), `vendors`, `vendor_bills`, `vendor_payments`, `expenses`, `expense_categories`, `tax_rates`, `tax_rules`, `tax_line_applications`, `credit_notes`, `debit_notes`, `tenant_finance_profiles` (legal name, GSTIN, bank, invoice series defaults)

---

## 13. Permissions

`finance.invoices.*`, `finance.payments.*`, `finance.expenses.*`, `finance.expenses.approve`, `finance.vendors.*`, `finance.reports.view`, `finance.tax.configure`, `finance.settings.configure`

---

## 14. APIs

CRUD invoices/payments/expenses/vendors/bills · `POST /invoices/{id}/send` · `POST /invoices/{id}/pdf` · reports endpoints · tax config endpoints

---

## 15. Events

`invoice.created` · `invoice.sent` · `invoice.overdue` · `invoice.paid` · `payment.received` · `payment.refunded` · `expense.submitted` · `expense.approved`

---

## 16. Automation examples

Invoice overdue → notify finance + owner → email client → wait 3 days → second reminder → collection task

---

## 17. Edge cases

- Payment larger than balance → reject or auto-credit
- Tax rule change mid-draft vs sent invoices
- FY sequence rollover
- Currency mismatches
- Gateway webhook duplicates → idempotent payment keys

---

## 18. Related documents

- [BILLING_SUBSCRIPTION.md](./BILLING_SUBSCRIPTION.md)
- [SALES_SPECIFICATION.md](./SALES_SPECIFICATION.md)
- [SCHEDULER.md](../operations/SCHEDULER.md)
- [adr/ADR-003-platform-vs-tenant-billing.md](../decisions/ADR-003-platform-vs-tenant-billing.md)
