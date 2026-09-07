# PHASE-4-FINANCE-AUDIT.md

**Phase:** 4 — Finance / Billing / Accounting  
**Wave:** Planning / audit only — **no application code**  
**Date:** 2026-09-05  
**Prerequisites:**  
- Phase 3A.1 Canonical Deal = **FROZEN**  
- Phase 3A.2 Canonical Lead = **COMPLETE**  
- Phase 3A.3 CustomerParty + Customer 360 = **COMPLETE**  
- Phase 3A.4 Products + Quotes = **FROZEN**  
- Phase 4 Commercial Finance MVP = **FROZEN** (see [PHASE-4-FINANCE-CLOSEOUT-REPORT.md](./PHASE-4-FINANCE-CLOSEOUT-REPORT.md))  
- ADR-024 / ADR-025 / ADR-026 = **Accepted**  
- ADR-021 Platform vs Tenant Billing = **Accepted**  

---

## 1. Executive finding

**Tenant Finance (invoices, payments, refunds, credit/debit notes, expenses, vendors, AR/AP, ledger, configurable tax engine) does not exist in runtime schema or application code.**

**CRM commercial foundations that Finance must consume are live:** CustomerParty, Products, Quotes (accepted + GST-ready totals + line snapshots + atomic numbering + outbox).

**Platform SaaS billing (ThinkAIQ → tenant) is docs/ADR-only** (plus `tenants.plan_id` column and unused `stripe` dependency). It must remain a **separate world** (ADR-021).

Roadmap note: `docs/roadmap/FUTURE_ROADMAP.md` “Phase 4” historically meant Automation/API/Webhooks. This document defines **business Phase 4 = Finance**. Do not confuse the labels.

**PRODUCTION TENANT FINANCE DATA = NONE** (greenfield expand).

---

## 2. Classification legend

| Tag | Meaning |
|-----|---------|
| **EXISTS IN RUNTIME** | Schema + API (+ UI/tests) used today |
| **DOCS/SPEC ONLY** | Spec/ADR/plan; no (or incomplete) implementation |
| **LEGACY/STUB** | Dead dependency, placeholder, or superseded path |
| **REUSABLE FOR PHASE 4** | Consume as input or copy pattern |
| **MUST REMAIN SEPARATE** | Different bounded context — never share tables/UX |

---

## 3. What exists in runtime (finance-adjacent)

### 3.1 CustomerParty + Customer 360

| Item | Status | Path / notes |
|------|--------|--------------|
| `customer_parties` | EXISTS IN RUNTIME | Canonical commercial customer |
| Customer 360 CORE | EXISTS IN RUNTIME | Identity, deals, leads, quotes, activities, tasks, projects |
| `extensions.finance` | EXISTS IN RUNTIME (stub) | `{ available: false, reason: 'not_implemented' }` in `apps/api/src/lib/customer-parties/360.ts` |
| UI Extensions card | EXISTS IN RUNTIME (placeholder) | Mentions Finance among future modules |

**Reuse:** `invoice.customer_party_id` → CustomerParty. Do **not** invent `clients` / finance-customer tables.

### 3.2 Products + Quotes (FROZEN)

| Item | Status | Notes |
|------|--------|-------|
| `products` | EXISTS IN RUNTIME | `list_price`, `currency`, `tax_category_code`, `billing_model` (`one_time`\|`recurring`\|`usage`) |
| `quotes` / `quote_line_items` | EXISTS IN RUNTIME | Money totals, `tax_breakup`, `place_of_supply`, line snapshots, HSN/SAC |
| Quote statuses | EXISTS IN RUNTIME | `draft`→`sent`→`viewed`→`accepted`\|`rejected`; also `expired`, `cancelled`. **No `converted` status yet** |
| `party_snapshot` | EXISTS IN RUNTIME (minimal) | party ids + display_name — **no GSTIN/address** yet |
| Quote numbering | EXISTS IN RUNTIME | `quote_number_sequences` + atomic UPSERT in `allocateQuoteNumber` (`apps/api/src/lib/quotes/index.ts`) |
| Quote totals engine | EXISTS IN RUNTIME | `apps/api/src/lib/quotes/totals.ts` — schemes `none`\|`in_gst`\|`vat`\|`other`; CGST/SGST/IGST pack |
| APIs / UI | EXISTS IN RUNTIME | `/api/quotes`, `/crm/quotes`, accept emits `crm.quote.accepted` |
| Convert → invoice | ABSENT | Explicitly deferred in 3A.4 closeout |

Migration `20260905_007_products_quotes.ts` header: **does not create Finance/invoice tables**.

### 3.3 Money utilities

| Item | Status | Path |
|------|--------|------|
| Deal money | EXISTS IN RUNTIME | `apps/api/src/lib/deals/money.ts` — NUMERIC strings, default INR |
| CRM money | EXISTS IN RUNTIME | `apps/api/src/lib/crm-money.ts` — round half-up, qty, add/sub |
| Quote totals | EXISTS IN RUNTIME | Uses crm-money |

**Reuse:** same NUMERIC(18,2) / decimal-string / no-float policy. Prefer promoting to shared package during Finance impl (libraries shared; tables not).

### 3.4 Events / outbox

| Item | Status | Path |
|------|--------|------|
| Outbox | EXISTS IN RUNTIME | ADR-019; `outbox_events`; `withUnitOfWork` |
| Quote events | EXISTS IN RUNTIME | `crm.quote.*` including `crm.quote.accepted` |
| Planned finance events | DOCS/SPEC ONLY | `docs/api/EVENTS.md` — `finance.invoice.*`, `finance.payment.*`, `finance.credit_note.*` |
| Platform events | DOCS/SPEC ONLY | `platform.subscription.*` — **separate** |

**Hard rule:** domain TX = mutate + outbox append; **never** BullMQ from domain services.

### 3.5 RBAC / modules

| Item | Status | Notes |
|------|--------|-------|
| CRM perms | EXISTS IN RUNTIME | `quotes:*`, `products:*`, `customers:*` colon style in `packages/modules` |
| Admin `billing:manage` | EXISTS IN RUNTIME | Workspace/platform billing gate — **MUST REMAIN SEPARATE** from tenant AR |
| Finance module | ABSENT | No `finance` in MODULE_REGISTRY |
| Spec finance perms | DOCS/SPEC ONLY | Dot style `finance.invoices.*` in FINANCE_SPEC — inconsistent with live CRM |

### 3.6 Tenancy / isolation

| Pattern | Status |
|---------|--------|
| `workspace_id` on commercial rows | EXISTS IN RUNTIME |
| Cross-tenant deny (live tests) | EXISTS IN RUNTIME — products/quotes/360 covered |
| Suspended tenant mutation block | EXISTS IN RUNTIME |

Finance must copy these patterns + add finance-specific isolation tests.

### 3.7 Documents / PDF

| Item | Status |
|------|--------|
| ADR-016 Playwright PDF | Accepted — **DOCS ONLY code** |
| ADR-022 Handlebars DSL | Accepted — **DOCS ONLY code** |
| DocumentRenderer | ABSENT |
| Quote PDF endpoint | ABSENT (send = status only) |

### 3.8 Platform billing

| Item | Status |
|------|--------|
| ADR-021 two worlds | Accepted |
| `tenants.plan_id` | Column exists; full plans/platform_* tables **not** in Kysely migrations |
| Stripe package | LEGACY/STUB — in `apps/api/package.json`, **no TS imports** |
| Razorpay | DOCS ONLY |

---

## 4. What is docs / spec only

Primary sources:

| Doc | Relevance |
|-----|-----------|
| `docs/modules/FINANCE_SPECIFICATION.md` | Invoices, payments, AR/AP, GST, reports, permissions (aspirational) |
| `docs/modules/BILLING_SUBSCRIPTION.md` | Tenant customer subscriptions — World 2 recurring |
| `docs/database/DATABASE_SCHEMA.md` §§8–9 | Sketch tables: invoices, payments, vendors, expenses, tax_*, recurring_* |
| `docs/api/EVENTS.md` | Canonical `finance.*` / `platform.*` event names |
| ADR-021 | Platform vs tenant billing boundary |
| ADR-016 / ADR-022 | PDF / template strategy |
| PHASE-3A-4 plan §15 | Quote → invoice handoff contract |

**Docs-only table inventory (none migrated):**  
`tenant_finance_profiles`, `estimates`, `orders`, `invoices`, `invoice_line_items`, `recurring_invoice_schedules`, `payments`, `payment_methods`, `credit_notes`, `debit_notes`, `vendors`, `vendor_bills`, `vendor_payments`, `expenses`, `expense_categories`, `tax_rates`, `tax_rules`, `chart_accounts`, `platform_invoices`, `platform_payments`, …

---

## 5. Spec conflicts / superseded claims

| Claim | Source | Resolution for Phase 4 |
|-------|--------|------------------------|
| Finance owns Quotes / Estimates | FINANCE_SPEC §3 | **Superseded by ADR-026** — CRM owns Quote; Finance consumes snapshot |
| Finance `clients` table | ADR-021 sketch / older docs | Use **CustomerParty** (ADR-024/025) |
| Permission style `finance.invoices.*` | FINANCE_SPEC | Prefer live CRM style with module prefix clarity — see Plan §RBAC |
| Roadmap “Phase 4” = Automation | FUTURE_ROADMAP | Label collision — this wave is **Finance** |
| Quote status `converted` | Older CRM 2.0 notes | Optional later; not required if `source_quote_id` uniqueness + invoice link suffices |

---

## 6. What can be reused

1. **Accepted Quote** as commercial source of truth for invoice draft (party, currency, totals, tax_breakup, lines, quote_number/version).  
2. **Atomic sequence UPSERT** pattern from `allocateQuoteNumber` (new finance sequence tables — do not share quote series).  
3. **`crm-money` + half-up rounding** policy.  
4. **Quote totals / GST pack** as starting point for invoice tax computation (evolve into Finance-owned configurable tax engine).  
5. **Transactional outbox** + `finance.*` event taxonomy.  
6. **CustomerParty + 360 finance extension slot**.  
7. **Tenant isolation / soft-delete / RBAC module** patterns.  
8. **ADR-016/022** DocumentRenderer strategy (shared library, separate jobs).  
9. **Product** `tax_category_code` / `billing_model` as catalog metadata for lines and recurring templates.

---

## 7. What must remain separate

| Keep apart | Why |
|------------|-----|
| Platform SaaS billing (`plans`, `platform_*`, ThinkAIQ Stripe customer) | ADR-021 World 1 |
| Tenant Finance AR (`invoices`, tenant `payments`) | ADR-021 World 2 |
| Admin `billing:manage` | Not tenant AR permission |
| Catalog `products.kind=plan` vs `tenants.plan_id` | ADR-026 |
| CRM `quotes` vs Finance `invoices` | Copy snapshot; dual-owning forbidden |
| Tenant recurring invoices vs platform subscriptions | Different legal party / events |

**Share libraries only:** money, tax helpers, PDF renderer port — **never** identical tables or UI lists.

---

## 8. Gaps blocking Finance MVP (inventory)

| Gap | Severity |
|-----|----------|
| No invoice / payment / expense / vendor / CN / DN tables | Blocker |
| No quote→invoice command | Blocker |
| Minimal `party_snapshot` (no GSTIN/address); Company has no GSTIN columns | High — need seller/buyer tax profile for India GST |
| No `tenant_finance_profiles` | High |
| No DocumentRenderer / PDF | Medium for MVP (data-first; PDF can follow Documents wave) |
| No configurable tax_rates/tax_rules | Medium — start with invoice-owned breakup + India pack; evolve |
| No double-entry ledger | Design decision — see Plan (staged) |
| Spec vs live permission naming | Low — decide in Plan |
| Unused Stripe dependency | Cleanup later; do not wire into tenant AR by default |

---

## 9. Numbering / sequences audit

| Series | Runtime |
|--------|---------|
| Pipeline auto-number | EXISTS (`auto_number_sequence`) |
| Quote numbers | EXISTS (`quote_number_sequences`, prefix `Q-`) |
| Invoice / CN / DN / payment numbers | ABSENT |

**Recommendation:** replicate UPSERT-per-workspace (optionally per FY/series later) for finance documents.

---

## 10. Customer 360 integration audit

| Slice | Today |
|-------|-------|
| Quotes | Live list on 360 |
| Invoices / payments / outstanding | Stub only (`extensions.finance.available: false`) |
| Expenses | N/A (vendor-centric; customer-linked expenses optional later) |

---

## 11. Migration / data reality

```
Production tenant finance rows = NONE
→ expand (additive migrations)
→ no backfill required for invoices
→ optional: enrich party_snapshot / finance profile on first use
→ contract only after live validation
```

No destructive migrations. Do not alter frozen Quote/Product schemas beyond additive nullable columns if absolutely required (prefer Finance-owned profiles).

---

## 12. ADR requirement

| ADR | Action |
|-----|--------|
| ADR-021 | **Reuse as boundary law** — no rewrite |
| ADR-024/025/026 | **Reuse** — CustomerParty + Quote handoff |
| ADR-016/022 | **Reuse** for PDF plan |
| New Finance domain ADR | **Deferred** — Plan locks MVP model; write ADR at implementation kickoff if schema needs durable acceptance |

---

## 13. Audit verdict

| Question | Answer |
|----------|--------|
| Invoice tables in runtime? | **No** |
| Payments / expenses / vendors / ledger? | **No** |
| Quote → invoice ready as input? | **Yes** (accepted quote + snapshots + event) |
| Platform billing mix risk? | **Controlled by ADR-021** if enforced in design |
| Greenfield Finance? | **Yes** |
| Ready to plan implementation? | **Yes** |

**PHASE 4 AUDIT = COMPLETE**
