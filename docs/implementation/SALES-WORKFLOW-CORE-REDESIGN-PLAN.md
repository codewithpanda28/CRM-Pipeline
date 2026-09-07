# SALES-WORKFLOW-CORE-REDESIGN-PLAN.md

| Field | Value |
|-------|-------|
| Status | **PLAN ONLY — NOT APPROVED FOR IMPLEMENTATION** |
| Date | 2026-09-07 |
| Product | ThinkAIQ CRM |
| Intent | Client-driven primary employee workflow redesign |
| Canonical PRD | [`docs/product/PRODUCT_REQUIREMENTS.md`](../product/PRODUCT_REQUIREMENTS.md) |
| Related | ADR-013, ADR-024, ADR-025, ADR-027 · CRM Block 1 · Ops R1/R2 · Pipeline Second View · DealCreate UX · Real DB verification · Sales Completion plan (frozen adjacent) |

**Hard rule:** No code, migrations, or schema changes until this plan is explicitly approved.

---

## 0. Executive summary

Client feedback reframes ThinkAIQ’s **daily employee experience** around four surfaces:

1. **My Tasks** (primary work queue)  
2. **Sales Pipeline**  
3. **Leads**  
4. **One unified Customer / Record page**

Everything else (Finance, Ops deep pages, Automation, Settings, Quotes/Invoices lists, Contacts/Companies raw CRUD) remains available under **Advanced / More** — not deleted.

This is **not** cosmetic nav reshuffling. It requires:

- A **unified record resolver** (Lead vs CustomerParty vs Deal context)  
- A **tenant-scoped section/field/option customization engine** (extend ADR-013; do not invent a second system)  
- **Editable pipeline stages** + **fixed DnD semantics**  
- **Explicit field ownership + sync contracts** (no uncontrolled dual-write)  
- **Task model extensions** for bounded (time-bound) vs unbounded (priority) work + meetings  
- **Topbar search** biased to client/record open  

Implementation is split into **exactly two rounds** (A = foundation, B = employee experience). Do not start B during A.

---

## 1. Core product intent

### Mental model (preserved)

```
Employee opens ThinkAIQ
  → My Tasks (next action obvious)
  → opens related Lead / Customer / Deal record
  → records communication / outcome
  → creates/updates next task or meeting
  → moves pipeline stage when sales progress changes
  → Deal Won
  → Finance / commercial completion continues
  → Operations ownership handoff (existing Ops; no Ops redesign)
```

### Product feel gate

The employee must **not** manually re-enter the same fact in Lead + Pipeline + Customer + Task. One canonical owner; projections/read-models elsewhere.

Disconnected CRUD modules violate **REQ-PLT-017**.

---

## 2. Primary navigation

### 2.1 Proposed primary (employee chrome)

| Order | Label | Canonical route (reuse) | Notes |
|------:|-------|-------------------------|-------|
| 1 | **My Tasks** | Prefer **`/ops/tasks`** (Ops R1 SoR UX) as primary; deprecate Sales nav prominence of `/crm/tasks` | Same `tasks` table; dual nav today is the confusion |
| 2 | **Sales Pipeline** | `/crm/pipeline` | Cards / Compact / Table / List preserved |
| 3 | **Leads** | `/crm/leads` | Block 1 import/export/bulk frozen |

Optional 4th primary (if product insists on always-visible customers): **Customers** → `/crm/customer-parties` — otherwise Customers sits in Advanced with deep-link from unified record.

### 2.2 Advanced / More (permissions & routes preserved)

| Area | Current routes (keep) | Placement |
|------|----------------------|-----------|
| Customers | `/crm/customer-parties` | Advanced → Sales |
| Contacts / Companies | `/crm/contacts`, `/crm/companies` | Advanced → Sales (identity CRUD; not primary “Client”) |
| Products / Quotes | `/crm/products`, `/crm/quotes` | Advanced → Sales |
| CRM Tasks (legacy list) | `/crm/tasks` | Redirect or “Advanced → All tasks” alias to My Tasks |
| Activity feed | `/crm/activity` | Advanced → Sales |
| Finance * | `/finance/*` | Advanced → Finance |
| Operations (Today, My Work, DPR, Employees, …) | `/ops/*` | Advanced → Operations (Today may remain secondary shortcut) |
| Automation | `/automation/*` | Advanced → Automation |
| Infra / Projects / Messaging / Analytics | existing | Advanced → respective groups |
| Settings | `/settings/*` | Advanced → Settings |
| Widgets Dashboard | `/dashboard` | Advanced → General (not employee primary) |

\* Invoices/Payments remain Finance SoR; reachable from unified record + Advanced.

### 2.3 Implementation approach (nav only in Round B UX; contract in Round A)

- Extend `Sidebar.tsx` / `useSidebarLayout` with a **preset layout profile**: `employee_sales_core` vs `full`.  
- Do **not** remove `NAV_ITEMS` entries or permissions — only default group/visibility.  
- Tenant Admin can restore full nav via layout prefs.  
- Module entitlement + RBAC unchanged.

---

## 3. Unified Customer / Record page

### 3.1 Identity rules (non-negotiable)

| Concept | Canonical SoR | Forbidden |
|---------|---------------|-----------|
| Commercial identity | **`customer_parties`** (ADR-025) | Second “Client” table / `/clients` entity |
| Person / org | **Contact / Company** (party_type + party_id) | Treating Contact alone as “customer” in primary UX |
| Sales opportunity | **`deals`** | Parallel opportunity model |
| Board card | **`pipeline_items`** = projection (`id === deals.id`) | Board-only truth |
| Business tasks | **`tasks`** (CRM/Ops) | Using `project_tasks` for sales work |
| Lead pre-customer | **`leads`** until conversion creates/links party | Fake CustomerParty for every lead by default |

### 3.2 Record modes

| Mode | When | Header identity | Primary SoR for “who” |
|------|------|-----------------|------------------------|
| **LeadRecord** | Lead not converted / no CustomerParty | Lead name + status + owner | `leads` |
| **PartyRecord** | CustomerParty exists (converted or deal-attached) | Party display_name + type | `customer_parties` |
| **DealContext** | Opened from pipeline with deal id | Party (or lead) + deal chip | Party for identity; Deal for sales |

Unconverted lead: show LeadRecord with CTA **Convert / Start deal** (existing convert + DealCreate paths). Do **not** invent a synthetic party.

Converted: PartyRecord is home; Lead remains linked via `lead_conversion_links` (history). Deals listed as sales opportunities under party.

### 3.3 Route & resolver (proposed)

| Item | Proposal |
|------|----------|
| Route | **`/crm/records/[ref]`** where `ref` is opaque or typed: `lead:{uuid}` \| `party:{uuid}` \| `deal:{uuid}` |
| Legacy deep links | Keep `/crm/leads`, `/crm/customer-parties/[id]`, `/crm/deals/[id]`, `/crm/pipeline/...` — redirect/open same shell |
| Resolver API | `GET /api/crm/records/resolve?lead_id=&party_id=&deal_id=` → `{ mode, lead?, party?, deal?, lineage, permissions }` |
| Open from | Leads row/card, Pipeline card, Topbar client search, Customers list |

### 3.4 Page chrome

**Header**

- Title (lead name or party.display_name)  
- Badges: mode, lead status / party status, deal stage (if deal context)  
- Owner avatar  
- Primary actions: Call/Log communication · Add task · Schedule meeting · Convert (lead) · Move stage (deal) · Create quote (party+deal)

**Sections (configurable — §4)**

Default system sections (tenant-renameable; not hard-deleted):

1. Overview / Identity  
2. Contact details  
3. Sales (deals + stage)  
4. Tasks & meetings  
5. Timeline / Communications  
6. Commercial (quotes/invoices/payments — read + deep link)  
7. Custom sections (tenant-defined)

**Editable fields** — only via customization + ownership table (§4, §7).

**Timeline** — §11.  
**Attachments / audio** — store via existing storage abstraction; timeline entries reference file ids (R2 pending does not block plan).

**Audit** — security_audit + domain outbox events; no silent edits.

---

## 4. Customizable client data model

### 4.1 Decision: extend ADR-013 — do not invent parallel CRM field engines

**Today**

| Exists | Gap |
|--------|-----|
| JSONB `custom_fields` on leads / deals / customer_parties | No tenant admin UI for sections/fields/options |
| Live `pipeline_fields` (+ options JSON) per pipeline | Pipeline-scoped only; not CustomerParty/Lead sections |
| PM `custom_fields` routes | **Wrong domain** — do not reuse for CRM |
| ADR-013 + `CUSTOMIZATION.md` | Spec; tables largely **not** in live schema |

**Plan:** Implement **CRM-scoped** ADR-013 hybrid for entities: `lead` | `customer_party` | `deal` (and optionally `contact`/`company` later).

Reuse patterns/types from `pipeline_fields` where possible; **do not** fork a third definition store for “client sections only.”

### 4.2 Proposed metadata schema (additive; Round A)

Tenant-scoped tables (names indicative):

| Table | Purpose |
|-------|---------|
| `crm_record_layouts` | Layout per entity_type + optional pipeline_id |
| `crm_record_sections` | Section: key, label, position, archived_at |
| `crm_field_definitions` | Field: key, section_id, type, required, default_json, validation_json, position, archived_at, searchable |
| `crm_field_options` | Option: field_id, value, label, position, archived_at |
| `crm_field_values` | Typed/JSONB values: (workspace_id, entity_type, entity_id, field_key) |

Optional denormalized cache: keep writing subset into parent `custom_fields` JSONB for hot filters (ADR-013).

**Versioning:** `definition_version` on layout; audit rows on definition CRUD; never rewrite historical values on rename (key stable; label editable).

### 4.3 Section / field / option operations

| Object | Create | Rename | Reorder | Archive | Hard delete |
|--------|--------|--------|---------|---------|-------------|
| Section | Yes | Yes | Yes | Yes | No (or only if empty + unused) |
| Field | Yes | Label yes; **key immutable** | Yes | Yes | No |
| Option | Yes | Yes | Yes | Yes | Prefer archive |

### 4.4 Field types (justified set)

text · long_text · number · currency · date · datetime · phone · email · url · single_select · multi_select · checkbox · user_ref (owner-like)

Defer: formula, file-as-field, relation-to-arbitrary-object (P3 custom objects).

### 4.5 Compatibility with existing records

| Rule | Behavior |
|------|----------|
| New field | Existing rows → value **null** unless explicit default policy on create |
| Default policy | Apply to **new** records only by default; optional one-shot backfill behind admin confirm |
| Archive field | Hidden on edit forms; **still readable** on historical timeline/export |
| Rename label | Keys unchanged; automation/API stable |
| Type change | Disallowed if values exist incompatible; require archive + new field |
| Tenant scope | All definitions `workspace_id` / tenant dual-read id |
| Permissions | `crm.fields.configure` (or existing settings configure) vs view/edit record |
| Validation | Server-side on write; client mirrors |
| Audit | Definition CRUD + value updates on sensitive fields |

### 4.6 Relation to pipeline_fields

- **Deal board secondary fields** may remain `pipeline_fields` initially.  
- Round A migration path: map or dual-register pipeline_fields into `crm_field_definitions` with `scope=pipeline` — **single admin UX** over time; no duplicate keys for the same fact.

---

## 5. Fully custom sales pipeline

### 5.1 What already exists

- `pipelines` / `pipeline_stages` (name, color, position, is_won, is_lost)  
- Stage CRUD + reorder APIs (`/api/pipelines/:id/stages`)  
- Four views + DealCreateModal  
- Move: `PATCH /api/items/:id/move` `{ stage_id, position }`  
- **Gap:** no stage **probability** column; DnD is **append-to-stage**, not mid-column reorder; client reports drag/drop “broken” relative to expected UX

### 5.2 Stage model extensions (proposed)

| Capability | Approach |
|------------|----------|
| Add / rename / reorder / color | Existing APIs + Settings UX polish |
| Probability (stage default) | Additive `pipeline_stages.default_probability` (nullable); deal.probability remains deal SoR — stage default applies on **enter stage** if deal has no override flag |
| Archive stage | Soft-archive; block if open deals remain (force move first) |
| Delete | Only empty archived stages |
| Won/Lost | Keep `is_won` / `is_lost`; at most one won and one lost recommended (validate) |

### 5.3 Views

Cards · Compact Board · Table · List — **must remain**. Shared `KanbanBoard` DnD core stays; no new DnD library unless HTML5 proven insufficient after fix.

### 5.4 Drag / drop semantics (exact)

| Concern | Spec |
|---------|------|
| Visual target | Highlight column + insertion index (gap line) within column |
| Within-stage reorder | Persist `pipeline_items.position` (and deal projection sync if needed) — **fix mid-column reorder** (current append-only is insufficient) |
| Between-stage move | Update `stage_id` + position; dual-write deal.stage_id via existing projection |
| Optimistic UI | Apply locally; on 4xx/5xx rollback card + toast |
| Server validation | Stage ∈ pipeline ∈ workspace; won/lost side effects via existing deal status hooks; concurrent position: last-write-wins with `updated_at` check optional (409 on stale) |
| Position persistence | Dense rank or fractional indexing — pick one; document migration of existing positions |
| Mobile | Long-press or explicit “Move to stage” sheet; no drag-only critical path |
| Concurrency | Two users moving same card: server accepts last valid move; loser refreshes |

Do **not** change Deal SoR or invent board-only deals.

---

## 6. Lead ↔ Pipeline data connection

### 6.1 Canonical flow

```
Lead (work / qualify)
  → Contact / Company (identity) [created or reused]
  → CustomerParty (commercial role) [ensure on convert and/or deal]
  → Deal (opportunity) + pipeline_items (board)
```

Lineage: **`lead_conversion_links`** (already). Preserve; never delete history.

### 6.2 Behaviors

| Situation | Rule |
|-----------|------|
| Lead already converted | Reuse party/contact/company; open PartyRecord; do not duplicate |
| “Move toward sales” | Prefer **create Deal** (DealCreateModal) linked to lead + party; lead status → `converted` when conversion completes (existing) |
| Stage movement | Owns **Deal.stage_id** only — does **not** invent parallel “lead stage” unless lead is still unconverted and using a lead-only board (out of scope: keep leads status machine) |
| Unconverted lead on pipeline | Not allowed as pipeline_item without Deal — pipeline = deals |

### 6.3 Field ownership (high level — full table §7)

| Fact | Owner |
|------|-------|
| Prospect name pre-convert | Lead |
| Commercial display name post-party | CustomerParty.display_name (from Contact/Company) |
| Opportunity amount / stage / probability / close | Deal |
| Board display | Projection from Deal (+ field_values) |
| Next action | Task (`related_*`) |

---

## 7. Field synchronization (critical)

### 7.1 Ownership table

| Field | Source of truth | Readable on | Editable on | Sync | Conflict |
|-------|-----------------|-------------|-------------|------|----------|
| Customer / party display name | Contact.name or Company.name → Party.display_name | PartyRecord, Deal card, Search | Identity section (contact/company) | Party.display_name refreshed on identity update | Identity wins |
| Lead name (pre-party) | `leads.name` | LeadRecord | LeadRecord | On convert: seed contact/company/party | After convert: lead name frozen or display-only |
| Phone | Contact / Lead (pre) | Record, Search | Identity / Lead | One-way to party search index | Contact/Lead owner wins for mode |
| Email | Contact / Lead (pre) | Record, Search | Identity / Lead | Same | Same |
| Company | Company / Lead.company_name | Record | Company / Lead | Convert creates/links company | No dual independent company name on Deal |
| Owner (sales) | Deal.owner_id / Lead.owner_id | Cards, lists | Deal / Lead editors | Task assignee ≠ deal owner unless user copies | Explicit assign APIs |
| Source | Lead.source; Deal.source nullable copy-on-create | Record | Lead primarily | Deal.source set at create; later edits do not overwrite lead | Lead historical source immutable after convert optional |
| Lead status | `leads.status` | Lead | Lead / convert actions | Stage move does not change lead status | — |
| Stage | `deals.stage_id` | Pipeline, DealContext | DnD / stage picker | Dual-write pipeline_items.stage_id | Deal SoR |
| Probability | `deals.probability` | Pipeline, Deal | Deal; optional stage-default on enter | Projection to field_values if displayed | Deal wins |
| Expected close | `deals.expected_close_at` | Deal, forecasts | Deal | — | Deal wins |
| Amount / currency | `deals.amount/currency` | Pipeline, Finance links | Deal | Projection | Deal wins |
| Custom fields | `crm_field_values` (or entity custom_fields) | Record sections | Section forms | No cross-entity dual-write unless mapped field_key + sync rule | Definition maps declare direction |

### 7.2 Projection policy

`pipeline_items.field_values` = **read model / board cache** only. Writers: deal projection helpers. UI must not PATCH field_values for canonical deal columns.

### 7.3 No uncontrolled dual-write

Any future “sync” requires: event name, direction, idempotent handler, conflict rule in this table (updated by ADR if needed).

---

## 8. Task system as core workflow

### 8.1 SoR

**`tasks` table** (CRM + Ops). **Not** `project_tasks`.

Unified inbox that mixes PM tasks must **not** be the primary My Tasks surface for sales employees (or filter `source=crm` only).

### 8.2 Two work kinds

| Kind | Semantics | Proposed fields (additive) |
|------|-----------|----------------------------|
| **Bounded / time-bound** | Meeting, call slot, visit | `scheduling_mode`: `unbounded` \| `time_bound`; `start_at`; `end_at` or `duration_minutes`; `timezone`; `meeting_mode`: `online` \| `offline` \| null; `location` (offline); reminders[] |
| **Unbounded / priority** | Prep script, research | `priority` (exists); optional `due_at` / `due_date` (exists); no required start |

Existing: `task_type`, `priority`, `due_at`, `due_date`, `related_*`, assignee, status — **reuse**.

### 8.3 My Tasks sort (stable)

1. Overdue (due_at/start_at in past, not done)  
2. Time-bound starting soon (e.g. next 2h)  
3. High priority unbounded  
4. Nearest deadline  
5. Lower priority / no date  

**No silent disappear:** cancelled/done go to filters (“Open” default); not deleted from history.

### 8.4 States & overdue

Reuse statuses: `todo` / `open` / `in_progress` / `done` / `cancelled`.  
Overdue = open-like status AND (due_at|end_at|start_at) < now.  
Reminders: job-runtime scheduled jobs (existing reminder columns / Ops patterns) — Round B.

---

## 9. Task creation from anywhere

| Entry point | Behavior |
|-------------|----------|
| My Tasks | Create modal; optional related record picker |
| Lead / Party / Deal record | Prefill `related_lead_id` / `related_customer_party_id` / `related_deal_id` |
| Pipeline stage change | Optional “Add follow-up” prompt (non-blocking) |
| Communication log | Optional “Create task from this” |
| Meeting create | Creates time_bound task |
| Assignee | Self or permitted employee (`tasks:assign` / Ops reassign) |
| Orphan tasks | Allowed (no related_*) |

API: extend existing `POST /api/tasks` + `/api/ops/tasks` — do not add a second task write API.

---

## 10. Meetings

Meeting = **time_bound task** with `task_type=meeting` (already in Ops taxonomy) + scheduling fields (§8.2).

| Mode | Extra |
|------|-------|
| Online | `meeting_mode=online`; optional link URL in body/custom |
| Offline | `meeting_mode=offline` + `location`; reminders: T-24h, T-2h, T-30m (tenant defaults) |

**Non-goals:** full Google/Outlook calendar product, free/busy sync (future-ready only per REQ-TSK-003).

Scheduled-by = `assigned_by_id` / created_by; scheduled-for = `assignee_id` (+ optional participants later).

---

## 11. Customer timeline / communication records

### 11.1 Reuse vs new

| Existing | Role |
|----------|------|
| `activities` | Polymorphic feed — **extend** as primary timeline store |
| `pipeline_activities` | Board-local; keep; also emit/mirror important events to party timeline |
| Domain outbox events | Source for system-generated timeline items |

**Prefer extending `activities`** with structured `type` + payload for:

task_* · meeting_* · communication_added · note_added · lead_status_changed · deal_stage_changed · quote_* · invoice_* · payment_* · record_field_changed (important)

If `activities` shape cannot support heading + long body + attachments cleanly, add **`crm_communications`** child rows linked to activity id — only if necessary (decide in Round A spike; default = activities + attachments join).

### 11.2 Communication entry (user-authored)

| Field | Required |
|-------|----------|
| heading | No (optional) |
| body / long description | Yes (min 1 char) |
| timestamp | Default now; editable only with permission |
| creator | Yes (actor) |
| attachments / audio | Optional |
| related task | Optional |

### 11.3 Ordering

Immutable chronological by `occurred_at` then id; no silent reorder. Edits create audit, not rewrite history for system events.

---

## 12. Topbar client search

### 12.1 Decision

| Surface | Behavior |
|---------|----------|
| **Topbar (Ctrl/⌘K)** | **Client-focused**: Lead, Contact, Company, CustomerParty (and Deal as secondary “open deal on party”) — shortcut visible in control |
| **Advanced / global search** | Keep `GET /api/crm/search` full entity set (Block 1 frozen) behind “Search everything” or Advanced |

Do **not** delete CRM Block 1 search architecture.

### 12.2 Result action

Click → **unified record resolver** (§3.3). Permission-aware + tenant-safe (existing search gates).

---

## 13. Pipeline / Leads UX

### Pipeline card must show

customer/party (or lead name if pre-party — rare) · deal name · amount · stage · owner · probability · **next task/action** (from `tasks` related_deal_id — already partially in Compact)

Click card → DealContext on unified record.

### Lead row/card must show

identity · owner · status/score · next task · deal/stage chip if linked  

Click → LeadRecord or PartyRecord if converted.

Shared record shell ensures “same client” feeling.

---

## 14. Operations handoff

**Won deal** (existing deal status / won stage):

- Record actor + timestamp (already on deal won fields / outbox)  
- Checklist of commercial completion (payment/invoice) — **read from Finance; no ledger redesign**  
- Optional task auto-create: “Ops onboarding” assigned to team (Automation or thin server hook — **no Ops module redesign**)  
- Ops Today / My Work already consume CRM tasks — handoff = task + party link  

Out of scope: new Ops entities, DPR redesign, commission.

---

## 15. Data / architecture safety

**Preserve:** CustomerParty · deals · pipeline_items projection · CRM tasks · Finance ledger · tenant isolation · RBAC · Automation approval (ADR-027) · Block 1 search/import.

**No duplicates** of customer identity, deal model, business task model, finance ledger.

**Events:** all structural changes emit outbox (REQ-PLT-017).

---

## 16. Implementation split

### ROUND A — Foundation (data / contracts / architecture)

1. CRM field/section/option metadata (ADR-013 CRM scope) + admin APIs  
2. Field ownership + sync contracts documented in code comments/ADR addendum; projection discipline  
3. Pipeline stage extensions (default_probability, archive rules) + **DnD mid-column fix**  
4. Unified record resolver API + thin shell (Lead/Party/Deal modes) — even if UX sparse  
5. Task additive columns for time-bound vs unbounded (migration) + API validation  
6. Topbar client-search mode (feature flag) without removing global search  

**Exit:** Customization safe on old records; stages editable; DnD correct; record opens from lead/pipeline/search to same resolver; tasks accept bounded fields.

### ROUND B — Employee experience

1. Nav preset: My Tasks · Pipeline · Leads primary  
2. My Tasks redesign (sort, filters, create)  
3. Task/meeting creation from record + stage-change prompt  
4. Reminders for meetings  
5. Timeline + communication composer on unified record  
6. Pipeline/Lead card UX alignment  
7. Ops handoff UX (lightweight)  
8. Mobile/responsive polish for core four surfaces  

**Do not start Round B during Round A.**

---

## 17. Testing matrix (must cover)

### Customization
Tenant-specific fields · section reorder · options · defaults · old records after new field · archived field readable · cross-tenant isolation

### Pipeline
Stage CRUD/reorder/archive · DnD within + between · optimistic rollback · multi-user · Cards/Compact/Table/List regression · DealCreate still works

### Unified record
Lead / Pipeline / Search open same resolver · converted vs unconverted lineage · no duplicate party

### Tasks
Bounded · unbounded · priority · due/start/end · online/offline · reminders · assign/reassign · related lead/party/deal/quote/invoice/none

### Timeline
Order · actor/time · communications · attachments when configured

### Security
RBAC · tenant isolation · forged field/party/employee IDs

### Regression
CRM Block 1 · Ops R1/R2 · Finance · Automation · PM (`project_tasks` untouched)

---

## 18. Acceptance principle

> Employee opens ThinkAIQ → **My Tasks** → next important action → related **client record** → records what happened → next task/meeting → moves opportunity → timeline + pipeline update **without re-typing**.

No-code customization is **tenant-specific** and **safe for historical data**.

---

## 19. Plan deliverables checklist (this document)

### Current architecture — **reuse**

- CustomerParty + 360 + conversion links  
- Deal ↔ pipeline_items dual-write + DealCreateModal  
- Four pipeline views + stage CRUD APIs  
- CRM `tasks` + related_* + Ops Today/My Work/Tasks  
- `activities` feed + outbox  
- Global CRM search + Topbar wiring  
- `pipeline_fields` patterns / ADR-013 direction  
- RBAC, modules, tenant dual-read  

### Current architecture — **conflicts with client intent**

- Dual task nav (`/crm/tasks` vs `/ops/tasks`)  
- Primary nav is module sprawl, not My Tasks → Pipeline → Leads  
- No single record shell (Lead / Customers / Deal pages feel separate)  
- JSONB custom fields without section/option admin  
- DnD append-only (no mid-column reorder)  
- Topbar search = full commercial graph, not client-first  
- Lead convert party optional vs deal ensure party (mental model friction)  
- Stage probability not on stages  
- Meetings calendar product missing (task_type only)  

### Exact schema changes **proposed** (not applied)

- `crm_record_layouts`, `crm_record_sections`, `crm_field_definitions`, `crm_field_options`, `crm_field_values`  
- `pipeline_stages.default_probability`, `archived_at` (if missing)  
- `tasks.scheduling_mode`, `start_at`, `end_at`, `duration_minutes`, `timezone`, `meeting_mode`, `location` (+ reminder rows if needed)  
- Possibly `activities` payload columns / `crm_communications` (spike-gated)  

### Exact API changes **proposed**

- `GET /api/crm/records/resolve`  
- CRUD for CRM field metadata  
- Stage archive + default_probability PATCH  
- `PATCH /api/items/:id/move` position semantics hardened  
- `POST /api/tasks` bounded field validation  
- Search mode query `scope=clients|all`  
- Timeline/communication write endpoints  

### Exact UI changes **proposed**

- Nav preset employee_sales_core  
- Unified record page shell  
- Settings → CRM fields/sections  
- Pipeline stage admin + DnD fix  
- My Tasks primary surface  
- Topbar client search + shortcut affordance  
- Timeline composer  

### Sync ownership — see §7 table  

### Task semantics — see §8–10  

### Unified record strategy — see §3  

### Round A / B — see §16  

### Acceptance gates

| Gate | Pass criteria |
|------|----------------|
| A1 | Custom field added; old party/lead still loads; new field null |
| A2 | Mid-column + cross-stage DnD persists; rollback on failure |
| A3 | Lead, pipeline card, client search open same resolver identity |
| A4 | Time-bound task validates start/end; unbounded without start |
| B1 | Default nav shows My Tasks / Pipeline / Leads first |
| B2 | Employee completes mental-model loop without duplicate data entry |
| B3 | Timeline shows communication + stage change + task events |
| Reg | Block 1, Ops, Finance, Automation, PM green |

### Risks

| Risk | Mitigation |
|------|------------|
| Scope explosion into full form-builder P2 | Cap Round A types/entities; defer custom objects |
| Breaking board projection | Keep deals SoR; only fix move/position |
| Dual task UX regression | Single primary My Tasks; alias CRM tasks |
| Sync bugs | Ownership table + no silent dual-write |
| R2/SMTP incomplete | Timeline attachments degrade gracefully |
| Sales Completion plan overlap | This redesign **supersedes** employee UX priority; Sales Completion forecast/score remains separate backlog |

### Explicit non-goals

- Implementing this plan without approval  
- Sales Completion forecast/lead-score (separate plan)  
- Finance ledger redesign · Automation engine rewrite · PM merge · Voice/WhatsApp/AI · full external calendar · commission · subscriptions/platform billing · deleting Advanced modules · second customer/deal/task identity  

---

## 20. Approval

| Role | Decision |
|------|----------|
| Product | Approve mental model + nav + unified record |
| Architecture | Approve ADR-013 CRM schema + ownership table |
| Engineering | Schedule Round A only after approval |

**Next step after approval:** Round A implementation plan with ticketized work packages (still no Round B).
