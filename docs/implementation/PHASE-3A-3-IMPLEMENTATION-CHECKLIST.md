# PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md

**Phase:** 3A.3 — CustomerParty + Customer 360  
**Status:** **COMPLETE** (main implementation round)  
**ADR:** [ADR-025](../adr/ADR-025-CUSTOMERPARTY-AND-CUSTOMER-360.md) = **Accepted**  
**Plan:** [PHASE-3A-3-CUSTOMERPARTY-PLAN.md](./PHASE-3A-3-CUSTOMERPARTY-PLAN.md)  
**Audit:** [PHASE-3A-3-CUSTOMERPARTY-AUDIT.md](./PHASE-3A-3-CUSTOMERPARTY-AUDIT.md)  
**Step 1:** [PHASE-3A-3-CUSTOMERPARTY-STEP-1-REPORT.md](./PHASE-3A-3-CUSTOMERPARTY-STEP-1-REPORT.md)  
**Step 2A:** [PHASE-3A-3-STEP-2A-DEAL-CUSTOMERPARTY-REPORT.md](./PHASE-3A-3-STEP-2A-DEAL-CUSTOMERPARTY-REPORT.md)  
**Final report:** [PHASE-3A-3-CUSTOMERPARTY-IMPLEMENTATION-REPORT.md](./PHASE-3A-3-CUSTOMERPARTY-IMPLEMENTATION-REPORT.md)

**Prerequisites:** 3A.1 Deal FROZEN · 3A.2 Lead COMPLETE · Product gate P1–P6 ACCEPTED

---

## Gate status

```
PHASE 3A.3 PRODUCT GATE = ACCEPTED
ADR-025 = ACCEPTED
PHASE 3A.3 IMPLEMENTATION = COMPLETE
```

Do **not** start Products, Quotes, Finance, WhatsApp, Voice, or Activity redesign.

---

## Locked product decisions (do not re-litigate)

- [x] **P1** Canonical `/api/customer-parties` + `/v1/customer-parties`; no `/clients` entity  
- [x] **P2** Deal create + Deal won ensure/reuse; Lead convert explicit flag only; no duplicate parties  
- [x] **P3** company_id → company party else contact; keep Deal contact/company FKs  
- [x] **P4** Deterministic backfill set 1–5; idempotent; ambiguous → manual  
- [x] **P5** Admin merge MVP with audit + TX repoint + 360 redirect  
- [x] **P6** No `customer_party_contacts` in this wave  

---

## Implementation checklist

### A. Expand / migrate

- [x] Create `customer_parties`  
- [x] Create `customer_party_merge_events`  
- [x] Unique `(workspace_id, party_type, party_id)` among active parties  
- [x] Add FK on `deals.customer_party_id` → `customer_parties`  
- [x] Extend `lead_conversion_links.entity_type` for `customer_party`  
- [x] Seed `crm:customers` module + `customers:*` permissions  

### B. Domain service

- [x] `ensureCustomerParty` — idempotent  
- [x] Prefer company over contact when resolving from Deal (P3)  
- [x] Tenant validation  
- [x] Outbox created|updated|linked|merged → ack job  

### C. Deal hooks

- [x] Integrity validates tenant party  
- [x] Deal create ensure/reuse  
- [x] Deal won ensure if null  
- [x] Dual-write / pipeline_items preserved  
- [x] Keep primary_contact_id / company_id  

### D. Lead hooks

- [x] Default convert unchanged (`create_customer_party` default false)  
- [x] Optional flag → ensure/reuse party + conversion link  
- [x] Idempotent re-convert still works  

### E. API

- [x] Session CRUD + `/360` + `/merge` + `/link` under `/api/customer-parties`  
- [x] `/v1/customer-parties` equivalents  
- [x] Optional `/api/customers` alias (same handlers)  
- [x] RBAC: view/create/edit/delete + merge (admin)  

### F. Backfill (P4)

- [x] Dry-run counts  
- [x] Idempotent ensure for candidates 1–5  
- [x] Ambiguous case report (no silent merge)  
- [x] Attach Deal.customer_party_id where deterministic  

### G. Merge (P5)

- [x] Admin-only; require source, target, reason  
- [x] One TX: repoint Deal FKs (+ lead links); mark source merged  
- [x] Merge event row + outbox  
- [x] 360 redirects merged → survivor  

### H. Customer 360 + UI

- [x] CORE slices + extension stubs  
- [x] `/crm/customer-parties` list + detail/360 — responsive  

### I. Tests / gate

- [x] Unit: ensure/reuse, merge, Deal helpers  
- [x] Live isolation (incl. CustomerParty CRUD/merge/lead party)  
- [x] Regression: Deal dual-write; Lead convert without party flag  
- [x] API + worker typecheck  
- [x] Implementation report  
- [x] Explicit **STOP** — no next CRM wave auto-start  

---

## Explicit non-goals this wave

- [x] ~~`customer_party_contacts` M:N~~ (P6)  
- [x] ~~`/clients` entity~~  
- [x] ~~Silent merge~~  
- [x] ~~Products / Quotes / Finance / WhatsApp / Voice~~  
- [x] ~~Activity polymorphic redesign~~  
- [x] ~~Drop contacts / companies / pipeline_items~~  

---

## STOP

```
PHASE 3A.3 = COMPLETE
NO PRODUCTS / QUOTES / FINANCE / WHATSAPP / VOICE / ACTIVITY REDESIGN
```
