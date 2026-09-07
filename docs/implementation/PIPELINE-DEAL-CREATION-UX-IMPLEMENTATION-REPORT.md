# Pipeline / Add Deal UX — Implementation Report

| Field | Value |
|-------|-------|
| Status | **COMPLETE** |
| Date | 2026-09-07 |
| Plan | [PIPELINE-DEAL-CREATION-UX-PLAN.md](./PIPELINE-DEAL-CREATION-UX-PLAN.md) |
| Scope | Pipeline Add Deal UX only — no Sales Completion / forecast / quote→cash |

---

## 1. Root cause fixed

**Before:** `+ Add Deal` opened `ItemForm` (“New item” / “Create item”), which only collected **Stage + optional custom `pipeline.fields`**. With zero custom fields, users saw “No fields configured” and could create **Untitled deal / $0** via `POST /api/pipelines/:id/items`.

**After:** `+ Add Deal` opens **`DealCreateModal`** (“New deal” / “Create deal”) with always-visible **canonical deal fields**, writing through **`POST /api/deals`**.

---

## 2. Canonical write path

```
DealCreateModal
  → POST /api/deals          (permission: deals:create)
  → INSERT deals (typed columns + customer_party_id)
  → upsertPipelineItemFromDeal (same UUID)
  → logItemCreated + onPipelineItemCreated + onDealCreated
  → emitCrmEvent crm.deal@v1 created

Optional next action (best-effort):
  → POST /api/tasks { related_deal_id, title, due_date? }
```

Unconverted lead + deal: reuses **`POST /api/leads/:id/convert`** with `create_deal: true` (existing convert SoR), then optional PATCH for probability / close / custom fields.

**Not changed:** `POST /api/pipelines/:id/items` remains for compatibility; human sales UI no longer uses it.

**Same-id semantics preserved:** `deals.id === pipeline_items.id`.

---

## 3. DealCreateModal behavior

| Aspect | Behavior |
|--------|----------|
| Title / CTA | New deal / Create deal |
| Always shown | Name, Customer (CustomerParty), Amount, Currency, Stage, Probability, Salesperson |
| Optional | Contact, Company, Lead, Expected close, Product/service label, Next action + due, Notes |
| Pipeline | Read-only chip (current pipeline name) |
| Custom fields | Secondary section below canonical fields (omitted when empty — no “No fields configured” blocker) |
| Customer | Searchable list via `GET /api/customer-parties?status=active&q=` |
| Permission | Requires `deals:create`; button/modal gated; server still enforces |
| Server | Rejects create without party/company/contact (`CUSTOMER_REQUIRED`); validates lead_id tenant; existing relation asserts |

Notes → `custom_fields.notes`. Product label → `custom_fields.product_name` (board enrichment keys).

---

## 4. List Add Deal fix

- `PipelineList` now accepts **`addTrigger`** and opens `DealCreateModal`.
- Pipeline page passes `addTrigger` into List (same as Cards / Compact / Table).
- Empty copy updated: no longer tells users to “switch to Board”.

---

## 5. Column sizing solution

`resolveColumnLayout(stageCount, boardWidth, { minWidth, maxWidth, gap })`:

- **Few stages (fit):** columns grow equally up to max (Cards 360 / Compact 280).
- **Many stages:** keep min width (Cards 260 / Compact 200) + horizontal scroll.

Applied via `ResizeObserver` on the board row in `KanbanBoard` → `columnWidth` on Cards + Compact columns. Table/List unchanged.

---

## 6. Files changed

### Web
- `modules/crm/pipeline/components/shared/DealCreateModal.tsx` *(new)*
- `modules/crm/pipeline/lib/deal-create-form.ts` + `.test.ts` *(new)*
- `modules/crm/pipeline/lib/column-layout.ts` + `.test.ts` *(new)*
- `modules/crm/pipeline/lib/list-add-deal-wiring.test.ts` *(new)*
- `modules/crm/pipeline/components/kanban/KanbanBoard.tsx`
- `modules/crm/pipeline/components/kanban/KanbanColumn.tsx`
- `modules/crm/pipeline/components/kanban/CompactKanbanColumn.tsx`
- `modules/crm/pipeline/components/table/PipelineTable.tsx`
- `modules/crm/pipeline/components/PipelineList.tsx`
- `modules/crm/pipeline/pages/[pipelineId]/page.tsx`
- `modules/crm/deals/lib/api.ts` — `createDeal` aligned to live schema
- `modules/crm/leads/components/LeadsBoard.tsx` — optional “Also create deal”

### API / shared
- `apps/api/src/routes/deals.ts` — `CUSTOMER_REQUIRED`, optional `lead_id`
- `apps/api/src/routes/deals.test.ts` — customer required test
- `apps/api/src/routes/tasks.ts` — `related_deal_id` / `deal_id` on create + tenant check
- `packages/api-client/src/deals.ts` — create body aligned
- `packages/api-client/src/tasks.ts` — `related_deal_id`

`ItemForm.tsx` left in tree (unused by pipeline Add Deal) for any non-sales callers; pipeline human path no longer mounts it.

---

## 7. Tests

| Suite | Result |
|-------|--------|
| `apps/web` `tsc --noEmit` | Pass |
| `column-layout.test.ts` | Pass |
| `deal-create-form.test.ts` | Pass |
| `list-add-deal-wiring.test.ts` | Pass |
| `deals.test.ts` (money, mapping, foreign pipeline, CUSTOMER_REQUIRED) | Pass |
| Full `lists deals` route mock | Flaky timeout observed once (pre-existing mock hang); not caused by create schema |

---

## 8. Tenant isolation

- Party / owner / stage / pipeline / contact / company: existing `assertDealRelations`
- `lead_id`: workspace lookup before insert
- Next-action task: `related_deal_id` must belong to workspace; contact similarly checked
- Customer list filtered to active, non-deleted, workspace-scoped

---

## 9. Permissions

| Surface | Permission |
|---------|------------|
| Header + Add Deal / column + | `deals:create` |
| Modal submit | Client gate + server `deals:create` |
| Next action | `tasks:create` (best-effort; deal still succeeds if task fails) |
| Lead convert + deal | `leads:convert` + `deals:create` for also-create path |

---

## 10. Regressions / preserved

- Cards default + Compact / Table / List modes retained
- DnD / `PATCH /api/items/:id/move` untouched
- Outbox + `crm.deal@v1` on create preserved
- CustomerParty canonical identity preserved
- Finance / Ops / Automation / CRM Block 1 not modified for this block (aside from shared deals/tasks route additives)

---

## 11. Known limitations

- Party picker is search + `<select>` (not a full combobox component library).
- Next action is best-effort after deal commit (not same TX as deal).
- Unconverted lead path uses convert API then PATCH for fields convert does not set (probability / expected close / notes).
- Stage-default probability column still absent on `pipeline_stages` (deal probability defaults to 0).
- `ItemForm` file not deleted (dead for pipeline Add Deal).
- No new live isolation suite specifically for DealCreateModal UI (API relation checks reused).

---

## 12. Explicitly not started

Sales Forecasting · Sales Completion Round A/B · Quote→cash · subscriptions · Automation R2B · Voice / WhatsApp / AI

---

*End of implementation report.*
