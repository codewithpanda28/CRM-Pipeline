# PHASE-3A-3-CUSTOMERPARTY-PLAN.md

**Phase:** 3A.3 — CustomerParty + Customer 360  
**Date:** 2026-09-05  
**Product gate:** **ACCEPTED** (P1–P6)  
**Audit:** [PHASE-3A-3-CUSTOMERPARTY-AUDIT.md](./PHASE-3A-3-CUSTOMERPARTY-AUDIT.md)  
**ADR:** [ADR-025](../adr/ADR-025-CUSTOMERPARTY-AND-CUSTOMER-360.md) (**Accepted**)  
**Checklist:** [PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md](./PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md)  
**Parent:** [ADR-024](../adr/ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md), [PHASE-3A-CRM-2-0-PLAN.md](./PHASE-3A-CRM-2-0-PLAN.md)

**Product decisions locked.** Implementation may start in a dedicated coding wave per the checklist. This documentation task does **not** change application code.

---

## 1. Canonical identity

### What CustomerParty is

**CustomerParty** = tenant-scoped **commercial party role** used as:

- Customer 360 aggregation root  
- Stable link target for Deal / Quotes / Finance / WhatsApp / Support / Voice  
- Explicit “this Contact or Company is commercially engaged”

It is **not**:

- A duplicate person row  
- A duplicate company row  
- A Lead  
- A Deal  
- Platform Stripe customer  
- PM portal “client”

### Distinctions (normative)

| Term | Meaning | Must not be |
|------|---------|-------------|
| **Person** | Human being in the real world | A DB table name |
| **Contact** | CRM person identity (email/phone/name) | Automatically a CustomerParty |
| **Company** | CRM organization / account identity | Automatically a CustomerParty |
| **Lead** | Pre-qualification acquisition record | Permanent customer substitute |
| **Deal** | Sales opportunity | Customer identity |
| **CustomerParty** | Commercial role pointing at exactly one Contact **or** Company | Second copy of that Contact/Company |

**Cardinality:** one CustomerParty → exactly one of (`party_type=contact`, `party_id`) **or** (`party_type=company`, `party_id`). Unique `(workspace_id, party_type, party_id)` among non-deleted rows.

---

## 2. Relationship model

### Proposed core tables (expand — not implemented yet)

#### `customer_parties`

| Column | Notes |
|--------|-------|
| id | UUID PK |
| workspace_id | Tenant scope |
| party_type | `contact` \| `company` |
| party_id | UUID of contact or company (no polymorphic DB FK; validated in app + optional CHECK via triggers later) |
| display_name | Cached label for lists/360 |
| status | `active` \| `inactive` \| `merged` |
| primary_owner_id | Optional sales owner |
| merged_into_id | Self-FK when merged away |
| custom_fields | JSONB |
| created_at / updated_at / deleted_at | Soft delete |

Unique: `(workspace_id, party_type, party_id) WHERE deleted_at IS NULL AND status <> 'merged'`.

#### Optional (same wave or immediate follow-on)

| Table | Purpose | 3A.3 MVP |
|-------|---------|----------|
| `customer_party_merge_events` | Auditable merge log (from_id, into_id, actor, reasons, snapshot) | **Yes** (P5) |
| `customer_party_contacts` | Extra Contacts related to a **company** party | **No** (P6) — use `contacts.company_id` |

**Default 3A.3 MVP:** `customer_parties` + `customer_party_merge_events` + Deal FK activation + 360 read + link/merge APIs. M:N company contacts deferred.

### How relationships work

| Scenario | Model |
|----------|-------|
| B2C customer | Party `party_type=contact` → Contact |
| B2B account customer | Party `party_type=company` → Company; Contacts via `company_id` (+ optional link table) |
| Company with many people | Contacts keep `company_id`; 360 lists them under company party |
| Deal context | Deal keeps `primary_contact_id` + `company_id`; **adds** nullable `customer_party_id` |
| Lead convert | Still creates/reuses Contact±Company±Deal; **optionally** creates/links CustomerParty |

```
CustomerParty ──► Contact     (B2C)
       │
       └──► Company ──◄── Contacts (B2B via company_id)
              ▲
Deal.customer_party_id ──┘
Deal.primary_contact_id / company_id remain for operational CRM
```

---

## 3. Legacy compatibility mapping

| Live artifact | Maps to CustomerParty | Action |
|---------------|----------------------|--------|
| Contact | Possible B2C party | Create party when marked customer / convert intent / deal won policy |
| Company | Possible B2B party | Same |
| `Contact.status=customer` | Legacy hint | Backfill candidate for contact-type parties |
| Deal with contact and/or company | Attach party | Prefer company party if `company_id` set; else contact party |
| Lead + conversion links | Lineage source | Extend links with optional `customer_party` entity_type |
| Docs “Client” | Alias | API naming: **CustomerParty**; deprecate Client entity |

**Do not delete** contacts, companies, leads, deals, or pipeline_items.

---

## 4. Customer 360

### Purpose

One commercial OS view rooted at CustomerParty: identity + CRM history + entitled module extensions.

### Aggregation slices

| Slice | Source | Classification |
|-------|--------|----------------|
| Identity (party + contact/company) | CRM | **CORE** |
| Related contacts | CRM (`company_id` / link table) | **CORE** |
| Company profile | CRM | **CORE** |
| Leads (converted lineage + open matching email) | CRM | **CORE** |
| Deals (`customer_party_id` + fallback contact/company) | CRM | **CORE** |
| Activities / tasks (via contact_ids + deal ids) | CRM | **CORE** (best-effort until 3A.5 polymorphic cleanup) |
| Projects linked to contact/company/deal | Projects | **CORE CRM-adjacent** |
| Emails by contact/deal | Mail (if present) | **CORE if mail enabled**; else empty |
| Quotes / Products | Future | **EXTENSION** — not 3A.3 impl |
| Invoices / Payments | Finance | **EXTENSION** |
| WhatsApp conversations | WhatsApp | **EXTENSION** |
| Support tickets | Support | **EXTENSION** |
| Voice summaries | Voice | **EXTENSION** |
| Automation history | Automation | **EXTENSION** (query by aggregate id) |

360 API returns **slots** with `available: false` for disabled modules — no Finance/WhatsApp code in 3A.3.

### API sketch (contract only)

```
GET /api/customer-parties/:id/360?include=identity,contacts,deals,leads,activities,tasks,projects
```

Response shape: `{ party, identity, contacts[], deals[], leads[], activities[], tasks[], projects[], extensions: { finance?, whatsapp?, … } }`.

---

## 5. Deal integration (frozen-safe) — **P2/P3 locked**

**Prefer additive nullable activation:**

1. Create `customer_parties`  
2. Add FK `deals.customer_party_id → customer_parties(id) ON DELETE SET NULL` (column already exists)  
3. Flip `assertDealRelations` to **validate** party belongs to tenant (instead of always reject)  
4. Backfill Deal → party from company_id / primary_contact_id  
5. Dual-read: 360 uses party; Deal UI still shows contact/company  

**Do not** remove `primary_contact_id` / `company_id` in 3A.3.  
**Do not** redesign Deal dual-write / pipeline_items.

**Accepted auto-create policy (P2/P3):**

| Trigger | Behavior |
|---------|----------|
| Deal **create** | If `company_id` → ensure/reuse **company** party; else if `primary_contact_id` → ensure/reuse **contact** party; set `customer_party_id` |
| Deal **won** | If `customer_party_id` still null → same ensure/reuse rules |
| Duplicate parties | Forbidden — ensure/reuse only |

---

## 6. Lead integration (preserve 3A.2) — **P2 locked**

Completed convert outcomes A–D remain valid.

**Additive step E (explicit only):**

```
convert body: { …, create_customer_party?: boolean, customer_party_id?: uuid }
```

Rules:

- Default **`create_customer_party=false`** — backward compatible with 3A.2  
- If true: resolve/reuse party for company (prefer) or contact; write `lead_conversion_links` row `entity_type=customer_party`  
- Never break idempotent re-convert  
- Never require party to create Contact/Company/Deal  

Extend CHECK on `lead_conversion_links.entity_type` to include `customer_party`.

---

## 7. Duplicates / merging — **P5 locked**

### Matching (tenant-scoped only)

| Signal | Strength | Action |
|--------|----------|--------|
| Contact email exact | Hard | Reuse Contact → reuse/create contact-party |
| Phone digits | Soft | Candidate list |
| Company website host | Soft | Candidate |
| Company / party display name | Soft | Candidate |
| Existing unique `(party_type, party_id)` | Hard | Prevent duplicate parties |

**No automatic silent merge.**

### Merge / resolve workflow (MVP — admin only)

1. `POST /api/customer-parties/:id/merge` with `{ into_id, reason }` (source = `:id`, target = `into_id`)  
2. Same TX: re-point supported relationships (e.g. Deal.customer_party_id); set `from.status=merged`, `merged_into_id`  
3. Append `customer_party_merge_events` + outbox `crm.customer_party.merged`  
4. 360 of merged-away id redirects to survivor  

Permissions: `customers:merge` (**admin only**).

---

## 8. Tenancy

- Every party row: `workspace_id` required  
- All lookups: workspace + soft-delete  
- Matching never crosses tenants  
- Live tests: A cannot GET/link/merge B’s party; cannot attach B’s contact/company to A’s party  

---

## 9. Events (plan only — do not implement)

| Event | Job (proposed) | Notes |
|-------|----------------|-------|
| `crm.customer_party.created` | `crm.customer_party.record` | Ack-only unless automation subscribed |
| `crm.customer_party.updated` | same | |
| `crm.customer_party.linked` | same | Deal/Lead/Contact link |
| `crm.customer_party.merged` | same | |

Same-TX EventRecorder; **no BullMQ in domain**. Do not double-fire Deal pipeline automation when linking.

---

## 10. API contract (design) — **P1 locked**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/customer-parties` | List + filters (status, party_type, q) |
| GET | `/api/customer-parties/:id` | Detail + identity |
| POST | `/api/customer-parties` | Create from contact_id **or** company_id |
| PATCH | `/api/customer-parties/:id` | Update display/status/owner |
| DELETE | `/api/customer-parties/:id` | Soft delete |
| GET | `/api/customer-parties/:id/360` | Aggregation |
| POST | `/api/customer-parties/:id/link` | Link deal / ensure relations |
| POST | `/api/customer-parties/:id/merge` | Merge into another |

Public: `/v1/customer-parties` (+ `/360`).

**Canonical naming:** `customer-parties` only. Optional `/api/customers` alias **only** if it maps 1:1 to the same handlers (no second concept). **No** `/clients` entity.

---

## 11. RBAC (plan)

| Permission | Default |
|------------|---------|
| `customers:view` | admin, member |
| `customers:create` | admin, member |
| `customers:edit` | admin, member |
| `customers:delete` | admin |
| `customers:merge` | admin |

Submodule: `crm:customers` → `/crm/customers` (360 list).  
Do not grant Finance permissions.

Deprecate future use of docs `crm.clients.*` in favor of `customers:*`.

---

## 12. Data migration strategy

```
expand → backfill → dual-read → validate → contract
```

### Expand

1. `customer_parties` (+ optional merge_events)  
2. FK on existing `deals.customer_party_id`  
3. Extend `lead_conversion_links.entity_type`  
4. Enable module + permissions  

### Deterministic backfill candidates — **P4 locked**

Idempotent ensure/reuse only. Document ambiguous cases for manual resolution — **no silent merge**.

| # | Source | Rule |
|---|--------|------|
| 1 | Contact `status=customer` | Ensure contact-type party |
| 2 | Company linked via customer/deal relationships | Ensure company-type party |
| 3 | Deal with `company_id` | Ensure company party; set Deal.customer_party_id |
| 4 | Deal with `primary_contact_id` only | Ensure contact party; set Deal FK |
| 5 | Converted Lead with deterministic Contact/Company | Ensure party for that Contact/Company; optional conversion link |

### Requires manual resolution (not auto-merged)

| Case | Why |
|------|-----|
| Contact `status=customer` **and** separate company party for same commercial account | May keep both (person + account) or merge later via admin UI |
| Two Contacts same company both “customer” | Multiple contact parties OK; company party separate |
| Deal with contact from company A but company_id B | Integrity repair before attach |
| Soft-deleted / ambiguous email duplicates | Human merge UI (P5) |

### Remains compatibility-only

- `Contact.status=customer` until UI fully switched  
- ContactDrawer as person view (not replaced day one)  
- Deal contact/company columns forever in 3A.3  

### Rollback

Drop party tables only after nulling Deal FKs; Contact/Company/Deal/Lead data remain.

---

## 13. Extensibility (non-goals for impl)

External modules reference `customer_party_id` later:

| Module | Use |
|--------|-----|
| Finance | Invoice/payment party |
| WhatsApp | Conversation ↔ party via contact identifiers |
| Support | Ticket party |
| Voice | Call summary party |
| Automation | Triggers on party events |

3A.3 only ships **stable id + 360 extension slots**.

---

## 14. Mobile / responsive (360 UX)

| Width | Behavior |
|-------|----------|
| **390** | Single column: identity header → section accordion (Deals, Contacts, Activity). No horizontal tables; cards. Primary CTA sticky. |
| **768** | Two-pane optional: identity + one list; sections still stack |
| **1280** | Identity rail + main timeline/lists; no desktop-only hover-only actions |

Rules: no horizontal overflow; convert/link/merge confirmations work with tap targets ≥40px; no drag-only workflows.

---

## 15. Test strategy (for future impl)

| Suite | Cases |
|-------|-------|
| Unit | Party ensure/reuse; merge status machine; matchers |
| Convert | Lead convert with/without party flag; idempotent |
| Deal | Create with party; reject cross-tenant party_id |
| Live isolation | GET/list/create/link/merge/360 cross-tenant deny |
| Lineage | lead_conversion_links includes customer_party |
| Regression | Frozen Deal dual-write; Lead convert without party still works |
| tsc | api + worker |

---

## 16. Recommended implementation sequence — **APPROVED**

1. Migration expand: `customer_parties` + `customer_party_merge_events`  
2. FK + integrity flip on Deal `customer_party_id`  
3. Ensure/reuse service + RBAC + session/v1 CRUD (`/api/customer-parties`, `/v1/customer-parties`)  
4. Deal create + won hooks: ensure/reuse party (P2/P3) — additive only  
5. Deterministic backfill job (dry-run counts) — P4  
6. Lead convert optional `create_customer_party` + link entity_type — P2  
7. `GET …/360` CORE slices only  
8. Minimal `/crm/customer-parties` list + 360 page (responsive)  
9. Admin merge endpoint — P5  
10. Live isolation + freeze gate report  
11. **STOP** — no Finance/WhatsApp/Products; no `customer_party_contacts` (P6)

---

## Product decisions P1–P6 — **RESOLVED** (2026-09-05)

| # | Decision | Resolution |
|---|----------|------------|
| P1 | API path name | **Canonical** `/api/customer-parties` + `/v1/customer-parties`. Optional `/api/customers` alias only if same handlers. **No** `/clients` entity. |
| P2 | Auto-create party | Deal **create** ensure/reuse when company/contact present; Deal **won** ensure if still null; Lead convert **explicit flag only**; never duplicate. |
| P3 | B2B root | `company_id` → company party; else contact party. Keep Deal contact/company FKs. |
| P4 | Backfill | Deterministic candidates 1–5 (status=customer, company via deals, deal company, deal contact-only, converted lead). Idempotent ensure/reuse; ambiguous → manual. |
| P5 | Merge MVP | **Yes** — admin-only, explicit source+target+reason, audited, one TX, 360 redirect. |
| P6 | M:N contacts | **Defer** — `contacts.company_id` only in first wave. |

See [ADR-025](../adr/ADR-025-CUSTOMERPARTY-AND-CUSTOMER-360.md) (Accepted) and [PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md](./PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md).

---

## STOP

```
PRODUCT GATE = ACCEPTED
READY FOR IMPLEMENTATION = YES
NO CODE IN THIS DOCUMENTATION TASK
NO PRODUCTS / QUOTES / FINANCE / WHATSAPP / VOICE / ACTIVITY REDESIGN
```
