# ADR-025 — CustomerParty and Customer 360

| Field | Value |
|-------|-------|
| Status | **Accepted** |
| Date | 2026-09-05 |
| Accepted | 2026-09-05 — product gate P1–P6 resolved |
| Relates to | [ADR-024](./ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md), ADR-001/017 (tenancy), ADR-013 (customization), ADR-015/019 (jobs/outbox), [PHASE-3A-3-CUSTOMERPARTY-AUDIT.md](../implementation/PHASE-3A-3-CUSTOMERPARTY-AUDIT.md), [PHASE-3A-3-CUSTOMERPARTY-PLAN.md](../implementation/PHASE-3A-3-CUSTOMERPARTY-PLAN.md) |
| Scope | Canonical commercial party role + Customer 360 aggregation root; additive integration with frozen Deal and completed Lead |

**Constraint:** Implementation of 3A.3 may now proceed per the accepted plan. No Products, Quotes, Finance, WhatsApp, Voice, or Activity polymorphic redesign in the first CustomerParty implementation wave. Do not change Deal/Lead behavior until the 3A.3 implementation wave explicitly wires additive hooks.

---

## 1. Context

ADR-024 established:

- Contact / Company = identity  
- Customer = **role**, not a duplicate person/org row  
- Deal carries nullable `customer_party_id`  
- Lead converts to Contact ± Company ± Deal, optionally CustomerParty  

As-built after 3A.1 / 3A.2:

- Deal + Lead are live; `customer_party_id` is a **reject-non-null stub**  
- No `customer_parties` table, 360 API, or customers permissions  
- UI “Customers” means `contacts.status=customer`  
- Specs still say “Client” / `/clients/{id}/360`  

Product gate (2026-09-05) locked P1–P6 so implementation can start without naming or policy ambiguity.

---

## 2. Decision (architecture)

1. Introduce **`customer_parties`** as the canonical commercial party and **Customer 360 root**.  
2. Each party references **exactly one** Contact **or** Company (`party_type` + `party_id`), unique per tenant.  
3. **Do not** delete or replace `contacts` / `companies`.  
4. Activate frozen Deal column additively: add FK, validate tenant, backfill, allow writes. Keep `primary_contact_id` / `company_id`.  
5. Preserve Lead convert; add **optional** party create/link + `lead_conversion_links.entity_type = customer_party`.  
6. **No silent merge** — merges are explicit, permissioned, audited.  
7. Strict **tenant isolation**; no cross-tenant identity resolution.  
8. Domain events via ADR-019 outbox (`crm.customer_party.*`); no BullMQ in domain.  
9. Permissions namespace **`customers:*`** (not `crm.clients.*`).  
10. 360 CORE = CRM (+ projects/mail best-effort); Finance/WhatsApp/Support/Voice = **extension slots only** in this wave.  
11. Migration: expand → backfill → dual-read → validate → contract.  

---

## 3. Product decisions (P1–P6) — Accepted

### P1 — API naming

| Decision | Rationale |
|----------|-----------|
| Canonical paths: `/api/customer-parties`, `/v1/customer-parties` | Matches entity name; avoids Client fork |
| Optional `/api/customers` alias only if it does **not** create a second concept | Compatibility without dual models |
| **Do not** implement `/clients` as a separate entity | Spec debt retired for new APIs |

### P2 — Automatic CustomerParty creation

| Decision | Rationale |
|----------|-----------|
| On **Deal create**, ensure/reuse party when valid `company_id` or `primary_contact_id` exists | Deals should always have commercial root when identity is known |
| Prefer **company** party when `company_id` present | B2B account is the commercial party |
| Lead conversion: party only via **explicit optional flag/operation** | Preserves 3A.2 backward compatibility |
| On Deal **won**, if still no party, ensure/reuse | Terminal commercial engagement never leaves orphan deals |
| Never create duplicate parties | Unique `(workspace, party_type, party_id)` + ensure/reuse |

### P3 — B2B root preference

| Decision | Rationale |
|----------|-----------|
| If Deal has `company_id` → Company is CustomerParty root; else Contact | Clear B2B vs B2C |
| Keep `primary_contact_id` and `company_id` unchanged | Frozen Deal operational FKs stay |

### P4 — Backfill

Deterministic, idempotent ensure/reuse for:

1. Contact `status=customer`  
2. Company linked through existing customer/deal relationships  
3. Deals with `company_id`  
4. Deals with `primary_contact_id` only  
5. Converted Lead relationships with deterministic Contact/Company  

No silent merge of ambiguous records — document for manual resolution.

### P5 — Merge

| Decision | Rationale |
|----------|-----------|
| Admin-only merge in 3A.3 MVP | Required for duplicate cleanup without silent auto-merge |
| Explicit source + target + reason | Auditability |
| One TX: repoint supported relationships; mark source `merged`; 360 redirects to survivor | Consistency |

### P6 — M:N company contacts

| Decision | Rationale |
|----------|-----------|
| **Do not** add `customer_party_contacts` in first 3A.3 wave | YAGNI; `contacts.company_id` sufficient |
| Revisit only on concrete product requirement | Avoid premature schema |

---

## 4. Consequences

### Positive

- Stable id for Finance / WhatsApp / Support / Voice later  
- Clear Lead ≠ Contact ≠ Company ≠ CustomerParty ≠ Deal  
- Deal/Lead waves remain compatible  
- Implementation unblocked — product policy locked  

### Trade-offs

- Temporary dual UX: Contact status “customer” vs party list  
- Polymorphic activity graph still weak until 3A.5 — 360 activity is best-effort  
- Lead convert does not auto-create party (explicit flag required)  

### Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| Rename Contact to Customer | Breaks B2B; conflates person with commercial role |
| Fat customer table copying fields | Duplicates identity; drift hell |
| Clients table / `/clients` entity | Naming fork; P1 |
| Require party on every Lead convert | Breaks 3A.2 default UX; P2 |
| Auto-merge on email | Unsafe; P5 |
| `customer_party_contacts` in MVP | Premature; P6 |

---

## 5. Implementation readiness

```
ADR-025 = ACCEPTED
PRODUCT GATE P1–P6 = ACCEPTED
READY FOR IMPLEMENTATION = YES
```

Follow [PHASE-3A-3-CUSTOMERPARTY-PLAN.md](../implementation/PHASE-3A-3-CUSTOMERPARTY-PLAN.md) §16 sequence and [PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md](../implementation/PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md).

---

## 6. Out of scope (first implementation wave)

Products, Quotes, Finance ledgers, WhatsApp, Voice, Support tickets, Activity polymorphic rewrite, destructive drops of contacts/companies/pipeline_items, M:N `customer_party_contacts`.
