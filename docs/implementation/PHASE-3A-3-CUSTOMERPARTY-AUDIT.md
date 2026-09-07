# PHASE-3A-3-CUSTOMERPARTY-AUDIT.md

**Phase:** 3A.3 — CustomerParty + Customer 360 (**planning / audit only**)  
**Date:** 2026-09-05  
**Prerequisites:** Phase 3A.1 Deal = **FROZEN**; Phase 3A.2 Lead = **COMPLETE**  
**Constraint:** No implementation in this wave. No Products / Quotes / Finance / WhatsApp / Voice / Activity redesign.

---

## Executive verdict

| Question | Answer |
|----------|--------|
| `customer_parties` table live? | **No** |
| CustomerParty API / UI / 360 page? | **No** |
| `deals.customer_party_id`? | **Stub column only** — no FK; integrity **rejects** non-null |
| Live commercial identity root? | **Contact + Company** |
| “Customer” in UI today? | `contacts.status = 'customer'` — **legacy role hint**, not a party |
| Docs “Client” / `/clients/{id}/360`? | **Spec only** — zero code |
| Safe to plan additive CustomerParty? | **Yes** — must not delete contacts/companies |

```
AUDIT = COMPLETE
CUSTOMERPARTY IMPLEMENTATION = NOT STARTED
SAFE TO PLAN 3A.3 = YES
```

---

## 1. Existing CustomerParty / customer / client remnants

### Real code (stub)

| Artifact | Path | Behavior |
|----------|------|----------|
| `deals.customer_party_id UUID NULL` | `packages/db/migrations/20260905_001_canonical_deals.ts` | No FK |
| Schema comment | `packages/db/src/schema.ts` | “table not created in 3A.1” |
| Integrity reject | `apps/api/src/lib/deals/integrity.ts` | Non-null → `'customer_party'` fail |
| Always persist `null` | Deal create routes, Lead `convert.ts`, projection | Stub preserved |

### Absent

- No `customer_parties` / `customers` / `clients` table  
- No `/api/customers`, `/v1/customers`, `/clients/*/360`  
- No `customers:*` / `crm.clients.*` permissions  
- No `crm.customer*` outbox events or aliases  
- No `crm.customer@v1` plugin contract  
- No Customer 360 page under `/crm/*`

### Docs-only / naming collision

| Name | Source | Conflict |
|------|--------|----------|
| CustomerParty | ADR-024, PHASE-3A plan | Canonical preferred term |
| Client / `/clients/{id}/360` | CRM_SPEC, DATABASE_SCHEMA, REQ-CRM-005 | Same intent, different name |
| Account | Plugin copy for Company | Synonym for Company, not a table |
| `Contact.status=customer` | Live enum + UI widgets | Legacy commercial signal |

**Planning decision required:** ship as **CustomerParty** + `/api/customer-parties` (or `/api/customers` alias) — retire “Client” as entity name in new APIs.

---

## 2. Live identity graph (today)

```
Lead ──convert──► Contact ──company_id──► Company
  │                  ▲                      ▲
  │                  │ primary_contact_id   │ company_id
  └───────────────► Deal ──customer_party_id──► NULL (stub)
                     ▲
Tasks / Activities ── contact_id + record_id (legacy semantics)
Projects ────────── contact_id / company_id / deal_id→pipeline_items FK history
Emails (typed) ──── contact_id / deal_id (weak / incomplete mail migrations)
```

### Contacts (`ContactTable`)

- `workspace_id`, `company_id?`, `owner_id`, `name`, `email` (unique lower per tenant), `phone?`, `status`, soft-delete  
- Primary person identity

### Companies (`CompanyTable`)

- `workspace_id`, `name`, `website?`, industry/location/employee_count  
- **No owner_id**; no website unique index  
- Org / account identity

### Leads (3A.2 frozen complete)

- Typed lead + `lead_conversion_links` for `contact|company|deal` create/reuse  
- **No** `customer_party` entity_type in CHECK  
- Convert always sets Deal `customer_party_id: null`

### Deals (3A.1 frozen)

- Canonical `deals` + dual-write `pipeline_items`  
- Real FKs: `primary_contact_id`, `company_id`  
- Stub: `customer_party_id`

### Activities / tasks

- `contact_id` + loosely typed `record_id` (historical pipeline_records semantics)  
- **Not** polymorphic `entity_type/entity_id` yet → Phase **3A.5** cleanup  
- Deal timeline also uses `pipeline_activity`

### Projects

- Optional `contact_id`, `company_id`, `deal_id` (FK historically to `pipeline_items`; UUID often equals canonical Deal)  
- PM portal “client_*” naming ≠ CRM CustomerParty

---

## 3. Duplicate / overlapping customer concepts

| Concept | Overlap risk | Disposition for 3A.3 |
|---------|--------------|----------------------|
| Contact | Person of record | **Keep** — CustomerParty may reference |
| Company | Org of record | **Keep** — CustomerParty may reference |
| Lead | Pre-qualification | **Keep** — conversion may link party later |
| Deal | Opportunity | **Keep** — additive `customer_party_id` |
| Contact `status=customer` | Soft “is customer” | **Compatibility signal** until party backfill |
| Docs Client | Duplicate name | **Do not implement as separate table** |
| Stripe / platform customer | SaaS billing | **Out of scope** |

**Rule:** CustomerParty is a **commercial role / 360 root**, not a second copy of Contact or Company.

---

## 4. Reusable identity fields for matching

| Source | Fields | Match use |
|--------|--------|-----------|
| Contact | `lower(email)` unique index | Hard person match |
| Contact | phone digits | Soft |
| Company | `name`, `website` host | Soft (no unique index) |
| Lead | email/phone/company_name/website | Soft (pre-party) |
| Deal | primary_contact / company FKs | Deterministic party attach |

Patterns to reuse: Lead `findLeadDuplicates`, Contact email uniqueness, Deal `assertDealRelations`.

---

## 5. APIs / plugins that may conflict

| Surface | Conflict |
|---------|----------|
| Contact widgets “Customers” / “New Leads Today” | Mislabel vs party / Lead entity |
| Spec `/v1/customers` vs `/clients` | Naming — pick one before implement |
| Plugin `crm.company@v1` “account” | Keep; party is separate contract later |
| Deal integrity reject on `customer_party_id` | Must flip carefully when table lands |
| `lead_conversion_links` CHECK | Must expand for `customer_party` if lineage required |

---

## 6. Indexes useful for party / 360

| Index | Use |
|-------|-----|
| `contacts_workspace_email_unique_idx` | Person dedup / party attach |
| Contact trigram name/email | Search UX |
| `deals_workspace_*` | 360 deal list by party (after backfill) |
| Companies | App-level website/name match only |

Proposed party indexes (plan): `(workspace_id, party_type, party_id)` **UNIQUE**, `(workspace_id, status)`, soft-delete partial.

---

## 7. Code paths that create Contact / Company / Deal

(Reuse from 3A.2 audit — summary)

- Contacts: session/v1/import/bridge/seeds  
- Companies: session/v1/import/bridge/seeds  
- Deals: **only** Deal UoW (`insert deals` + `upsertPipelineItemFromDeal`)  
- Lead convert: same TX create/reuse contact±company±deal  

**3A.3 rule:** Party create/link helpers must be callable from convert / mark-as-customer / deal-won without inventing parallel Contact/Company insert paths.

---

## 8. Tenant / RBAC / outbox patterns

| Concern | Pattern to reuse |
|---------|------------------|
| Scope | `workspace_id` (= tenant) + soft-delete |
| RBAC | `requirePermission` + `requireCrmFeature('crm:…')` |
| Outbox | `withUnitOfWork` + `EventRecorder`; ack job like `crm.deal.record` / `crm.lead.record` |
| Isolation tests | Extend `crm-isolation.live.test.ts` |

No cross-tenant identity resolution — ever.

---

## 9. Customer 360 as-built UX

| Surface | Status |
|---------|--------|
| Dedicated 360 page | **Missing** |
| ContactDrawer | Partial person timeline (tasks, projects, activities) |
| Company pages | List/form only |
| Deal ItemActivity | Pipeline item timeline |
| Project CRM timeline | Hook-gated PM surface |

360 must be designed as a **new aggregation read model**, not a rename of ContactDrawer.

---

## 10. Migration / freeze constraints

| Constraint | Implication |
|------------|-------------|
| Deal frozen | Only **additive** `customer_party_id` activation (FK + allow writes) |
| Lead complete | Convert flow must remain backward compatible; party step **optional additive** |
| No destructive drops | Contacts/companies stay forever as identity anchors |
| expand → backfill → dual-read → validate → contract | Same strategy as Deal/Lead |

---

## 11. Risks if implementation starts without this plan

1. Dual “Customers” lists (status filter vs party list) confuse users  
2. Breaking Deal integrity / Lead convert by half-wiring stub  
3. Orphan parties without Contact/Company anchors  
4. Silent merge destroying auditability  
5. Pulling Finance/WhatsApp tables into CRM core  

---

## 12. Audit gate

```
PHASE 3A.3 AUDIT = COMPLETE
IMPLEMENTATION = BLOCKED UNTIL PLAN + ADR ACCEPTED
NEXT = PHASE-3A-3-CUSTOMERPARTY-PLAN.md + ADR-025
```
