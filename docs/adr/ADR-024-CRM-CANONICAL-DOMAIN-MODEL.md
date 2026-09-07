# ADR-024 — CRM Canonical Domain Model

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 3A.1 Deal implementation matches this decision) |
| Date | 2026-09-05 |
| Relates to | ADR-001/017 (tenancy), ADR-013 (customization), ADR-015/019 (jobs/outbox), ADR-016/022 (documents), ADR-018 (white-label), ADR-020/023 (auth), [CRM_SPECIFICATION.md](../modules/CRM_SPECIFICATION.md), [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md), [PHASE-3A-CRM-2-0-PLAN.md](../implementation/PHASE-3A-CRM-2-0-PLAN.md), [PHASE-3A-1-DEAL-AUDIT.md](../implementation/PHASE-3A-1-DEAL-AUDIT.md) |
| Scope | Canonical ThinkAIQ CRM entities, relationships, identity rules — Deal storage implemented in 3A.1; Leads/CustomerParty/Quotes deferred |

**Constraint:** Phase 3A.1 implements the canonical **Deal** table + dual-write only. No Leads, CustomerParty table, Products, Quotes, Finance, or WhatsApp in this wave.

---

## 1. Context

### 1.1 As-built (Phase 2B)

| Live | Reality |
|------|---------|
| Contacts / Companies | Implemented; `workspace_id` scoped |
| “Deals” | **UI/product name** over `pipeline_items` (+ `field_values` JSONB) |
| Pipelines / stages / fields | Implemented |
| Tasks / activities | Implemented; polymorphic `record_id` is loosely typed |
| Leads / Clients / Quotes / Products | **Not in live schema** (docs-only) |
| Legacy | `deals` table dropped; `DealTable` / plugin `deals.*` drift remains |

Phase 2B closed tenancy isolation, outbox→BullMQ, and same-TX critical events. Phase 3A designs the **commercial CRM** without copying HubSpot/Salesforce schemas.

### 1.2 Problem

Without a single canonical model:

- “Deal” means three different things across migrations, UI, and plugins
- Lead / Contact / Customer / Client language collides
- Finance and WhatsApp risk embedding into CRM core tables
- Automation events stay informal (`crm.deal@v1` vs `crm.deal.stage_changed`)

---

## 2. Decision

Adopt a **canonical CRM domain** with these rules:

1. **One Deal entity** as first-class opportunity (not an opaque pipeline card).
2. **Lead** is a pre-qualification acquisition record with conversion lineage.
3. **Contact** and **Company** are people/org identity; **Customer** is a commercial party role (not a duplicate person/org row).
4. **Pipeline / Stage** configure Deal workflow; Deals reference them.
5. **Products / Quotes** are CRM-adjacent commercial objects with clear finance handoff boundaries.
6. All tenant CRM rows are scoped by tenant identity (today `workspace_id` ≡ `tenants.id`; target `tenant_id` via expand/contract — no destructive rename in 3A implementation waves without dual-read).
7. Critical side effects emit via **ADR-019**: mutate + `EventRecorder` same TX → outbox → JobQueue → BullMQ. Domain never imports BullMQ.

---

## 3. Canonical entities (summary)

```
Lead ──converts──► Contact(s) + optional Company + optional Deal
                         │                │              │
                         └──── CustomerParty (role) ─────┘
                                      │
                    Deals · Quotes · (future Invoices/Payments via Finance)
                                      │
                         Activities · Tasks · Documents · Conversations*
```

\*Conversations/WhatsApp are **linked**, not owned by CRM core.

Full field/relationship detail: [PHASE-3A-CRM-2-0-PLAN.md](../implementation/PHASE-3A-CRM-2-0-PLAN.md).

---

## 4. Identity distinctions (normative)

| Term | Meaning | Must not be |
|------|---------|-------------|
| **Lead** | Unqualified or early interest record | A permanent Customer substitute |
| **Contact** | A person (email/phone/identifiers) | Automatically a paying Customer |
| **Company** | An organization / account | Automatically a Customer |
| **Customer** | Commercial party **role** used by 360, quotes, finance links | A second copy of Contact/Company rows |
| **Deal** | Sales opportunity in a pipeline | A generic `pipeline_items` bag forever |
| **Pipeline Item** (legacy) | Current runtime card | Long-term canonical Deal |

**Customer implementation preference:**  
`customer_parties` (or `customers`) row with `party_type = contact|company`, FK to exactly one Contact **or** Company, unique per `(tenant_id, party_type, party_id)`. Customer 360 is assembled from this party root.

---

## 5. Lead conversion (normative)

```
Lead
  → Contact (required for full convert, or soft-create)
  → Company (optional)
  → Deal (optional)
  → CustomerParty (when commercially engaged / won / explicit “mark as customer”)
```

Rules:

- Conversion writes **`lead_conversion_links`** (or equivalent) preserving `lead_id` lineage.
- Idempotent: re-convert of already-converted lead is a no-op or 409 with existing links.
- No silent duplicate Contact/Company when tenant uniqueness rules match.
- Timeline remains queryable across lead + resulting entities.

---

## 6. Canonical Deal (normative)

Replace long-term reliance on unstructured `pipeline_items.field_values` for commercial opportunity data.

**Target columns (logical):**  
`id`, `tenant_id`, `pipeline_id`, `stage_id`, `name`, `owner_id`, `amount`, `currency`, `probability`, `expected_close_at`, `source`, `primary_contact_id`, `company_id`, `customer_party_id`, `status` (`open|won|lost|abandoned`), `won_at`/`lost_at`, `lost_reason`, soft-delete, timestamps, `custom_fields` (JSONB cache + EAV per ADR-013).

**Associations:** participants (M:N contacts), line items → products/services, activities/tasks via polymorphic refs, documents (quotes).

**Migration:** expand new `deals` (or promote `pipeline_items` with typed columns) → backfill from `pipeline_items` + known field keys → dual-read → validate → contract (drop opaque-only paths). See plan §18.

---

## 7. Event contract (normative)

CRM domain mutations that have asynchronous consumers **must** use ADR-019:

| Event | Typical job |
|-------|-------------|
| `crm.lead.created` / `crm.lead.converted` | automation / notify |
| `crm.contact.created` / `updated` | webhook / search index |
| `crm.company.created` / `updated` | webhook |
| `crm.deal.created` / `crm.deal.stage_changed` / `crm.deal.won` / `crm.deal.lost` | automation / webhook |
| `crm.quote.created` / `accepted` / `converted` | document / finance handoff |

Aliases may map legacy `deal.*` webhook names during transition.

---

## 8. Integration boundaries

| System | CRM owns | CRM does not own |
|--------|----------|------------------|
| **Finance** | CustomerParty link, Quote commercial snapshot, Deal amount | Ledger, GST engine, payment rails, chart of accounts |
| **WhatsApp** | Contact identifiers, CustomerParty link | Message store, conversation threads, BSP credentials |
| **Documents** | Quote/Deal refs, template binding keys | PDF renderer internals (ADR-016/022) |
| **Customization** | Field defs for CRM entities | Full layout engine implementation in 3A |
| **Mobile** | Same `/v1` resources | Native app framework choice |

---

## 9. Consequences

### Positive

- One vocabulary for product, API, automation, and UI
- Clean Customer 360 aggregation root
- Safe finance/WhatsApp extension without schema pollution
- Aligns with Phase 2B outbox foundation

### Trade-offs

- Requires careful expand/backfill from `pipeline_items`
- Customer-as-role adds a table vs “Client = Contact with status”
- Temporary dual-read complexity during migration

### Rejected alternatives

- Keep forever: Deal ≡ `pipeline_items` only with JSONB bags  
- Copy Salesforce Account/Opportunity naming wholesale  
- Embed invoice/payment columns on Contact  

---

## 10. Status & follow-ups

- **Accepted** — Phase 3A.1 opened and Deal expand/backfill/dual-read matches §6.
- Leads / CustomerParty / Products / Quotes remain later waves.
- Destructive `workspace_id` → `tenant_id` cutover remains **out of scope** (dual-read only).
