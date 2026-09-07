# THINKAIQ — Master Requirements Gap Audit

| Field | Value |
|-------|-------|
| Status | **AUDIT ONLY — no code, no migrations, no new phase** |
| Date | 2026-09-06 |
| Canonical requirements | [`docs/product/PRODUCT_REQUIREMENTS.md`](../product/PRODUCT_REQUIREMENTS.md) |
| Traceability (stale statuses) | [`docs/product/REQUIREMENTS_TRACEABILITY.md`](../product/REQUIREMENTS_TRACEABILITY.md) — mostly still `Documented`; **this audit is authoritative for implementation status** |
| Prior related audit | [`THINKAIQ-SALES-REQUIREMENTS-GAP-AUDIT.md`](./THINKAIQ-SALES-REQUIREMENTS-GAP-AUDIT.md) — **Team/DPR rows are STALE** (pre–Ops R1/R2) |
| Positioning | **White-Label Business CRM & Management Platform** — not “AI Voice CRM” |

**Evidence sources (implementation reports):**

- Phase 2A/2B foundation & isolation · ThinkAIQ branding  
- Phase 3A CRM (Deals, Leads, CustomerParty, Products/Quotes)  
- Phase 4 Finance · Phase 5 Production Business Core  
- Phase 6 Automation Round 1 + Round 2A · Phase 6.5 entitlement hardening  
- Business Operations Round 1 + Round 2 (COMPLETE / FROZEN + hardened)  
- ADR-003 / ADR-021 (platform vs tenant billing) · ADR-027 (critical action approval)

**Status legend (exactly one per requirement):**

| Status | Meaning |
|--------|---------|
| **COMPLETE** | Concrete schema/API/UI/tests/report evidence that core acceptance behavior shipped |
| **PARTIAL** | Material pieces exist; named gaps remain |
| **MISSING** | No meaningful product surface (tables/APIs/UI) for the requirement |
| **FUTURE / OPTIONAL** | Intentionally deferred by priority, ADR, or phase non-goals (Voice, WhatsApp, AI, reseller, etc.) |

Do **not** infer COMPLETE merely because a related feature exists.

---

## A. Executive summary

ThinkAIQ already has a **credible multi-tenant business core**:

- Enforced tenant isolation (live suites green across CRM/Finance/Accounting/Ops)
- Canonical **CustomerParty** identity + Client 360
- Sales pipeline (pipelines/deals) + products + quotes → invoice
- Tenant **Finance World 2** (invoices, payments, vendors, expenses, CN/DN, recurring) + **double-entry GL**
- Branded commercial PDF engine, notifications bus, MFA, security audit foundations
- **Automation engine** (R1 + R2A guided UX) with **ADR-027** human-in-the-loop approvals
- **Operations module** (org chart, business tasks, targets, DPR, performance) — R1+R2 COMPLETE

It is **not yet “first paying client complete”** for every fantasy in the master PRD. The highest-impact open gaps for a sales/ops–led SMB are:

1. **Global CRM search** (REQ-CRM-008)  
2. **Lead bulk import/export + scoring polish** (REQ-CRM-002 / scoring)  
3. **Tenant customer subscriptions** if the client sells recurring plans (REQ-BIL-001/002) — *not* platform SaaS billing  
4. **Sales forecasting** (REQ-SAL-003)  
5. **Automation depth** (richer actions/triggers) beyond R2A guided builder  
6. **Platform commercial plans enforcement** (ThinkAIQ monetization World 1 — separate ledger)

Voice, WhatsApp, AI assistant, reseller, and commission **engine** are **not** first-client blockers for the core Business SaaS.

**Architecture held:** CRM `tasks` = business-task SoR · PM `project_tasks` untouched · Finance commercial docs + journals = money SoR · Automation does not auto-approve critical actions · Platform billing ≠ tenant finance (ADR-003/021).

---

## B. Requirement coverage table

### Explicit architecture validations

| Claim | Status | Evidence | Notes |
|-------|--------|----------|-------|
| Multi-tenant isolation | **COMPLETE** | Phase-2B 40/40; Phase-5 50/50 live; ops/CRM/finance isolation suites | Continuous coverage as new routes ship |
| CustomerParty canonical identity | **COMPLETE** | ADR-024/025; `customer_parties`; 360 APIs/UI; Phase-3A-3 | Stronger than legacy “Client” wording |
| CRM tasks = business-task SoR | **COMPLETE** (Ops path) | Ops R1/R2; CRM `tasks` + `business_task_recurrence_rules` | PM tasks remain a **separate** SoR |
| Finance ledger = financial SoR | **COMPLETE** (commercial + GL) | Phase-4 finance + Phase-5 journals/periods/postings | Management accounting, not certified filing |
| Automation approval policy (ADR-027) | **COMPLETE** (policy + engine gate) | ADR-027 Accepted; approvals inbox; Class C hard-block | Money mutations stay domain-owned |
| Operations module (`ops`) | **COMPLETE** (R1+R2 scope) | Ops R1/R2 reports; `/ops/**`; permissions | Not full HRMS |
| White-label architecture | **PARTIAL** | ADR-018; `tenant_branding`; ThinkAIQ identity | Custom domain SSL / email parity polish |
| Platform billing vs tenant finance | **Policy COMPLETE; World 1 PARTIAL/MISSING** | ADR-003/021; World 2 shipped; `plans`/`platform_subscriptions` absent | Must not collapse ledgers |

---

### 1. Platform & White-label SaaS Architecture

| ID | Requirement | Status | Exists | Missing / why |
|----|-------------|--------|--------|---------------|
| REQ-PLT-001 | Multi-tenant isolation | **COMPLETE** | Workspace scoping + live isolation matrix | Continuous expansion only |
| REQ-PLT-002 | White-label branding | **PARTIAL** | Name/logo/colors/login foundations; branding routes | Custom domain SSL polish; email branding completeness |
| REQ-PLT-018 | ThinkAIQ CRM default identity | **COMPLETE** | Platform brand mark/meta; no customer-facing Vencore | Internal `@vencore/*` packages OK |
| REQ-PLT-019 | Responsive / future mobile identity | **PARTIAL** | Responsive shell | Native/Play Store app deferred |
| REQ-PLT-003 | Super Admin console | **PARTIAL** | Platform tenants/outbox/audit APIs + ops docs | Full commercial lifecycle console UX |
| REQ-PLT-013 | Platform Ops Center | **PARTIAL** | Tenant ops/health/export fragments | Full visual Platform Pulse / incident console |
| REQ-PLT-014 | Tenant/module health, errors, timelines | **PARTIAL** | Health, failed jobs, alerts | Unified error groups + timelines product |
| REQ-PLT-015 | Incidents + blast radius | **MISSING** | Spec / fragments | Expected: `platform_incidents*` SoR + SA UI — never built |
| REQ-PLT-016 | Automation failure lane + recovery | **PARTIAL** | Dead letters + run failures | SA failure lane + recovery playbooks |
| REQ-PLT-004 | Role hierarchy + custom roles | **COMPLETE** | Admin/Member + custom roles; Manager template (Ops R2) | Label polish only |
| REQ-PLT-005 | Granular RBAC verbs | **PARTIAL** | Module permissions + middleware | Export/import/approve not uniform on all entities |
| REQ-PLT-006 | Module entitlement engine | **PARTIAL** | `workspace_modules` + registry; Phase 6.5 automation backfill | Commercial plan→module packaging incomplete |
| REQ-PLT-007 | Auth + sessions | **COMPLETE** | Auth + MFA (Phase-5) | Continuous hardening |
| REQ-PLT-008 | Security audit log | **PARTIAL** | `security_audit_events`; finance/ops coverage | Unified explorer for all sensitive actions |
| REQ-PLT-009 | Soft-delete + metadata | **PARTIAL** | Many `deleted_at` columns | Not universal; trash UX incomplete |
| REQ-PLT-010 | Storage abstraction | **COMPLETE** | File adapters + isolation tests | — |
| REQ-PLT-011 | Jobs + scheduler | **COMPLETE** | BullMQ job-runtime + workers | Business-calendar sophistication |
| REQ-PLT-012 | Observability foundations | **PARTIAL** | Logs/alerts/ops | APM-grade product |
| REQ-PLT-017 | Autonomous OS posture | **PARTIAL** | Outbox + automation v2 | Many modules still under-automated |
| REQ-TNT-001 | Tenant entity | **COMPLETE** | `tenants` + settings/modules/branding links | — |
| REQ-TNT-002 | Tenant statuses | **PARTIAL** | provisioning/active/suspended/archived/deleting | Spec Trial/Expired/Cancelled commercial UX |
| REQ-TNT-003 | Provisioning flow | **PARTIAL** | Setup + seed | Guided plan→modules→domain→admin wizard |
| REQ-TNT-004 | Platform vs tenant settings | **COMPLETE** | Separated surfaces | — |
| REQ-TNT-005 | Domains | **PARTIAL** | `tenant_domains` foundations | Production SSL workflow (**FUTURE polish**) |

---

### 2. Main Dashboard

| Topic | Status | Exists | Missing |
|-------|--------|--------|---------|
| Configurable dashboards / widgets | **PARTIAL** | Dashboard layouts/widgets (`/dashboard`, settings dashboards) | Sales/finance KPI pack completeness; no-code report builder (REQ-CUS-004) |

---

### 3. CRM & Client Management

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-CRM-001 Leads | **PARTIAL** | CRUD, source, owner, status, notes, custom_fields | Score engine; tags/attachments productization |
| REQ-CRM-002 Assign/dedup/bulk | **PARTIAL** | Assignment + duplicate hints | Bulk import/export/actions |
| REQ-CRM-003 Conversion lineage | **COMPLETE** | Convert + `lead_conversion_links` incl. party | Edge UX polish |
| REQ-CRM-004 Contacts & Companies | **COMPLETE** | Full modules | Multi-contact polish |
| REQ-CRM-005 Client 360 | **COMPLETE** | CustomerParty 360 (+ finance ext) | — |
| REQ-CRM-006 Notes/tags/fields/attachments | **PARTIAL** | Uneven across entities | Uniform attachment/custom-field product |
| REQ-CRM-007 Activity timeline | **PARTIAL** | `/activity` + pipeline activity | Equal richness on all CRM/finance entities |

---

### 4. Sales Pipeline & Deal Management

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-SAL-001 Kanban pipelines | **COMPLETE** | Pipelines/stages/Kanban | Probability UX consistency |
| REQ-SAL-002 Deals | **COMPLETE** | Value/currency/owner/stage + party | “Next action” productization |
| REQ-SAL-003 Forecasting | **MISSING** | — | Weighted pipeline forecast API/UI — never shipped |
| Legacy pipeline automations | **COMPLETE** (island) | `pipeline-automations` | Must stay labeled vs Automation v2 |

---

### 5. Lead Management

Covered primarily by REQ-CRM-001–003. Additional:

| Topic | Status | Missing |
|-------|--------|---------|
| Lead scoring engine | **MISSING** / thin | Rules engine (schema has `rating`, not score product) |
| Lead source analytics | **PARTIAL** | Dedicated source performance reports |

---

### 6. Plans, Products & Subscriptions

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-SAL-005 Products catalog | **COMPLETE** (core) | Products CRUD; kinds product/service/package/plan | BOM/package composition; billing package depth |
| REQ-BIL-001 Customer subscriptions | **MISSING** | — | Tenant customer subscription SoR (cycles/trial/renewal) — expected under tenant billing World 2+, not built |
| REQ-BIL-002 Subscription lifecycle | **MISSING** | — | Depends on BIL-001 |
| REQ-BIL-003 Platform commercial plans | **PARTIAL** | ADR-021; `tenants.plan_id`; module entitlements | `plans` / `plan_modules` / platform subscriptions enforcement |
| REQ-BIL-004 Usage metering | **PARTIAL** | Automation usage counters | Cross-module metering + overage billing |

> **Keep separated:** Platform SaaS billing (World 1) ≠ tenant billing of end customers (World 2). ADR-003/021.

---

### 7. Accounting & Billing (tenant finance)

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-FIN-001 Finance dashboard | **PARTIAL** | Reports board + KPIs/GL | Single cash-flow “finance home” story |
| REQ-FIN-002 Invoicing + branded PDF | **COMPLETE** | Lifecycle, PDF, branding snapshot | Email-send polish |
| REQ-FIN-010 Estimates/orders/recurring/CN/DN | **PARTIAL** | CN/DN + recurring schedules | First-class estimates/orders |
| REQ-FIN-011 History protection | **COMPLETE** | Void/reverse; no unsafe erase | — |
| REQ-FIN-003 Payments/refunds | **COMPLETE** | Full/partial/refund + recompute | Method config depth |
| REQ-FIN-004 AR aging + reminders | **PARTIAL** | AR aging; native reminders | Fully productized reminder campaigns |
| REQ-FIN-008 GST/tax | **PARTIAL** | India-ready fields; CGST/SGST/IGST paths | Full configurable tax engine / filing cert |
| REQ-FIN-009 Reports + export | **PARTIAL** | TB/P&L/BS/CF + commercial reports | Export packaging completeness |
| Accounting / GL SoR | **COMPLETE** (Phase-5) | Journals, periods, postings, reports | Not certified GAAP/GST filing |

---

### 8. Expense & Vendor Management

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-FIN-007 Vendors | **COMPLETE** | Vendors CRUD | Deep vendor 360 |
| REQ-FIN-006 Expenses | **PARTIAL** | Expenses + GL post | Approval + recurring expense product |
| REQ-FIN-005 AP / vendor bills | **PARTIAL** | Expenses-first AP + AP register | Dedicated `vendor_bills` → pay flow (explicitly deferred in Phase-4) |

---

### 9. Team, Employee & DPR

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-TM-001 Employees/depts/teams | **COMPLETE** | Ops R1: `employee_profiles`, departments, teams, designation field, manager history, UI | Designation master catalog (free-text only); multi-dept |
| REQ-DPR-001 DPR + targets | **COMPLETE** | Ops R2: DPR lifecycle, targets, performance, TZ windows | Automation outbox `ops.dpr.submitted` (deferred) |
| REQ-COM-001 Commission rules | **PARTIAL** | `commission_eligible` + record-only hooks | Commission engine, amounts, payout ledger (**intentionally out of R2**) |

---

### 10. Tasks & Follow-ups

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-TSK-001 Task views | **PARTIAL** | Ops Today/My Work/Tasks list; CRM tasks; PM tasks | Unified board + calendar product |
| REQ-TSK-002 Follow-ups / recurrence | **PARTIAL** | `reminder_at`, business recurrence rules, complete→spawn | First-class follow-up UX; reminder delivery depth |
| REQ-TSK-003 Meetings & calendar | **MISSING** | Activity type `meeting` only | Meetings module + calendar — **explicit Ops R2 non-goal** |

---

### 11. Document Management

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| Commercial PDF engine | **COMPLETE** | Quote/Invoice/CN/DN via DocumentRenderer | — |
| REQ-DOC-001 DMS versions/ACL | **PARTIAL** | Templates + artifacts | Versioned file library + ACL product |
| REQ-CUS-005 Templates/numbering | **PARTIAL** | Doc templates + number sequences | Email/WA templates; business calendar |

---

### 12. Support & Ticket Management

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-SUP-001 Helpdesk | **MISSING** | Spec only (`SUPPORT_HELPDESK.md`) | Tickets tables/routes/UI/SLA — never started |

---

### 13. Notifications & Automation

#### Notifications

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-NTF-001 Notification system | **COMPLETE** (core bus) | In-app + prefs + deliveries (Phase-5 PASS) | Deep multi-channel email/SMS/WA |
| REQ-MSG-001 Communication center | **PARTIAL** | Internal messaging | Omnichannel email/WA/SMS/calls inbox |
| REQ-WA-001 WhatsApp CRM module | **FUTURE** | Docs + reserved action seams | Runtime/tables — deferred |
| REQ-WA-002 WA SaaS packaging | **FUTURE** | Spec | Packaging SKU |

#### Automation

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-AUT-001 Workflow engine | **PARTIAL** | Trigger/condition/action/delay/branch/approval | Loop/parallel product depth |
| REQ-AUT-002 Trigger catalog | **PARTIAL** | Event matcher + templates | Full time/comms/external catalog |
| REQ-AUT-003 Retry/logs/version/test | **PARTIAL** | Runs, attempts, versioning, replay, DLQ | Simulator/test/override polish |
| REQ-AUT-004 No-code builder | **PARTIAL** | R2A guided WHEN→THEN | Freeform canvas; rich IF |
| REQ-AUT-005 Approvals HITL | **COMPLETE** | ADR-027 + inbox + authorize | — |
| REQ-AUT-006 Wait-for-event / calendar | **PARTIAL** | Delay steps | Wait-for-event; business calendar |
| REQ-AUT-007 Cross-module actions | **PARTIAL** | Class A task/notify; Class B stub | Deep CRM/Finance/webhook mapper |
| REQ-AUT-008 Idempotency / durable queue | **COMPLETE** | Outbox→BullMQ + run keys | Rate/concurrency UX |
| REQ-AUT-009 Templates + lifecycle | **PARTIAL** | 5 templates; draft→publish | Test/review gates; marketplace |
| REQ-AUT-010 Health + debugger | **PARTIAL** | Activity + run timeline | Visual debugger |
| REQ-AUT-011 Auto dashboards + ops | **PARTIAL** | Tenant usage/settings | SA automation ops dashboards |
| REQ-AUT-012 NL / Copilot | **FUTURE** | — | R2B+ |
| REQ-AUT-013 AI explain/optimize | **FUTURE** | — | R2B+ |
| REQ-AUT-014 Quotas / packaging | **PARTIAL** | Soft usage display | Enforce + sell |
| REQ-AUT-015 Emergency pause | **PARTIAL** | Engine flags + job controls | SA emergency UX |
| REQ-AUT-016 Replay / API / subscriptions | **PARTIAL** | Run replay | Broader public automation API |
| REQ-AUT-017 Process mining | **FUTURE** | — | Spec only |
| REQ-AUT-018 Marketplace | **FUTURE** | — | Spec only |

---

### 14. Reports & Analytics

| Topic | Status | Exists | Missing |
|-------|--------|--------|---------|
| REQ-SAL-003 Sales forecasting | **MISSING** | — | Forecast API/UI |
| Finance/GL reports | **COMPLETE** | TB/P&L/BS/CF + commercial | — |
| Analytics module | **PARTIAL** | Analytics surfaces | Sales-centric packs / BI builder |
| Ops performance | **COMPLETE** (Ops R2 scope) | Employee/team/dept/company performance | Not a BI builder |
| REQ-CUS-004 Report builder | **PARTIAL** | Dashboards | No-code reports on custom dims |

---

### 15–16. Optional Voice AI & Telephony / Campaign Analytics

| ID | Status | Why deferred |
|----|--------|--------------|
| REQ-VAI-001 Voice agents | **FUTURE** | Optional P3; Automation must adapt, not fork Voice |
| REQ-TEL-001 Channel inventory | **FUTURE** | Spec only |
| REQ-VBL-001 Voice usage billing | **FUTURE** | Spec only |
| Voice/campaign analytics in CRM | **FUTURE** | Not in CRM SoR |

**Not blockers** for core Business SaaS first client.

---

### 17. Global Search & Filters

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-CRM-008 Global CRM search | **MISSING** | PM/messaging search only | Cross-entity CRM search + RBAC — expected `/api/search` (CRM) — not built |
| List filters | **PARTIAL** | Per-board filters | Saved views / global filter bar |

---

### 18. Activity Timeline & Audit

| Topic | Status | Exists | Missing |
|-------|--------|--------|---------|
| Business activity feed | **PARTIAL**→strong | `/activity`, activities | Uniform entity coverage |
| Security audit | **PARTIAL** | `security_audit_events` | Unified finance+security explorer |
| Automation run / approval audit | **COMPLETE** | Runs + approval events | — |

---

### 19. Integrations & API

| ID | Status | Exists | Missing |
|----|--------|--------|---------|
| REQ-API-001 REST API | **PARTIAL** | Broad `/api/*` + `/api/v1/*` + API keys | Uniform public versioned contract for all major entities |
| REQ-WHK-001 Webhooks | **COMPLETE** | Subscriptions, deliveries, retry, live tests | — |
| REQ-INT-001 Modular integrations | **PARTIAL** | Integrations settings + plugin credentials | Mature connector matrix / vault |

---

### 20. Security & Administration

| Topic | Status | Exists | Missing |
|-------|--------|--------|---------|
| Auth / MFA / sessions | **COMPLETE** | Phase-5 MFA PASS | — |
| RBAC / roles | **COMPLETE** (core) | Custom roles + Manager template | Verb coverage gaps (PLT-005) |
| Backup / restore | **COMPLETE** (ops) | Drill + runbook (Phase-5) | Tenant self-serve restore UX |
| Super Admin / ops | **PARTIAL** | Platform APIs + tenant ops | Full Ops Center (PLT-013/015) |
| ADR-027 critical actions | **COMPLETE** (policy + automation path) | ADR + engine | Expand consistently to all finance critical UX |

---

### 21. White-label Commercial System

| Topic | Status | Exists | Missing |
|-------|--------|--------|---------|
| Tenant white-label runtime | **PARTIAL** | Branding resolve + PDFs | Domain SSL + email parity |
| Platform commercial SKUs | **PARTIAL** | Docs + entitlements | Enforce plans/metering World 1 |
| REQ-RSL-001 Reseller | **FUTURE** | `reseller_id` column hint | Hierarchy/APIs/console |
| One codebase multi-tenant | **COMPLETE** | Monorepo apps/packages | No per-industry forks |

---

### 22. Recommended Core Business Flow

| Flow | Status | Gap |
|------|--------|-----|
| Lead → Contact/Company → Deal → CustomerParty | **COMPLETE** (core) | Bulk import + scoring |
| Deal → Quote → Invoice → Payment → GL | **COMPLETE** (core) | Estimates/orders optional |
| Invoice overdue → notify → follow-up | **PARTIAL** | Reminder productization; automation action depth |
| Expense → books | **PARTIAL** | Formal AP bills + expense approval |
| Automation draft → publish → run → approve | **PARTIAL** | Limited actions; R2B not started |
| Ops Today → task complete → DPR → targets | **COMPLETE** (Ops R1+R2) | Board/calendar views; commission engine |
| Quote/Invoice branded PDF | **COMPLETE** | — |
| Backup → restore drill | **COMPLETE** | Self-serve UX |

---

### 23. Product Design Direction / Positioning

| Claim | Status |
|-------|--------|
| White-Label Business CRM & Management Platform (not AI Voice CRM) | **HELD** in docs, Ops/Finance/Automation shipping, Voice/WA FUTURE |
| ThinkAIQ default brand | **COMPLETE** (PLT-018) |
| Autonomous OS differentiator | **PARTIAL** — foundations exist; not all modules emit rich automatable events |

---

### Extensibility (REQ-CUS / PLG / EMB) — condensed

| ID | Status |
|----|--------|
| REQ-CUS-001 Customization (fields/pipelines/views) | **PARTIAL** |
| REQ-CUS-002 Custom form builder | **MISSING** |
| REQ-CUS-003 Validation / business rules | **MISSING** |
| REQ-CUS-004 Custom dashboards + report builder | **PARTIAL** |
| REQ-CUS-005 Templates / numbering / calendar | **PARTIAL** |
| REQ-CUS-006 Config audit / impact analysis | **MISSING** |
| REQ-CUS-007 Config export/import / blueprints | **MISSING** |
| REQ-CUS-008 Plan-gated customization quotas | **PARTIAL** |
| REQ-CUS-009 Custom objects | **FUTURE** |
| REQ-CUS-010 Config API + custom events | **PARTIAL** |
| REQ-CUS-011 Sandbox config | **FUTURE** |
| REQ-CUS-012 AI config assistant | **FUTURE** |
| REQ-CUS-013 Custom module request portal | **FUTURE** |
| REQ-PLG-001 Plugin architecture | **PARTIAL** |
| REQ-EMB-001 Embedding model | **FUTURE** |
| REQ-PRT-001 Client portal | **PARTIAL** (PM portal ≠ full CRM portal) |
| REQ-AI-001 AI Business Assistant | **FUTURE** |

---

## C. P0 gaps blocking first paying client

*Depends on client type; for a typical sales + finance SMB:*

| # | Gap | REQ | Why it blocks |
|---|-----|-----|---------------|
| 1 | Global CRM search | CRM-008 | Daily speed / demos feel unfinished |
| 2 | Lead bulk import/export | CRM-002 | Volume onboarding |
| 3 | Quote approval / versioning polish | SAL-004 | Quote→cash confidence |
| 4 | Automation action depth (CRM/Finance follow-ups) | AUT-007 | “Autonomous” promise under-delivers |
| 5 | White-label domain/email polish | PLT-002 / TNT-005 | WL sales demos |
| 6 | **If** client sells subscriptions | BIL-001/002 | Recurring revenue SoR missing |

*Not P0 for core Business SaaS:* Voice, WhatsApp, AI, reseller, commission engine, helpdesk, Platform World 1 billing (needed for *ThinkAIQ* monetization, not always for first tenant client).

---

## D. P1 gaps that should follow shortly after

- REQ-SAL-003 Sales forecasting  
- REQ-FIN-001 / FIN-004 / FIN-008 / FIN-009 polish (finance home, AR campaigns, tax depth, export)  
- REQ-FIN-005/006 AP bills + expense approval  
- REQ-FIN-010 Estimates/orders  
- REQ-TSK-001/002 Board/calendar + follow-up UX  
- REQ-AUT-002/004/006/009 depth (catalog, canvas, wait-event, lifecycle)  
- REQ-BIL-003/004 Platform plans + metering (ThinkAIQ revenue)  
- REQ-API-001 Public API consistency  
- REQ-PLT-003/013/016 Super Admin / ops maturity  
- REQ-CRM-001/006 scoring, tags, attachments uniformity  

---

## E. P2 / future features

| Bucket | Examples |
|--------|----------|
| P2 product | Helpdesk (SUP-001), full DMS (DOC-001), omnichannel inbox (MSG-001), meetings calendar (TSK-003), commission engine (COM-001), form builder / business rules (CUS-002/003), config packs (CUS-006/007) |
| FUTURE / OPTIONAL | Voice (VAI/TEL/VBL), WhatsApp (WA-001/002), AI assistant (AI-001), Automation Copilot (AUT-012/013), process mining/marketplace (AUT-017/018), reseller (RSL-001), custom objects/sandbox (CUS-009/011), embedding (EMB-001) |

---

## F. Features stronger / differentiated vs typical CRM

1. **CustomerParty canonical identity** + 360 (not contact-only silos)  
2. **Real double-entry accounting** posted from commercial finance events  
3. **Branded multi-doc PDF engine** (quote/invoice/CN/DN) with tenant branding snapshots  
4. **ADR-027 critical-action approvals** wired into Automation (not just pretend “approve”)  
5. **Operations module** with org hierarchy, DPR freeze-on-submit, targets + performance snapshots  
6. **Hard tenant isolation culture** (live suites as a product discipline)  
7. **Platform vs tenant billing separation** documented and respected in code (World 2 shipped without polluting platform ledger)  
8. **Plugin runtime foundations** (extensibility path without forking)  

---

## G. Recommended next 2–3 implementation blocks

**Block 1 — Daily sales usability (first-client P0)**  
Global CRM search · lead CSV import/export · Today/follow-up polish already partly done via Ops — extend CRM lead ops + search only.

**Block 2 — Quote→cash & collections polish**  
Quote versioning/approval UX · AR reminder productization · automation Class A/B actions for overdue→task/notify (no R2B AI).

**Block 3 — Choose one commercial track (do not mix)**  
- **A (tenant):** Customer subscriptions (BIL-001/002) *if* ICP is subscription sellers  
- **B (platform):** Platform plans/entitlement enforcement (BIL-003) *if* ThinkAIQ needs to bill tenants  
- **C (differentiator):** Automation Round 2B action catalog / wait-for-event — *not* Voice/WhatsApp  

---

## H. Explicit list of things NOT to build yet

- Voice AI / telephony runtime / voice billing  
- WhatsApp product / WA SaaS packaging  
- AI Business Assistant / Automation Copilot / NL builder  
- Commission payout engine / second ledger  
- Meetings/calendar product  
- Full HRMS (payroll/attendance/leave)  
- Helpdesk (unless ICP is support-led)  
- Reseller hierarchy  
- Custom objects / sandbox config / AI config assistant  
- BI report builder / process mining / automation marketplace  
- Collapsing platform billing into tenant finance (forbidden by ADR-003/021)  
- Rewriting Ops R1/R2 or Finance Phase-4/5 architecture  

---

## I. Architecture risks / duplicate systems

| Risk | Detail | Mitigation already / needed |
|------|--------|----------------------------|
| Dual task systems | CRM/Ops business `tasks` vs PM `project_tasks` | Keep separate SoRs; never merge write paths |
| Dual automation islands | Automation v2 vs legacy pipeline/PM automation | Label UX; do not fork Voice; do not delete legacy without migration |
| Dual billing worlds | Platform SaaS vs tenant customer billing | ADR-003/021 — keep ledgers separate |
| Dual “ops” naming | Platform `/api/ops` export/jobs vs Business Operations module `ops` | Different permission namespaces (`ops:export` vs `ops.tasks.*`) — document for operators |
| Settings “Team” vs Operations | Users/roles vs org employees | Already clarified in Ops reports — keep UI labels distinct |
| Traceability doc staleness | `REQUIREMENTS_TRACEABILITY.md` still largely `Documented` | Prefer **this audit** until traceability is rewritten |
| Sales gap audit staleness | Team/DPR marked missing in older audit | **Superseded by Ops R1/R2 COMPLETE** |

---

## Coverage counts (master REQ IDs in PRODUCT_REQUIREMENTS §2)

| Status | Count |
|--------|------:|
| **COMPLETE** | **24** |
| **PARTIAL** | **55** |
| **MISSING** | **11** |
| **FUTURE / OPTIONAL** | **16** |
| **Total classified** | **106** |

*Dashboard / design-direction rows above are thematic; counts are per formal REQ-* IDs in §2.1–2.13.*

---

## Immediate next block (recommendation)

**Daily sales usability:** implement **REQ-CRM-008 global CRM search** + harden **REQ-CRM-002 lead bulk import/export**, without starting Voice/WhatsApp/Billing World 1/Automation R2B unless product explicitly re-prioritizes.

---

*End of audit. No code or schema was changed producing this document.*
