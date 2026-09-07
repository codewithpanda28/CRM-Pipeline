# REPORTING_ANALYTICS.md — ThinkAIQ

## 1. Purpose

Reporting & analytics across Sales, CRM, Finance, Team, Automation, and Super Admin platform metrics. Dashboards are widget-configurable and role-based.

Module code: `reporting` (+ platform analytics in Super Admin) · Priority: **P1/P2**

---

## 2. Report groups

### Sales

Leads · Conversion · Pipeline · Revenue · Win/loss · Salesperson performance

### CRM

Lead source · Lead conversion · Client growth · Churn

### Finance

Revenue · Expense · Profit · Cash flow · Receivables · Payables · Taxes

### Team

DPR · Targets · Activities · Performance

### Automation

Runs · Success · Failures · Execution time · Most-used workflows

### Platform (Super Admin)

Tenants · MRR/ARR/Churn · Plan distribution · Module adoption · API/automation usage

**Ops reliability (via Platform Ops Center):** MTTA · MTTR · incidents by module/provider · top failing automations · tenant reliability scores

Commercial widgets must not replace Platform Pulse — see [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md).

---

## 3. Dashboard widgets

Total/active clients · New/qualified leads · Pipeline value · Revenue · MRR · ARR · Outstanding · Overdue · Expenses · Profit · Cash flow · Tasks · Follow-ups · Team achievement · DPR · Support tickets · Voice usage

Dashboards must be visually engaging — charts, timelines, health indicators, funnels, trends, heatmaps, drill-downs, workflow diagrams, incident timelines. Avoid dozens of meaningless cards. Goal: **understand the business in seconds.**

Tenant product dashboards remain white-label themed; Super Admin Pulse is platform control-room themed ([PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md)).

---

## 4. Global search & saved views

Search covers: Leads, Contacts, Companies, Clients, Deals, Quotes, Invoices, Payments, Products, Plans, Tasks, Tickets, Documents, Users, Vendors, Voice entities.

Advanced filters: date, status, owner, plan, source, product, payment status, custom fields. Saved views supported.

Implementation may start with DB `ILIKE`/indexes and evolve to search engine.

---

## 5. Activity timeline

Track created/updated/deleted/assigned/called/messaged/emailed/task events/payment/invoice/stage/status changes on major entities.

---

## 6. Performance approach

- Pre-aggregated daily rollups for heavy metrics
- On-demand for narrow filters
- Export via async jobs

---

## 7. Permissions / APIs

`reporting.*.view` with scopes · dashboard layout APIs · export APIs

---

## 8. Related documents

- [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md)
- [SALES_SPECIFICATION.md](./SALES_SPECIFICATION.md)
- [FINANCE_SPECIFICATION.md](./FINANCE_SPECIFICATION.md)
- [TEAM_DPR.md](./TEAM_DPR.md)
