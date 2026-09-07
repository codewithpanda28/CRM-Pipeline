# TEAM_DPR.md — ThinkAIQ

## 1. Purpose

Team structure, Daily Progress Reports (DPR), targets, performance reporting, and configurable commissions/incentives.

Module code: `team` · Priority: **P1** (commissions **P2**)

---

## 2. Team management

Entities: Employees · Departments · Teams · Managers · Designations · Status · Joining information · Roles · Permissions (via RBAC)

---

## 3. DPR metrics

Daily capture / rollup:

Calls · Follow-ups · Leads added · Leads qualified · Demos · Proposals · Deals · Revenue · Tasks · Meetings

Sources: manual entry + automatic activity aggregation where possible.

---

## 4. Targets

Daily · Weekly · Monthly targets per user/team.

Reports: Target vs achievement · Productivity · Team performance · Employee performance

---

## 5. Commissions & incentives (P2)

Support sales, affiliate, partner commissions with **configurable rules** (not hard-coded percentages only).

Rule inputs may include: deal value, product, stage won date, payment collected (cash-based vs booking-based — tenant setting).

---

## 6. User flows

- Manager sets monthly targets
- Employee submits/auto DPR
- Dashboard shows achievement %
- Commission run generates payable lines (finance integration optional)

---

## 7. Data model

`departments`, `teams`, `team_members`, `designations`, `employee_profiles`, `dpr_entries`, `targets`, `commission_rules`, `commission_runs`, `commission_lines`

---

## 8. Permissions

`team.employees.*`, `team.targets.manage`, `team.dpr.view|create`, `team.performance.view`, `team.commissions.configure|approve`

---

## 9. APIs / Events / Reporting

CRUD team structures · DPR submit · targets · performance reports  
Events: `dpr.submitted` · `target.updated` · `commission.calculated`

---

## 10. Related documents

- [RBAC_PERMISSIONS.md](../security/RBAC_PERMISSIONS.md)
- [REPORTING_ANALYTICS.md](./REPORTING_ANALYTICS.md)
- [SALES_SPECIFICATION.md](./SALES_SPECIFICATION.md)
