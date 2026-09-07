# PHASE-4-FINANCE-PLAN.md

**Phase:** 4 — Finance / Billing / Accounting  
**Wave:** Planning **COMPLETE** → Main implementation **COMPLETE** → Final verification **PASS / FROZEN** (see [PHASE-4-FINANCE-CLOSEOUT-REPORT.md](./PHASE-4-FINANCE-CLOSEOUT-REPORT.md), [PHASE-4-FINANCE-IMPLEMENTATION-REPORT.md](./PHASE-4-FINANCE-IMPLEMENTATION-REPORT.md))  
**Date:** 2026-09-05 (plan); implementation + closeout 2026-09-05  
**Depends on:** [PHASE-4-FINANCE-AUDIT.md](./PHASE-4-FINANCE-AUDIT.md)  
**Governing ADRs:** ADR-021 (billing worlds), ADR-024/025/026 (CRM commercial), ADR-019 (outbox), ADR-016/022 (documents — later)

**Locked defaults applied in implementation:** D1=draft · D2=linked CN applies · D3=recurring+generator · D4=expenses-first · D5=no quote converted_invoice_id

**Out of Phase 4 MVP / deferred to 4B+:** full double-entry COA/journals, platform SaaS billing, PDF engine, FX, GAAP/IFRS.

---

## 0. Scope statement

Phase 4 delivers a **production-grade, multi-tenant Finance module** that:

1. Bills **tenant customers** (World 2) using **CustomerParty** + **accepted Quotes**  
2. Never mixes with **ThinkAIQ platform SaaS billing** (World 1)  
3. Supports invoices, payments (partial), refunds, credit/debit notes, expenses, vendors, AR/AP views, GST-ready tax data, reporting foundations, and optional recurring invoices  
4. Leaves a clean path to full double-entry accounting without rewriting posted invoices/payments

**Out of this planning wave:** all implementation.  
**Out of Phase 4 MVP (implementation later):** full FX engine, multi-book GAAP suites, platform Stripe wiring, Playwright PDF engine (data-ready only unless Documents wave lands first).

---

## 1. Domain boundaries

### A. PLATFORM BILLING (World 1) — ThinkAIQ → Tenant

| Examples | Ownership |
|----------|-----------|
| SaaS subscription, seats, modules | Platform |
| Usage (WhatsApp, Voice, API, storage, PDF) | Platform |
| Reseller / partner platform charges | Platform |
| Tables | `plans`, `platform_subscriptions`, `platform_invoices`, `platform_payments`, … |
| Events | `platform.subscription.*`, `platform.invoice.*` |
| Permissions | Admin / `billing:manage` / platform ops |
| UI | Super-admin / platform billing — **not** `/finance/*` |

**Phase 4 does not implement World 1.** Design must not create shared invoice tables or CustomerParty linkage for platform charges.

### B. TENANT BUSINESS FINANCE (World 2) — Tenant → Tenant’s customers / vendors

| Examples | Ownership |
|----------|-----------|
| Invoice, Payment, Refund, Credit/Debit note | Tenant Finance |
| Expense, Vendor, AR/AP | Tenant Finance |
| GST/tax on customer documents | Tenant Finance |
| Tables | `invoices`, `payments`, `expenses`, `vendors`, … with `workspace_id` |
| Events | `finance.*` |
| Permissions | `invoices:*`, `payments:*`, … (see §19) |
| UI | `/finance/*` (+ Customer 360 finance extension) |

### Hard rules

- Separate IDs, sequences, permissions, events, storage prefixes, and accounting boundaries  
- Tenant customer invoice **never** appears in platform billing analytics as ThinkAIQ revenue  
- Platform Stripe customer id **never** charges a tenant’s end customer  
- Shared code allowed: money math, tax helpers, DocumentRenderer port  

---

## 2. Canonical finance customer

**Use CustomerParty only.**

| Field on invoice | Rule |
|------------------|------|
| `customer_party_id` | **Required** FK → `customer_parties` |
| `contact_id` / `company_id` | Optional context (denormalized from party / picker) |
| `party_snapshot` / billing identity snapshot | Immutable JSONB at issue time (legal name, address, GSTIN, email, phone) |

Do **not** create `clients`, `finance_customers`, or `accounts` as customer masters.

Seller identity comes from **`tenant_finance_profiles`** (legal name, GSTIN, address, bank, default series) — not from CustomerParty.

---

## 3. Canonical invoice model

### 3.1 Table: `invoices` (workspace-scoped)

| Column | Notes |
|--------|-------|
| `id` | UUID PK |
| `workspace_id` | Tenant scope (≡ tenant_id) |
| `invoice_number` | Human series, unique per workspace (+ series) |
| `status` | Server-controlled enum (below) |
| `customer_party_id` | Required |
| `contact_id` | Nullable |
| `company_id` | Nullable |
| `source_quote_id` | Nullable FK → quotes |
| `source_quote_version` | Nullable int |
| `deal_id` | Nullable informational |
| `issue_date` | Date |
| `due_date` | Date nullable |
| `currency` | ISO-4217 text |
| `subtotal`, `discount_total`, `taxable_amount`, `tax_amount`, `total` | NUMERIC(18,2) |
| `amount_paid`, `amount_due` | NUMERIC(18,2) — **server-maintained** from payments/credits |
| `tax_breakup` | JSONB |
| `place_of_supply` | Text nullable |
| `billing_address_snapshot` | JSONB |
| `shipping_address_snapshot` | JSONB nullable |
| `buyer_gstin_snapshot` / `seller_gstin_snapshot` | Text nullable |
| `party_snapshot` | JSONB — commercial identity |
| `payment_terms` | Text nullable |
| `notes`, `terms` | Text nullable |
| `created_by` | User id |
| `issued_at` / `issued_by` | Lifecycle |
| `voided_at` / `void_reason` | Lifecycle |
| `cancelled_at` | Lifecycle |
| `overdue_at` | Set by job when due passed & unpaid |
| `custom_fields` | JSONB |
| `created_at`, `updated_at`, `deleted_at` | Soft-delete for drafts only; posted docs prefer void |

### 3.2 Status machine (server-only transitions)

```text
draft
  → issued          (issue / finalize)
  → cancelled       (cancel draft)

issued
  → partially_paid  (payment recorded, amount_due > 0)
  → paid            (amount_due == 0)
  → overdue         (scheduler: past due_date & amount_due > 0)
  → void            (void issued unpaid / constrained policy)

partially_paid
  → paid | overdue | void (void constrained)

overdue
  → partially_paid | paid | void

paid
  → (terminal for normal path; adjustments via credit note / refund — do not reopen arbitrarily)

void / cancelled
  → terminal
```

**No arbitrary `PATCH status`.** Commands: `issue`, `cancel`, `void`, `record_payment` (indirect), scheduler `mark_overdue`.

---

## 4. Invoice line items

### Table: `invoice_line_items`

Commercial snapshots — **immutable after issue** (draft lines editable).

| Column | Notes |
|--------|-------|
| `id`, `workspace_id`, `invoice_id` | Scope |
| `position` | Order |
| `product_id` | Nullable |
| `sku_snapshot`, `name_snapshot`, `description_snapshot`, `unit_snapshot` | Required snapshots |
| `quantity` | NUMERIC(18,4) |
| `unit_price`, `discount_amount`, `taxable_amount`, `tax_amount`, `line_total` | NUMERIC(18,2) |
| `tax_rate`, `tax_type`, `tax_breakup` | GST-ready |
| `hsn_sac` | Nullable |
| `created_at` | |

**Never** live-join current Product list_price for historical invoices.

### Accepted Quote → Invoice copy set

| From Quote | To Invoice |
|------------|------------|
| `customer_party_id`, contact/company, party_snapshot (enriched) | Same + finance billing snapshot |
| `currency`, money totals, `tax_breakup`, `place_of_supply` | Copied then recalculated server-side for consistency |
| All line snapshots | Copied 1:1 |
| `quote_number` / `version` | `source_quote_id` + `source_quote_version` |
| Notes/terms | Optional copy |

**Do not mutate frozen Quote or Product models** beyond optional additive flags later (`converted_invoice_id` nullable on quote is allowed as expand if needed for UX — prefer invoice→quote FK as SoR).

---

## 5. Quote → Invoice handoff

### Preferred flow

```text
Accepted Quote
    → POST /api/invoices/from-quote/:quoteId  (idempotent command)
    → Finance service validates tenant + status=accepted
    → Creates draft or issued invoice (product default: draft)
    → Copies commercial snapshots
    → Emits finance.invoice.created (+ issued if auto-issue)
```

### Guarantees

| Rule | Mechanism |
|------|-----------|
| Same tenant | `workspace_id` match on quote |
| Accepted only | Reject non-accepted |
| Idempotent | Unique partial index: one non-void invoice per `(workspace_id, source_quote_id, source_quote_version)` **or** dedupe_key on command |
| Quote immutable | Read-only copy |
| No accidental duplicates | Unique constraint + outbox dedupe |

Automation path (later): consume `crm.quote.accepted` → enqueue command job — **still** via outbox, not domain→BullMQ.

---

## 6. Payments

### Table: `payments`

| Column | Notes |
|--------|-------|
| `id`, `workspace_id` | |
| `payment_number` | Optional human series |
| `invoice_id` | Required for AR payments MVP |
| `customer_party_id` | Denormalized for queries |
| `amount`, `currency` | Must match invoice currency in MVP (no FX) |
| `payment_date` | |
| `method` | cash \| bank \| upi \| card \| gateway \| other |
| `reference` | External txn id |
| `gateway_provider` | Nullable (tenant keys — not platform) |
| `status` | pending \| succeeded \| failed \| refunded \| partially_refunded |
| `notes` | |
| `received_by` | User |
| `reconciled_at` / metadata | JSONB |
| `created_at`, `updated_at`, `deleted_at` | Soft-delete only for pending mistakes; succeeded payments reverse via refund |

### Relationship

```text
Invoice 1 ─── * Payment (succeeded)
```

### Balance rules (server)

```text
amount_paid = sum(succeeded payments) − sum(succeeded refunds allocated)
            − sum(applied credit notes)   // policy TBD in impl; default: credits reduce amount_due
amount_due  = total − amount_paid   (clamp ≥ 0)
status      = derived from amount_due + due_date + void
```

**Never trust client totals.** Recompute inside the same DB transaction as payment insert.

Partial payments: multiple rows; each `amount ≤ remaining amount_due`.

---

## 7. Refunds / Credit notes / Debit notes

| Instrument | Purpose | Effect |
|------------|---------|--------|
| **Refund** | Return money against a payment | Links `payment_id` (+ optional `invoice_id`); reduces net collected; may reopen `amount_due` |
| **Credit note** | Commercial credit to customer (returns, adjustments) | Own number series; may apply to invoice balance or leave unapplied credit; tax breakup preserved |
| **Debit note** | Additional charge to customer | Increases receivable; tax-aware; links original invoice when applicable |

### Rules

- Never silently rewrite paid invoice line history  
- Posted invoices: adjust via CN/DN/refund, not line edits  
- Each instrument has immutable rows + audit fields  
- Numbering: separate sequences (`CN-`, `DN-`, optional `RCPT-`/`PAY-`)  
- Events: `finance.payment.refunded`, `finance.credit_note.created`, `finance.debit_note.created`

---

## 8. Expenses / Vendors

### Vendor (`vendors`)

MVP fields: legal/display name, contact email/phone, address, GSTIN/tax id, payment terms, bank/payment metadata JSONB, status, `workspace_id`, soft-delete.

**Not** CustomerParty (vendors are AP parties). Optional later link if same legal entity — out of MVP.

### Expense (`expenses`)

MVP fields: `vendor_id` nullable, category, date, amount, currency, tax_amount/tax_breakup, payment_status (`unpaid`\|`paid`\|`partial`), receipt/document ref, notes, created_by.

### Vendor bills (optional MVP stretch)

If timeboxed: treat **expense** as the AP primitive first; introduce `vendor_bills` when bill→payment matching is needed. Prefer one clear AP document over dual models in first ship.

**Do not overbuild** chart-of-accounts master data in MVP beyond what reporting needs.

---

## 9. AR / AP strategy

### Accounts Receivable (derived)

| View | Source |
|------|--------|
| Outstanding | Invoices where `amount_due > 0` and status ∈ {issued, partially_paid, overdue} |
| Overdue | Same + `due_date < today` |
| Collected | Sum payments succeeded in range |
| Credits | Unapplied / applied credit notes |

**Avoid stored redundant AR totals** that can drift. Optional materialized rollups later with rebuild from ledger of invoices+payments+CN.

### Accounts Payable (derived)

| View | Source |
|------|--------|
| Unpaid expenses / vendor bills | `payment_status != paid` |
| Due dates | Expense/bill due_date |
| Paid | Expense payments / marked paid |

Same anti-drift rule: derive from documents + payments.

---

## 10. Accounting foundation (staged — no fake books)

### Decision (default)

**Phase 4 MVP = commercial finance core (documents + cash movements), not full double-entry.**

| Stage | Deliver |
|-------|---------|
| **4A MVP** | Invoices, lines, payments, refunds, CN/DN, expenses, vendors, tax snapshots, AR/AP queries, events |
| **4B Accounting** | Chart of accounts, journal entries, journal lines, periods, posting rules from invoice/payment/expense events |

### Why staged

- Fake P&L from invoice−expense alone without cash/accrual rules misleads users  
- Posted invoice/payment schemas must be **posting-friendly** (immutable snapshots, clear event stream) so 4B attaches journals without rewrite  

### Schema readiness now (even if unused in MVP)

- Stable aggregate ids + event types for every money movement  
- Optional nullable `journal_entry_id` on payments/invoices later (expand)  
- Do **not** invent shadow “accounting_total” columns that diverge from documents  

**Do not claim “accounting complete” in MVP.** Reports labeled clearly: *Sales register / Cash collected / Expense register* until 4B.

---

## 11. GST / Tax architecture

### Ownership

**Finance owns the configurable tax engine.** Quote GST pack is a **consumer-compatible precursor**, not the long-term SoR.

### Design

| Layer | MVP | Later |
|-------|-----|-------|
| Document snapshots | `tax_breakup` JSONB on invoice/lines (scheme discriminator) | Unchanged |
| India pack | CGST/SGST (intra) / IGST (inter), HSN/SAC, place of supply, GSTIN snapshots | GSTR exports |
| Config tables | Optional thin `tax_rates` | Full `tax_rules` applicability |
| Other regimes | `scheme: vat \| other \| none` | Country packs |

**India-first capability required; domain not India-only.**

Seller GSTIN: `tenant_finance_profiles`. Buyer GSTIN: party tax profile / snapshot at issue.

Rounding: reuse half-up per money step (crm-money).

---

## 12. Money / Currency

| Rule | Detail |
|------|--------|
| Persistence | NUMERIC(18,2); qty NUMERIC(18,4) |
| API | Decimal strings |
| Floats | Forbidden |
| Currency | Explicit per document; MVP **single-currency payments** (payment currency = invoice currency) |
| Default | INR (existing CRM default) — not hard-wired exclusively |
| FX | **Out of MVP**; schema may store `fx_rate` null / `presentment_currency` later without blocking |

---

## 13. Numbering

Tenant-scoped atomic sequences (reuse Quote UPSERT pattern):

| Document | Suggested prefix | Table |
|----------|------------------|-------|
| Invoice | `INV-` | `finance_number_sequences` (series_key) |
| Credit note | `CN-` | same, `series_key=credit_note` |
| Debit note | `DN-` | |
| Payment | `PAY-` (optional) | |
| Expense | `EXP-` (optional) | |

Requirements: concurrency-safe, tenant-scoped, unique, audit-friendly. FY/series variants later via `series_key` + period — design table to allow multiple series per workspace.

---

## 14. Documents / PDF

| Concern | Plan |
|---------|------|
| Data | Invoice + lines + tax + party/seller snapshots = PDF payload |
| Rendering | ADR-016/022 DocumentRenderer — **Finance must not import Playwright** |
| Timing | Implement PDF when Documents foundation exists; MVP can ship without PDF if send = email metadata / status only |
| Separation | Financial truth ≠ render cache; store artifact refs on document row later |

Quote PDF and Invoice PDF share renderer; different templates.

---

## 15. Reporting (read models)

Prefer **queries over transactional tables** first; add rollup tables only if performance demands.

| Report | Source |
|--------|--------|
| Revenue / sales register | Issued/paid invoices by issue_date |
| Payment collection | Succeeded payments |
| Overdue / AR aging | amount_due buckets |
| Expenses / AP | Expenses (+ vendor bills) |
| Tax summary | Aggregate tax_breakup components |
| Gross profit | Invoice revenue − cost snapshots **if** cost on lines; else defer |
| P&L / Cash flow | **Label as operational** until 4B journals exist |

Export: CSV later; permission `reports:view`.

---

## 16. Recurring billing (tenant → customer)

| Object | Purpose |
|--------|---------|
| `recurring_invoice_schedules` | Template lines, customer_party_id, cadence, next_run_at, status (active/paused/cancelled) |
| Generator job | Idempotent create invoice for period key `(schedule_id, period_start)` |

**Do not confuse** with ThinkAIQ SaaS subscriptions or `platform_subscriptions`.  
Product `billing_model=recurring` is catalog metadata only until schedules exist.

MVP: design schema; implementation can follow invoices+payments if schedule risk is high.

---

## 17. Events / outbox

Canonical events (append in same TX as mutation):

```text
finance.invoice.created
finance.invoice.issued
finance.invoice.partially_paid
finance.invoice.paid
finance.invoice.overdue
finance.invoice.voided
finance.invoice.cancelled
finance.payment.received
finance.payment.refunded
finance.expense.created
finance.credit_note.created
finance.debit_note.created
```

Align with `docs/api/EVENTS.md`. Job names e.g. `finance.invoice.record`.  
**No domain → direct BullMQ.**

---

## 18. RBAC (recommended)

New module: `finance` in `packages/modules`.

Prefer **live CRM colon style** (not FINANCE_SPEC dots):

| Permission | Intent |
|------------|--------|
| `invoices:view` | List/get |
| `invoices:create` | Create / from-quote |
| `invoices:edit` | Edit draft |
| `invoices:delete` | Soft-delete draft only |
| `invoices:issue` | Draft → issued |
| `invoices:void` | Void |
| `invoices:cancel` | Cancel draft |
| `payments:view` | |
| `payments:create` | Record payment |
| `payments:refund` | Refund |
| `expenses:view\|create\|edit\|delete` | |
| `vendors:view\|create\|edit\|delete` | |
| `credit_notes:view\|create` | |
| `debit_notes:view\|create` | |
| `reports:view` | Finance reports |
| `finance:settings` | Tax profile, series, defaults |

**Do not reuse** `billing:manage` for tenant AR.

Default roles: admin + member for view/create/edit; void/refund/settings admin-weighted.

---

## 19. Tenancy / security

| Control | Requirement |
|---------|-------------|
| Scope | Every finance row has `workspace_id` |
| Cross-tenant | Fail closed on get/list/update (live isolation tests) |
| Worlds | Platform tables never joined into tenant AR queries |
| Immutability | Issued lines immutable; money fixes via CN/DN/refund |
| Audit | `created_by`, lifecycle timestamps, optional `finance_audit_events` |
| Idempotency | from-quote, payment webhooks (tenant gateway later), recurring generation |
| Concurrency | Sequence UPSERT; payment insert with `SELECT … FOR UPDATE` on invoice |
| Documents | Secure artifact URLs tenant-scoped |
| Soft-delete | Drafts; posted → void |

---

## 20. Customer 360 integration

Fill stub:

```ts
extensions.finance = {
  available: true, // when module enabled
  invoices: [...],
  payments: [...],
  outstanding_total,
  credit_notes: [...],
}
```

Module-gated. Expenses only if customer-linked (rare) — default omit.

---

## 21. API contract (planned — not implement)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/invoices` | List/create |
| GET/PATCH | `/api/invoices/:id` | Get / edit draft |
| POST | `/api/invoices/from-quote/:quoteId` | Idempotent handoff |
| POST | `/api/invoices/:id/issue` | Issue |
| POST | `/api/invoices/:id/void` | Void |
| POST | `/api/invoices/:id/cancel` | Cancel draft |
| GET/POST | `/api/payments` | List / record |
| POST | `/api/payments/:id/refund` | Refund |
| CRUD | `/api/expenses`, `/api/vendors` | |
| POST/GET | `/api/credit-notes`, `/api/debit-notes` | |
| GET | `/api/finance/reports/*` | AR, AP, tax, sales, expenses |
| GET/PATCH | `/api/finance/profile` | Tenant finance profile |

Mirror `/v1/*` with API-key scopes when public API is required.

Also session aliases under `/api/finance/...` if route grouping preferred — pick one prefix in impl and stick to it.

---

## 22. UI / navigation / responsive

### Routes

| Route | Purpose |
|-------|---------|
| `/finance/invoices` | List + filters |
| `/finance/invoices/new`, `/finance/invoices/[id]` | Create / detail / issue |
| `/finance/payments` | Payment register |
| `/finance/expenses` | Expenses |
| `/finance/vendors` | Vendors |
| `/finance/reports` | Reports hub |

Optional alias `/crm/invoices` **redirect** to `/finance/invoices` — prefer **Finance nav group**, not Sales clutter.

### Sidebar

New group **Finance** (after Sales or before Insights): Invoices, Payments, Expenses, Vendors, Reports.  
Module/permission gated like CRM submodules.

### Responsive (390 / 768 / 1280)

- Desktop: tables  
- Mobile: stacked cards / detail sheets  
- No hover-only critical actions  
- Tap targets ≥ 40px  
- Invoice builder: centered panel ~900–1000px (same pattern as Quote builder); **page shell full width** like Contacts  

---

## 23. Migration strategy

```
expand  → additive finance migrations (new tables only)
backfill → none for invoices (greenfield); optional finance profile seed
validate → isolation + lifecycle + from-quote idempotency tests
contract → only after production soak (no early drops)
```

**Do not** alter Quote/Product CHECK constraints destructively.  
**Do not** create platform billing tables in the same migration as tenant invoices without clear `platform_` prefixes and separate modules.

---

## 24. Implementation sequencing (single phase, ordered slices)

Avoid micro-phases; ship as **one Phase 4** with ordered slices:

1. **Foundation** — `tenant_finance_profiles`, number sequences, money/tax shared helpers, RBAC module, nav  
2. **Invoices + lines + from-quote** — draft/issue/void/cancel  
3. **Payments + refunds** — balances + status derivation  
4. **Credit / debit notes**  
5. **Vendors + expenses** (+ AP views)  
6. **AR aging + operational reports**  
7. **360 finance extension + events coverage**  
8. **Recurring schedules** (if in MVP cut)  
9. **PDF** when DocumentRenderer exists  
10. **4B accounting** — separate follow-on after commercial core stable  

---

## 25. Minimal unresolved product decisions

Only decisions that still need a conscious pick at implementation kickoff:

| # | Decision | Default if unblocked |
|---|----------|----------------------|
| D1 | from-quote creates **draft** vs **issued** | **Draft** (safer) |
| D2 | Auto-apply credit notes to invoice balance vs unapplied wallet | **Apply to source invoice when linked**; else unapplied |
| D3 | Include recurring schedules in first production cut? | **Yes schema + basic generator** if capacity; else schema-only |
| D4 | Vendor bills table in first cut vs expenses-only AP | **Expenses-first**; vendor_bills when bill matching needed |
| D5 | Store `converted_invoice_id` on Quote? | **No** — invoice.`source_quote_id` is SoR; optional later |

No large product gate required.

---

## 26. Explicit non-goals (Phase 4)

- Platform SaaS billing / Stripe platform account wiring  
- Rewriting Deal/Lead/CustomerParty/Product/Quote domain  
- Full double-entry in MVP (4B)  
- Full FX  
- WhatsApp/Voice/Support modules  
- Desktop-only finance UI  
- Hard-delete of posted financial history  

---

## 27. Success criteria (for later implementation gate)

- World 1 / World 2 never mix in UI, APIs, or tests  
- Accepted quote → invoice idempotent  
- Partial payments update amount_due/status correctly  
- Cross-tenant finance access denied  
- 360 finance extension module-gated  
- Responsive 390/768/1280  
- Outbox events for lifecycle  
- No float money  

---

## 28. Planning verdict

| Item | Status |
|------|--------|
| Finance domain boundaries | Defined |
| Platform vs tenant billing | ADR-021 enforced in plan |
| Canonical invoice + lines | Defined |
| Payment / refund / CN / DN | Defined |
| Quote → invoice handoff | Defined |
| Tax/GST architecture | Defined (Finance-owned; India pack first) |
| Accounting strategy | Staged 4A commercial / 4B ledger |
| AR/AP | Derived views |
| Expense / vendor | Defined (MVP-thin) |
| Numbering | Atomic sequences |
| Events / RBAC / security | Defined |
| Customer 360 | Extension plan |
| Reporting | Operational first |
| Responsive | Required |
| Unresolved decisions | Minimal (D1–D5) |

```
PHASE 4 PLANNING = COMPLETE
READY FOR IMPLEMENTATION = YES
```

**STOP** — no application code in this wave.
