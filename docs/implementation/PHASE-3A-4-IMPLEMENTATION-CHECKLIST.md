# PHASE-3A-4-IMPLEMENTATION-CHECKLIST.md

**Phase:** 3A.4 — Products + Quotes  
**Status:** **FROZEN** (final verification PASS)  
**Closeout:** [PHASE-3A-4-PRODUCTS-QUOTES-CLOSEOUT-REPORT.md](./PHASE-3A-4-PRODUCTS-QUOTES-CLOSEOUT-REPORT.md)

```
PHASE 3A.4 = FROZEN
FINAL VERIFICATION = PASS
READY FOR NEXT MAJOR PHASE = YES
```

Do **not** start Finance, PDF renderer, WhatsApp, Voice, Support, Activity redesign, Deal line items, price books, or FX.

---

## Locked decisions

- [x] Single `products` table + `kind`
- [x] CRM-owned Quotes; Finance handoff later
- [x] Line + party snapshots
- [x] CustomerParty required; Deal optional
- [x] Lifecycle via POST actions
- [x] Same quote_number + version on revise
- [x] O1 auto-ensure (company > contact)
- [x] O2 viewed via action

---

## Implementation

### DB
- [x] `products` + SKU unique
- [x] `quotes` + number/version unique
- [x] `quote_line_items`
- [x] `quote_number_sequences`
- [x] Module seed `crm:products` / `crm:quotes`

### Domain / API
- [x] Product CRUD session + v1
- [x] Quote CRUD + lifecycle + revise
- [x] Server totals + GST breakup
- [x] Snapshots / immutability
- [x] Outbox events + worker ack
- [x] RBAC permissions

### Integration
- [x] CustomerParty required / auto-ensure
- [x] Optional Deal + mismatch reject
- [x] Customer 360 quotes slice
- [x] Deal frozen (no line items / no dual-write change)

### UI
- [x] Products list/detail
- [x] Quotes list/builder/detail + actions

### Tests / docs
- [x] Unit totals
- [x] Live isolation Products/Quotes
- [x] API + worker typecheck
- [x] Implementation report

---

## STOP

```
NO FINANCE / PDF / WHATSAPP / VOICE / ACTIVITY REDESIGN / DEAL LINE ITEMS
```
