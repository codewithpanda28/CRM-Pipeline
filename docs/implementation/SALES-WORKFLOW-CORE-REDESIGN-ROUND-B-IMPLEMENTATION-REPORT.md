# SALES-WORKFLOW-CORE-REDESIGN — ROUND B IMPLEMENTATION REPORT

| Field | Value |
|-------|-------|
| Status | **ROUND B COMPLETE** |
| Date | 2026-09-07 |
| Plan | [`SALES-WORKFLOW-CORE-REDESIGN-PLAN.md`](./SALES-WORKFLOW-CORE-REDESIGN-PLAN.md) |
| Round A (frozen) | [`SALES-WORKFLOW-CORE-REDESIGN-ROUND-A-IMPLEMENTATION-REPORT.md`](./SALES-WORKFLOW-CORE-REDESIGN-ROUND-A-IMPLEMENTATION-REPORT.md) |

**Full Sales Workflow Core = Round A + Round B.** Round A foundations were not redesigned.

---

## 1. Navigation (`employee_sales_core`)

- Default primary **Work** group: **My Tasks** (`/ops/tasks`) · **Pipeline** · **Leads**
- Remaining Sales / Finance / Ops / Automation / etc. stay available under their groups (Advanced/More equivalent)
- Routes and permissions preserved; `/crm/tasks` labeled “All tasks” and redirects to `/ops/tasks`
- Implemented via `applyEmployeeSalesCorePreset` in `sidebar-layout.ts` + client `FALLBACK_GROUPS`

---

## 2. My Tasks UX

- Canonical route: **`/ops/tasks`** (CRM `tasks` SoR; not `project_tasks`)
- Sort: overdue → time-bound soon → high-priority unbounded → nearest deadline → lower/no date (`my-tasks-sort.ts`)
- Filters: status / priority / type; history via include_done / status filters
- Quick create: unbounded + time-bound + meeting fields
- Related context chips → unified `/crm/records/...`
- Complete action retained

---

## 3. Unified record

- `/crm/records/[ref]` → `UnifiedRecordShell`
- Modes: LeadRecord / PartyRecord / DealContext
- Sections: Overview, Contact, Sales, Tasks & Meetings, Timeline, Commercial, Custom Fields
- Actions: Add Task, Schedule Meeting, Add Communication, Move Deal Stage, Ops handoff when Won
- API enrichment: related tasks + customization sections/fields/values
- Timeline: `GET /api/crm/records/:ref/timeline` (activities + pipeline_activity, stable chronological)
- Communications: `POST /api/crm/records/:ref/communications` → `activities` type `communication_added` (heading + body + occurred_at + meta links)

---

## 4. Meetings / reminders

- Meeting = time_bound task (+ optional `task_type=meeting`)
- Online / offline + location validation (Round A)
- Reminder policy **T-24h / T-2h / T-30m** via `runMeetingReminders` inside native reminder sweep (`reminder_runs` idempotency)
- No Google/Outlook sync

---

## 5. Customization admin UI

- **Settings → CRM Customization** (`/settings/crm-customization`)
- Sections / fields / options CRUD against Round A `/api/crm/customization`
- Gated by `workspace:manage`

---

## 6. Stage-change → task

- After successful Cards/Compact stage move: optional non-blocking **“Add a next task?”** (assign to me / skip)
- Does not change deal stage semantics

---

## 7. Lead / Pipeline UX

- Lead rows → `/crm/records/lead:{id}`; optional next-task chip
- Cards + Compact show `next_action`; open → unified deal record
- Move-to-Stage context menu retained (mobile / non-drag)

---

## 8. Operations handoff

- On Won deal context: lightweight banner + create Ops follow-up task (existing `tasks` + Ops assignees)
- No Ops redesign / no second handoff SoR

---

## 9. Topbar search

- Round A client search kept (`scope=clients`, Ctrl/Cmd+K, Search everything)

---

## 10. Mobile

- My Tasks / Record / create flows are stack-friendly; no drag-only requirement for stage moves

---

## 11. Schema / audit / isolation

- Migration `20260907_003_sales_workflow_round_b`: `activities.occurred_at`, `heading`, type varchar(40)
- Writes remain workspace-scoped + RBAC; related IDs validated server-side
- Task create logs timeline events (`task_created` / `meeting_scheduled`)

---

## 12. Tests / regressions

| Check | Result |
|-------|--------|
| My Tasks sort unit | Pass |
| Round A foundation + scheduling units | Pass |
| Web `tsc --noEmit` | Pass |
| API `tsc --noEmit` | Pass (after import fix) |
| Round A DnD / customization / Block 1 / Finance / Ops / Automation / PM | Not rewritten |

---

## 13. Acceptance gates

| Gate | Status |
|------|--------|
| B1 Default nav My Tasks / Pipeline / Leads | **Pass** |
| B2 Mental-model loop without duplicate identity entry | **Pass** (unified record + tasks + timeline) |
| B3 Timeline shows communication + stage + task events | **Pass** (foundation) |
| Round A gates | Still hold |
| **Round B COMPLETE** | **Yes** |
| **Full Sales Workflow Core COMPLETE** | **Yes** (A + B) |

---

## 14. Known limitations

- Attachment/audio on communications: meta-ready; upload UX degrades if storage unset
- Customization UI is functional admin, not a full form-builder designer
- Existing saved sidebar layouts are reshaped by `mergeLayout` preset — admins can still customize after
- Meeting reminders depend on native reminder job being scheduled in the environment
- Sales forecast / score remains separate backlog (Sales Completion plan)
