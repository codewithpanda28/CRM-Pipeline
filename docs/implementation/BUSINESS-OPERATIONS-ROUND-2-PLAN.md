# BUSINESS OPERATIONS — Round 2 Plan

| Field | Value |
|-------|-------|
| Status | **PLAN ONLY — approval-ready · no code** |
| Date | 2026-09-06 |
| Depends on | [BUSINESS-OPERATIONS-ROUND-1-IMPLEMENTATION-REPORT.md](./BUSINESS-OPERATIONS-ROUND-1-IMPLEMENTATION-REPORT.md) — **COMPLETE / FROZEN** |
| Binding baseline | [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md) · REQ-TSK-001/002 · REQ-DPR-001 · REQ-TM-001 · REQ-COM-001 (hooks only) |
| Spec ancestor | [TEAM_DPR.md](../modules/TEAM_DPR.md) (partial; module id remains `ops`, not `team`) |
| Supersedes | Round 1 plan §20 Round 2 bullet list **only where this document conflicts** (see §0.2) |

**Rule:** Do not start Round 2 implementation until this plan is accepted. Round 1 APIs, schema, and UI contracts are **frozen** — extend, do not rewrite.

---

## 0. Round 2 objective

Make Operations useful for **real managerial daily execution and performance management**:

1. Deepen Today / My Work into a manager-capable execution surface  
2. Deliver employee / team / department / company performance views on the Round 1 metric + snapshot foundation  
3. Ship **DPR** (daily performance report) with system-derived lines + optional manual overlay + manager review  
4. Prepare **commission data contracts / hooks only** — no payout engine  
5. Harden manager hierarchy visibility (own / team / department / company) under existing RBAC  

**Architecture one-liner (unchanged):**  
PostgreSQL = SoR · `User` = login · `EmployeeProfile` = org identity · CRM `tasks` = business work · CRM/Finance/activities = metric derivation · `achievement_snapshots` = closed history · Automation runtime untouched.

---

## 0.1 Round 1 freeze (must not break)

| Frozen area | Evidence |
|-------------|----------|
| Module `ops` + `workspace_modules` entitlement | R1 report |
| Org tables | `departments`, `teams`, `team_members`, `employee_profiles`, `employee_reporting_history` |
| Task extensions + recurrence | CRM `tasks` columns + `business_task_recurrence_rules` |
| Targets foundation | `target_metrics`, `target_periods`, `targets`, `achievement_snapshots` |
| APIs under `/api/ops/*` | Additive only — no breaking response shape changes without versioning |
| UI routes `/ops/*` + Operations sidebar group | Keep nav keys; may **add** routes |
| Permissions keys introduced in R1 | Keep; may **add** new keys |
| PM `project_tasks`, Finance ledger, Automation engine | Untouched |

**Compatibility rule:** Existing R1 clients must keep working. Prefer additive fields, query params, and new endpoints over renaming.

---

## 0.2 Conflict with Round 1 plan’s old “Round 2” list

| R1 plan §20 said | This Round 2 plan |
|------------------|-------------------|
| Commission engine (Finance payouts) | **Out** — hooks/contracts only |
| Meetings/calendar product | **Out** (explicit non-goal) |
| Operational reporting pack | **In** as performance + DPR views (not BI builder) |
| DPR UI + manual overlays | **In** |

Commissions and meetings remain **future / Round 3+** unless product re-opens them.

---

## 1. Round 1 inventory — reuse map

### 1.1 Tables / SoR (reuse)

| Asset | Round 2 use |
|-------|-------------|
| `employee_profiles` + manager tree | Scope resolution, DPR subject, performance subject |
| `departments` / `teams` / `team_members` | Team/dept rollups |
| `employee_reporting_history` | Historical manager attribution (do not rewrite closed snapshots) |
| `tasks` (business) | Today/My Work depth; follow-up metrics; completion outcomes |
| `business_task_recurrence_rules` | Keep; polish generation UX only if needed |
| `target_metrics` / `target_periods` / `targets` | Performance UI; period filters |
| `achievement_snapshots` | Closed-period display (authoritative when `period.status = closed`) |
| `activities` | DPR system lines (calls/meetings) |
| `leads` / `deals` / `quotes` / `payments` | Metric calculators (`calculateMetricActual`) |
| `security_audit_events` | DPR submit/review; target ops; reassign |
| `commission_eligible` on employee | Gate for future commission hooks |

### 1.2 Libs / APIs (reuse)

| Asset | Path | Round 2 use |
|-------|------|-------------|
| Hierarchy helpers | `apps/api/src/lib/business-ops/hierarchy.ts` | Manager subtree for Today + performance + DPR |
| Task mapping | `task-mapping.ts` | Outcomes, status, recurrence next-due |
| Metric calculators | `metrics.ts` + `CALCULATOR_VERSION` | Performance + DPR system lines |
| Periods | `periods.ts` | Daily/weekly/monthly windows |
| Business ops router | `routes/business-ops.ts` | Extend; split files if size warrants |
| OpsShell / SubNav | `apps/web/modules/ops/**` | Keep pattern; add routes to sub-nav |
| Live isolation harness | `test/live/business-ops-isolation.live.test.ts` | Expand cases |

### 1.3 Gaps Round 2 must close

| Gap | Severity |
|-----|----------|
| Today/My Work thin: weak CRM context, outcome UX, manager scope toggle | High |
| `/performance/summary` stub | High |
| Targets UI list-only; no period wizard / trends | High |
| No DPR tables or UI | High (REQ-DPR-001) |
| `ops.targets.view_team` / assign seeded admin-only; managers need practical grants | Medium |
| Related entity labels not resolved in Today API | Medium |
| No commission event/hook records (only boolean) | Low (prep only) |

---

## 2. Product requirements (Round 2)

### A. Daily execution

| ID | Requirement |
|----|-------------|
| R2-EX-001 | Today shows overdue / due today / upcoming / high priority with stable sort (priority then due_at) |
| R2-EX-002 | Each task row shows related context chips (Lead / CustomerParty / Deal / Quote / Invoice) with deep links |
| R2-EX-003 | Complete flow captures optional `completion_outcome` + writes activity |
| R2-EX-004 | Reschedule and reassign from Today/My Work (reassign gated by `ops.tasks.assign` + subtree) |
| R2-EX-005 | Scope control: **Mine** \| **Team** (managed subtree) \| **All** (admin / company view) |
| R2-EX-006 | My Work remains employee-centric (own assignee) with richer filters (type, priority, status) |
| R2-EX-007 | No PM tasks in write path; optional read badge only if product later opts in (default: business tasks only) |

### B. Performance & targets

| ID | Requirement |
|----|-------------|
| R2-PF-001 | Performance views for subject types: employee, team, department, tenant |
| R2-PF-002 | Period grain: daily / weekly / monthly; open periods compute live; closed use snapshots |
| R2-PF-003 | Display goal / actual / remaining / % for each target row |
| R2-PF-004 | Achievement summary cards for selected period + subject |
| R2-PF-005 | Manager sees team subtree; dept managers / admins see broader scopes per RBAC |
| R2-PF-006 | Target create/edit UX for open periods; close period with snapshot (R1 API, thicker UI) |
| R2-PF-007 | Trends: compare current open period vs prior closed snapshot for same metric+subject (read-only) |

### C. DPR

| ID | Requirement |
|----|-------------|
| R2-DPR-001 | Employee has one DPR per calendar day per tenant (idempotent upsert draft) |
| R2-DPR-002 | System lines derived from CRM/tasks/activities/finance metrics for that day — **no duplicate counters** |
| R2-DPR-003 | Optional manual overlay fields (notes + limited numeric adjustments) with audit |
| R2-DPR-004 | Submit → manager review (approve / return with comment) |
| R2-DPR-005 | Submitted/reviewed rows immutable except return→draft |
| R2-DPR-006 | Manager inbox of team DPRs for a date range |

### D. Commission preparation (hooks only)

| ID | Requirement |
|----|-------------|
| R2-COM-001 | Keep `commission_eligible` authoritative gate |
| R2-COM-002 | Optional append-only `ops_commission_hook_events` recording eligible business events (deal won / payment succeeded) with refs — **no amount calc, no ledger** |
| R2-COM-003 | Document contract for future Round 3+ commission engine |

### E. Manager hierarchy / authorization

| ID | Requirement |
|----|-------------|
| R2-AUTH-001 | Scope resolver: own / team (subtree) / department / company |
| R2-AUTH-002 | Seed or document a **Manager** role template with team view + DPR review + assign |
| R2-AUTH-003 | Deny peer performance unless granted team/dept/company |

---

## 3. Ambiguities & decisions (locked for approval)

| # | Ambiguity | Decision |
|---|-----------|----------|
| A1 | DPR day timezone | Use **tenant finance/profile timezone if present**, else UTC; store `report_date` as `date` in that zone |
| A2 | Who is “manager” for DPR review | Primary `manager_employee_id` of submitter; fallback admin with `ops.dpr.review` |
| A3 | Manual DPR numbers vs system | System lines always shown; manual overlays stored separately and **labeled**; dashboards prefer system unless overlay attested |
| A4 | Include PM tasks in Today | **No** (default). R2 stays business-task SoR |
| A5 | Commission hook emission | Best-effort on deal won / payment succeeded **only if** employee eligible; never blocks money path |
| A6 | Secondary departments | Still deferred; primary department only |
| A7 | Breaking R1 `/performance/summary` | Replace stub body **additively** (`data.targets`, `data.period` keep; expand fields) |

---

## 4. Schema changes (proposed)

Migration name (tentative): `YYYYMMDD_00N_business_operations_round2.ts`

### 4.1 New tables

#### `dpr_entries`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| workspace_id | uuid NOT NULL | tenant |
| employee_id | uuid NOT NULL | FK employee_profiles |
| report_date | date NOT NULL | one per employee/day |
| status | text | `draft` \| `submitted` \| `reviewed` \| `returned` |
| system_snapshot | jsonb NOT NULL | derived lines at last refresh/submit |
| manual_overlay | jsonb NOT NULL default `{}` | notes + optional adjustments |
| calculator_version | text NOT NULL | metric calculator version |
| submitted_at / submitted_by | | |
| reviewed_at / reviewed_by | | |
| review_comment | text null | |
| created_at / updated_at | | |
| UNIQUE (workspace_id, employee_id, report_date) | | |

#### `dpr_review_events` (audit-friendly append-only)

| Column | Notes |
|--------|-------|
| id, workspace_id, dpr_entry_id | |
| from_status, to_status | |
| actor_user_id | |
| comment | |
| created_at | |

#### `ops_commission_hook_events` (optional but recommended)

| Column | Notes |
|--------|-------|
| id, workspace_id | |
| employee_id | eligible employee |
| event_type | e.g. `deal.won`, `payment.succeeded` |
| source_type / source_id | deal / payment id |
| status | `recorded` only in R2 |
| meta jsonb | non-authoritative display refs — **no calculated commission amount** |
| created_at | |
| UNIQUE (workspace_id, event_type, source_id, employee_id) | idempotent |

### 4.2 Additive columns (if needed)

| Change | Why |
|--------|-----|
| `tasks.completion_outcome` already exists | UI + validation enum tighten only |
| Optional `targets.notes` text | Admin clarity — only if needed; else skip |

### 4.3 No changes

- PM tables · Finance journals · Automation tables · CustomerParty identity · second ledger

---

## 5. Metric / DPR line mapping (system-derived)

Reuse R1 calculators with **daily window** `[start, end)`:

| DPR / performance line | Metric / source |
|------------------------|-----------------|
| Calls | `activities` type `call` by user that day |
| Follow-ups completed | `followups.completed` |
| Leads added | `leads.created` |
| Leads contacted | `leads.contacted` |
| Leads qualified | `leads.qualified` |
| Demos | `demos.completed` |
| Proposals | `proposals.sent` |
| Deals won | `deals.won` |
| Revenue | `revenue.won` |
| Collections | `collections.received` |
| Tasks completed | `tasks.completed` |
| Meetings | `activities` type `meeting` |

**Rule:** Prefer live derivation for open days; on DPR submit, freeze `system_snapshot` jsonb so later CRM edits do not silently rewrite submitted reports (parallel to target period close).

---

## 6. API changes (additive)

Base: `/api/ops` + `requireModule('ops')`.

### 6.1 Execution

| Method | Path | Change |
|--------|------|--------|
| GET | `/today` | Add `scope=mine\|team\|all`, enriched `context` objects, filters |
| GET | `/my-work` | Filters: type, priority, status |
| PATCH | `/tasks/:id` | Already supports outcome/reschedule/reassign — tighten validation + audit |
| POST | `/tasks/:id/complete` | **New convenience** endpoint (optional): status done + outcome in one call |

### 6.2 Performance

| Method | Path | Change |
|--------|------|--------|
| GET | `/performance/summary` | Expand: subjects, metrics, open vs snapshot |
| GET | `/performance/subjects/:type/:id` | New detail |
| GET | `/targets` | Add query: `period_id`, `granularity`, `subject_type` |
| POST/PATCH | periods/targets | Keep R1; UI uses them |

### 6.3 DPR

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dpr` | List (scoped) |
| GET | `/dpr/me?date=` | Get or create draft for self |
| POST | `/dpr/:id/refresh` | Recompute system_snapshot (draft only) |
| PATCH | `/dpr/:id` | Manual overlay (draft/returned only) |
| POST | `/dpr/:id/submit` | Submit |
| POST | `/dpr/:id/review` | approve \| return |
| GET | `/dpr/inbox` | Manager team inbox |

### 6.4 Commission hooks

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/commission-hooks` | List recorded hooks (admin / eligible self) |
| (internal) | writers on deal won / payment | Idempotent insert — **no public calculate** |

### 6.5 Breaking change policy

- Do not remove R1 fields  
- Do not change success envelope `{ data, error }`  
- New optional query params default to R1 behavior (`scope=mine` for today if omitted for members)

---

## 7. UI routes / components

### 7.1 Existing (deepen)

| Route | Round 2 work |
|-------|--------------|
| `/ops/today` | Scope toggle, context chips, complete-with-outcome sheet, reschedule/reassign |
| `/ops/my-work` | Filters, same complete/reschedule patterns |
| `/ops/tasks` | Align with Today actions; keep list |
| `/ops/targets` | Period picker, create target, close period, % bars, snapshot badge |

### 7.2 New routes

| Route | Purpose |
|-------|---------|
| `/ops/performance` | Manager/employee performance hub |
| `/ops/performance/[subjectType]/[id]` | Subject detail |
| `/ops/dpr` | My DPR (today) |
| `/ops/dpr/inbox` | Manager review inbox |
| `/ops/dpr/[id]` | DPR detail / review |

### 7.3 Sub-nav

Extend `OPS_SUB_NAV_ITEMS` (keep Automation-style SubNav):

`Today · My Work · Tasks · Performance · DPR · Employees · Departments · Teams · Targets`

(Order: execution → performance → org → targets.)

### 7.4 Components (reuse ThinkAIQ patterns)

- `OpsShell` / SubNav / `PageHeader` / panels from CRM shared UI  
- Sheets/modals consistent with Automation / CRM  
- Mobile: horizontal wrap sub-nav; Today list first; scope as select  

**Sidebar:** add Performance + DPR keys only; do not restyle sidebar chrome.

---

## 8. RBAC

### 8.1 Keep R1 keys

All existing `ops.*` permissions remain valid.

### 8.2 New permissions

| Key | Default roles | Purpose |
|-----|---------------|---------|
| `ops.dpr.view_own` | admin, member | Own DPR |
| `ops.dpr.create` | admin, member | Draft/submit own |
| `ops.dpr.view_team` | admin (+ Manager template) | Team DPR inbox |
| `ops.dpr.review` | admin (+ Manager template) | Approve/return |
| `ops.performance.view_own` | admin, member | Own performance |
| `ops.performance.view_team` | admin (+ Manager) | Team performance |
| `ops.performance.view_department` | admin | Dept |
| `ops.performance.view_company` | admin | Company |
| `ops.commission_hooks.view` | admin | Inspect hooks |

### 8.3 Manager role template

Document + seed optional system role **Manager** (non-breaking):

- `ops.employees.view`, `ops.tasks.view|manage|assign`  
- `ops.targets.view_own|view_team`  
- `ops.dpr.view_own|create|view_team|review`  
- `ops.performance.view_own|view_team`  

Admins keep `grants_all`. Do not force-assign Manager to existing users.

### 8.4 Scope resolver (shared)

Centralize in `lib/business-ops/scope.ts`:

```text
resolveOpsScope(actor) → { mode: own|team|department|company, userIds?, employeeIds?, departmentId? }
```

Used by Today, targets list, performance, DPR inbox.

---

## 9. Audit events

| Action | `security_audit_events.action` |
|--------|--------------------------------|
| DPR submit | `ops.dpr.submit` |
| DPR review approve/return | `ops.dpr.review` |
| DPR overlay edit | `ops.dpr.overlay_update` |
| Target create/update/close | keep R1 + ensure UI paths hit them |
| Task reassign / complete with outcome | `ops.task.reassigned` / `ops.task.completed` |
| Commission hook recorded | `ops.commission_hook.recorded` (meta only) |

Also append `dpr_review_events` rows for DPR state machine.

---

## 10. Tenant isolation

| Entity | Scope |
|--------|-------|
| All new tables | `workspace_id` on every row + every query |
| DPR / performance / hooks | Join only in-tenant employee/task/CRM ids |
| Live tests | Expand: DPR cross-tenant deny; performance leak deny; hook leak deny |

PostgreSQL remains SoR. No Redis as authority for DPR/performance.

---

## 11. Automation boundary

**Do not modify Automation runtime.**

Optional safe emissions (only if cheap and reliable — prefer defer if risky):

- `ops.task.completed` / `ops.task.overdue` (design already in R1)  
- `ops.dpr.submitted` / `ops.dpr.reviewed`  
- `ops.target.reached` when % crosses 100 on refresh  

Must not call Automation engine internals. Outbox event type strings only if existing outbox pattern is reused without changing workers.

---

## 12. Testing strategy

| Layer | Cases |
|-------|-------|
| Unit | Scope resolver; DPR state machine; overlay merge rules; snapshot preference for closed periods; commission hook idempotency key |
| API | Today scopes; complete with outcome; performance summary; DPR CRUD/submit/review; permission denials |
| Live isolation | Two tenants × DPR/performance/hooks/tasks |
| RBAC | Member own-only; Manager team; Admin company |
| Historical integrity | Submitted DPR snapshot stable after later CRM edits; closed target periods unchanged |
| Regression | R1 ops routes smoke; CRM `/api/tasks`; PM tasks; Finance; Automation suites |

---

## 13. Migration / rollout order

1. Land migration (DPR + optional commission hooks) + schema types  
2. Permissions + Manager role template seed/backfill-missing (never flip intentional disables)  
3. Scope resolver extracted; wire Today/targets  
4. Deepen Today / My Work / Tasks UI  
5. Performance APIs + `/ops/performance` UI  
6. Thicker Targets UI (period/target lifecycle)  
7. DPR APIs + UI + inbox  
8. Commission hook writers (feature-flag or soft fail) + read API  
9. Live isolation + regression  
10. Implementation report + gate sheet  

**Feature flags (optional):** `ops.dpr_enabled`, `ops.commission_hooks_enabled` as workspace settings — only if needed for staged rollout; default on for entitled `ops` module.

---

## 14. Explicit non-goals (Round 2)

- Payroll · attendance · leave · biometrics · recruitment · full HRMS  
- Full commission engine · payout ledger · GL postings for commission  
- Meetings/calendar product  
- Automation runtime / R2B / AI / Voice / WhatsApp  
- Platform billing · support/helpdesk · global search · lead CSV import  
- PM write model changes · Finance accounting rule changes  
- Rewriting Round 1 org model or replacing CRM tasks  
- BI report builder  

---

## 15. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| DPR vs live metrics diverge | Freeze `system_snapshot` on submit; show “as of submit” |
| Manager without permission still needs team view | Manager role template + docs |
| Hook writers slow payment path | Async/outbox or try/catch never fail payment |
| Sub-nav overcrowding on mobile | Wrap + existing Automation gap pattern |
| Scope bugs leak peer data | Central resolver + live tests |
| Scope creep into commissions | Gate sheet; reject calc PRs |

---

## 16. Gate sheet (post-implementation)

| Gate | Pass criteria |
|------|----------------|
| DAILY EXECUTION | Today/My Work scopes + outcomes + context |
| PERFORMANCE | Employee/team/dept/company views; open live / closed snapshot |
| DPR | Draft→submit→review; isolation; audit |
| COMMISSION HOOKS | Record-only; no amounts; Finance untouched |
| RBAC / HIERARCHY | Own/team/dept/company enforced |
| TENANT ISOLATION | Live green |
| R1 COMPAT | Existing ops APIs/UI still work |
| AUTOMATION UNTOUCHED | Engine suites unchanged |
| NO DUPLICATE LEDGER/IDENTITY | Verified |

---

## 17. Final recommendation — next implementation scope

After approval, implement **Business Operations Round 2** in the rollout order (§13), starting with:

1. Schema: `dpr_entries` (+ review events) · optional `ops_commission_hook_events`  
2. Scope resolver + Today depth  
3. Performance hub  
4. DPR employee + manager flows  
5. Commission hooks (record-only)  

**Do not** start commission engine, meetings product, or Automation R2B in this stream.

---

*End of plan — design only. No code, migrations, or database changes were made in producing this document.*
