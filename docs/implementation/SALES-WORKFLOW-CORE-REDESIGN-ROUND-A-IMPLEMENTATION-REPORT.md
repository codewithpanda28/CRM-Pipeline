# SALES-WORKFLOW-CORE-REDESIGN — ROUND A IMPLEMENTATION REPORT

| Field | Value |
|-------|-------|
| Status | **ROUND A COMPLETE** (not full Sales Workflow Core) |
| Date | 2026-09-07 |
| Plan | [`SALES-WORKFLOW-CORE-REDESIGN-PLAN.md`](./SALES-WORKFLOW-CORE-REDESIGN-PLAN.md) |
| Ownership contracts | [`SALES-WORKFLOW-CORE-FIELD-OWNERSHIP.md`](./SALES-WORKFLOW-CORE-FIELD-OWNERSHIP.md) |

**Hard rule:** Round B (My Tasks UX, timeline composer, meeting reminders UX, Ops handoff UX, nav preset) was **not** started.

---

## 1. Customization architecture used

**Reuse:** ADR-013 hybrid direction — tenant-scoped metadata + typed values, not a second form-builder product.

**Canonical model (no competing SoR):**

| Layer | Tables | Role |
|-------|--------|------|
| Layout sections | `crm_record_sections` | Create / rename / reorder / archive |
| Field definitions | `crm_field_definitions` | Immutable `field_key`, mutable label/type/required/default/validation/searchable/position/archive |
| Options | `crm_field_options` | Select options: add / rename / reorder / archive |
| Values | `crm_field_values` | Canonical stored values for new custom fields |

**Explicit non-duels:**

- Parent entity `custom_fields` JSONB remains **legacy / ad-hoc** only — new Round A defs write to `crm_field_values`.
- `pipeline_fields` remain **board secondary** fields (unchanged SoR for deal amount/stage).
- Defaults apply on **new** records by convention; no automatic backfill of historical rows.

**API:** `/api/crm/customization/*`  
**Configure permission:** `workspace:manage`  
**Read permission:** `leads:view`  
**Audit:** `recordSecurityAudit` on section/field/option mutations.

**Field types shipped:** text, long_text, number, currency, date, datetime, phone, email, url, single_select, multi_select, checkbox, user_ref.

**Type change:** blocked when non-null `crm_field_values` exist → archive + create new field.

---

## 2. Schema changes

Migration: `packages/db/migrations/20260907_002_sales_workflow_round_a.ts` (applied).

- New: `crm_record_sections`, `crm_field_definitions`, `crm_field_options`, `crm_field_values`
- `pipeline_stages.default_probability` (0–100 nullable), `pipeline_stages.archived_at`
- `tasks`: `scheduling_mode`, `start_at`, `end_at`, `duration_minutes`, `timezone`, `meeting_mode`, `location`

---

## 3. Field ownership model

Documented in `SALES-WORKFLOW-CORE-FIELD-OWNERSHIP.md` (name, phone, email, company, owner, source, stage, probability, amount, expected close, custom fields).

Projection rule preserved: `pipeline_items.field_values` = board read-model; `deals` = opportunity SoR.

---

## 4. Pipeline stage changes

Existing `/api/pipelines/:id/stages` extended:

- Create/PATCH: `default_probability`
- PATCH `archive: true|false` — archive blocked while **open** deals remain in stage
- DELETE: only **archived** stages with **no** remaining non-deleted deals
- List/get pipelines: hide archived stages unless `?include_archived=1`
- Moves reject archived destination stages

---

## 5. DnD behavior

**Server:** `applyPipelineItemMove` renumbers siblings; position = 0-based insert index among remaining cards. Stage change still dual-writes deal + outbox/webhooks; applies stage `default_probability` when entering a stage.

**Client (Cards + Compact shared `KanbanBoard`):**

- Mid-column insert index + visual insertion line
- Within-stage reorder + cross-stage move
- Optimistic React Query update + rollback on failure + error banner
- Context menu **Move to Stage** retained (mobile / non-drag path)
- Card open → `/crm/records/deal:{id}`

Table/List views untouched.

---

## 6. Unified record resolver

| Surface | Detail |
|---------|--------|
| API | `GET /api/crm/records/resolve`, `GET /api/crm/records/:ref` |
| Refs | `lead:{uuid}` \| `party:{uuid}` \| `deal:{uuid}` |
| Modes | LeadRecord / PartyRecord / DealContext |
| Rules | Tenant-scoped; permission-checked; no synthetic CustomerParty |
| UI shell | `/crm/records/[ref]` (thin Round A shell; legacy deal/party/lead routes kept) |

Converted lead with party → PartyRecord when resolving lead without deal.

---

## 7. Task foundation

Extended CRM `tasks` (+ Ops create path validation) only — **not** `project_tasks`.

| Mode | Rules |
|------|-------|
| `unbounded` (default) | Optional due; no required start |
| `time_bound` | `start_at` + `timezone` + (`end_at` \| `duration_minutes`); offline → `location` |

Statuses unchanged.

---

## 8. Search behavior

- CRM Block 1 full search **preserved** (`scope=all`, default for API when omitted / Advanced UI)
- Topbar default: **Clients** (`scope=clients`) → Lead, Contact, Company, CustomerParty, Deal
- Unified hrefs for client scope → `/crm/records/...` (contact/company resolve to party when a party exists; otherwise legacy list)
- Ctrl/Cmd+K kept; shortcut shown in the control
- “Search everything” toggle in GlobalSearch

---

## 9. Permissions / audit / tenant isolation

- Customization configure: `workspace:manage`; mutations audited
- Record resolver: `leads:view` / `customers:view` / `deals:view` as applicable; workspace_id on every load
- Stage/item moves: pipeline ∈ workspace; stage ∈ pipeline; archived stages rejected
- Search: per-bucket RBAC (unchanged Block 1 pattern)

---

## 10. Tests / regressions

| Area | Coverage |
|------|----------|
| Task scheduling | unit (`task-scheduling.test.ts`) |
| DnD position + record ref parse | unit (`round-a-foundation.test.ts`) |
| Search scope=clients | unit (`crm-search.test.ts`) |
| Pipeline stage delete rules | unit (`pipelines.test.ts`) |
| Web `tsc --noEmit` | pass |
| API `tsc --noEmit` | pass (after `@vencore/db` rebuild) |

**Not declared broken:** CRM Block 1, Ops R1/R2, Finance, Automation, PM — no intentional changes to those write models.

---

## 11. Acceptance gates (Round A only)

| Gate | Status |
|------|--------|
| A1 Custom field + old records remain valid | **Pass** (values table; defaults not backfilled) |
| A2 Mid-column + cross-stage DnD + rollback | **Pass** |
| A3 Lead / pipeline / client search → resolver | **Pass** (foundation shell) |
| A4 Time-bound validation | **Pass** |
| Full Sales Workflow Core | **Not complete** (Round B pending) |

---

## 12. Known limitations (Round A)

- No admin Settings UI for sections/fields (API + foundation only)
- Unified record shell is sparse (no timeline / composer — Round B)
- Contact/company client search without a CustomerParty keeps legacy hrefs (no synthetic party)
- Optional admin backfill for defaults not implemented
- Meeting reminders UX / My Tasks redesign / nav preset deferred to Round B
- `pipeline_fields` not dual-registered into `crm_field_definitions` yet (documented coexistence)

---

## 13. Declaration

**ROUND A is complete** against the approved plan exit criteria.

**Sales Workflow Core overall is not complete** until Round B ships.
