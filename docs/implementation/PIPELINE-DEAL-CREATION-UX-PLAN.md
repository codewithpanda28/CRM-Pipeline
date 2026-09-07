# Pipeline / Add Deal UX Gap — Plan Only

| Field | Value |
|-------|-------|
| Status | **DESIGN ONLY — no code** |
| Date | 2026-09-07 |
| Canonical PRD | [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md) |
| Sales detail | [SALES_SPECIFICATION.md](../modules/SALES_SPECIFICATION.md) §3 Deals |
| Sales audit §4 | [THINKAIQ-SALES-REQUIREMENTS-GAP-AUDIT.md](./THINKAIQ-SALES-REQUIREMENTS-GAP-AUDIT.md) §4 Sales Pipeline |
| Related | [SALES-COMPLETION-BLOCK-PLAN.md](./SALES-COMPLETION-BLOCK-PLAN.md) (filters/next-action; this plan owns **creation UX**) |

**Rule:** Plan only. No code, migrations, or schema changes in this phase.

---

## 1. Exact current Add Deal root cause

### What the user sees

1. Header button **`+ Add Deal`** (`pipeline/pages/[pipelineId]/page.tsx`) bumps `addTrigger`.
2. Cards / Compact / Table listen and open **`ItemForm`**.
3. Modal title is **`New item`**; primary CTA is **`Create item`**.
4. Body always shows **Stage**.
5. Then it renders **only** `pipeline.fields` (custom pipeline field definitions).
6. When `fields.length === 0`, the UI shows:  
   *“No fields configured for this pipeline. Add fields in Settings → Pipelines.”*
7. User can still submit with **stage only**.

### Why that breaks REQ-SAL-002 / sales usage

Canonical deal attributes (name, amount, currency, owner, party, probability, expected close, …) live on **`deals` typed columns**, not on optional pipeline custom fields. The create modal never presents those sales fields unless an admin coincidentally configured matching custom fields (`name`, `amount`, etc.).

So **“+ Add Deal” is a generic pipeline-item creator**, not a sales deal form — terminology and field set both wrong.

### Secondary UX gaps (same surface)

| Gap | Detail |
|-----|--------|
| **List view** | Header `+ Add Deal` still fires `addTrigger`, but **`PipelineList` does not accept/use `addTrigger`** — Add Deal is a no-op in List. Empty copy even says “switch to Board and add one.” |
| **Context delete copy** | Kanban context menu still says “Delete this **item**…” |
| **Stale api-client** | `packages/api-client/src/deals.ts` `createDeal` body shape does **not** match live `POST /api/deals` schema (missing `owner_id`, amount, party, etc.) — web pipeline path does not use it today |

---

## 2. Current canonical write path (do NOT invent a second deal system)

### Path used by Add Deal today

```
ItemForm
  → createItem(token, pipelineId, { stage_id, field_values })
  → POST /api/pipelines/:pipelineId/items   (permission: pipelines:create)
  → INSERT pipeline_items
  → upsertDealFromPipelineItem(trx, item)   // same UUID
  → onDealCreated + onPipelineItemCreated (outbox)
  → emitCrmEvent crm.deal@v1 created
```

**Same-id dual-write:** `deals.id === pipeline_items.id`. Projection maps `field_values` → typed deal columns via `mapFieldValuesToDeal` (`lib/deals/field-map.ts`).

With empty `field_values`, the deal lands as:

| Column | Default when ItemForm submits empty |
|--------|-------------------------------------|
| `name` | `"Untitled deal"` |
| `owner_id` | actor user (fallback) |
| `amount` | `0` |
| `currency` | tenant default (e.g. INR) |
| `probability` | `0` |
| `expected_close_at` | null |
| `customer_party_id` | only if company/contact ids present in field_values (usually null) |
| `primary_contact_id` / `company_id` | null |

So: **canonical `deals` is written** — but with unusable sales data. Board cards then show “Untitled deal” / zero value. **No second deal model is needed**; the bug is the **create UX + payload**, not missing SoR.

### Preferred canonical create path (already exists)

```
POST /api/deals   (permission: deals:create)
  → assertDealRelations (pipeline/stage/owner/contact/company/party)
  → INSERT deals (typed columns + customer_party_id)
  → upsertPipelineItemFromDeal (same id, field_values projection)
  → logItemCreated + onPipelineItemCreated + onDealCreated
  → emitCrmEvent crm.deal@v1 created
```

This is the **correct product path** for Add Deal: typed validation, CustomerParty attach, probability/amount/owner, then board projection. Move/DnD continues via existing item/deal move APIs (same id).

### Lead conversion path (already exists; UI underused)

`lib/leads/convert.ts` with `createDeal: true` inserts **`deals`** then `upsertPipelineItemFromDeal`, stores `custom_fields.lead_id`, sets source from lead. Current Leads UI converts with **`create_deal: false`** (“Confirm → Contact” only) — lineage-preserving deal-from-lead is API-ready but not productized in pipeline Add Deal.

---

## 3. Architecture locks (preserve)

- **CustomerParty** = canonical commercial identity  
- **`deals`** = canonical opportunity SoR (no second deal system)  
- **`pipeline_items`** = board/list projection / compatibility (same id)  
- **CRM `tasks`** = next-action SoR (`related_deal_id`)  
- Existing **`PATCH …/move`** / stage DnD / outbox / `crm.deal@v1` events  
- Existing RBAC keys (`deals:*`, `pipelines:*`) — align create to **`deals:create`** for the new form  
- Tenant isolation on every party/contact/company/owner/stage reference  
- Finance / Ops / Automation / CRM Block 1 / Compact+Cards+Table+List **modes unchanged**

---

## 4. Final Deal creation UX

### 4.1 Component & copy

| Today | Target |
|-------|--------|
| `ItemForm` · “New item” · “Create item” | **`DealCreateModal`** (replace usage from pipeline) · **“New deal”** · **“Create deal”** |
| Driven by custom `pipeline.fields` | Driven by **canonical deal fields** always; optional **extra** custom fields section below |

Entry points (same modal):

- Header **`+ Add Deal`** (all views that support create)  
- Column “+” on Cards / Compact  
- Table add trigger  
- List must wire `addTrigger` (fix no-op)  
- Empty-board CTA  

### 4.2 Form fields (canonical)

| Field | Required | Source / behavior |
|-------|----------|-------------------|
| **Deal name** | **Yes** | `deals.name` |
| **Customer** (CustomerParty) | **Yes** for sales MVP* | Search/select active, non-merged parties in workspace; show type (company/contact) + display name; link obvious |
| Contact (optional) | No | Tenant-scoped; prefer contacts linked to selected party when available |
| Company (optional) | No | Prefer derived from company-type party; do not invent second identity |
| **Optional lead** | No | Search open/qualified leads; on submit either (a) call convert-with-deal if not converted, or (b) create deal + write `custom_fields.lead_id` + conversion link per existing convert rules — **never drop lead history** |
| **Amount** | Yes (allow 0 only with explicit UX? Prefer **required ≥ 0**, warn if 0) | `deals.amount` |
| **Currency** | Yes | ISO-3; default workspace/deal default |
| **Stage** | Yes | Current pipeline stages; default = first non-won/lost or column context |
| **Probability** | Yes (default) | 0–100; default from stage if stage probability exists later, else `0` or sensible mid default (document choice: **default 0**, user editable) |
| **Owner / salesperson** | Yes | Default = current user; must be workspace member |
| **Expected close** | No (recommended) | date → `expected_close_at` |
| **Product / service** | No | Where model supports: store product id/label in `custom_fields` / field_values keys already read by `product_label` enrichment — **do not** invent `deal_products` table in this UX plan unless schema already exists (it does not today) |
| **Next action / follow-up** | No | Optional title + due → create CRM **task** with `related_deal_id` after deal create (same TX preference or best-effort follow-up call) |
| **Notes** | No | No dedicated `deals.notes` column today → store in `custom_fields.notes` **or** create activity/note via existing notes API if one exists for deals; prefer `custom_fields.notes` for v1 without schema |
| Pipeline | Implicit | Current pipeline id (read-only chip in modal) |
| Custom pipeline fields | No (unless required flags) | Render **below** canonical section; map into `custom_fields` / field_values remainder |

\*If product insists party optional for “quick capture,” still **prefer required**; empty party produces orphan deals that break quote→cash and 360. Design default: **Customer required**.

### 4.3 Customer selection UX

- Typeahead / combobox against `GET /api/customer-parties?search=` (reuse QuoteEditor pattern but upgrade from flat `<select>` to searchable control for scale).  
- Results: `display_name`, party_type, status=active only.  
- Selection sets `customer_party_id`; optionally hydrate contact/company ids via party identity (server `attachCustomerPartyToDeal` already resolves).  
- Secondary: “Create party from existing company/contact” deep-link to existing CustomerParty create — **do not** create parallel identity tables.  
- Tenant isolation: search API already workspace-scoped; client never trusts cross-tenant ids.

### 4.4 Lead-origin flow

| Entry | Behavior |
|-------|----------|
| Pipeline Add Deal + optional lead | Preserve `lead_id` on deal (`custom_fields.lead_id` and/or conversion link); prefer calling existing convert API when lead not yet converted so Contact/Company/Party lineage matches REQ-CRM-003 |
| From Leads board | Extend convert confirm to optional **“Also create deal”** (pipeline/stage/amount) → existing `createDeal: true` path |
| Already converted lead | Reuse party/contact/company; link deal; do not re-convert |

**Never** silently create deal without lineage when user selected a lead.

### 4.5 Empty pipeline configuration

**Do not** show “No fields configured” as the only content.

Always show the **canonical sales form** above. Custom fields section:

- If none: omit section or show muted “No custom fields for this pipeline” (non-blocking).  
- Custom fields never replace name/amount/party/owner/stage.

### 4.6 Validation (client + server)

| Rule | Enforce |
|------|---------|
| Name non-empty trim | Client + `POST /api/deals` |
| Stage ∈ current pipeline | Server `assertDealRelations` |
| Owner ∈ workspace | Server |
| Party active, non-merged, same workspace | Server |
| Contact/company tenant-safe | Server |
| Amount numeric, ≥ 0 | Client + `parseMoneyAmount` |
| Currency length 3 | Server |
| Probability integer 0–100 | Server |
| Expected close valid date or null | Client + server |
| Lead ∈ workspace if provided | Server |

Permission: submit with **`deals:create`**. Gate header button on that permission (and keep stage-required guard).

### 4.7 Desktop / mobile

- Modal: max-width ~560–640px; full-width on small screens; scroll body; sticky footer actions.  
- Two-column grid for amount+currency, stage+probability on desktop; single column on mobile.  
- Touch-friendly controls (min ~40px), matching existing CRM patterns (QuoteEditor / pipeline header).

### 4.8 Views consistency

Cards / Compact / Table / List **modes unchanged**. Only creation modal + List `addTrigger` wiring change. After create: invalidate `['items', pipelineId]` (+ deals queries if any).

---

## 5. Right-side pipeline whitespace (column sizing)

### Current behavior

Cards: column `minWidth: 260`, `maxWidth: 280`, `flexShrink: 0`.  
Compact: `minWidth: 200`, `maxWidth: 220`, `flexShrink: 0`.  
Board row: `display: flex; overflowX: auto`.

With **few stages**, columns stay narrow and **leave empty space on the right**. With **many stages**, horizontal scroll already works — good.

### Recommended responsive behavior

| Stage count vs viewport | Behavior |
|-------------------------|----------|
| Columns’ natural min-widths **fit** in board width | Each column **`flex: 1 1 0`** with **`min-width`** floor (Cards ≥ ~240–260px, Compact ≥ ~180–200px) and **`max-width`** soft cap (~360–400px Cards / ~280 Compact) so cards stay readable — **fill** available width without absurd stretch |
| Sum of min-widths **exceeds** board width | Columns keep **min-width**, **`flex-shrink: 0`**, board **`overflow-x: auto`** (current many-stage behavior) |

Implementation sketch (CSS/container queries or JS measure):

- `columnFlexMode = (stageCount * minCol) <= boardClientWidth`  
- Few: grow equally within max cap  
- Many: fixed min + scroll  

**Do not** stretch a single column to full viewport width (card content becomes unreadable). **Do not** change card internal layout as part of this fix.

Apply to both Cards and Compact column components; Table/List unaffected.

---

## 6. API / data design (no new deal system)

### Primary write

`POST /api/deals` with body aligned to existing `createSchema` (+ optional extensions):

```
pipeline_id, stage_id, name, owner_id,
amount?, currency?, probability?, expected_close_at?,
customer_party_id?, primary_contact_id?, company_id?,
source?, custom_fields? (notes, product_*, lead_id, …)
```

Then optional:

`POST /api/tasks` (or Ops task create) with `related_deal_id` for next action.

### Deprecate for sales UX (not delete API)

Pipeline `POST …/items` remains for compatibility/tests/automations, but **pipeline Add Deal UI must not use it** as the human sales path.

### Align client

Update web deals client (and/or `packages/api-client` deals create) to match live schema — out of sync today.

### Schema

**No migration required** for MVP form if notes/product/lead ride `custom_fields`. Stage-default probability column on `pipeline_stages` is **out of scope** unless already present (it is **not** on `PipelineStageTable` today) — probability stays deal-level.

---

## 7. Files likely to change (when implementing)

| Area | Files |
|------|-------|
| New modal | `apps/web/modules/crm/pipeline/components/shared/DealCreateModal.tsx` (or `…/deals/DealCreateModal.tsx`) |
| Replace ItemForm usage | `KanbanBoard.tsx`, `PipelineTable.tsx`; retire or keep `ItemForm` for non-sales only |
| Page / List wiring | `pages/[pipelineId]/page.tsx`, `PipelineList.tsx` (add `addTrigger`) |
| API client | `apps/web/modules/crm/deals/lib/api.ts`, `packages/api-client/src/deals.ts` |
| Party search UX | Reuse `customer-parties/lib/api.ts`; shared combobox if extracted |
| Lead convert UI | `LeadsBoard.tsx` / convert modal (optional “create deal”) |
| Column layout | `KanbanColumn.tsx`, `CompactKanbanColumn.tsx`, possibly `KanbanBoard.tsx` measure |
| Copy fixes | Context menu “Delete deal…” in `KanbanBoard.tsx` |
| Tests | New modal unit/RTL; API already covered — add web/e2e or API assert create via deals; List addTrigger; column layout unit if pure function |
| Docs | Implementation report after build (not this phase) |

**Unlikely / freeze:** Finance, Ops/DPR, Automation runtime, CRM Block 1 search/import, deal move routes, CustomerParty SoR.

---

## 8. Acceptance tests

### Functional

- [ ] `+ Add Deal` opens modal titled **New deal** (not “New item”) from Cards, Compact, Table, **and List**  
- [ ] With **zero** custom pipeline fields, form still shows name, customer, amount, currency, stage, probability, owner, expected close (optional), notes/next action — **no** blocking “No fields configured” empty state  
- [ ] Submit creates row in **`deals`** with typed columns; matching **`pipeline_items`** same id appears on board  
- [ ] CustomerParty required (MVP): cannot submit without valid party; party link visible after create  
- [ ] Amount/currency/probability/owner/stage validation rejects bad input  
- [ ] Optional lead preserves lineage (`lead_id` / conversion path) without history loss  
- [ ] Optional next action creates CRM task with `related_deal_id`  
- [ ] Stage DnD still works on created deal; outbox/`crm.deal@v1` still emitted  
- [ ] Permission: user without `deals:create` cannot create via modal  

### Layout

- [ ] Few stages: columns grow to use board width up to max readable width; **no** huge empty right gutter  
- [ ] Many stages: horizontal scroll; min readable column width preserved  
- [ ] Cards / Compact / Table / List view modes still available; Cards remains default preference behavior  

### Regression / isolation

- [ ] Tenant A cannot attach Tenant B party/owner/stage  
- [ ] Compact Board + Table enrichment still load  
- [ ] Lead import / global search (Block 1) untouched  
- [ ] Finance / Ops / Automation suites green  

### Explicit non-goals for this UX plan

- Sales forecast APIs (Sales Completion Block)  
- Commission engine, subscriptions, Voice/WhatsApp/AI  
- New `deal_products` SoR  
- Replacing pipeline custom fields system (additive only)  

---

## 9. End summary (requested)

### Exact current Add Deal root cause

**+ Add Deal opens `ItemForm`, a generic pipeline-item creator** that only collects **Stage + optional custom `pipeline.fields`**. With no custom fields configured, users only pick Stage and see “No fields configured,” then create **Untitled deal / $0** records. Terminology (“New item” / “Create item”) contradicts the sales object.

### Current canonical write path

`POST /api/pipelines/:id/items` → `pipeline_items` insert → **`upsertDealFromPipelineItem`** (same UUID) → outbox/events. Canonical **`deals` is already written**; data quality and UX are the failure. Preferred human path: **`POST /api/deals`** → `upsertPipelineItemFromDeal`.

### Final Deal creation UX

Replace with **DealCreateModal**: canonical sales fields always; searchable **CustomerParty**; optional lead with lineage; amount/currency/stage/probability/owner/expected close; optional product label via custom_fields; optional next-action task; notes in custom_fields; custom pipeline fields secondary; copy = Deal throughout; works from all four views (List wired).

### Right-side layout behavior

Few stages → columns flex-grow within min/max readable bounds to fill width. Many stages → min-width + horizontal scroll. No absurd single-column stretch.

### Files likely to change

DealCreateModal + KanbanBoard / PipelineTable / PipelineList / page wiring; deals API client; column width styles; optional Leads convert UX; tests/docs — not Finance/Ops/Automation.

### Acceptance tests

See §8 — deal-labeled modal, canonical fields without custom config, `deals`+projection write, party/validation/lineage, List entry, column fill vs scroll, four views preserved, tenant isolation.

---

*End of plan. No code or migrations were produced.*
