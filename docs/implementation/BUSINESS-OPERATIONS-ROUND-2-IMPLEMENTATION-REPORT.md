# BUSINESS OPERATIONS — Round 2 Implementation Report

| Field | Value |
|-------|-------|
| Status | **IMPLEMENTED — gate sheet below** |
| Date | 2026-09-06 |
| Plan | [BUSINESS-OPERATIONS-ROUND-2-PLAN.md](./BUSINESS-OPERATIONS-ROUND-2-PLAN.md) |
| Depends on | Round 1 **COMPLETE / FROZEN** |

---

## 1. Summary

Round 2 extends Operations additively for daily execution depth, performance hub, DPR lifecycle, Manager role template, central scope resolver, and record-only commission hooks. Round 1 APIs/UI contracts remain; response envelope stays `{ data, error }`.

---

## 2. Files changed (primary)

### Schema / migration
- `packages/db/migrations/20260906_004_business_operations_round2.ts`
- `packages/db/migrations/20260906_004_business_operations_round2.test.ts`
- `packages/db/src/schema.ts` — `dpr_entries`, `dpr_review_events`, `ops_commission_hook_events`

### Permissions / roles
- `packages/modules/src/ops/index.ts` — R2 permissions + nav + `OPS_MANAGER_PERMISSIONS`
- `packages/modules/src/index.test.ts`
- `apps/api/src/lib/seed-roles.ts` — `ensureManagerRoleTemplate`

### Libs
- `apps/api/src/lib/business-ops/scope.ts` (+ test)
- `apps/api/src/lib/business-ops/dpr.ts` (+ test)
- `apps/api/src/lib/business-ops/performance.ts`
- `apps/api/src/lib/business-ops/task-context.ts`
- `apps/api/src/lib/business-ops/commission-hooks.ts` (+ test)

### APIs
- `apps/api/src/routes/business-ops.ts` — Today/My Work/Tasks depth, complete endpoint, performance expansion, targets filters
- `apps/api/src/routes/business-ops-dpr.ts` — DPR + commission-hooks read
- `apps/api/src/routes/deals.ts` — best-effort `deal.won` hook
- `apps/api/src/lib/finance/payments.ts` — best-effort `payment.succeeded` hook

### UI
- `apps/web/modules/ops/lib/ops-sub-nav.ts` (+ test)
- `apps/web/modules/ops/lib/hooks.ts`
- `apps/web/modules/ops/components/OpsShell.tsx`
- `apps/web/app/(dashboard)/ops/today/page.tsx`
- `apps/web/app/(dashboard)/ops/my-work/page.tsx`
- `apps/web/app/(dashboard)/ops/targets/page.tsx`
- `apps/web/app/(dashboard)/ops/performance/page.tsx`
- `apps/web/app/(dashboard)/ops/performance/[subjectType]/[id]/page.tsx`
- `apps/web/app/(dashboard)/ops/dpr/page.tsx`
- `apps/web/app/(dashboard)/ops/dpr/inbox/page.tsx`
- `apps/web/app/(dashboard)/ops/dpr/[id]/page.tsx`
- Sidebar / Topbar / `useSidebarLayout` — Performance + DPR keys only

### Tests
- Live: `apps/api/src/test/live/business-ops-isolation.live.test.ts` expanded

---

## 3. Migration name

`20260906_004_business_operations_round2`

Applied on isolation DB (`vencore_isolation_test`).

Tables:
- `dpr_entries` (unique workspace+employee+report_date)
- `dpr_review_events`
- `ops_commission_hook_events` (idempotent unique; status=`recorded` only)

Also seeds Member R2 own-scope perms + Manager system role template (not auto-assigned).

---

## 4. APIs added / changed

### Changed (additive)
| Method | Path | Change |
|--------|------|--------|
| GET | `/api/ops/today` | `scope`, type/priority filters, `context` chips |
| GET | `/api/ops/my-work` | type/priority/status filters + context |
| GET | `/api/ops/tasks` | scope + filters + context |
| PATCH | `/api/ops/tasks/:id` | subtree check on reassign; `ops.task.completed` audit |
| GET | `/api/ops/targets` | `period_id`, `granularity`, `subject_type` queries |
| GET | `/api/ops/performance/summary` | full targets + prior compare + open/live vs closed/snapshot |

### Added
| Method | Path |
|--------|------|
| POST | `/api/ops/tasks/:id/complete` |
| GET | `/api/ops/performance/subjects/:type/:id` |
| GET | `/api/ops/dpr` |
| GET | `/api/ops/dpr/me` |
| GET | `/api/ops/dpr/inbox` |
| GET | `/api/ops/dpr/:id` |
| POST | `/api/ops/dpr/:id/refresh` |
| PATCH | `/api/ops/dpr/:id` |
| POST | `/api/ops/dpr/:id/submit` |
| POST | `/api/ops/dpr/:id/review` |
| GET | `/api/ops/commission-hooks` |

Internal writers (non-blocking): `deal.won`, `payment.succeeded` → `ops_commission_hook_events`.

---

## 5. UI routes added / changed

| Route | Notes |
|-------|-------|
| `/ops/today` | Scope Mine/Team/All; outcome sheet; context chips; reschedule/reassign |
| `/ops/my-work` | Filters |
| `/ops/tasks` | Unchanged list (API enriched) |
| `/ops/performance` | **New** hub |
| `/ops/performance/[subjectType]/[id]` | **New** detail |
| `/ops/dpr` | **New** my DPR |
| `/ops/dpr/inbox` | **New** manager inbox |
| `/ops/dpr/[id]` | **New** detail/review |
| `/ops/targets` | Period picker, create target, close period, % bar, snapshot badge |

Sub-nav order: Today · My Work · Tasks · Performance · DPR · Employees · Departments · Teams · Targets.

---

## 6. Permissions added

- `ops.dpr.view_own` · `ops.dpr.create` · `ops.dpr.view_team` · `ops.dpr.review`
- `ops.performance.view_own` · `ops.performance.view_team` · `ops.performance.view_department` · `ops.performance.view_company`
- `ops.commission_hooks.view`

Member defaults: own DPR + create + own performance (idempotent insert; never flips intentional disables).

Manager system role template: team assign, team targets view, DPR team/review, team performance.

R1 permissions preserved.

---

## 7. Audit events added

| Action | When |
|--------|------|
| `ops.dpr.submit` | DPR submit |
| `ops.dpr.review` | Approve/return |
| `ops.dpr.overlay_update` | Manual overlay edit |
| `ops.task.completed` | Complete (PATCH or `/complete`) |
| `ops.task.reassigned` | Reassign (existing; subtree hardened) |
| `ops.commission_hook.recorded` | Hook insert (system actor) |

Plus append-only `dpr_review_events` rows for state transitions.

---

## 8. Tests run / results

### Initial Round 2 implementation

| Suite | Result |
|-------|--------|
| `packages/db` R1+R2 migration unit | **9 PASS** |
| `packages/modules` index.test | **21 PASS** |
| `apps/api` `src/lib/business-ops/*` | **16 PASS** (then **18** after TZ tests) |
| `apps/web` `modules/ops` | **4 PASS** |
| Live `business-ops-isolation.live.test.ts` | **1 PASS** |

### Final hardening verification (2026-09-06)

| Suite | Result |
|-------|--------|
| Business Ops unit (`src/lib/business-ops`) | **18 PASS** (incl. Kolkata date-boundary) |
| CRM libs (customer-parties, deals, leads) | **PASS** |
| CRM routes (deals, leads, tasks-list) | **12 PASS** (retry after parallel timeout flakiness) |
| Finance unit (finance + accounting) | **PASS** |
| PM (projects, project-tasks, milestones, sprints, time-logs) | **PASS** |
| Automation (api automation + engine package) | **PASS** (api routes + 24 engine tests) |
| Web `tsc --noEmit` | **PASS** |
| Web ops unit | **4 PASS** |
| Modules + migration unit | **30 PASS** |
| Live isolation (ops + CRM + finance) | **3 files · 17 PASS** |

---

## 9. Gate sheet (§16)

| Gate | Status | Evidence |
|------|--------|----------|
| DAILY EXECUTION | **PASS** | Today scope + context + complete-with-outcome + reschedule/reassign picker |
| PERFORMANCE | **PASS** | Summary + subject detail; open live / closed snapshot; prior compare |
| DPR | **PASS** | Draft→submit→review; freeze snapshot; review events; **tenant TZ day window** |
| COMMISSION HOOKS | **PASS** | Record-only; no amounts; payment/deal paths not blocked |
| RBAC / HIERARCHY | **PASS** | `scope.ts` + Manager template + assignable employees endpoint |
| TENANT ISOLATION | **PASS** | Live ops+CRM+finance green |
| R1 COMPAT | **PASS** | Additive fields/params; envelope unchanged |
| AUTOMATION UNTOUCHED | **PASS** | No engine/runtime edits |
| NO DUPLICATE LEDGER/IDENTITY | **PASS** | Hooks table only; CRM tasks + CustomerParty unchanged |

---

## 10. Deviations / remaining limitations

1. **DPR timezone (A1) — FIXED in hardening:** Uses existing `tenant_settings.timezone` (IANA). Invalid/missing → **UTC**. Finance profile has no timezone column; did not invent a second setting. Snapshot includes `timezone` field.
2. **Today/My Work reassign — FIXED in hardening:** Employee picker via `GET /api/ops/employees/assignable` + dialog; empty when no `ops.tasks.assign`; API subtree enforcement unchanged.
3. **Feature flags** `ops.dpr_enabled` / `ops.commission_hooks_enabled` not added (plan optional).
4. **Commission hooks** on primary `deals` + `createPayment` only (not duplicated on v1 deals router).
5. **Automation outbox** for `ops.dpr.submitted` still deferred.
6. **`report_date` DB storage** remains a `date` column (calendar day string); metric windows use zoned `[start,end)` instants.

---

## 11. Explicit non-goals confirmed untouched

No commission engine · no payout ledger · no meetings/calendar · no payroll/HRMS · no Automation R2B · no AI/Voice/WhatsApp · no billing · no helpdesk · no global search · no lead CSV · no PM write changes · no Finance accounting rule changes · no BI builder.

---

## 12. Final hardening notes (not Round 3)

| Item | Behavior |
|------|----------|
| DPR timezone | `resolveTenantTimezone` → `tenant_settings.timezone`; `dprDayWindow` / `reportDateForInstant` use that zone; UTC fallback |
| Reassign UX | `ReassignTaskDialog` + `/employees/assignable`; Reassign button only when assignable list non-empty |

*Round 2 implementation + final hardening complete. No Round 3 started.*
