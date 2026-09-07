# PHASE-3A-4-PRODUCTS-QUOTES-CLOSEOUT-REPORT.md

**Phase:** 3A.4 — Products + Quotes  
**Wave:** Final verification / closeout  
**Date:** 2026-09-05  
**Implementation report:** [PHASE-3A-4-PRODUCTS-QUOTES-IMPLEMENTATION-REPORT.md](./PHASE-3A-4-PRODUCTS-QUOTES-IMPLEMENTATION-REPORT.md)  
**ADR:** [ADR-026](../adr/ADR-026-PRODUCTS-AND-QUOTES.md)

---

## Gate

```
PHASE 3A.4 = FROZEN
FINAL VERIFICATION = PASS
READY FOR NEXT MAJOR PHASE = YES
```

Do **not** start Finance, PDF renderer, WhatsApp, Voice, Support, Activity redesign, Deal line items, price books, or FX without a new approved phase.

---

## Verification results

### 1. Products — PASS

| Check | Result |
|-------|--------|
| CRUD | Live + route handlers |
| Tenant isolation | Cross-tenant GET denied |
| SKU uniqueness | 409 on duplicate; unique index + race catch `23505` |
| Soft delete | Soft-delete path + `deleted_at` filter |
| Money/currency | `NUMERIC(18,2)` + decimal strings via `crm-money` |
| RBAC | `products:view\|create\|edit\|delete` on session routes |

### 2. Quotes — PASS

| Check | Result |
|-------|--------|
| CustomerParty required | Enforced; auto-ensure company > contact |
| Optional Deal | Allowed; party mismatch rejected |
| Same-tenant validation | Party/contact/company/deal/product scoped |
| Line snapshots | Live: price change does not mutate lines |
| Server totals | Unit + live (GST 18% totals) |
| Decimal money / qty | `18,2` / `18,4` |
| Tax/GST breakup | Intra CGST+SGST / inter IGST |
| Lifecycle | send/view/accept/reject/cancel; status PATCH locked |
| Invalid transitions | Repeated send → 409 |
| Sent immutability | PATCH notes on sent → 409 |
| Revision | Same number, `max(version)+1`, starts draft |
| Terminal immutability | Soft-delete limited to draft/cancelled |

### 3. Security / tenancy — PASS

Live suite covers products, quotes, CustomerParty, contact/company/deal regressions, lifecycle, revision, 360 cross-tenant deny. Quote lines inherit quote workspace filter.

### 4. RBAC — PASS (code audit + modules registry)

| Permission | Enforced on |
|------------|-------------|
| `products:view` | GET list/detail |
| `products:create` | POST |
| `products:edit` | PATCH |
| `products:delete` | DELETE |
| `quotes:view` | GET list/detail |
| `quotes:create` | POST create, POST revise |
| `quotes:edit` | PATCH draft, POST view |
| `quotes:delete` | DELETE |
| `quotes:send` | POST send |
| `quotes:accept` | POST accept |
| `quotes:reject` | POST reject |
| `quotes:cancel` | POST cancel |

Modules test: CRM permission count **49**.

### 5. Events / outbox — PASS

- `crm.product.created|updated|deleted` → `crm.product.record`  
- `crm.quote.created|updated|sent|accepted|rejected|cancelled|expired` → `crm.quote.record`  
- Appended inside `withUnitOfWork`  
- No BullMQ imports in product/quote domain  
- Quote paths do not emit pipeline automation  
- Deal create still emits pipeline automation exactly once (regression suite)

### 6. Customer 360 — PASS

Quotes slice filtered by `customer_party_id` + workspace. Merged redirect behavior unchanged. Live asserts quotes present for party.

### 7. Customer / Deal / Lead regression — PASS

Frozen Deal dual-write + Lead convert + CustomerParty tests still green in full live suite.

### 8. Migration safety — PASS

- Additive `20260905_007_products_quotes` only  
- `PRODUCTION PRODUCT/QUOTE DATA = NONE`  
- Unique `(workspace_id, quote_number, version)` among non-deleted  
- Sequence UPSERT for numbering concurrency  

### 9. Concurrency / idempotency — PASS (fixed in this round)

| Issue found | Fix |
|-------------|-----|
| Quote number read-modify-write race | Atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING` |
| Repeated revise of same sent parent → version clash | Allocate `MAX(version)+1` for quote_number |
| Duplicate lifecycle under race | Transition `UPDATE` requires `status IN allowed_from` |
| Concurrent SKU insert | Catch Postgres `23505` → `sku_conflict` |

Live extended: repeated send 409; second revise → version 3.

### 10. Responsive — PASS (static review)

Products/Quotes pages: `overflowX: hidden`, `minWidth: 0`, flex wrap, tap targets `minHeight: 40`. Quote builder uses button reorder (no DnD). No redesign; no overflow regressions found in code review for 390/768/1280 targets.

### 11. Runtime — PASS

- API/worker `tsc --noEmit` PASS after closeout fixes  
- Worker ack jobs registered for product/quote records  
- Live suite exercises API against Postgres successfully  
- Redis/BullMQ not newly required for domain path (outbox ack only)

### 12. Tests — PASS

| Suite | Count |
|-------|--------|
| Quote totals unit | **5/5** |
| Modules RBAC | **18/18** |
| Live isolation (full) | **46/46** |
| API tsc | PASS |
| Worker tsc | PASS |

---

## Failures / fixes in this closeout

1. **Quote number allocation** hardened for concurrent creates.  
2. **Revise versioning** uses max version to avoid unique index collisions.  
3. **Lifecycle transitions** optimistic status guard against double-apply.  
4. **SKU create** maps unique-violation races to 409.  
5. Live assertions for repeated send + double revise.

No scope expansion.

---

## Known non-blocking debt

1. PDF / DocumentRenderer not implemented  
2. No convert-to-invoice / Finance handoff write path  
3. Quote expire job not scheduled (domain transition exists)  
4. Dedicated `quotes:view` for mark-viewed uses `quotes:edit` (MVP)  
5. No automated browser matrix for 390/768/1280 (layout guards present)  
6. Plugin bridge Deal create party attach debt from 3A.3 still open  

---

## Exact deferred scope

- Finance (invoices, payments, tax engine)  
- Playwright/PDF renderer  
- WhatsApp / Voice / Support  
- Activity polymorphic redesign  
- Deal line items  
- Price books / FX  
- `customer_party_contacts` M:N  

---

## STOP

```
PHASE 3A.4 = FROZEN
FINAL VERIFICATION = PASS
READY FOR NEXT MAJOR PHASE = YES
```
