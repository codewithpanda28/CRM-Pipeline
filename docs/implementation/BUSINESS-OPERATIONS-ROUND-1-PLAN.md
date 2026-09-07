# BUSINESS OPERATIONS — Round 1 Plan

| Field | Value |
|-------|-------|
| Status | **PLAN / AUDIT ONLY — no code** |
| Date | 2026-09-06 |
| Product baseline | [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md) · REQ-TM-001 · REQ-TSK-001/002 · REQ-DPR-001 · REQ-COM-001 (hooks only) |
| Prior gap audit | [THINKAIQ-SALES-REQUIREMENTS-GAP-AUDIT.md](./THINKAIQ-SALES-REQUIREMENTS-GAP-AUDIT.md) §9–10 |
| Spec ancestor | [TEAM_DPR.md](../modules/TEAM_DPR.md) (aspirational; **not implemented**) |
| Explicit non-goals (this artifact) | Code · migrations · tables · Automation engine changes · DPR UI · commission engine · payroll/HRMS · Voice · WhatsApp · AI · Round 2B |
| Adjacent HOLDs | Phase 6.5 entitlement hardening (ops hold) · Automation R2B / AI / Voice / WhatsApp |

**Rule:** Do not start Round 1 implementation until this plan is accepted. This document is the engineering charter for Business Operations Round 1 only.

---

## 0. Round 1 objective

Ship the **organizational + daily-execution foundation** so a business owner/manager can:

1. Model employees, departments, teams, and reporting hierarchy on top of existing users/RBAC  
2. Run a usable **Today / My Work** follow-up surface on a **single business-task model**  
3. Define **targets** (employee / team / department / tenant) with period integrity  
4. Keep **tenant isolation**, **audit**, and **RBAC** authoritative  
5. Leave **PM/project delivery tasks**, **Finance ledger**, and **Automation runtime** unchanged  

**Architecture one-liner:**  
`User` = login · `EmployeeProfile` = org identity · `Membership` = tenant access · `Role` = authorization · CRM `tasks` (extended) = business work · `project_tasks` = delivery work · CRM/Finance records = performance derivation SoR.

---

## 1. Current-state audit

### 1.1 Inventory grid

| Area | Verdict | Evidence (canonical) |
|------|---------|----------------------|
| Users / auth | **EXISTS** | `users`, `platform_users`; `apps/api/src/routes/auth.ts`, `users.ts`, `invites.ts` |
| Tenant memberships | **EXISTS** | `tenants`, `tenant_memberships`; dual-read `workspaces.id === tenants.id` |
| Roles / RBAC | **EXISTS** | `roles`, `role_permissions`, `user_roles`; module registry permissions; `RBAC_PERMISSIONS.md` aspirational scopes |
| Departments / teams / employees / managers | **MISSING** | No tables; `settings/team` → redirect to `/settings/users`; `companies.employee_count` is CRM demographic only |
| CRM business tasks | **EXISTS (thin)** | Table `tasks`: assignee, contact, record, title, due, `todo`\|`done` only |
| PM / project tasks | **EXISTS (rich)** | `project_tasks` + assignees, statuses, priorities, recurrence, board/calendar |
| Unified task read | **PARTIAL** | `GET /api/tasks/unified` merges CRM + PM into overdue/today/… buckets |
| Recurring tasks | **PARTIAL** | PM `recurring_task_rules` only; **no CRM recurrence** |
| Reminders / notifications | **EXISTS** | `reminder_runs`, native `task.due`; in-app notifications + prefs |
| Activities | **EXISTS** | `activities` (+ `pipeline_activity` secondary) |
| Targets / achievements / DPR / commissions | **MISSING** | Spec only in `TEAM_DPR.md` / `DATABASE_SCHEMA.md`; no `targets` / `dpr_*` / `commission_*` tables |
| Calendars / meetings | **PARTIAL** | `activities.type = meeting`; `calendar_events` typed but migration stub + **no mounted API**; PM due-date calendar only |
| Dashboard widgets (tasks) | **EXISTS** | CRM unified widgets + PM workload widgets; **no** target/DPR widgets |
| Module registry `team` / `ops` | **MISSING** | `MODULE_REGISTRY` has no org/ops module |

### 1.2 What already exists (reuse)

| Concept | Reuse as |
|---------|----------|
| `users` | Authentication identity; task assignee / manager pointer target |
| `tenant_memberships` + `users.workspace_id` | Tenant relationship (active/disabled) |
| `roles` / `role_permissions` | Authorization — extend with ops permissions; do **not** invent parallel ACL |
| CRM `tasks` | **Canonical business task SoR** to extend |
| `GET /api/tasks/unified` | Pattern for Today buckets; Round 1 evolves presentation toward **business-first** |
| `activities` + `logActivity` | Timeline + DPR derivation source |
| Native reminders / notifications | Follow-up reminders |
| `customer_parties`, `leads`, `deals`, `quotes`, `invoices` | Relation targets for tasks + metrics |
| `security_audit_events` | Org/target change audit |
| Dashboard widget framework | My Work / manager widgets later |
| Analytics “team leaderboard” | **Sales revenue ranking only** — do not confuse with org Team |

### 1.3 What is duplicated / confusing

| Collision | Decision |
|-----------|----------|
| CRM `tasks` vs PM `project_tasks` | **Keep both.** Boundary: Business Ops vs Delivery. Never merge write models. |
| `tasks:*` vs `pm.tasks:*` | Keep separate permission namespaces |
| Settings “Team” = users | Rename UX later to **Users & roles**; org lives under Business Ops |
| Analytics “Team” leaderboard | Unrelated to departments/teams |
| `project_members` | Project collaboration, **not** org chart |
| Activity stores (`activities` / `pipeline_activity` / PM comments) | Prefer deriving DPR from primary CRM/activity + task completion; do not invent a third counter table in Round 1 |
| “Automation” (ThinkAIQ v2) vs PM project automations | Nav labeling already a known risk — Business Ops must not add a third “Automation” |

### 1.4 What is incomplete (extend)

| Gap | Round |
|-----|-------|
| Org chart (employee, dept, team, manager) | **R1** |
| CRM task richness (type, priority, outcome, relations, recurrence, assigned_by) | **R1** |
| Today / My Work UX | **R1** |
| Targets + period integrity | **R1** |
| Target security scopes | **R1** |
| DPR UI / submission ritual | **R2** (data mapping designed in R1) |
| Commission engine | **R2** (hooks only in R1) |
| Meetings calendar product | **R2** if still required |
| CRM task board/calendar views | R1 list/Today first; board/calendar polish can land R1 late or R2 |

### 1.5 What must NOT be rebuilt

- Second login identity for employees  
- Second customer / deal / invoice / ledger  
- Second task write model that replaces PM  
- Second entitlement/module system outside `MODULE_REGISTRY` + `workspace_modules`  
- Second finance money path for commissions  
- Automation engine / Round 2B surfaces  

### 1.6 Requirements mapping (status)

| ID | Requirement | Code today | Round |
|----|-------------|------------|-------|
| REQ-TM-001 | Employees, departments, teams, designations | Missing | **R1** |
| REQ-TSK-001 | Tasks list/calendar/board | Partial dual systems | **R1** business surface; PM stays |
| REQ-TSK-002 | Follow-ups + reminders + recurrence | Partial | **R1** |
| REQ-TSK-003 | Meetings & calendar | Mostly missing | **R2** (prep only) |
| REQ-DPR-001 | DPR + targets | Missing | Targets **R1**; DPR **R2** |
| REQ-COM-001 | Commissions | Missing | Hooks **R1**; engine **R2** |
| REQ-NTF-001 | Notifications | Exists | Reuse |

---

## 2. Canonical product model

### 2.1 Identity stack (locked)

```text
User                    → authentication identity (login, MFA, session)
TenantMembership        → user ↔ tenant access (invited/active/disabled)
Role / Permissions      → authorization
EmployeeProfile         → business/organizational identity (1:1 user per tenant)
Department / Team       → org structure
BusinessTask (CRM tasks)→ daily sales/ops work
ProjectTask (PM)        → delivery/execution work (out of Business Ops write scope)
TargetPeriod / Target   → goals with historical integrity
```

**Employee decision (canonical):**  
Employee is a **profile over an existing tenant user**, not a separate identity.

| Rule | Detail |
|------|--------|
| Link | `employee_profiles.user_id` → `users.id` (unique per `workspace_id`) |
| Login | Only via `users`; invite flow creates user → optional auto-create employee profile |
| External workers without login | **Out of Round 1** (no shadow users). If needed later: invited user with limited role |
| Platform ops users | `platform_users` stay out of tenant org chart |

### 2.2 Core entities (logical)

| Entity | Purpose |
|--------|---------|
| **Department** | Org unit (Sales, Accounts, Support) |
| **Team** | Sub-group under a department (or tenant-wide if dept optional) |
| **EmployeeProfile** | Org fields + manager + status |
| **Reporting edge** | Primary manager; history on change |
| **BusinessTask** | Extended CRM task (follow-up, call, …) |
| **TaskAssignment** | Owner + assigned_by (fields on task; no parallel assignment table required in R1) |
| **Follow-up** | Task type + due/reminder semantics (not a separate root entity) |
| **TargetDefinition** | Metric + scope + period template |
| **TargetPeriod** | Immutable period instance (daily/weekly/monthly window) |
| **Target** | Goal value for subject × period × metric |
| **AchievementSnapshot** | Derived (or cached) actuals for a closed period |
| **PerformanceSummary** | Read model / API aggregation (R1 thin; R2 dashboards) |

### 2.3 Module packaging

| Decision | Value |
|----------|-------|
| Module id | **`ops`** (Business Operations) |
| Display name | **Operations** (or **Team & Work** in nav) |
| Why not `team` | Avoid collision with Settings “Team”, analytics “team”, messaging teams |
| Registry | New `OPS_MODULE` in `packages/modules` with `defaultEnabled: true` (or installer-gated later) |
| Entitlement | Existing `workspace_modules` — follow Phase 6.5 pattern (seed + backfill-missing; never flip intentional disable) |
| Spec alias | Document maps historical `TEAM_DPR` `team` → `ops` |

---

## 3. Departments / teams / hierarchy

### 3.1 Org tree (example)

```text
Tenant (Company)
├── Sales (Department)
│   ├── Enterprise (Team)
│   │   ├── Manager (Employee) ← primary manager of team
│   │   ├── Executive A
│   │   └── Executive B
│   └── SMB (Team)
├── Accounts (Department)
└── Support (Department)
```

### 3.2 Cardinality (explicit)

| Relation | Rule |
|----------|------|
| Employee → Department | **One primary department** (`primary_department_id`, required when active) |
| Employee → additional departments | **Optional** via `employee_department_memberships` (secondary, non-primary) — Round 1 may ship primary-only and defer secondary M:N if schedule tight |
| Employee → Team | **0..N** via `team_members` (primary team optional flag) |
| Team → Department | **Exactly one** department (team cannot float across depts in R1) |
| Employee → Manager | **Exactly one primary manager** (`manager_employee_id`, nullable for top-of-tree / owner) |
| Manager cycles | Forbidden (API validation + DB check constraint / app-level DFS) |
| Status | Department/Team/Employee: `active` \| `inactive` (soft; no hard delete of historical targets) |

### 3.3 Manager history

When `manager_employee_id` changes:

1. Write `employee_reporting_history` row: `{ employee_id, from_manager_id, to_manager_id, effective_at, changed_by }`  
2. Emit security audit event  
3. **Do not rewrite** past target periods or closed achievement snapshots  

Same pattern for primary department / team primary changes that matter for reporting.

### 3.4 Tenant isolation

Every org table includes `workspace_id` (or `tenant_id` dual-read consistent with tenancy foundation). All queries filter by authenticated workspace. No cross-tenant joins.

---

## 4. Employee profile (non-HR)

### 4.1 In-scope fields

| Field | Notes |
|-------|-------|
| `user_id` | Required unique per workspace |
| `employee_code` | Optional tenant-unique string |
| `display_name` | Defaults from `users.name`; overridable |
| `designation` | Free text or small designation catalog (R1: free text OK; optional `designations` table if needed) |
| `primary_department_id` | FK |
| `primary_team_id` | Optional FK |
| `manager_employee_id` | FK → employee_profiles |
| `joined_on` | Optional date |
| `status` | `active` \| `inactive` |
| `work_email` / `work_phone` | Optional; may mirror user email |
| `commission_eligible` | Boolean **hook** only (no rules engine) |
| `target_owner` | Implicit: profile is target subject when active |

### 4.2 Out of scope (explicit)

Payroll · salary · attendance · leave · biometrics · recruitment · full HRMS · benefits.

---

## 5. Unified business tasks / follow-ups

### 5.1 Boundary (locked)

| Domain | SoR | Client nav home |
|--------|-----|-----------------|
| **Business / CRM tasks** | Extended `tasks` table | Operations → Today / My Work; CRM entity side panels |
| **Project / Delivery tasks** | `project_tasks` | Projects → task board/list/calendar |
| **Unified read** | Optional inclusion of PM items in Today with **source badge** | Never imply PM writes go through CRM task API |

**Do not break PM tasks.** Round 1 may enhance `tasks-unified` for presentation but must preserve separate write paths and permissions.

### 5.2 Business task types

`follow_up` · `call` · `demo` · `meeting` · `payment_follow_up` · `onboarding` · `renewal` · `support` · `internal` · `other`

### 5.3 Required fields (logical schema — extend CRM `tasks`)

| Field | Required | Notes |
|-------|----------|-------|
| `workspace_id` | yes | Tenant scope |
| `title` | yes | |
| `task_type` | yes | enum above |
| `owner_id` / `assignee_id` | yes | Existing assignee |
| `assigned_by_id` | yes on create | Defaults to actor |
| `due_at` | preferred | Evolve from date-only `due_date` → timestamptz where feasible |
| `priority` | yes | Align with unified enum: URGENT/HIGH/MEDIUM/LOW/NONE |
| `status` | yes | Expand beyond todo/done: `open` · `in_progress` · `done` · `cancelled` (map legacy todo→open, done→done) |
| `related_lead_id` | no | |
| `related_customer_party_id` | no | Prefer over raw contact when known |
| `related_deal_id` | no | Prefer explicit deal FK over opaque `record_id` where possible; keep `record_id` for pipeline compatibility |
| `related_quote_id` | no | |
| `related_invoice_id` | no | |
| `notes` / `body` | no | |
| `recurrence_rule_id` | no | New CRM-side recurrence (do not reuse PM table writes) |
| `reminder_at` / reminder policy | no | Hook native reminders |
| `completed_at` | set on done | |
| `completion_outcome` | no | Short enum/text: completed / no_answer / rescheduled / won_step / lost_step / other |
| `contact_id` | legacy | Keep for backward compatibility |

### 5.4 Recurrence

- **Round 1:** Introduce business-task recurrence (RRULE or simple daily/weekly/monthly) generating next open task on completion or schedule — **separate** from `recurring_task_rules` (PM).  
- Reuse notification/reminder infrastructure for due alerts.

### 5.5 Nav clarity

| Label | Points to |
|-------|-----------|
| **Today** / **My Work** | Business tasks (ops) |
| **CRM → Tasks** | Same business SoR (list); eventually deep-link into ops views |
| **Projects → Tasks** | Delivery only |
| **Automation** | ThinkAIQ Automation v2 only — never “ops automation” |

---

## 6. Follow-up UX — “Today”

### 6.1 Primary working view

Salesperson opens ThinkAIQ → **Today**:

| Bucket | Definition |
|--------|------------|
| Overdue | `due_at < startOfToday` ∧ not done |
| Due today | due within today |
| Upcoming | next 7 days (configurable) |
| High priority | URGENT/HIGH in open set |

Timeline example:

```text
09:30 — Call ABC Corp
11:00 — Follow up XYZ
14:00 — Send quote
16:00 — Payment follow-up INV-1042
```

### 6.2 Interactions

| Action | Behavior |
|--------|----------|
| Complete | status done + `completed_at` + optional outcome; activity `task_done` |
| Reschedule | change `due_at`; audit if manager-forced |
| Reassign | change owner; requires permission; audit |
| Create follow-up | quick form: type, who, when, related entity |
| Recurring | toggle/rule on create/edit |
| Reminder | default relative to due (reuse native reminders) |
| Context | chips linking Lead / CustomerParty / Deal / Quote / Invoice |

### 6.3 Filters

Owner (self/team/dept for managers) · type · priority · status · related entity · overdue only · period.

### 6.4 Assignment rules

- Default owner = creator  
- Managers with `ops.tasks.assign` can assign within managed subtree  
- Admins with broader scope can assign tenant-wide  
- Employees see own tasks by default (existing CRM pattern)

---

## 7. Targets

### 7.1 Subjects

`employee` · `team` · `department` · `tenant`

### 7.2 Periods

`daily` · `weekly` · `monthly`

Each concrete window is a **TargetPeriod** with `period_start` / `period_end` (half-open `[start, end)`).

### 7.3 Metric configuration (extensible — not hardcoded)

`target_metrics` (or enum + JSON config) registry examples:

| Metric key | Derivation source (preferred) |
|------------|-------------------------------|
| `leads.created` | `leads` created_at |
| `leads.contacted` | activities/calls linked to leads |
| `leads.qualified` | lead status transitions |
| `demos.completed` | tasks type=demo completed **or** activity meeting/demo |
| `proposals.sent` | quotes sent |
| `deals.won` | deals won |
| `revenue.won` | won deal amounts |
| `collections.received` | payments (Finance SoR) |
| `tasks.completed` | business tasks completed |
| `followups.completed` | business tasks type follow_up/call completed |

**Rule:** Metrics are **configured**, not hardcoded into one sales KPI. New metrics = registry entries + calculator — not schema forks.

### 7.4 Measures

For each Target:

| Field | Meaning |
|-------|---------|
| `goal_value` | Target |
| `actual_value` | Derived (or cached) |
| `remaining` | `max(goal - actual, 0)` |
| `pct_achieved` | `actual / goal` (null if goal=0) |

### 7.5 Historical integrity (critical)

| Event | Behavior |
|-------|----------|
| Edit goal on **open** period | Allowed with audit; actuals recompute |
| Edit goal on **closed** period | **Forbidden** (or creates **new revision** without mutating closed snapshot) |
| Close period | Persist `achievement_snapshots` with actuals + calculator version |
| Manager change mid-period | Does not rewrite closed snapshots; open period subject remains employee/team id |

Changing a target later **must not rewrite** historical performance.

---

## 8. Target security (RBAC)

Use existing RBAC; proposed permission keys under `ops.*`:

| Permission | Who (default seeds) | Capability |
|------------|---------------------|------------|
| `ops.employees.view` | admin, member (scoped) | View employee directory (policy-scoped) |
| `ops.employees.manage` | admin | CRUD employees/org links |
| `ops.departments.manage` | admin | Depts/teams structure |
| `ops.tasks.view` | member+ | View tasks in scope |
| `ops.tasks.manage` | member+ | Create/edit own; assign if granted |
| `ops.tasks.assign` | manager-equivalent, admin | Assign within subtree |
| `ops.targets.view_own` | member | Own targets |
| `ops.targets.view_team` | manager | Direct reports / team |
| `ops.targets.view_department` | dept manager / admin | Department |
| `ops.targets.view_company` | admin | Tenant rollup |
| `ops.targets.manage` | admin (+ optional manager create for reports) | Create/edit open targets |

**Privacy default:** Employees do **not** see peers’ private performance unless granted team/dept/company view. Manager sees **managed subtree** only.

Map “Manager” to: employee with direct reports **or** custom role with team/dept target permissions — not a hardcoded role enum (runtime roles are DB-defined).

---

## 9. Performance foundation (pre-DPR)

### 9.1 Prefer system-derived metrics

| Kind | Examples | Storage |
|------|----------|---------|
| **System-derived** | leads created, deals won, tasks completed, payments collected | Query CRM/Finance/tasks/activities; optional cache in snapshots |
| **Manually submitted** | qualitative notes, exceptions, “calls made” when telephony absent | Round 2 DPR entry fields — **not** R1 product |

Round 1 ships **derivation contracts + target actuals computation** for configured metrics; not a DPR form.

### 9.2 Feeds (later consumers)

- DPR daily rollup  
- Manager dashboard  
- Target vs achievement  
- Productivity views  
- Commission eligibility evaluation  

---

## 10. DPR preparation (design only — no R1 UI)

Future DPR day card should show counts for:

Calls · Follow-ups · Leads · Qualified leads · Demos · Proposals · Deals · Revenue · Tasks · Meetings

### 10.1 Event / data mapping (avoid duplicate counters)

| DPR line | Preferred SoR |
|----------|---------------|
| Calls | `activities` type `call` (+ future telephony outcomes) |
| Follow-ups | business tasks `follow_up` completed / due |
| Leads | `leads` created / status |
| Qualified leads | lead status history |
| Demos | tasks `demo` completed or tagged activities |
| Proposals | `quotes` sent/accepted |
| Deals | `deals` created/won |
| Revenue | won deal value / invoice paid (define metric config carefully) |
| Tasks | business tasks completed |
| Meetings | `activities` type `meeting` |

**Do not** maintain parallel `dpr_counters` that diverge from CRM. Optional `dpr_entries` in Round 2 stores **manual overlays + attestation**, with system lines computed live or snapshotted.

---

## 11. Commission preparation (hooks only)

Round 1 fields / future join keys only:

| Hook | Notes |
|------|-------|
| `employee_profiles.commission_eligible` | Gate |
| Eligible event ref | e.g. `deal.won`, `payment.received` (config later) |
| `commission_rule_id` | Nullable FK placeholder or opaque string until R2 |
| `base_metric` / `base_amount` | From deal/payment — **Finance remains money SoR** |
| `status` | `pending` \| `approved` \| `paid` \| `void` (R2) |

**No** second ledger. Commission lines later post into Finance as payable documents if product requires — never shadow GL.

---

## 12. Dashboard / UX screen map

### 12.1 Client-facing views (Round 1)

| View | Route (proposed) | Audience |
|------|------------------|----------|
| Today | `/ops/today` | Everyone |
| My Work | `/ops/my-work` | Everyone |
| My Tasks | `/ops/tasks` | Everyone |
| Employees | `/ops/employees` | Admin / managers (scoped) |
| Departments | `/ops/departments` | Admin |
| Teams | `/ops/teams` (or nested under dept) | Admin |
| Targets | `/ops/targets` | Scoped by permission |
| Performance summary | `/ops/performance` | Thin R1: own + manager subtree |

### 12.2 Experience matrix

| Persona | Sees |
|---------|------|
| **Employee** | Today, my tasks/follow-ups, my target, my progress |
| **Manager** | Team workload, overdue team tasks, team target vs achievement, team activity (subtree) |
| **Admin** | Departments, teams, employees, target configuration, permissions (via existing Roles UI) |

Hide technical ids, calculator versions, and engine jargon from normal users.

### 12.3 Sidebar

New **Operations** group (module `ops`), children: Today · My Work · Tasks · Employees · Departments · Targets.  
Do not bury org under Settings Users.

---

## 13. Mobile UX (390 / 768 / 1280)

| Breakpoint | Priority |
|------------|----------|
| **390** | Today list, swipe/complete, reschedule sheet, target % ring, quick add follow-up |
| **768** | Split: list + detail; manager overdue strip |
| **1280** | Full manager panels: workload + targets + activity |

Manager mobile: overdue team tasks + target status first; deep org editing is desktop-primary.

---

## 14. Automation integration (contracts only — no runtime changes)

Document future events/actions; **do not** modify Automation engine in Round 1.

### Future events

`ops.employee.assigned` · `ops.employee.manager_changed` · `ops.task.created` · `ops.task.completed` · `ops.task.overdue` · `ops.target.updated` · `ops.target.reached`

### Future actions

`ops.task.create` · `ops.task.assign` · `notify.manager` (likely via existing notify Class A)

ADR-027 still applies to any future Class B ops actions.

---

## 15. CRM / Finance relationships

Always reference existing canonical IDs:

| Domain | ID |
|--------|-----|
| Tenant | `workspace_id` / `tenant_id` |
| User | `users.id` |
| Employee | `employee_profiles.id` |
| Customer | `customer_parties.id` |
| Lead / Deal / Quote / Invoice | existing tables |

**Forbidden:** duplicate customer, deal, invoice, or private money ledger for ops/commissions.

---

## 16. Reporting (R1 foundation, not BI)

### Round 1 reports (simple)

- Individual / team / department target vs actual  
- Task completion rate  
- Overdue work  
- Activity summary (thin, from `activities` + tasks)

### Filters

Period · employee · team · department · manager (subtree).

**Out of scope:** full report builder / BI studio.

---

## 17. Tenant isolation

| Entity | Scope key | Enforcement |
|--------|-----------|-------------|
| employee_profiles, departments, teams, team_members | `workspace_id` | Middleware + every query |
| business tasks | existing `tasks.workspace_id` | Keep |
| targets / periods / snapshots | `workspace_id` | Keep |
| performance APIs | derive only in-tenant | Integration tests |

No cross-tenant access. Live isolation tests mandatory (same pattern as CRM/Finance).

---

## 18. Audit

Use `security_audit_events` (+ activity where user-visible).

| Must audit | |
|------------|--|
| Employee create/link/unlink | |
| Manager change | + reporting history row |
| Department / team membership change | |
| Target create / modify / close | |
| Sensitive task reassignment | |
| Grants of `ops.targets.view_*` beyond own | via roles UI already audited where present |

Payload snapshot in `meta` for material changes.

---

## 19. What should NOT be built (either round unless forced)

- Payroll / salary / attendance / leave / biometrics / recruitment / full HRMS  
- WhatsApp / Voice / AI automation  
- Full commission engine in Round 1  
- Subscription billing  
- Automation runtime changes  
- Fake seed performance numbers  

---

## 20. Implementation split (exactly two rounds)

### ROUND 1 — Foundation (this plan’s implementation scope)

1. Module `ops` + permissions + entitlement seed/backfill pattern  
2. Employee profiles + departments + teams + manager hierarchy + history  
3. Extend CRM business tasks (types, priority, relations, outcomes, recurrence foundation)  
4. Today / My Work UX (business-first)  
5. Targets + periods + metric registry + actuals derivation for core metrics  
6. RBAC scopes (own / team / dept / company)  
7. Audit + tenant isolation  
8. Commission eligibility hook field only  
9. DPR **mapping docs** only (no DPR UI)  
10. Automation **event/action contract appendix** only  

### ROUND 2 — Performance & money hooks

1. DPR UI + manual overlays + attestation  
2. Manager/team performance dashboards  
3. Richer target analytics / trends  
4. Commission engine (Finance-authoritative payouts)  
5. Meetings/calendar product if still required  
6. Operational reporting pack  

**Do not** invent micro-phases between R1 and R2.

---

## 21. Testing strategy

| Layer | Cases |
|-------|-------|
| **Unit** | Hierarchy cycle detection; period close immutability; metric calculators; task status mapping; visibility scope helpers |
| **API** | Employee CRUD; dept/team; task extend; Today buckets; targets CRUD; permission denials |
| **Live tenant isolation** | Two tenants; zero leakage on employees/tasks/targets |
| **RBAC** | Member own-only; manager subtree; admin company; disabled module |
| **Task assignment** | Assign within/outside subtree |
| **Manager hierarchy** | History rows on change; no cycle |
| **Target period integrity** | Closed period reject mutate; snapshots stable |
| **Performance derivation** | Deal won increments revenue metric; no double count |
| **Regression** | Existing CRM task APIs; PM tasks untouched; Finance unchanged; Automation suites green |

---

## 22. Migration strategy (design only — do not apply in this step)

1. Add `ops` to `MODULE_REGISTRY` + seed/backfill-missing `workspace_modules` (Phase 6.5 pattern).  
2. Create org tables: `departments`, `teams`, `team_members`, `employee_profiles`, `employee_reporting_history` (+ optional secondary dept memberships / designations).  
3. Expand `tasks` columns (nullable for backward compatibility); migrate `todo`→`open` carefully or dual-read.  
4. Add business recurrence tables (not PM).  
5. Add `target_metrics`, `target_periods`, `targets`, `achievement_snapshots`.  
6. Backfill: for each active `tenant_membership`/`users` row, optionally create `employee_profiles` (admin-gated or auto for active members — **product choice:** recommend **auto-create stub profile** for active members on first ops enable to reduce empty org friction).  
7. Do **not** migrate PM tasks into CRM tasks.  

---

## 23. Round 1 implementation order

1. Module + permissions + empty nav shell  
2. Org schema + APIs (departments → teams → employees → manager)  
3. Audit + isolation tests for org  
4. Business task schema extension + API/compat layer  
5. Today / My Work UI  
6. Target schema + metric calculators (core set) + APIs  
7. Target RBAC + UI  
8. Widgets (overdue / my target %)  
9. Regression CRM + PM + Automation  
10. Implementation report + gate sheet  

---

## 24. Exact files / packages expected to change (Round 1 implementation)

| Area | Likely paths |
|------|----------------|
| Module definition | `packages/modules/src/ops/**`, `packages/modules/src/index.ts` |
| DB | `packages/db/src/schema.ts`, new migrations under `packages/db/migrations/` |
| API routes | `apps/api/src/routes/ops-*.ts` or `employees.ts`, `departments.ts`, `targets.ts`; extend `tasks.ts`, evolve `tasks-unified.ts` |
| Lib | metric calculators, hierarchy helpers, seed-modules entitlement ensure |
| Web module | `apps/web/modules/ops/**` |
| Routes | `apps/web/app/(dashboard)/ops/**` |
| Sidebar | `apps/web/modules/shared/components/Sidebar.tsx`, sidebar layout keys |
| Tests | `apps/api/src/__tests__/ops-*.ts`, db migration policy tests, web empty-state/unit helpers |
| Docs | Round 1 implementation report (future); update gap audit after ship |
| **Do not touch** | `@vencore/automation-engine` runtime, PM write paths, Finance journals, Voice/WhatsApp |

---

## 25. Risks and edge cases

| Risk | Mitigation |
|------|------------|
| Dual task confusion | Clear nav labels + source badges; docs; never write PM via CRM API |
| Settings “Team” vs org Team | Rename settings entry; module id `ops` |
| Expanding `tasks.status` breaks clients | Compat mapping layer; versioned API fields |
| Auto employee profiles for every user | Only active memberships; inactive users → inactive profiles |
| Manager subtree performance | Materialized path or recursive CTE with indexes; cache later |
| Metric double-counting | Single calculator ownership per metric key; tests |
| Target edit rewriting history | Closed period immutability + snapshots |
| Entitlement miss on old tenants | Reuse ensure-missing module pattern |
| Scope creep into HR/DPR/commissions | Gate sheet; reject R2 items in R1 PRs |
| Automation naming collision | Ops events namespaced `ops.*` only |

---

## 26. Final recommendation — next implementation scope

**Accept this plan, then implement Business Operations Round 1 only:**

> **Org foundation (employee/department/team/manager) + extended business CRM tasks + Today/My Work + targets/periods/metric derivation + ops RBAC/audit/tenant isolation.**

**Immediate next coding milestone after acceptance:**

1. Add `OPS_MODULE` to registry + permissions  
2. Migrations for org tables + task column expansion + targets  
3. Org APIs + Today API/UI  
4. Target APIs + own/team visibility  
5. Isolation + RBAC regression suite  

**Defer to Round 2:** DPR UI, commission engine, meetings calendar product, advanced analytics.

**Do not** start Automation R2B, Voice, WhatsApp, or Phase 6.5 expansion in the same stream.

---

## Gate sheet (for post-implementation Round 1 report)

| Gate | Pass criteria |
|------|----------------|
| ORG MODEL | Employees/depts/teams/manager history work, tenant-scoped |
| BUSINESS TASKS | Types/priority/relations/complete/reschedule without breaking PM |
| TODAY / MY WORK | Overdue/today/upcoming usable on mobile + desktop |
| TARGETS | Multi-subject, multi-period, historical integrity |
| RBAC | Own vs team vs dept vs company enforced |
| TENANT ISOLATION | Live two-tenant tests green |
| AUDIT | Manager/target/assignment changes recorded |
| NO DUPLICATE LEDGER / IDENTITY | Verified |
| AUTOMATION UNTOUCHED | Engine suites unchanged |
| REGRESSION CRM/PM/FINANCE | Green |

---

*End of plan — design/audit only. No code, migrations, or database changes were made in producing this document.*
