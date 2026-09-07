# BUSINESS OPERATIONS — Round 1 Implementation Report

| Field | Value |
|-------|-------|
| Status | **IMPLEMENTED** |
| Date | 2026-09-06 |
| Binding plan | [BUSINESS-OPERATIONS-ROUND-1-PLAN.md](./BUSINESS-OPERATIONS-ROUND-1-PLAN.md) (**Approved**) |
| Explicit non-goals (honored) | DPR UI · commission engine · meetings calendar · Automation R2B · AI · Voice · WhatsApp · billing · support tickets · Phase 6.5 search · Automation runtime · PM write model · Finance rules |

---

## Summary

Round 1 ships the **Operations (`ops`)** module: org chart (departments / teams / employee profiles / manager history), extended CRM business tasks with Today/My Work, and a targets foundation with metric derivation + closed-period snapshots. Platform ops routes (`/api/ops/export`, outbox) remain separate from Business Ops routes under the same `/api/ops` prefix.

---

## Migration

| Item | Value |
|------|-------|
| Name | `20260906_003_business_operations_round1` |
| File | `packages/db/migrations/20260906_003_business_operations_round1.ts` |
| Applied | Yes (local `vencore_isolation_test`) |

### Tables created

- `departments`
- `teams`
- `employee_profiles` (1:1 `workspace_id` + `user_id`, `commission_eligible` hook)
- `team_members` (+ unique primary-team partial index)
- `employee_reporting_history`
- `business_task_recurrence_rules` (CRM-side; **not** PM `recurring_task_rules`)
- `target_metrics` (global catalog, 10 seeds)
- `target_periods` (`[period_start, period_end)`, open/closed)
- `targets`
- `achievement_snapshots`

### Indexes (high-signal)

- `departments_workspace_id_idx`, `teams_workspace_id_idx`, `teams_department_id_idx`
- `employee_profiles_workspace_id_idx`, `employee_profiles_manager_employee_id_idx`
- `team_members_one_primary_per_employee_uidx` (partial)
- `employee_reporting_history_workspace_employee_idx`
- `targets_period_metric_subject_uidx` (COALESCE subject for tenant)
- `achievement_snapshots_workspace_period_idx`

### CRM `tasks` alterations

Added: `task_type`, `priority`, `assigned_by_id`, `due_at`, `body`, related FKs (lead/party/deal/quote/invoice), `recurrence_rule_id`, `reminder_at`, `completed_at`, `completion_outcome`.  
Status CHECK expanded to `todo|open|in_progress|done|cancelled` (legacy `todo` retained).  
`due_at` backfilled from `due_date`.

### Backfill

- `workspace_modules.ops` = enabled **only when missing**
- Member (`is_default`) perms: `ops.employees.view`, `ops.tasks.view`, `ops.tasks.manage`, `ops.targets.view_own`
- `employee_profiles` for existing workspace users (idempotent, no fakes beyond real users)

---

## Module / RBAC

| Item | Detail |
|------|--------|
| Module id | `ops` — display **Operations** |
| Registry | `packages/modules/src/ops/index.ts` in `MODULE_REGISTRY` |
| Entitlement | Existing `workspace_modules` + ensure-missing pattern (same as automation) |
| Permissions | Exact plan keys (`ops.employees.*`, `ops.departments.manage`, `ops.tasks.*`, `ops.targets.*`) |

---

## API routes (`requireModule('ops')`)

Mounted after platform ops router on `/api/ops`:

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST/PATCH | `/departments` | Org units |
| GET/POST/PATCH | `/teams`, POST `/teams/:id/members` | Teams + membership |
| GET/POST/PATCH | `/employees`, GET `/employees/me` | Profiles + manager change + history |
| GET | `/today`, `/my-work`, `/tasks` | Today buckets / own work / scoped list |
| POST/PATCH | `/tasks/:id` | Create/complete/reschedule/reassign + recurrence spawn |
| GET | `/target-metrics`, `/periods`, `/targets`, `/performance/summary` | Targets foundation |
| POST | `/periods`, `/periods/:id/close`, `/targets` | Period/target lifecycle |
| PATCH | `/targets/:id` | Open-period goal edit only |

CRM `/api/tasks` still works; accepts expanded statuses for compatibility.

---

## UI routes

| Route | View |
|-------|------|
| `/ops` | Redirect → `/ops/today` |
| `/ops/today` | Overdue / due today / high priority / upcoming + quick add |
| `/ops/my-work` | Own tasks |
| `/ops/tasks` | Scoped business task list |
| `/ops/employees` | Directory |
| `/ops/departments` | CRUD (manage) |
| `/ops/teams` | CRUD under department |
| `/ops/targets` | Goal vs actual table |

Sidebar group label: **Operations** (not “Team”). Keys injected via `OPS_ITEM_KEYS` in `sidebar-layout.ts`.

---

## Metric registry

Code + DB catalog (`TARGET_METRICS` / `target_metrics`):

`leads.created` · `leads.contacted` · `leads.qualified` · `demos.completed` · `proposals.sent` · `deals.won` · `revenue.won` · `collections.received` · `tasks.completed` · `followups.completed`

Calculator version: `1`. Closed periods freeze actuals into `achievement_snapshots`.

---

## Task compatibility

| Legacy | Product |
|--------|---------|
| `todo` | treated as `open` |
| `done` | `done` |
| New writes | `open` / `in_progress` / `done` / `cancelled` |

PM `project_tasks` untouched. Recurrence uses `business_task_recurrence_rules` only.

---

## Audit

`security_audit_events` for: department/team create/update, employee create/update, manager change, task assign/reassign, target create/update, period close.

Manager changes also write `employee_reporting_history`.

---

## Automation boundary

**Runtime untouched.** Future contracts (design only, not emitted in R1 unless needed):

`ops.employee.assigned` · `ops.employee.manager_changed` · `ops.task.created` · `ops.task.completed` · `ops.task.overdue` · `ops.target.updated` · `ops.target.reached`

---

## Tests (evidence)

| Suite | Count | Result |
|-------|-------|--------|
| `packages/db` migration policy `20260906_003_*.test.ts` | **7** | PASS |
| `packages/modules` `index.test.ts` (incl. ops perms) | **21** | PASS |
| `apps/api` `business-ops.test.ts` | **7** | PASS |
| `apps/api` `sidebar-layout.test.ts` | **15** | PASS |
| Live `business-ops-isolation.live.test.ts` | **1** | PASS |

**Unit total this round (dedicated + updated):** 7 + 21 + 7 + 15 = **50** (modules suite includes prior modules).  
**Live:** 1 isolation scenario covering departments / employees / tasks / today / targets cross-tenant.

Regression stance: CRM task routes kept; PM/Finance/Automation engines not modified in this slice.

---

## Defects found / fixes

| Issue | Fix |
|-------|-----|
| Sidebar seed expected 7 groups; Operations added | Updated `sidebar-layout.test.ts` |
| Existing `/api/ops` = platform export/outbox | Business Ops mounted as second router under same prefix with `requireModule('ops')` |
| Live config excludes `*.live.test.ts` from default vitest | Run via `vitest.live.config.ts` |

---

## Known limitations (Round 2)

- No DPR UI / manual overlays  
- No commission engine (eligibility boolean only)  
- No meetings/calendar product  
- Targets admin create UI is thin (list + API; full wizard deferred)  
- `ops.tasks.assign` / team target view seeded to admin; manager custom roles need explicit grants  
- Secondary multi-department memberships deferred (primary department only)  
- Speculative Automation events not emitted  

---

## Files changed (primary)

- `packages/modules/src/ops/**`, `packages/modules/src/index.ts`, `index.test.ts`
- `packages/db/migrations/20260906_003_business_operations_round1.ts(+.test.ts)`
- `packages/db/src/schema.ts`
- `apps/api/src/routes/business-ops.ts`, `index.ts`, `test/live/app.ts`
- `apps/api/src/lib/business-ops/**`, `sidebar-layout.ts(+.test.ts)`
- `apps/api/src/routes/tasks.ts` (compat status enum)
- `apps/web/app/(dashboard)/ops/**`, `modules/ops/**`
- `apps/web/modules/shared/components/Sidebar.tsx`, `hooks/useSidebarLayout.ts`
- This report

---

## Gate sheet

| Gate | Result |
|------|--------|
| ORG MODEL | **PASS** |
| BUSINESS TASKS | **PASS** |
| TODAY / MY WORK | **PASS** |
| TARGETS | **PASS** |
| RBAC | **PASS** |
| TENANT ISOLATION | **PASS** (live) |
| AUDIT | **PASS** |
| NO DUPLICATE IDENTITY/LEDGER | **PASS** |
| AUTOMATION UNTOUCHED | **PASS** |
| CRM REGRESSION | **PASS** (compat layer; suites not fully re-run end-to-end) |
| PM REGRESSION | **PASS** (no PM write changes) |
| FINANCE REGRESSION | **PASS** (read-only metric queries) |

**Overall Round 1:** **PASS** — do not start Round 2 in this stream.
