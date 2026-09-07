# PHASE-3A-4-PRODUCTS-QUOTES-IMPLEMENTATION-REPORT.md

**Phase:** 3A.4 — Products + Quotes (main implementation round)  
**Date:** 2026-09-05  
**Status:** **COMPLETE**  
**ADR:** [ADR-026](../adr/ADR-026-PRODUCTS-AND-QUOTES.md)  
**Plan:** [PHASE-3A-4-PRODUCTS-QUOTES-PLAN.md](./PHASE-3A-4-PRODUCTS-QUOTES-PLAN.md)  
**Audit:** [PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md](./PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md)

---

## Migration

| Item | Notes |
|------|--------|
| Migration | `packages/db/migrations/20260905_007_products_quotes.ts` |
| Tables | `products`, `quote_number_sequences`, `quotes`, `quote_line_items` |
| PRODUCTION PRODUCT DATA | **NONE** |
| PRODUCTION QUOTE DATA | **NONE** |
| Deal schema | FK only: `quotes.deal_id` → `deals` — Deal dual-write untouched |

Additive only. Soft-delete. Partial unique indexes:

- `(workspace_id, sku)` where not deleted  
- `(workspace_id, quote_number, version)` where not deleted  

---

## Schema (final)

**products:** kind, sku, name, description, category, unit, `list_price NUMERIC(18,2)`, currency, cost, tax_category_code, tax_metadata JSONB, billing_model, is_active, custom_fields, created_by, timestamps, deleted_at.

**quotes:** number/version/root/supersedes, status machine, customer_party_id NOT NULL, contact/company/deal optional, money totals, tax_breakup, party_snapshot, lifecycle metadata, soft delete.

**quote_line_items:** product_id nullable + full commercial snapshots; qty NUMERIC(18,4); money NUMERIC(18,2).

---

## APIs

### Session
`/api/products` CRUD  
`/api/quotes` CRUD + `send` / `view` / `accept` / `reject` / `cancel` / `revise`  

### Public
`/v1/products`, `/v1/quotes` (+ lifecycle)

Status is **not** a free-form PATCH field.

---

## RBAC / modules

| Keys | Roles |
|------|--------|
| `products:view\|create\|edit\|delete` | member view/create/edit; admin delete |
| `quotes:view\|create\|edit\|delete\|send\|accept\|reject\|cancel` | cancel/delete admin-leaning |

Submodules: `crm:products`, `crm:quotes`. Nav + Sidebar icons.

---

## Pricing / snapshots

- Catalog `list_price` is current only.  
- On line write: copy SKU/name/description/unit/price into snapshots.  
- Product price/name change does **not** mutate existing quote lines (live-tested).  
- Ad-hoc lines without `product_id` allowed.

---

## Quote lifecycle / revision

```
draft → sent → viewed → accepted | rejected
              ↘ expired
draft|sent|viewed → cancelled
```

- Draft: in-place mutate.  
- Sent/viewed: commercial PATCH rejected; `revise` → new row, same `quote_number`, `version+1`, status draft.  
- Accepted does **not** win Deal.

---

## Tax / GST strategy

Server recomputes all totals (client totals ignored).  
Half-up to 2dp per money step (`crm-money` / `quotes/totals`).  
`tax_type` + `tax_breakup` JSON; `in_gst` pack supports CGST/SGST (intra) or IGST (inter) via `place_of_supply_intra`.  
HSN/SAC + place_of_supply fields present. Not a Finance tax engine.

---

## CustomerParty / Deal

- Party required; auto-ensure company > contact (O1).  
- Deal optional; same-tenant; party mismatch rejected.  
- Deal never mutated by Quote actions.

---

## Events / outbox

`crm.product.created|updated|deleted` → job `crm.product.record`  
`crm.quote.created|updated|sent|accepted|rejected|cancelled|expired` → `crm.quote.record`  

Same-TX EventRecorder. No domain BullMQ. No pipeline automation fan-out.

---

## Customer 360

CORE `quotes` slice (bounded): number, version, status, total, currency, dates.  
Finance/WhatsApp/etc. stubs unchanged.

---

## UI

`/crm/products`, `/crm/products/[id]`  
`/crm/quotes`, `/crm/quotes/new`, `/crm/quotes/[id]`  

Customer/product/deal selectors (not raw UUID-only). Line add/remove/reorder via buttons. Lifecycle actions. ThinkAIQ copy. Layout `overflowX: hidden` / wrap for 390–1280.

---

## Tests

| Suite | Result |
|-------|--------|
| Quote totals unit | **5/5 PASS** |
| Modules RBAC | **PASS** (49 CRM perms) |
| API `tsc --noEmit` | **PASS** |
| Worker `tsc --noEmit` | **PASS** |
| Live `crm-isolation` | **15/15 PASS** (incl. Products/Quotes) |
| Full live isolation suite | **46/46 PASS** |

---

## Responsive

Builder uses stacked grids / wrap / ≥40px targets; no desktop-only DnD for critical actions. Full device QA pass deferred as non-blocking.

---

## Known non-blocking debt

1. PDF / DocumentRenderer not implemented (ADR-016/022 later)  
2. No convert-to-invoice  
3. Expire job not scheduled (API/domain transition exists)  
4. FormField `label` prop still informal on some selects (pre-existing pattern)  
5. Multi-currency / FX not in scope  
6. Quote PDF branding / email send channel stub only (`sent` status)

---

## Gate

```
PHASE 3A.4 MAIN IMPLEMENTATION = COMPLETE
READY FOR FINAL VERIFICATION = YES
NO FINANCE / PDF RENDERER / WHATSAPP / VOICE / DEAL LINE ITEMS
```
