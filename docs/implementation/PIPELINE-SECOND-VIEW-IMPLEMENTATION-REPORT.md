# Pipeline Second View — Implementation Report

| Field | Value |
|-------|-------|
| Status | **COMPLETE** |
| Date | 2026-09-06 |
| Plan | [PIPELINE-SECOND-VIEW-PLAN.md](./PIPELINE-SECOND-VIEW-PLAN.md) |
| Scope | Compact Board additive pipeline view only |

**No other roadmap block was started** (no Quote→Cash Block 2, subscriptions, Automation R2B, Voice/WhatsApp).

---

## 1. Files changed

### API
- `apps/api/src/lib/pipelines/item-display.ts` — additive display fields: `probability`, `next_action` (batched CRM tasks), `product_label` (field_values only)
- `apps/api/src/lib/pipelines/item-display.test.ts` — probability/product label unit coverage

### Web
- `modules/crm/pipeline/components/ViewSwitcher.tsx` — Cards / Compact Board / Table / List
- `modules/crm/pipeline/lib/view-preference.ts` (+ `.test.ts`) — localStorage preference helpers
- `modules/crm/pipeline/pages/[pipelineId]/page.tsx` — compact branch + preference hydrate/write
- `modules/crm/pipeline/components/PipelineCompactBoard.tsx` — thin wrapper
- `modules/crm/pipeline/components/kanban/KanbanBoard.tsx` — optional `density` (`comfortable` default = Cards)
- `modules/crm/pipeline/components/kanban/CompactKanbanColumn.tsx` — new
- `modules/crm/pipeline/components/kanban/CompactKanbanCard.tsx` — new
- `modules/crm/pipeline/lib/items.ts` — display type extensions
- `modules/crm/pipeline/lib/pipelines.ts` — `view` type allows `compact`
- `apps/web/vitest.config.ts` — include pipeline unit tests

### Docs
- Plan status → IMPLEMENTED
- This report

**Unchanged visually for Cards path:** `KanbanColumn.tsx`, `KanbanCard.tsx` (still used when `density !== 'compact'`).

---

## 2. Components added / modified

| Component | Change |
|-----------|--------|
| `ViewSwitcher` | Labels: Cards (id `kanban`), Compact Board, Table, List |
| `PipelineCompactBoard` | New — `KanbanBoard` with `density="compact"` |
| `KanbanBoard` | Shared DnD/move/context menu; branches column/card by density |
| `CompactKanbanColumn` | ~200–220px, stage bar, count + total, vertical scroll |
| `CompactKanbanCard` | Dense fields; omits empties |
| Pipeline page | Preference + compact render branch |

---

## 3. API / display enrichment

Still **one** `GET /api/pipelines/:id/items` path. Enrichment now:

1. Deal batch select includes `probability`
2. **One** batched `tasks` query: `related_deal_id IN (…)`, status not `done`/`cancelled`, earliest due per deal
3. `product_label` from field_values keys only (`product_name`, `product`, `service`, …) — **no quote-line joins**

Move API unchanged: `PATCH /api/items/:id/move`.

---

## 4. Preference

Key: `thinkaiq.pipeline.view.{workspaceId}.{userId}`  
Values: `kanban | compact | table | list`  
Default: **`kanban` (Cards)**  
No new preference service. Compact is never forced as workspace default.

Hydration order: localStorage → else `pipeline.view` if valid → else `kanban`.

---

## 5. Responsive behavior

- Desktop: multi-column horizontal board (gap 12px)
- Tablet (768–1099): columns ~180–200px via CSS
- Mobile (&lt;768): column ≈ viewport width, `scroll-snap-type: x mandatory` — stage-oriented, not List

ViewSwitcher collapses text labels under 640px (icons remain with `aria-label`).

---

## 6. Tests

| Suite | Result |
|-------|--------|
| `item-display.test.ts` (API) | 4 passed |
| `view-preference.test.ts` (web pipeline) | 5 passed |
| Web `tsc --noEmit` | pass |
| Live `crm-isolation.live.test.ts` | **16/16 pass** |

---

## 7. Isolation evidence

Live CRM isolation suite green after enrichment changes — tenant-scoped deals/items/tasks queries unchanged in auth boundaries; task next-action query filters `workspace_id`.

---

## 8. Cards / Table / List regression evidence

- Cards still rendered via `PipelineKanban` → `KanbanBoard` **without** `density` (defaults `comfortable`) → existing `KanbanColumn` / `KanbanCard`
- Table / List dynamic imports and branches unchanged
- Shared DnD still calls `moveItem` with append-to-stage position
- Unit coverage asserts switcher option order and default id `kanban`

---

## 9. Known limitations

- Mid-column reorder still not supported (same as Cards)
- Product chip only when field_values contain known keys (no catalog join)
- Next action only from incomplete CRM `tasks.related_deal_id` (not activities)
- Workspace DB `pipelines.view` enum may not include `compact` yet — UI persists per-user via localStorage; server enum extend left optional (Phase 4 of plan)
- No measured p95 performance claim
- Live isolation reseed may still wipe unrelated Ops employee profiles (out of this scope)

---

## 10. Confirmation

- Finance, Operations/DPR, Automation runtime, billing, Voice, WhatsApp, AI, PM write model: **not touched**
- CustomerParty identity: display still prefers `customer_name` over company
- Permissions: existing `pipelines:view` / `pipelines:edit` only
- Quote→Cash Block 2 / subscriptions / Automation R2B: **not started**

---

*End of Pipeline Second View implementation report.*
