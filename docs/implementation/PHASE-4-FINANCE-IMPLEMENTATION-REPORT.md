# PHASE-4-FINANCE-IMPLEMENTATION-REPORT.md

**Phase:** 4 — Finance / Billing (commercial MVP — World 2)  
**Date:** 2026-09-05  
**Status:** FROZEN (final verification PASS — see [PHASE-4-FINANCE-CLOSEOUT-REPORT.md](./PHASE-4-FINANCE-CLOSEOUT-REPORT.md))  
**Prerequisites:** 3A.1–3A.4 frozen/complete · ADR-021/024/025/026 Accepted  
**Locked defaults:** D1 draft from-quote · D2 linked CN applies · D3 recurring schema+generator · D4 expenses-first AP · D5 no `quotes.converted_invoice_id`

---

## 1. Summary

Tenant Finance (ThinkAIQ World 2) is implemented as a greenfield commercial layer:

- Invoices + line snapshots, quote→invoice handoff, lifecycle commands  
- Payments + refunds with server balance recompute  
- Credit notes / debit notes  
- Vendors + expenses (AP)  
- Finance profile, atomic numbering, GST-ready tax engine  
- AR/AP operational reports  
- Recurring invoice schedules + idempotent runs  
- Customer 360 finance extension  
- Finance module RBAC + sidebar + UI  
- Outbox events + worker ack (`finance.record`)

**Not claimed:** full double-entry, audited P&L, GAAP/IFRS, GST filing certification, platform SaaS billing, PDF renderer.

**PRODUCTION TENANT FINANCE DATA = NONE** (additive migration only).

---

## 2. Migration / schemas

**File:** `packages/db/migrations/20260905_008_finance.ts`

| Table | Purpose |
|-------|---------|
| `tenant_finance_profiles` | Seller identity, GSTIN, defaults, prefixes, `default_tax_scheme` |
| `finance_number_sequences` | `(workspace_id, series_key)` atomic UPSERT |
| `invoices` / `invoice_line_items` | AR documents + snapshots |
| `payments` / `payment_refunds` | Collections + refunds |
| `credit_notes` / `credit_note_line_items` | Adjustments |
| `debit_notes` / `debit_note_line_items` | Additional charges |
| `vendors` | AP parties |
| `expenses` | AP spend (no `vendor_bills`) |
| `recurring_invoice_schedules` / `recurring_invoice_runs` | Templates + idempotent generation |

Money: `NUMERIC(18,2)` · Qty: `NUMERIC(18,4)` · No floats.

Unique: invoice numbers; non-void/cancelled from-quote `(workspace, source_quote_id, source_quote_version)`; recurring `(schedule_id, period_key)`.

Typed in `packages/db/src/schema.ts`.

---

## 3. Module / RBAC / nav

**Module:** `finance` (`packages/modules/src/finance/index.ts`) — 24 permissions (colon style).

Submodules: `finance:invoices|payments|expenses|vendors|reports`.

Sidebar **Finance** group: `/finance/invoices`, `/payments`, `/expenses`, `/vendors`, `/reports`.

Platform `billing:manage` remains separate (ADR-021).

---

## 4. Domain services

`apps/api/src/lib/finance/` — numbering, tax, events, profile, invoices, payments, credit-notes, debit-notes, vendors, expenses, recurring, reports.

### Invoice lifecycle (server commands only)

`draft → issued | cancelled`  
`issued|partially_paid|overdue → paid|partially_paid|overdue|void` (via payment recompute / void)  
`paid` terminal except refund/CN adjustments.

### Quote → invoice

`POST /api/invoices/from-quote/:quoteId` (+ `/v1/invoices/from-quote/:quoteId`)

- Accepted quote only · same tenant · **DRAFT** · snapshots copied · idempotent · Quote immutable · no `converted_invoice_id`.

### Payments

FOR UPDATE on invoice · currency must match · reject overpayment · recompute `amount_paid`/`amount_due`/status · refunds via `payment_refunds`.

### Tax

Finance-owned `tax.ts` (`none`|`in_gst`|`vat`|`other`); India pack CGST/SGST/IGST; half-up rounding via `crm-money`.

### Recurring

Schedules + `generateDueRecurringInvoices` idempotent on `(schedule_id, period_key)`.

---

## 5. APIs

| Surface | Paths |
|---------|-------|
| Session | `/api/invoices`, `/from-quote/:quoteId`, `/:id/issue|cancel|void` |
| | `/api/payments`, `/:id/refund` |
| | `/api/expenses`, `/api/vendors`, `/api/credit-notes`, `/api/debit-notes` |
| | `/api/finance/profile`, `/api/finance/reports/*`, recurring endpoints |
| Public v1 | `/v1/invoices`, `/v1/payments` |

Gated with `requireModuleFeature('finance')(...)`.

---

## 6. Events / outbox

Same-TX `finance.*` events; job `finance.record` (worker ack). No domain→BullMQ.

---

## 7. Customer 360

`extensions.finance` is **module-gated**: when finance is disabled → `available: false`, `reason: 'module_disabled'`; when enabled → invoices, payments, outstanding_total, credit_notes (bounded).

---

## 8. UI

Routes under `/finance/*` — invoices (list/builder), payments, expenses, vendors, reports.  
Contacts-style `padding: 24` full-width shell; invoice builder centered ~960px. Responsive cards/tables.

---

## 9. Tests

| Suite | Result |
|-------|--------|
| Finance tax + numbering unit | PASS |
| Sidebar layout | PASS |
| Modules registry | PASS |
| API / web / worker `tsc` | PASS |
| Live `finance-isolation` | PASS |
| Live `crm-isolation` (regression) | PASS (with finance suite, 16 tests) |

---

## 10. Known non-blocking debt

1. Dedicated overdue scheduler job (balances already derive overdue on recompute)  
2. Existing workspaces may need role/module re-seed for finance permissions  
3. PDF DocumentRenderer still deferred (ADR-016/022)  
4. Full CN/DN UI surfaces thinner than invoices (API complete)  
5. Phase **4B** double-entry / COA / journals not started  
6. Platform billing (World 1) not started  

---

## 11. Explicit non-claims

Do **not** claim: audited accounting, GAAP/IFRS, tax filing compliance, platform Stripe billing, WhatsApp/Voice/Support.

---

```
PHASE 4 = FROZEN
FINAL VERIFICATION = PASS
READY FOR NEXT MAJOR PHASE = YES
```

Closeout details: [PHASE-4-FINANCE-CLOSEOUT-REPORT.md](./PHASE-4-FINANCE-CLOSEOUT-REPORT.md)
