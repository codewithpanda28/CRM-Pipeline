# ADR-026 — Products Catalog and Quotes (CRM Commercial Documents)

| Field | Value |
|-------|-------|
| Status | **Accepted** (planning lock for Phase 3A.4) |
| Date | 2026-09-05 |
| Relates to | ADR-024 (CRM domain), ADR-025 (CustomerParty), ADR-016/022 (PDF later), ADR-019 (outbox), [PHASE-3A-4-PRODUCTS-QUOTES-PLAN.md](../implementation/PHASE-3A-4-PRODUCTS-QUOTES-PLAN.md), [PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md](../implementation/PHASE-3A-4-PRODUCTS-QUOTES-AUDIT.md) |
| Scope | Ownership, catalog shape, quote snapshots, lifecycle, finance boundary |

**Constraint:** This ADR locks design for the 3A.4 implementation wave. It does not authorize Finance, PDF renderer, or Deal redesign.

---

## 1. Context

Sales and Finance specs both mention quotes/estimates. Live schema has **no** products or quotes (greenfield). Deal is frozen without line items. CustomerParty is the commercial party root. Money on Deal already uses `NUMERIC(18,2)` + currency strings.

Without a clear boundary:

- Quotes could be duplicated in Finance and CRM  
- Live product joins would corrupt historical quote totals  
- Platform SaaS `plan_id` could be confused with sellable catalog plans  

---

## 2. Decision

1. **CRM owns** the tenant **Product catalog** and **Quote** commercial document in Phase 3A.4.  
2. **Finance later copies** accepted Quote snapshots into invoices — Finance does not own the primary Quote table in this wave.  
3. **One `products` table** with `kind ∈ {product, service, package, plan}`; SKU unique per tenant among active rows.  
4. **Quote line items store price/name/SKU/tax snapshots**; after `sent`, commercial fields are immutable on that revision.  
5. **Quote requires `customer_party_id`**; `deal_id` optional; Contact/Company optional denormalized FKs.  
6. **Lifecycle transitions** use dedicated actions (`send` / `accept` / `reject` / `cancel`); status is not a free-form PATCH.  
7. **Revisions:** draft mutates in place; post-send edits create a new version row (same `quote_number`, incremented `version`).  
8. **Tax:** store GST-ready amounts and extensible `tax_breakup` JSON; do not embed a full tax rules engine in CRM.  
9. **Money:** `NUMERIC(18,2)` only; no float persistence.  
10. **Events:** transactional outbox `crm.product.*` / `crm.quote.*`; domain never calls BullMQ.  
11. **Deal frozen:** no `deal_line_items` and no Deal dual-write changes in 3A.4.  
12. **PDF:** ADR-016/022 remain the strategy; generation is out of band for the first Products/Quotes code wave unless explicitly re-scoped.

---

## 3. Consequences

### Positive

- Clear finance handoff contract (snapshot-preserving)  
- Aligns with ADR-024/025 and 3A roadmap  
- Avoids India-only hard-coding while remaining GST-ready  

### Trade-offs

- Estimates as a separate Finance document type deferred  
- No multi-currency lines / price books in 3A.4  
- Send without PDF until Documents wave  

### Rejected

- Separate `services` table as the primary model  
- Live-join quote lines to current product price  
- Quote as Finance-only entity for 3A.4  
- Arbitrary PATCH to `accepted`  
- Coupling catalog `kind=plan` to platform billing plans  

---

## 4. Gate

```
ADR-026 = ACCEPTED
PHASE 3A.4 DESIGN LOCK = YES
IMPLEMENTATION = NOT STARTED (planning wave only)
```
