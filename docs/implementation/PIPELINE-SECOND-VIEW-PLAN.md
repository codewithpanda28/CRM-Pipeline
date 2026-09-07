# Pipeline Second View — Compact Sales Board (Design Only)

| Field | Value |
|-------|-------|
| Status | **IMPLEMENTED** — see [PIPELINE-SECOND-VIEW-IMPLEMENTATION-REPORT.md](./PIPELINE-SECOND-VIEW-IMPLEMENTATION-REPORT.md) |
| Date | 2026-09-06 |
| Scope | CRM Pipeline UX enhancement only |
| Positioning | Second visualization for sales teams — **does not replace** existing Kanban |

**Rule:** Existing Board (Kanban), Table, and List remain intact. Compact Board is additive. Do not touch Finance ledger, Operations/DPR, Automation runtime, Voice, WhatsApp, subscriptions, or platform billing.

---

## 0. Discovery summary (reuse map)

### 0.1 What exists today

| Asset | Path / evidence | Reuse |
|-------|-----------------|-------|
| Pipeline shell + open-value header | `modules/crm/pipeline/pages/[pipelineId]/page.tsx` | Keep; add Compact branch only |
| View switcher | `components/ViewSwitcher.tsx` — **Board / Table / List** | Extend with Compact; rename Board label → **Cards** |
| Kanban board + HTML5 DnD | `components/kanban/KanbanBoard.tsx` | Reuse DnD + move semantics |
| Stage columns + totals | `KanbanColumn.tsx` — count + stage value | Compact column variant (narrower) |
| Current cards | `KanbanCard.tsx` — name, party, amount, status, owner, close date | Leave as Cards default |
| List view | `PipelineList.tsx` | **Already exists** — keep in switcher |
| Table view | `PipelineTable.tsx` | Keep (not in product rename trio, but do not remove) |
| Items API + display enrichment | `GET …/pipelines/:id/items` + `lib/pipelines/item-display.ts` | Primary data path |
| Stage move | `PATCH /api/items/:id/move` `{ stage_id, position }` | Same DnD rules |
| Deal model | `deals` — includes `probability`, amount, owner, party, close | Display only; no model rewrite |
| Workspace pipeline view column | `pipelines.view` ∈ `kanban\|table\|list` | Optional persistence target; today UI does **not** PATCH on switch |
| Tokens | `--surface`, `--border`, `--text*`, `--font-sans`, CRM radii | Compact must match |

### 0.2 Gaps vs Compact card wish-list

| Desired card field | Today on board | Plan |
|--------------------|----------------|------|
| Deal name | Yes (`display.name`) | Reuse |
| Company / customer | Yes (`customer_name` \|\| `company_name`) | Prefer CustomerParty label; company fallback |
| Amount | Yes | Emphasize typography |
| Owner | Yes | Compact initials or truncated name |
| Probability | On `deals.probability`; **not** in `PipelineItemDisplay` | Additive display enrichment (batched) |
| Next action | No first-class deal field | Soft: earliest open CRM `tasks` with `related_deal_id` (batched), else omit |
| Next activity / due | Partial via `expected_close_at` | Show task due if present; else expected close as “Close …” |
| Product / service | No deal↔product FK on board | Soft indicator from `field_values` product/sku if present, else hide |
| Status | Won/lost badge only | Keep; compact chip |

### 0.3 Explicit non-goals

- Replacing Cards Kanban
- New deal/pipeline schema or SoR
- New DnD library (keep native HTML5)
- New preference platform
- Per-card N+1 task/product fetches
- Copying any third-party sales CRM visual brand
- Finance / Ops / Automation / messaging work

---

## 1. Goals / non-goals

### Goals

1. Add **Compact Board** as a denser stage-column sales board alongside Cards.
2. Keep Cards as the **default** view for users without a saved preference.
3. Preserve List (and Table) because architecture already supports them.
4. Same pipeline/stages/deals, same move API, same RBAC, same tenant isolation.
5. Stage count + stage value immediately readable; header open-value unchanged.
6. Usable with many stages (horizontal scroll) and smaller screens.

### Non-goals

Rewriting Deal/CustomerParty · new search · new analytics · board virtualization v1 (document as later if needed) · mid-column pixel-perfect reorder beyond existing append-to-stage behavior.

---

## 2. UX flow

```
/crm/pipeline/[pipelineId]
  ├─ PipelineSwitcher (unchanged)
  ├─ Search + Open value + deal count (unchanged)
  ├─ ViewSwitcher: Cards | Compact Board | Table | List
  └─ Active view body
        Cards        → existing PipelineKanban / KanbanCard
        Compact Board→ CompactBoard (new) sharing KanbanBoard DnD core
        Table        → existing PipelineTable
        List         → existing PipelineList
```

### Switcher labeling (product)

| Switcher label | Internal id | Default? |
|----------------|-------------|----------|
| **Cards** | `kanban` (existing) | **Yes** |
| **Compact Board** | `compact` (new) | No |
| **Table** | `table` | No — keep; sales ops still use it |
| **List** | `list` | No — already implemented |

Table stays in the control so we do not regress existing users. Product copy emphasizes Cards vs Compact; Table remains a fourth segment.

### Defaulting & preference (locked for design)

1. **Default:** Cards (`kanban`).
2. **Session:** local React state (today’s behavior).
3. **Persist (minimal, no new system):**
   - Prefer **per-user `localStorage`** key  
     `thinkaiq.pipeline.view.{workspaceId}.{userId}` → `kanban|compact|table|list`  
     (same class of pattern as infra `databases-view-mode`).
   - Optionally, if product later wants workspace default: extend `pipelines.view` enum with `compact` and wire ViewSwitcher → `PATCH /api/pipelines/:id` (today switcher does not persist). **Do not invent a new prefs service.**
4. Compact is never forced as workspace default in v1.

### Interaction flow (Compact)

1. User selects Compact Board.
2. Same items query as Cards (`['items', pipelineId]`).
3. Columns = stages left→right (existing stage order).
4. Drag card → drop on stage → `moveItem` (same as Cards).
5. Click card → `/crm/deals/:id` (same as Cards).
6. Context menu (move / assign / won-lost / delete) reused from Cards board.

---

## 3. Wireframe-level structure

### 3.1 Page chrome (shared)

```
┌────────────────────────────────────────────────────────────────┐
│ PipelineSwitcher ▾    Open · N deals · ₹X open value           │
│ [search………]                    [ Cards | Compact | Table | List ] │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Compact Board (horizontal stages)

```
◀ scroll                                                    scroll ▶
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ QUALIFY  │ │ PROPOSAL │ │ NEGOT.   │ │ WON      │
│ 12 · ₹4.2L│ │ 8 · ₹9.1L│ │ 3 · ₹2.0L│ │ 5 · ₹…  │
├──────────┤ ├──────────┤ ├──────────┤ ├──────────┤
│ ▌card    │ │ ▌card    │ │ …        │ │ …        │
│ ▌card    │ │ ▌card    │ │          │ │          │
│ + Add    │ │ + Add    │ │          │ │          │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

- Column width target: **~200–220px** (vs Cards 260–280).
- Column gap: **10–12px**; clear vertical stage color bar (reuse stage color / won-lost).
- Header: stage name (truncate) · count · **bold stage total**.
- Body: vertical scroll per column; board scrolls horizontally for stage overflow.
- Drop target highlight: same visual language as Cards (`isDragOver`).

### 3.3 Compact deal card (dense)

```
┌─────────────────────────────┐
│ Deal name (1-line ellipsis) │
│ CustomerParty / company     │
│ ₹1,20,000          40%      │  ← amount dominant; probability right
│ UA · Follow-up · Tue 10     │  ← owner · next action · due/close
│ [Service]            [Won?] │  ← optional product chip · status
└─────────────────────────────┘
```

**Density rules**

- Padding `8px 10px`; radius `8px` (tighter than Cards `12`).
- Single-line name; no 2-line clamp.
- Hide empty optional rows (no “—” clutter).
- Amount uses tabular nums; probability as `NN%` only if present.
- Next action: task title truncated ≤24 chars, or omit.
- Due: task `due_at`/`due_date` preferred; else expected close as `Close …`.
- Product chip: only when enrichment provides a short label.

### 3.4 Responsive

| Breakpoint | Behavior |
|------------|----------|
| ≥1100px | Full multi-column horizontal board |
| 768–1099 | Same board; narrower columns (~180px); sticky switcher |
| &lt;768 | Horizontal snap-scroll columns (one stage ≈ viewport width − padding); header stats wrap; switcher may collapse labels to icons with `aria-label` |

Do not stack all stages vertically on mobile in v1 (that becomes List). Compact stays column-oriented.

---

## 4. Reusable components (implementation sketch — not built yet)

| Component | Role |
|-----------|------|
| `ViewSwitcher` | Add `compact`; label `kanban` → Cards |
| `PipelineCompactBoard` | Thin wrapper parallel to `PipelineKanban` |
| `CompactKanbanBoard` | **Prefer** density prop / fork of `KanbanBoard` sharing DnD state |
| `CompactKanbanColumn` | Narrow column + stronger totals typography |
| `CompactKanbanCard` | Dense card layout |
| Shared | `ItemForm`, context menu, `PipelineSwitcher`, money helpers, search filter |

Avoid a third DnD implementation. Prefer `density: 'comfortable' | 'compact'` on shared board if that keeps Cards pixel-stable; otherwise duplicate column/card only, keep board DnD in one place.

---

## 5. Data / API reuse

### 5.1 Unchanged

- `GET /api/pipelines/:id`
- `GET /api/pipelines/:pipelineId/items` (+ existing display map)
- `PATCH /api/items/:id/move`
- Deal write model, CustomerParty identity, automation/outbox on stage change

### 5.2 Additive display enrichment (optional, batched)

Extend `PipelineItemDisplay` **only** with fields needed for Compact (Cards may ignore):

```ts
probability?: number | null;
next_action?: { title: string; due_at: string | null } | null;
product_label?: string | null;
```

**Query strategy (no N+1)**

1. Existing deal batch select — add `probability` to the same `deals` select.
2. Next action: **one** query for open CRM tasks where `related_deal_id IN (…)` and status incomplete, pick min due per deal in memory.
3. Product label: read from mapped `field_values` keys if already used by tenants; **do not** join quote line items in v1 (avoids heavy joins). Document as progressive enhancement.

If task join is expensive for huge boards, ship Compact v1 without next_action and show expected close only — call out in rollout.

### 5.3 Client

- Same React Query key `['items', pipelineId]` for Cards and Compact (shared cache).
- No new board endpoint.

---

## 6. Drag / drop behavior

| Rule | Behavior |
|------|----------|
| Library | Native HTML5 (existing) |
| Permission | Server: `pipelines:edit` (unchanged) |
| Drop | Append to target stage (`position = destItems.length`) — same as Cards |
| Invalid stage | Server `INVALID_STAGE` |
| Won/lost | Existing context menu / stage flags; Compact does not invent new win-lose UX |
| Automation | Unchanged side effects on stage change |

Compact must not introduce mid-list reorder unless Cards gains it in the same change (out of scope).

---

## 7. Permissions

| Action | Key |
|--------|-----|
| View board | `pipelines:view` |
| Move card | `pipelines:edit` (API) |
| Create / delete / config | Existing pipeline keys |

No new permission keys. Compact is a presentation of the same authorized data.

Tenant isolation: all existing workspace filters on items/deals/tasks remain.

---

## 8. Performance considerations

- One items list + existing enrichment fan-out; Compact must not per-card fetch.
- Cap next-action task query to deal ids on the current pipeline page only.
- Prefer CSS density over virtualization in v1; if &gt;~500 visible cards becomes janky, follow-up: virtualize column lists only.
- Do not claim p95 budgets without measurement.
- Shared React Query cache between Cards ↔ Compact avoids double fetch on switch.

---

## 9. ThinkAIQ visual language

- Reuse `--surface`, `--border`, `--text`, `--text2`, `--text3`, `--font-sans`, existing stage colors.
- Segmented `ViewSwitcher` style unchanged except new tab.
- No purple marketing gradients, no foreign brand chrome, no new icon font.
- Compact is “denser CRM,” not a different product skin.

---

## 10. Testing strategy

| Layer | Cases |
|-------|--------|
| Unit | Compact card field visibility (omit empty); stage total formatting; view id mapping |
| Component | ViewSwitcher includes Compact; default remains Cards |
| API (if enrichment extended) | Display includes probability; task next-action batch tenant-scoped; no cross-tenant leak |
| Manual / e2e light | Switch Cards ↔ Compact; DnD move still updates stage; List/Table untouched |
| Regression | Existing Kanban card layout unchanged; move API; deal detail click; web `tsc` |
| Isolation | Live CRM pipeline/deal isolation suites remain green; **no** Ops/Finance/Automation runs unless shared code touched |

---

## 11. Rollout plan

| Phase | Work | Exit |
|-------|------|------|
| **0** | This plan approved | Design locked |
| **1** | ViewSwitcher + Compact shell reusing DnD + existing display fields | Compact usable with current card data density |
| **2** | Additive display enrichment (probability ± next_action) | Full compact card content |
| **3** | Per-user localStorage preference | Remembers last view |
| **4** | Optional: persist `compact` into `pipelines.view` + PATCH wire-up | Workspace default (product decision) |

Feature flag: not required if shipped behind normal deploy; can gate Compact tab with env if desired.

Rollback: remove Compact tab; Cards remains default — zero schema rollback if enrichment columns are additive only.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Changing Cards while building Compact | Density fork or strict visual regression on Cards |
| Next-action query cost | Ship without it first; batch + limit; omit empty |
| Workspace `pipelines.view` vs per-user | v1 localStorage per user; document shared column as optional later |
| Many stages on mobile | Horizontal snap; do not force List |
| Confusing Board vs Cards rename | Keep internal id `kanban`; only label change |

---

## 13. Acceptance checklist (implementation phase)

- [ ] Cards (Kanban) still default and visually unchanged
- [ ] Compact Board shows stages, counts, stage totals, dense cards, DnD
- [ ] List and Table still available
- [ ] Same move API / permissions / tenant rules
- [ ] CustomerParty identity preserved (display prefers party name)
- [ ] No Finance / Ops / Automation / billing changes
- [ ] No N+1 in enrichment
- [ ] Preference approach documented and implemented per plan (localStorage v1)
- [ ] Tests + web typecheck green
- [ ] Implementation report after ship (separate from this plan)

---

## 14. Files likely touched (implementation — not now)

**Web:** `ViewSwitcher.tsx`, `[pipelineId]/page.tsx`, new `compact/*` or density variants of `KanbanBoard` / `Column` / `Card`, optional localStorage helper.

**API (only if Phase 2 enrichment):** `item-display.ts` (+ tests); no new routes.

**DB:** none for v1; optional later enum extend on `pipelines.view` if Phase 4.

---

## 15. Confirmation

- **Existing Kanban remains** the Cards view and default.
- **List is in scope** because `PipelineList` already exists.
- **This document is design only** — no code, migrations, or schema changes were made producing it.
- **Block scope:** Pipeline UX only; CRM Block 1 / Ops R1–R2 / Finance / Automation frozen surfaces untouched by this plan.

---

*End of Phase 0 design.*
