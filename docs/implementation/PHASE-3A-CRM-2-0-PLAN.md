# PHASE-3A-CRM-2-0-PLAN.md

**Phase:** 3A — ThinkAIQ CRM 2.0 + Customer 360 (architecture)  
**Date:** 2026-09-05  
**Status:** Planning only — **no code, no migrations, no packages**  
**Depends on:** Phase 2B foundation GREEN (isolation, outbox atomicity, BullMQ)  
**Normative companion:** [ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md](../adr/ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md)

---

## 0. Goals and non-goals

### Goals

Design ThinkAIQ’s commercial CRM as a **canonical, multi-tenant, API-first** domain that is:

- customizable (ADR-013 boundaries)
- automation-ready (ADR-019 outbox → JobQueue → BullMQ)
- finance-compatible (handoff only)
- WhatsApp-compatible (link only)
- mobile-compatible (same `/v1` contract)
- white-label compatible (ADR-018)

### Non-goals (explicit)

- Do **not** implement CRM 2.0 code in this phase  
- Do **not** build Finance, GST, Payments, WhatsApp, Voice, Super Admin UI, Meilisearch, Temporal  
- Do **not** run destructive `workspace_id` migration  
- Do **not** copy HubSpot/Salesforce schemas wholesale  

### As-built baseline (Phase 2B)

| Area | State |
|------|--------|
| Contacts / Companies | Live |
| Pipelines / stages / fields / automations | Live |
| “Deals” | `pipeline_items` + `field_values` (legacy `deals` dropped) |
| Tasks / activities | Live |
| Leads / Customer / Quotes / Products | Spec only |
| Events | Same-TX outbox for pipeline/PM critical paths |
| Tenancy | CRM rows use `workspace_id` (= `tenants.id` dual-read) |

---

## 1. Canonical CRM entities and relationships

### 1.1 Entity map

```
┌─────────┐     converts      ┌─────────┐
│  Lead   │ ────────────────► │ Contact │◄────┐
└─────────┘                   └────┬────┘     │
     │                             │          │ company_contacts
     │                             │          │
     ▼                             ▼          │
 optional Deal              ┌──────────┐     │
     │                      │ Company  │◄────┘
     │                      └────┬─────┘
     │                           │
     └──────────┬────────────────┘
                ▼
        ┌───────────────┐
        │ CustomerParty │  ← commercial role / 360 root
        └───────┬───────┘
                │
    ┌───────────┼───────────┬────────────┐
    ▼           ▼           ▼            ▼
  Deal       Quote     (Invoice*)   Conversation*
    │           │
    ▼           ▼
 Pipeline    Line items → Product/Service
 Stage
```

\*Finance invoices and WhatsApp conversations are **extension links**, not CRM-owned stores.

### 1.2 Lead vs Contact

| | Lead | Contact |
|---|------|---------|
| Purpose | Capture & qualify interest | Durable person identity |
| Lifecycle | New → … → Converted / Disqualified | Long-lived |
| Ownership | Sales owner required | Owner + optional company |
| After convert | Remains as history + lineage | Becomes primary person row |

A Lead may hold provisional company name/email before a Company exists. Conversion **must not** invent a second Contact when tenant uniqueness already matches.

### 1.3 Contact vs Customer

| | Contact | Customer (CustomerParty) |
|---|------|--------------------------|
| What | Person | **Role** attached to Contact **or** Company |
| When | Always for people in CRM | When commercially engaged (quote/deal won/explicit) |
| 360 root | No (contributor) | **Yes** |

`Contact.status = customer` today is a **legacy hint**, not the long-term Customer model.

### 1.4 Company vs Customer

Company = organization/account.  
CustomerParty may point at a Company (B2B account customer) **or** a Contact (B2C).  
Never create a “Customer company” that duplicates Company name/GSTIN without linking.

### 1.5 Lead conversion

Supported outcomes (combinable):

1. Lead → Contact  
2. Lead → Contact + Company  
3. Lead → Contact + Company + Deal  
4. Optional: create/link CustomerParty when conversion intent is commercial  

**No duplicate customers:** uniqueness checks run before insert; conversion writes `lead_conversion_links`.

### 1.6 Deal ownership and participants

- **Owner:** single primary `owner_id` (user) for accountability and forecasting  
- **Participants:** M:N `deal_contacts` (roles: primary, influencer, decision_maker, …)  
- **Company:** optional `company_id`  
- **CustomerParty:** optional link for 360/finance alignment  

### 1.7 Company contacts

`company_contacts` (or Contact.`company_id` + M:N if multi-company employment is required later).  
Phase 3A default: Contact has optional `company_id`; M:N employment is a **future** customization if needed.

### 1.8 Customer 360

See §2 — aggregation rooted at CustomerParty.

---

## 2. Customer 360

### 2.1 Purpose

A **connected OS view** (not a static form): one commercial party and everything entitled modules attach.

### 2.2 Aggregation surface (logical)

| Slice | Source module | Extension point |
|-------|---------------|-----------------|
| Identity | CustomerParty + Contact/Company | CRM core |
| Contacts | Contacts linked to party/company | CRM core |
| Company | Company entity | CRM core |
| Deals | Deals by `customer_party_id` / company / contacts | CRM core |
| Quotes | Quotes by party/deal | CRM → Documents |
| Invoices / Payments | Finance service API / FK links | **Finance extension** |
| Tasks / Activities / Notes | Polymorphic activity graph | CRM core |
| Documents | Document attachments by aggregate | Storage + ADR-016 |
| Conversations / WhatsApp | Messaging module by contact identifiers | **WhatsApp extension** |
| Support tickets | Helpdesk module by party id | **Support extension** |
| Automation history | Outbox/job logs + automation runs by aggregate | Automation |
| Voice | Optional AI call summaries | **Voice extension** |

### 2.3 API shape (future)

`GET /v1/customers/{id}/360?include=deals,quotes,activities,…`

- TenantContext + RBAC + module entitlement gates  
- Each include is a **bounded subquery** or fan-out port — no cross-tenant joins  
- Empty slices when module off  

### 2.4 What 360 is not

- Not a denormalized god-table  
- Not a place to store WhatsApp message bodies or ledger lines  

---

## 3. Deal model

### 3.1 Audit of existing

| Artifact | Role today |
|----------|------------|
| `deals` table | **Dropped** (migrated away) |
| `pipeline_records` / Monday-style `items` | Legacy / parallel types in schema drift |
| `pipeline_items` | **Live** opportunity cards; commercial attrs often in `field_values` |
| UI / hooks / projects.`deal_id` | Treat `pipeline_items.id` as deal id |
| Plugin `deals.*` | Stale table references — must be fixed in implementation |

### 3.2 ONE canonical future Deal

**Name:** `Deal` (API `/v1/deals`, table preferred `deals` after expand, or evolved `pipeline_items` with typed columns — implementation chooses one storage strategy; **logical model is Deal**).

#### Lifecycle

```
open → (stage moves) → won | lost | abandoned
```

Won/lost stages must align with `pipeline_stages.is_won` / `is_lost` (or Deal.status override with validation).

#### Core fields

| Field | Notes |
|-------|--------|
| `name` | Required |
| `owner_id` | Required |
| `pipeline_id` / `stage_id` | Required; stage ∈ pipeline; tenant-owned |
| `amount` / `currency` | Money; currency ISO; tenant default currency |
| `probability` | 0–100; may default from stage |
| `expected_close_at` | Optional date |
| `source` | Enum/custom source catalog |
| `primary_contact_id` / `company_id` / `customer_party_id` | Optional FKs |
| `status` | open/won/lost/abandoned |
| `custom_fields` | ADR-013 cache + defs |
| Soft delete | `deleted_at` |

#### Products / services

`deal_line_items`: product_id, qty, unit_price, discount, tax_category snapshot.

#### Activity history

Via unified Activity (§9) + optional `pipeline_activity` retained for stage telemetry during migration.

### 3.3 Migration strategy (non-destructive)

**Expand → backfill → dual-read → validate → contract**

1. **Expand:** add typed Deal table **or** typed columns on `pipeline_items` + `deal_line_items`, `deal_contacts`.  
2. **Backfill:** map known `field_values` keys (`name`, `value`/`amount`, owner, dates) per tenant; unknown keys → custom_fields.  
3. **Dual-read:** API reads prefer Deal view; writes update both until validated.  
4. **Validate:** isolation suite + amount/stage integrity counts.  
5. **Contract:** stop writing opaque-only paths; fix plugins; deprecate legacy types.

No drop of `pipeline_items` until dual-read green and product sign-off.

---

## 4. Pipelines

### 4.1 Model

- **Multiple pipelines per tenant** (already true)  
- Stages: ordered `position`, `is_won` / `is_lost`, color, name  
- Optional **stage probability** default (new)  
- Pipeline fields: typed defs (already) → bind to Deal custom/standard fields  
- View prefs: kanban/table/list (already)

### 4.2 Rules

| Concern | Direction |
|---------|-----------|
| Stage ordering | Contiguous positions; reorder API |
| Validation | Stage must belong to deal’s pipeline; won/lost exclusivity |
| Automation hooks | Same-TX outbox: `crm.deal.stage_changed` → `automation.*` |
| Pipeline-specific rules | Automations scoped by `pipeline_id` (exists); expand to Deal events |
| Permissions | `crm.pipelines.*`, `crm.deals.*` separate |

### 4.3 Tenancy

Every pipeline/stage/field/deal query filters tenant. Stage IDs from other tenants rejected (already guarded on items).

---

## 5. Lead management

### 5.1 Fields

source, owner_id, status, score, name/email/phone, company hint, tags, custom fields, notes, attachments, duplicate keys, soft delete.

**Sources (catalog):** Website, Referral, Cold Outreach, WhatsApp, Social, Ads, Partners, Import, Custom.

### 5.2 Status (example)

`new | contacted | qualified | unqualified | converted | junk`

### 5.3 Conversion

See ADR-024 §5 and §1.5. Wizard + `POST /v1/leads/{id}/convert` with idempotency key.

### 5.4 Activities

Leads participate in Activity/Task graph before conversion; timeline merges post-convert.

---

## 6. Contacts / Companies

### 6.1 Improvements over as-built

| Gap today | Target |
|-----------|--------|
| Contact status conflates Customer | CustomerParty role |
| Limited company fields (no GSTIN/owner) | Optional GSTIN, owner, source, status — **display only for tax; finance owns tax engine** |
| Tags contact-only | Keep contact tags; optional company tags later |
| Unmounted `/api/contact-tags` | Mount or fold into contacts API |
| Dedup | Explicit rules below |

### 6.2 Tenant-specific uniqueness (explicit)

| Entity | Default uniqueness | Override |
|--------|-------------------|----------|
| Contact | `(tenant_id, lower(email))` where email not null & not deleted | Tenant setting: allow duplicate emails with warning |
| Company | `(tenant_id, lower(name))` soft-unique **or** `(tenant_id, gstin)` when gstin set | Configurable |
| Lead | Soft dedup on email/phone within tenant; block or warn | Tenant policy |

Ownership: `owner_id` on Contact/Lead; Company optional owner.  
Tags, custom fields, relationships, activities, tasks, communication identifiers (`emails[]`, `phones[]` future normalized table).

---

## 7. Products / Services

### 7.1 Catalog (future tables)

`products` (type: `product|service|package|plan`):

- sku/code, name, description  
- unit, list_price, currency  
- tax_category_code (string key for Finance)  
- active/inactive  
- tenant ownership  

### 7.2 Later integration

| Consumer | Use |
|----------|-----|
| Deal | line items / estimated value |
| Quote | priced lines + tax snapshot |
| Invoice | Finance copies snapshot — **not live-join forever** |

CRM does not compute GST; it stores **category codes** and display prices.

---

## 8. Quotes

### 8.1 Model

- quote_number (tenant sequence)  
- customer_party_id, deal_id optional  
- line items (product, qty, price, discount, tax)  
- discounts, tax totals, grand total  
- validity_until, status (`draft|sent|accepted|rejected|expired|converted`)  
- version, parent_quote_id  
- approval state  
- PDF via **ADR-016/022** DocumentRenderer + template DSL  
- convert → Finance invoice **handoff event** (not local invoice table)

### 8.2 Events

`crm.quote.created`, `crm.quote.sent`, `crm.quote.accepted`, `crm.quote.converted` → outbox.

---

## 9. Activity / Task model

### 9.1 Unify carefully

| Concept | Role |
|---------|------|
| **Activity** | Immutable-ish timeline fact (call, meeting, email, note, stage change, system) |
| **Task** | Actionable work item with due date / assignee / open-closed |

Do not collapse Task into Activity; link them (`task_id` on activity when completing).

### 9.2 Types

call · meeting · email · note · task · follow-up · deal_change · lead_change · system

### 9.3 Polymorphic association

```
subject_type: lead|contact|company|deal|customer|quote|…
subject_id: UUID
tenant_id: required on every row
```

**Rules:**

- Never store cross-tenant subject ids  
- Validate subject exists in same tenant on write  
- Migrate `record_id` → `subject_type=deal, subject_id=…` during Deal promotion  

CRM Tasks vs PM `project_tasks`: keep separate modules; unified inbox may **compose** both (as today `/api/tasks/unified`) without merging tables.

---

## 10. Customization integration

Compatible with ADR-013 / CUSTOMIZATION.md:

| Capability | CRM boundary |
|------------|--------------|
| Custom fields | Per entity (`lead`, `contact`, `company`, `deal`, `quote`, `product`) |
| Layouts / forms / views | Metadata; CRM UI consumes |
| Validation / custom statuses | Engine rules; CRM enforces on write |
| Pipeline fields | Merge with Deal field registry |
| Dashboards | Widgets over CRM metrics ports |

**3A does not build** the full customization engine — only defines CRM as a **first-class metadata consumer**.

---

## 11. Automation integration

### 11.1 Path (mandatory)

```
CRM domain TX
  → mutate
  → EventRecorder.append (same TX)
COMMIT
  → OutboxPublisher
  → JobQueue
  → BullMQ
  → workers / webhooks / automation.evaluate
```

**No** `bullmq.add` from CRM routes/services.

### 11.2 Event catalog (initial)

| Event | When |
|-------|------|
| `crm.lead.created` | Lead insert |
| `crm.lead.converted` | Successful convert |
| `crm.contact.created` / `updated` | Contact write |
| `crm.company.created` / `updated` | Company write |
| `crm.deal.created` | Deal insert |
| `crm.deal.stage_changed` | Stage transition |
| `crm.deal.won` / `crm.deal.lost` | Terminal status |
| `crm.quote.created` / `accepted` / `converted` | Quote lifecycle |

Map legacy webhook names (`deal.stage_changed`, `contact.created`) via aliases during transition (already partially present).

### 11.3 Idempotency

dedupe_key + job idempotencyKey + handler guards (Phase 2B patterns).

---

## 12. Finance compatibility

### 12.1 Handoff points

| CRM | Finance |
|-----|---------|
| CustomerParty | Accounting party / customer account (separate id possible with link table) |
| Quote accepted | Create invoice draft command/event |
| Deal won | Optional invoice/subscription trigger |
| Product tax_category | Tax rule lookup |
| Deal/Quote money | Snapshot into financial documents |

### 12.2 Separation

- CRM **CustomerParty** ≠ ledger entity  
- No AR/AP balances on Contact  
- No hard-delete of posted money docs (REQ-FIN-011) — CRM soft-deletes only CRM aggregates  

---

## 13. WhatsApp compatibility

```
CustomerParty ↔ Contact ← identifiers (phone E.164)
                      ↕
              Conversation (messaging module)
                      ↕
                   Message
```

CRM stores **identifiers and links**, not message payloads.  
Lead source `whatsapp` may deep-link to conversation id when present.

---

## 14. Mobile compatibility

- All CRM capabilities exposed on **versioned HTTP `/v1`**  
- Same RBAC/TenantContext as web  
- Responsive web mandatory: **390 / 768 / 1280+**  
- No native framework selection in 3A  
- Avoid desktop-only interactions for core flows (convert, stage move, create contact)

---

## 15. Permissions

### 15.1 Resource permissions (initial)

| Resource | Examples |
|----------|----------|
| contacts | view, create, edit, delete, export, import, assign |
| companies | view, create, edit, delete, export, import |
| leads | view, create, edit, delete, assign, convert, import, export |
| deals | view, create, edit, delete, move_stage, win_lose |
| pipelines | view, configure |
| products | view, manage |
| quotes | view, create, edit, send, accept, convert |
| activities | view, create |
| tasks | view, create, edit, complete |

### 15.2 Future (design only)

- Field-level permissions  
- Record ownership (`owner_id` / team)  
- Team visibility scopes  
- Manager hierarchy  

Implementation later; schema should keep `owner_id` and avoid hard-coding “everyone sees all” in domain services.

---

## 16. Search / filters

| Capability | Approach |
|------------|----------|
| Entity search | PostgreSQL FTS / `ILIKE` + indexes first |
| Global search | Fan-out tenant-scoped queries by entity |
| Advanced filters | Structured query DSL on list endpoints |
| Saved views | Metadata store (customization) |
| Sort / pagination | Cursor or limit/offset with stable keys |
| Bulk actions | JobQueue for large sets; same-TX for small |

**No Meilisearch in 3A.**

---

## 17. Reporting (tenant-scoped)

| Metric | Grain |
|--------|-------|
| Lead conversion rate | tenant / owner / source / time |
| Pipeline value | open deals × amount (optionally × probability) |
| Win rate | won / (won+lost) |
| Deal cycle time | created → won/lost |
| Sales activity volume | activities/tasks by owner |
| Rep performance | owner rollups |
| Source performance | lead/deal by source |
| Forecast | sum(amount × probability) by period |

All queries: **tenant filter first**. No platform cross-tenant CRM analytics in tenant app.

---

## 18. Migration (existing Vencore → canonical)

| Existing | Target |
|----------|--------|
| `contacts` | Contact (+ CustomerParty when status/engagement warrants) |
| `companies` | Company |
| `pipeline_items` | Deal (typed) + retain id where possible |
| `pipeline_stages` / `pipelines` / `pipeline_fields` | unchanged conceptually |
| `pipeline_activity` | Activity + deal stage telemetry |
| `tasks` (`record_id`) | Task with `subject_type=deal` |
| `activities` | Activity with polymorphic subject |
| `contact_tags` / links | Contact tags |
| Legacy `deals` / `pipeline_records` types | Ignore or read-only archaeology; do not revive |

**Process:** expand / backfill / dual-read / validate / contract.  
**Forbidden:** destructive cutover, silent id rewrite across tenants.

---

## 19. UI architecture (future)

```
CRM
  Dashboard
  Leads
  Contacts
  Companies
  Deals          ← primary opportunity UX (Kanban from Pipelines)
  Pipelines      ← configuration
  Products
  Quotes
  Activities
  Tasks
```

Customer 360: reachable from Companies/Contacts/Customers as **profile hub**.

Responsive: 390 / 768 / 1280+; ThinkAIQ branding intact (Phase 2B).  
**Do not implement UI in planning.**

---

## 20. API architecture (`/v1`)

| Resource | Notes |
|----------|--------|
| `/v1/leads` | CRUD + convert |
| `/v1/contacts` | Exists; extend |
| `/v1/companies` | Exists; extend |
| `/v1/customers` | CustomerParty + `/360` |
| `/v1/deals` | Canonical deals |
| `/v1/pipelines` | Config + stages |
| `/v1/products` | Catalog |
| `/v1/quotes` | Quotes + PDF actions |
| `/v1/activities` | Timeline |
| `/v1/tasks` | Exists; align subjects |

Every resource:

- TenantContext  
- RBAC  
- pagination + filtering  
- idempotency on create/convert where applicable  
- audit (security_audit / activity)  
- rate limits  
- **no** direct BullMQ  

---

## 21. Test strategy

| Layer | Coverage |
|-------|----------|
| Isolation | Cross-tenant IDOR on every new entity (extend live 40/40 style) |
| CRUD | Leads, deals, products, quotes |
| Conversion | Partial/full; idempotent; no dup contacts |
| Deal stages | Invalid stage; won/lost; outbox event present same TX |
| Uniqueness | Email/company rules |
| Relations | deal_contacts, line items, party links |
| Permissions | Denied paths return 403 |
| Automation | Outbox row in TX; publisher dispatch; no BullMQ in domain |
| Migration | Backfill counts; dual-read parity |
| Responsive smoke | 390/768/1280 on new CRM pages when built |

---

## 22. Documentation checklist

| Deliverable | Location |
|-------------|----------|
| Canonical entity model | This doc §1 + ADR-024 |
| Relationships | §1 |
| Migration strategy | §3.3, §18 |
| API strategy | §20 |
| Event strategy | §11 |
| Permissions | §15 |
| Customization integration | §10 |
| Finance boundary | §12 |
| WhatsApp boundary | §13 |
| Mobile / responsive | §14, §19 |
| UI structure | §19 |
| Testing | §21 |

---

## 23. Definition of done (planning)

- [x] One canonical Deal model defined (§3, ADR-024)  
- [x] Lead / Contact / Customer relationships clear (§1)  
- [x] Customer 360 boundary clear (§2)  
- [x] Pipeline architecture clear (§4)  
- [x] Products / services / quotes boundary clear (§7–8)  
- [x] Automation event integration clear (§11)  
- [x] Finance integration boundary clear (§12)  
- [x] WhatsApp integration boundary clear (§13)  
- [x] Migration strategy documented (§18)  
- [x] Responsive/mobile constraints documented (§14, §19)  

---

## Implementation sequencing (advisory — not started)

1. **3A.1** Deal typed model + dual-read from `pipeline_items`  
2. **3A.2** Leads + conversion + lineage  
3. **3A.3** CustomerParty + 360 read API  
4. **3A.4** Products + Quotes (document PDF via ADR-016/022)  
5. **3A.5** Activity polymorphic cleanup + permissions polish  

Each wave: TenantContext, outbox events, isolation tests, responsive smoke.

---

**STOP.** Do not write implementation code. Do not start CRM implementation automatically.
