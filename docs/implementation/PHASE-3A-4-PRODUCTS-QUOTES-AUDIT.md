# PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md

**Phase:** 3A.4 — Products + Quotes  
**Wave:** Planning / audit only — **no code**  
**Date:** 2026-09-05  
**Prerequisites:** 3A.1 Deal FROZEN · 3A.2 Lead COMPLETE · 3A.3 CustomerParty COMPLETE · ADR-024/025 Accepted  

---

## 1. Executive finding

**There is no live Product catalog, Quote, estimate, proposal, price book, or deal line-item implementation in schema or application code.**

Everything about Products/Quotes today is **documentation / product intent**. Implementation is greenfield expand — no dual-read from a legacy catalog table is required.

Overlaps are **naming and ownership collisions across docs**, not competing runtime tables.

---

## 2. What exists in code / schema

### 2.1 Present (relevant foundations)

| Area | Reality | Relevance to 3A.4 |
|------|---------|-------------------|
| Canonical **Deal** | `deals` + dual-write `pipeline_items`; `amount NUMERIC(18,2)`, `currency` | Quote may link `deal_id`; Deal amount stays opportunity-level (no line items yet) |
| **Lead** | Full convert → Contact ± Company ± Deal ± optional CustomerParty | Quote is post-commercial; Lead does not need quote FK in 3A.4 |
| **CustomerParty** | Role over Contact\|Company; 360 CORE + extension stubs | Preferred Quote party root |
| **Contact / Company** | Soft-delete, workspace-scoped; Company has **no GSTIN/address columns** yet | Quote bill-to will need party snapshot and/or future party tax profile |
| Money helpers | `apps/api/src/lib/deals/money.ts` — decimal strings, ISO-4217 currency | **Reuse pattern** for Product/Quote money (extract shared util in impl) |
| Auto-number | Pipeline `auto_number_sequence` + `apps/api/src/lib/auto-number.ts` | Pattern for **tenant quote numbering** (new series, not pipeline) |
| Outbox / ADR-019 | Deal/Lead/CustomerParty emit `crm.*` + ack jobs | Same pattern for `crm.product.*` / `crm.quote.*` |
| RBAC modules | `packages/modules` CRM perms — **no** `products:*` / `quotes:*` | Must seed in impl |
| PDF ADRs | ADR-016 (Playwright), ADR-022 (Handlebars HTML) **Accepted** | **No** `DocumentRenderer` code in apps yet |
| Custom fields | Deal/Lead/CustomerParty use JSONB `custom_fields`; PM EAV is **project-task only** | CRM entities continue JSONB (+ ADR-013 later); not PM custom_fields |

### 2.2 Absent (confirmed)

Searched migrations, `schema.ts`, routes, web modules, plugins:

- No `products`, `product_categories`, `price_books`, `catalog_items`
- No `quotes`, `quote_versions`, `quote_line_items`, `quote_approvals`
- No `deal_products` / `deal_line_items`
- No invoice / estimate / order tables
- No GSTIN / HSN / tax_rate tables on tenant CRM entities
- No DocumentRenderer / quote PDF jobs
- No `/api/products` or `/api/quotes`
- No CRM nav entries for Products/Quotes
- Zero runtime hits for `sku`, `list_price`, `product_id`, `hsn`, `gstin` in app code

**PRODUCTION PRODUCT/QUOTE DATA = NONE** (greenfield).

---

## 3. Overlapping concepts (docs vs live)

Do **not** assume same name = same entity.

| Concept | Spec / doc home | Live meaning | 3A.4 treatment |
|---------|-----------------|--------------|----------------|
| **Product** | SALES_SPEC, CRM 2.0 plan, REQ-SAL-005 | Unimplemented | Canonical **catalog** table |
| **Service / Package / Plan** | SALES_SPEC “products, services, packages, plans” | Unimplemented | Same catalog via `kind` discriminator |
| **Plan** (platform) | BILLING_SUBSCRIPTION, tenants.`plan_id` | Platform SaaS entitlement plan | **Different domain** — do not reuse for sellable catalog |
| **subscription_products** (tenant billing clients) | BILLING_SPEC future | Unimplemented | Future Finance/Billing — may **reference** catalog SKU later |
| **Quote / Proposal / Estimate** | SALES_SPEC + FINANCE_SPEC both claim quotes/estimates | Unimplemented | **CRM owns Quote in 3A.4**; Finance later consumes snapshot (see ADR-026) |
| **Deal “product/service” field** | SALES_SPEC deal fields | Opportunity `amount` only; optional free-text `source` | No structured deal products until unfrozen Deal wave |
| **pipeline_items** | Legacy cards | Compatibility projection | Not a catalog or quote |
| **Invoice line items** | FINANCE_SPEC | Unimplemented | Out of scope; Quote must be convertible later |
| **Document “proposals/quotes”** | DOCUMENT_MANAGEMENT | Unimplemented file repo | Quote PDF artifacts link later via Documents |
| **Client** | Older docs / search | Superseded by CustomerParty | Do not create `/clients` |
| **Custom fields** | ADR-013 hybrid; Deal JSONB | Split models | Product/Quote: JSONB cache like Deal |

---

## 4. Spec conflicts to resolve in plan (not in code)

### 4.1 Who owns Quotes?

| Source | Claim |
|--------|-------|
| SALES_SPEC | Quotes & proposals under Sales; convert to invoice |
| FINANCE_SPEC | Quotes/estimates listed under Finance document types |
| ADR-024 | Products/Quotes CRM-adjacent; Finance handoff boundary |
| PHASE-3A-CRM-2-0-PLAN | §7–8 Products/Quotes in CRM wave 3A.4; convert → Finance event |

**Audit conclusion:** Specs collide. Canonical direction already in ADR-024 / 3A roadmap: **CRM implements Quote commercial object; Finance later copies snapshot into Invoice.** Estimates as a separate Finance document type can wait — 3A.4 does not ship a parallel `estimates` table.

### 4.2 Permission namespace

| Source | Prefix |
|--------|--------|
| SALES_SPEC | `sales.quotes.*`, `sales.products.*` |
| Live CRM | `deals:*`, `leads:*`, `customers:*` (colon style) |

**Audit conclusion:** Follow live CRM style: `products:*`, `quotes:*` under CRM module (not invent `sales.` prefix mid-migration).

### 4.3 Deal line items

ADR-024 / CRM 2.0 plan mention `deal_line_items`. **Deal is FROZEN.**  
**Audit conclusion:** Do **not** add Deal line items or change Deal dual-write in 3A.4. Quote ↔ Deal is FK only; optional later wave for opportunity products.

### 4.4 Tax engine ownership

CRM 2.0 plan: “CRM does not compute GST; stores category codes.”  
User 3A.4 brief: Quote must be GST-ready with CGST/SGST/IGST fields.  

**Audit conclusion:** Quote stores **calculated/display tax snapshots** at quote time (rates + amounts as metadata). Full configurable tax **engine** remains Finance. Avoid hard-coding India as the only path — use extensible tax breakup + India-friendly columns.

### 4.5 Company tax identity

Company table has no GSTIN/billing address. Quote PDF/tax needs party legal identity.  

**Audit conclusion:** Snapshot bill-to / ship-to / tax ids onto Quote (and optionally JSON party snapshot). Do not block 3A.4 on Company schema expansion; additive Company GSTIN can be a small optional expand if product wants, else quote-level party snapshot is enough for MVP.

---

## 5. Money / currency (as-built)

| Rule | Source |
|------|--------|
| `NUMERIC(18,2)` + `currency CHAR(3)` | DATABASE_SCHEMA, Deal migration |
| No float persistence | Deal money helpers |
| Default currency `INR` until tenant settings | Temporary Deal default |

Quotes/Products must match this. Tenant default currency settings still thin (`tenant_settings.settings` JSON) — plan: Quote.currency required; Product.currency required; default from workspace/tenant setting when present else `INR`.

---

## 6. Events / outbox (as-built pattern)

| Entity | Event types | Job |
|--------|-------------|-----|
| Deal | `crm.deal.created|updated|stage_changed|won|lost` | `crm.deal.record` |
| Lead | `crm.lead.*` | `crm.lead.record` |
| CustomerParty | `crm.customer_party.*` | `crm.customer_party.record` |

No domain → BullMQ. Quote/Product must follow same TX outbox pattern. Pipeline automation must **not** double-fire from Quote.

---

## 7. PDF / documents

| Layer | Status |
|-------|--------|
| ADR-016 / ADR-022 | Accepted design |
| Implementation | **None** |
| Quote PDF in 3A.4 | **Plan only** — implement in a later documents/PDF wave |

---

## 8. Customer 360 readiness

360 extensions today: finance, whatsapp, support, voice, automation — all `available: false`.  
**No quotes/products slot yet.** Plan: add CORE or extension slice for quotes when Quote ships (bounded list by `customer_party_id`).

---

## 9. UI surface

No `/crm/products` or `/crm/quotes`. Sidebar CRM nav: Pipeline, Leads, Customers, Contacts, Companies, Tasks.  
Responsive CRM patterns from Leads/CustomerParties are the template for Products/Quotes UI.

---

## 10. Migration posture

| Question | Answer |
|----------|--------|
| Legacy catalog rows? | **None** |
| Backfill? | No-op / empty report |
| Dual-read? | Not required for products/quotes |
| Expand/contract? | Additive tables only; contract N/A |
| Deal frozen impact | No Deal schema redesign; optional `quotes.deal_id` FK only |

---

## 11. Risks for implementation (informational)

1. Spec drift if Finance later creates parallel quote/estimate tables without handoff contract.  
2. Snapshot discipline — any live join of quote lines → products would break commercial truth.  
3. Deal frozen — resist sneaking `deal_line_items` into this wave.  
4. PDF deferred — send flow must work without PDF (email/link stub ok).  
5. Tax amount authority — server must compute/validate totals; clients must not be sole source of truth.

---

## 12. Audit gate

```
PHASE 3A.4 AUDIT = COMPLETE
LIVE PRODUCTS/QUOTES SCHEMA = NONE (GREENFIELD)
READY TO PLAN = YES
```
