# THINKAIQ — Sales Requirements Gap Audit

| Field | Value |
|-------|-------|
| Status | **AUDIT ONLY — no code changes** |
| Date | 2026-09-06 |
| Authoritative baseline | `docs/product/PRODUCT_REQUIREMENTS.md` (+ module specs under `docs/modules/`, ADRs) |
| Traceability companion | `docs/product/REQUIREMENTS_TRACEABILITY.md` (still largely `Documented` — this audit supersedes status with repo evidence) |
| Scope | Full product vs current implementation (CRM → Automation R2A, Security, Backup) |
| Explicit non-goals of this doc | Implementation · Round 2B · WhatsApp/Voice/AI shipping |

**Status legend (exactly one per requirement):**

| Symbol | Meaning |
|--------|---------|
| ✅ COMPLETE | Repo evidence shows core acceptance behavior shipped |
| 🟡 PARTIAL | Material pieces exist; gaps block full sales intent |
| ❌ MISSING | No meaningful product surface / tables / APIs |
| 🔵 FUTURE / INTENTIONALLY DEFERRED | Spec’d but product/architecture policy says wait (WhatsApp, Voice runtime, advanced AI, etc.) |

**Priority (sales readiness):**

| Priority | Meaning |
|----------|---------|
| P0 | Must have before real daily / first-client use |
| P1 | Important for commercial product |
| P2 | Later enhancement |
| FUTURE | Intentionally deferred |

---

## 0. Executive verdict

ThinkAIQ already has a **strong multi-tenant business core**: CRM (Lead → Deal → CustomerParty), Sales pipeline/quotes/products, Finance + Accounting, documents/PDF, notifications, tasks, Automation Round 1+2A (ADR-027), RBAC/MFA, isolation, backup drill.

It is **not yet first-client complete** for the full sales-team fantasy: subscriptions/billing worlds, DPR/team org, global search, sales forecasting, helpdesk, rich automation catalog, and several commercial/ops polish items remain open.

**Critical UX defect observed (2026-09-06):** Sidebar **Automation** group can appear **expanded but empty**. Root cause (evidence): `mergeLayout` injects `/automation*` keys, but client `isVisible` requires `workspace_modules.module_id = 'automation'` enabled; Phase-6 did not backfill existing tenants (`seedWorkspaceModules` is `ON CONFLICT DO NOTHING`). See §13 and First-client checklist.

---

## 1. Platform / White-label

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-PLT-001 Multi-tenant isolation | Workspace-scoped APIs + live isolation suites | `apps/api` tenancy middleware; `PHASE-2B-FULL-ISOLATION-REPORT`; Phase-5 live 50/50 | ✅ | Continuous expansion as new routes ship | Trust / legal | P0 |
| REQ-PLT-002 White-label branding | Tenant branding resolve (logo, colors, name, domains foundations) | `tenant_branding`, `routes/tenant-branding.ts`, ADR-018, ThinkAIQ branding reports | 🟡 | Custom domain SSL workflow polish; email template branding completeness varies | Client-facing polish | P0 |
| REQ-PLT-018 ThinkAIQ CRM identity | Platform brand ThinkAIQ; Vencore package names remain internal | Branding audit/impl reports; `PlatformBrandMark` | ✅ | Internal `@vencore/*` package names (OK if not customer-facing) | Brand trust | P0 |
| REQ-PLT-019 Responsive identity | Responsive shell patterns documented/shipped | `RESPONSIVE_AND_MOBILE.md`; UX pass reports | 🟡 | Native mobile/Play Store app deferred | Mobile sales demos | P1 |
| REQ-PLT-003 Super Admin console | Platform/super-admin surfaces exist | `docs/operations/SUPER_ADMIN.md`; platform routes | 🟡 | Full commercial tenant lifecycle UX uneven | Ops scale | P0 |
| REQ-PLT-013 Ops Center | Tenant ops/settings/ops, health pieces | `settings/ops`, `routes/ops.ts` | 🟡 | Full visual Platform Pulse / incident console as specified | Incident response | P1 |
| REQ-PLT-014 Tenant/module health | Partial health/error surfaces | ops + alerts + job controls | 🟡 | Unified error groups + timelines as product | Debugging | P1 |
| REQ-PLT-015 Incidents blast radius | Not first-class incident entity UI | Spec only / ops fragments | ❌ | Incident SoR + UX | Enterprise sales | P2 |
| REQ-PLT-016 Automation failure lane | Automation dead letters + run failures; limited ops lane | `automation_dead_letters`, runs UI | 🟡 | Super Admin automation failure lane + recovery playbooks | Differentiator ops | P1 |
| REQ-PLT-004 Roles hierarchy | Users/roles/custom roles | `settings/(users-roles)`, `roles.ts` | ✅ | Named Owner/Manager product labels may differ | Access control | P0 |
| REQ-PLT-005 Granular RBAC | Permission keys + middleware | `requirePermission`, module permissions | 🟡 | Not every sales verb (export/import/approve) uniformly present on all entities | Least privilege | P0 |
| REQ-PLT-006 Module entitlements | `workspace_modules` + module registry | `seed-modules.ts`, `workspace-modules.ts` | 🟡 | **Existing tenants miss new modules (e.g. automation)** without backfill; plan↔module commercial packaging incomplete | **Empty Automation nav; broken feature discovery** | **P0** |
| REQ-PLT-007 Auth + sessions | Auth, MFA Phase-5 | `auth.ts`, `mfa.ts`, ADR-023 | ✅ | Continuous hardening | Security | P0 |
| REQ-PLT-008 Security audit | `security_audit_events` + settings activity | Phase-5 MFA/ops | 🟡 | Full append-only audit product for all sensitive finance actions | Compliance | P0 |
| REQ-PLT-009 Soft-delete + metadata | Many tables have `deleted_at` | `packages/db/src/schema.ts` | 🟡 | Not universal on every entity; UX “trash” incomplete | Data recovery | P1 |
| REQ-PLT-010 Storage abstraction | File/storage adapters + isolation tests | Phase-5 storage live tests | ✅ | — | Attachments/PDF | P0 |
| REQ-PLT-011 Jobs + scheduler | BullMQ job-runtime + workers | `packages/job-runtime`, `apps/worker` | ✅ | Business calendar sophistication | Reminders/automation | P0 |
| REQ-PLT-012 Observability foundations | Logs, alerts, ops | alerts module, ops | 🟡 | Unified APM-grade product | Reliability | P1 |
| REQ-PLT-017 Autonomous OS posture | Outbox + events + automation v2 started | ADR-019, automation-engine | 🟡 | Many modules still under-automated | Differentiator | P1 |
| REQ-TNT-001 Tenant entity | Tenants + settings + modules | `tenants`, `tenant_settings` | ✅ | — | Multi-tenant SoR | P0 |
| REQ-TNT-002 Tenant statuses | Status fields / lifecycle | lifecycle live tests | 🟡 | Full Trial→Expired commercial state machine UX | Billing readiness | P1 |
| REQ-TNT-003 Provisioning flow | Setup + seed | `routes/setup.ts`, `seed.ts` | 🟡 | Guided commercial wizard incomplete | Time-to-value | P0 |
| REQ-TNT-004 Platform vs tenant settings | Separated settings surfaces | platform vs workspace settings | ✅ | — | Safety | P0 |
| REQ-TNT-005 Domains | `tenant_domains` foundations | schema + branding docs | 🟡 | Custom domain SSL “production ready” incomplete | White-label | P1 / FUTURE SSL polish |

---

## 2. Dashboard

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Configurable dashboards / widgets | Dashboard pages + widget registry | `(dashboard)/dashboard`, `modules/dashboard`, task widgets | 🟡 | Sales/finance KPI pack incomplete vs sales fantasy | Daily ops visibility | P1 |
| REQ-CUS-004 No-code report builder | Partial dashboards; not full report builder | dashboards tables | 🟡 | Drag-build reports on custom fields | Self-serve analytics | P2 |

---

## 3. CRM / Client Management

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-CRM-001 Leads | Leads CRUD, status, owner, duplicates meta | `crm/leads`, `leads` table, Phase-3A-2 | 🟡 | Score/tags/attachments/custom fields incomplete vs full spec | Lead ops | P0 |
| REQ-CRM-002 Assign / dedup / bulk | Assignment + duplicate hints on create | `LeadsBoard`, leads API | 🟡 | Bulk import/export/actions incomplete | Volume sales teams | P0 |
| REQ-CRM-003 Conversion lineage | Convert lead → party/deal links | `lead_conversion_links`, convert API | ✅ | Edge-case history UX polish | Funnel integrity | P0 |
| REQ-CRM-004 Contacts & Companies | Full modules | `crm/contacts`, `crm/companies` | ✅ | Multi-contact UX polish | B2B CRM | P0 |
| REQ-CRM-005 Client 360 | CustomerParty 360 | ADR-025, `customer-parties`, `360.ts` | ✅ | Stronger than older “client” wording | Shared customer identity | P0 |
| REQ-CRM-006 Notes/tags/fields/attachments | Partial across entities | CRM modules + activities | 🟡 | Uniform attachments/custom fields | Completeness | P1 |
| REQ-CRM-007 Activity timeline | Activity module + entity activity | `activity`, pipeline activity | 🟡 | Not equally rich on every finance/CRM entity | Accountability | P1 |
| Shared CustomerParty (architecture) | Canonical party model | ADR-024/025 | ✅ **stronger than original “Client” naming** | — | Prevents identity silos | P0 |

---

## 4. Sales Pipeline

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-SAL-001 Kanban pipelines | Pipelines, stages, Kanban | `crm/pipeline`, `pipelines` tables | ✅ | Probability UX consistency | Core sales | P0 |
| REQ-SAL-002 Deals | Deals + fields + stage | `crm/deals`, `deals` table, Phase-3A-1 | ✅ | “Next action” productization varies | Pipeline management | P0 |
| Pipeline legacy automations | Separate island (must remain) | `pipeline-automations.ts` | ✅ (island) | Must not confuse with Automation v2 | Dual systems risk | P1 (clarify UX) |

---

## 5. Lead Management

Covered primarily under §3 (REQ-CRM-001–003). Additional sales-team expectations:

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Lead scoring | Limited / not full engine | leads schema fields may exist; no scoring product | 🟡/❌ | Score rules engine | Prioritization | P2 |
| Lead source analytics | Partial via lists/filters | leads UI | 🟡 | Source performance reports | Marketing ROI | P1 |

---

## 6. Products / Plans / Subscriptions

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-SAL-005 Products catalog | Products CRUD | `crm/products`, Phase-3A-4 | ✅ | Packages/plans as first-class billing products incomplete | Catalog | P0 |
| REQ-SAL-004 Quotes | Quotes, tax, convert to invoice | `crm/quotes`, finance convert | 🟡 | Full proposal versioning/approval/view-tracking incomplete | Quote→cash | P0 |
| REQ-BIL-001 Customer subscriptions | **No** customer subscription SoR | No `customer_subscriptions*` in schema | ❌ | Cycles, trial, renewals | Recurring revenue tenants | **P0 for SaaS-ish clients** / P1 general |
| REQ-BIL-002 Subscription lifecycle | Missing | — | ❌ | States/actions | Same | P1 |
| REQ-BIL-003 Platform commercial plans | Partial platform packaging docs | ADR-003, PRODUCT_PACKAGING | 🟡 | Enforce plan→modules commercially | ThinkAIQ monetization | P1 |
| REQ-BIL-004 Usage metering | Automation usage counters; not full commercial metering | `automation_usage_*` | 🟡 | Cross-module metering + overage | Packaging | P1 |

> **Architecture note:** Platform SaaS billing vs tenant billing of end customers must stay separated (ADR-003 / ADR-021). Do not collapse into one ledger.

---

## 7. Accounting / Billing

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-FIN-001 Finance dashboard | Reports board + KPIs | `finance/reports`, Phase-4/5 | 🟡 | Single “finance home” cash-flow story incomplete | CFO view | P1 |
| REQ-FIN-002 Invoicing + branded PDF | Invoices, PDF, payments | Phase-4/5 verification PASS | ✅ | Email send reliability polish | Revenue capture | P0 |
| REQ-FIN-003 Payments / refunds | Payments + refunds | finance routes/tables | ✅ | Method configurability depth | Collections | P0 |
| REQ-FIN-004 AR aging + reminders | AR aging reports; automation templates for overdue | finance reports; automation templates | 🟡 | Fully automated reminder productization | Cash collection | P1 |
| REQ-FIN-008 GST / tax | India-ready fields / tax on docs | finance profiles, quote/invoice tax | 🟡 | Full configurable tax engine | India GTM | P0 |
| REQ-FIN-009 Reports + export | GL reports TB/P&L/BS + commercial reports | accounting routes; Phase-5 | 🟡 | Export packaging completeness | Close process | P1 |
| REQ-FIN-010 Estimates/orders/recurring/CN/DN | CN/DN + recurring schedules exist; estimates/orders thin | `credit_notes`, `debit_notes`, `recurring_invoice_*` | 🟡 | Estimates/orders first-class | Doc suite | P1 |
| REQ-FIN-011 History protection | Void/reverse; no unsafe erase (Phase-5) | accounting integrity verification | ✅ | — | Audit risk | P0 |
| Accounting SoR | Journals, periods, accounts | Phase-5 ACCOUNTING = PASS | ✅ **stronger than many CRM competitors** | — | Trust | P0 |
| ADR-027 on money | Approval policy Accepted; automation Class B path | ADR-027, automation approvals | ✅ (policy + stub path) | Real money actions still domain-owned, not auto | Fraud/safety | P0 |

---

## 8. Expense / Vendor

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-FIN-007 Vendors | Vendors CRUD | `finance/vendors` | ✅ | Deep vendor 360 | AP | P0 |
| REQ-FIN-006 Expenses | Expenses module | `finance/expenses` | 🟡 | Approval + recurring expense productization | Cost control | P1 |
| REQ-FIN-005 AP / vendor bills | Expenses/vendors ≠ full AP bills module | No dedicated `vendor_bills` product | 🟡/❌ | Vendor bill → payment AP flow | AP teams | P1 |

---

## 9. Team / Employee / DPR

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-TM-001 Employees/depts/teams | Team settings = users/roles, not org chart | `settings/team` | 🟡 | Departments, designations, employee profiles | Sales org mgmt | P1 |
| REQ-DPR-001 Daily Progress Reports | Spec only | `docs/modules/TEAM_DPR.md`; no `dpr_*` tables | ❌ | DPR + targets | Manager ritual | P1 |
| REQ-COM-001 Commissions | Spec only | TEAM_DPR commissions section | 🔵/❌ | Commission engine | Incentive alignment | P2 / FUTURE until finance rules clear |

---

## 10. Tasks / Follow-ups

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-TSK-001 Tasks views | CRM tasks + PM tasks | `crm/tasks`, projects tasks | 🟡 | Unified list/board/calendar product incomplete | Daily execution | P0 |
| REQ-TSK-002 Follow-ups / recurrence | Recurring rules exist | `recurring_task_rules`, reminders | 🟡 | First-class follow-up UX | Lead SLA | P0 |
| REQ-TSK-003 Meetings calendar | Meeting as activity type; calendar thin | activities type `meeting` | 🟡 | Meetings module + integrations | Scheduling | P2 |

---

## 11. Documents

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Commercial PDF engine | Quote/Invoice/CN/DN PDF via DocumentRenderer | Phase-5 DOCUMENTS = PASS; `packages/documents` | ✅ **stronger than “attachments only”** | Standalone DMS UI | Client documents | P0 |
| REQ-DOC-001 Document management versions/ACL | Templates + artifacts, not full DMS | `document_templates`, `document_artifacts` | 🟡 | Versioned file library with ACL | Knowledge/compliance | P2 |
| REQ-CUS-005 Templates/numbering | Number sequences + doc templates | finance/quote sequences | 🟡 | Email/WA templates; business calendar | Ops consistency | P1 |

---

## 12. Support / Tickets

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-SUP-001 Helpdesk | Spec only | `SUPPORT_HELPDESK.md`; no tickets routes/tables | ❌ | Tickets + SLA | Post-sale support | P2 |

---

## 13. Notifications / Automation

### Notifications

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-NTF-001 Notifications | In-app + prefs + deliveries | Phase-5 NOTIFICATIONS = PASS | ✅ | Multi-channel (email/SMS/WA) depth | Engagement | P0 |
| REQ-MSG-001 Communication center | Messaging module exists (internal) | `messaging` | 🟡 | Unified email/WA/SMS/calls inbox | Omnichannel | P2 / FUTURE for WA |

### Automation (R1 + R2A)

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-AUT-001 Workflow engine | Trigger/condition/action/delay/branch/approval | `@vencore/automation-engine`, Phase-6 R1 PASS | 🟡 | Loop/parallel incomplete | Differentiator | P1 |
| REQ-AUT-002 Rich trigger catalog | Small event set | matcher + templates | 🟡 | Full catalog (time/comms/external) | Coverage | P1 |
| REQ-AUT-003 Retry/logs/version/test | Runs, attempts, versioning, replay | R1 report | 🟡 | Simulator/test mode polish | Trust | P1 |
| REQ-AUT-004 No-code WHEN/THEN builder | Round 2A guided builder | `/automation/**`, R2A report | 🟡 | Freeform canvas; richer IF branches | Adoption | P0 |
| REQ-AUT-005 Approvals HITL | ADR-027 + approval inbox | `/automation/approvals` | ✅ | — | Safety | P0 |
| REQ-AUT-006 Wait-for-event / calendar | Delay yes; wait-event/calendar limited | delay steps | 🟡 | Wait-for-event + business calendar | Timing | P1 |
| REQ-AUT-007 Cross-module actions | Class A task/notify; Class B stub | action registry | 🟡 | Finance/CRM deep actions + mapping | Value | P1 |
| REQ-AUT-008 Idempotency / durable queue | Outbox + run keys + workers | R1 | ✅ foundation | Rate/concurrency product UX | Reliability | P0 |
| REQ-AUT-009 Templates + lifecycle | 5 templates; draft→publish | R2A templates | 🟡 | Test/review gates; marketplace later | Time-to-value | P0 |
| REQ-AUT-010 Health + debugger | Activity timelines + advanced drawer | `/automation/runs` | 🟡 | Visual debugger | Supportability | P1 |
| REQ-AUT-011 Auto dashboards + ops | Tenant usage/settings; limited SA | settings usage | 🟡 | Platform automation ops | Ops | P1 |
| REQ-AUT-012 NL / Copilot | Explicitly not in R2A | Round 2B | 🔵 | — | Future | FUTURE |
| REQ-AUT-013 AI explain/optimize | Not implemented | — | 🔵 | — | Future | FUTURE |
| REQ-AUT-014 Quotas / packaging | Soft usage display; not billing | `/automation/usage` | 🟡 | Enforce + sell | Monetization | P1 |
| REQ-AUT-015 Emergency pause | Flags + job controls foundations | engine flags, tenant_job_controls | 🟡 | Super Admin emergency UX | Incident | P1 |
| REQ-AUT-016 Replay API | Run replay + note | R1 APIs | 🟡 | Broader automation public API | Integration | P2 |
| REQ-AUT-017 Process mining | — | — | 🔵 | — | Future | FUTURE |
| REQ-AUT-018 Marketplace | — | — | 🔵 | — | Future | FUTURE |
| **Automation module entitlement / sidebar** | Nav keys exist; **empty group on old tenants** | `sidebar-layout.ts`, `Sidebar.tsx` `isEnabled('automation')`, `seed-modules` doNothing | ❌→🟡 defect | Backfill `workspace_modules` + permissions; don’t hide pages when zero workflows | **Users cannot find Automation** | **P0** |
| Engine ON/OFF UX | Settings ON/OFF on Round 1 flag | R2A UX fix section | ✅ | Ensure module enabled so users reach Settings | Control | P0 |
| Legacy PM/pipeline automation | Unchanged islands | `packages/automation`, project automation pages | ✅ (must keep) | Clear labeling vs v2 | Confusion risk | P1 |

---

## 14. Reports / Analytics

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-SAL-003 Sales forecasting | **No dedicated forecast API/UI** | grep forecast empty in routes | ❌ | Weighted pipeline / forecast | Sales leadership | **P1** |
| Finance/GL reports | TB/P&L/BS + commercial reports | Phase-5 REPORTING PASS | ✅ | — | Finance close | P0 |
| Analytics module | Exists | `analytics` page | 🟡 | Sales-centric packs | Insights | P1 |
| PM analytics | Project analytics | `projects/[id]/analytics` | ✅ for PM | Not sales | — | P2 |

---

## 15. Voice

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-VAI-001 Voice agents | Docs only; **do not replace** existing Voice | `VOICE_AI.md`, Phase-6 contract | 🔵 | Adapter later (R2B+) | Call automation | FUTURE |
| REQ-TEL-001 Telephony inventory | Spec | `TELEPHONY.md` | 🔵 | — | Channel ops | FUTURE |
| Architecture rule | Automation must adapt, not fork Voice | Round 2 contract | ✅ policy | Implementation deferred | Prevent dual systems | FUTURE |

---

## 16. Voice Analytics

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Call analytics / outcomes in CRM | Not in CRM SoR | — | 🔵 | Outcome events → Customer 360 | Coaching / conversion | FUTURE |
| REQ-VBL-001 Voice usage billing | Spec | — | 🔵 | — | Monetization | FUTURE |

---

## 17. Global Search / Filters

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-CRM-008 Global CRM search | **Missing** as product | Only `pm-search` project-scoped | ❌ | Cross-entity search with RBAC | Daily speed | **P0** |
| List filters | Per-board filters exist | CRM/Finance boards | 🟡 | Saved views / global filter bar | Power users | P1 |

---

## 18. Activity / Audit

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Business activity feed | Activity module | `/activity`, `activities` | ✅ | Coverage depth | Accountability | P0 |
| Security audit | Security audit events | Phase-5 | 🟡 | Unified audit explorer for finance+security | Compliance | P1 |
| Automation run audit | Runs + approval events | automation tables | ✅ | — | ADR-027 | P0 |

---

## 19. Integrations / API

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| REQ-API-001 REST API | Broad `/api/*` + keys; v1 surfaces | `api-keys`, routes, live api-key tests | 🟡 | Consistent public versioned contract for all major CRM entities | Partner ecosystem | P1 |
| REQ-WHK-001 Webhooks | Webhooks + retry/logs | webhook tables; live tests | ✅ | — | Integrations | P1 |
| REQ-INT-001 Modular integrations | Plugins/hooks/integrations settings | `settings/integrations`, plugin-runtime | 🟡 | Credential vault maturity | Connectors | P2 |
| REQ-PLG-001 Plugins | Plugin architecture shipped | `packages/plugin-*` | 🟡 | Marketplace quality bar | Extensibility | P2 |

---

## 20. Security / Administration

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Auth / MFA / sessions | Phase-5 MFA PASS | `settings/security`, `mfa.ts` | ✅ | — | Account takeover risk | P0 |
| RBAC / roles | Custom roles | users/roles | ✅ | Permission coverage gaps | Least privilege | P0 |
| Backup / restore | Drill + smoke script | `BACKUP-RESTORE-DRILL.md`, Phase-5 BACKUP PASS | ✅ | Tenant self-serve restore UX | DR | P0 |
| Ops / updates | Ops + updates settings | `settings/ops`, `settings/updates` | 🟡 | Platform Ops Center completeness | Operate at scale | P1 |
| ADR-027 critical actions | Accepted + Cursor rule + automation path | ADR-027 | ✅ policy | Expand to all finance critical UX consistently | Fraud | P0 |

---

## 21. White-label Commercial System

| Requirement | Current implementation | Evidence | Status | Missing | Business impact | Priority |
|-------------|------------------------|----------|--------|---------|-----------------|----------|
| Tenant white-label runtime | Branding resolve | ADR-018, branding reports | 🟡 | Domain SSL + email/PDF parity everywhere | Sell WL | P0 |
| Platform commercial plans / SKUs | Docs + partial controls | PRODUCT_PACKAGING, ADR-003 | 🟡 | Enforce entitlements + metering commercially | ThinkAIQ revenue | P1 |
| REQ-RSL-001 Reseller | Spec | `RESELLER_SYSTEM.md` | 🔵 | — | Agency channel | FUTURE |
| REQ-WA-002 WA SaaS packaging | Spec | — | 🔵 | — | Adjacent SKU | FUTURE |
| One codebase multi-tenant | Confirmed architecture | monorepo apps/packages | ✅ | No per-industry forks | Maintainability | P0 |

---

## 22. Core Business Flows

| Flow | Status | Evidence | Gap / impact | Priority |
|------|--------|----------|--------------|----------|
| Lead → Contact/Company → Deal → CustomerParty | 🟡→✅ mostly | Phase-3A reports | Bulk import + scoring gaps | P0 |
| Deal → Quote → Invoice → Payment → GL | ✅ core | Phase-3A-4 + Phase-4/5 | Estimate/order optional path | P0 |
| Invoice overdue → notify/approve → follow-up | 🟡 | Automation templates + AR reports | Engine OFF / module entitlement / WA channel | P0 |
| Expense → approve → books | 🟡 | Expenses + accounting | Formal AP bills | P1 |
| Automation draft → publish → run → approve Class B | 🟡 | R1+R2A | Sidebar empty; limited actions | P0 |
| Quote PDF / Invoice PDF branded | ✅ | Phase-5 real PDF | — | P0 |
| Backup → restore drill | ✅ | Phase-5 | — | P0 |
| Customer subscription renew | ❌ | — | Recurring SaaS clients blocked | P1 |
| Ticket → resolve | ❌ | — | Support motion | P2 |
| Voice call → CRM outcome | 🔵 | — | Deferred | FUTURE |
| WhatsApp reply → Customer 360 | 🔵 | — | Deferred; no identity silo | FUTURE |

---

## Cross-cutting analysis

### Duplicated requirements
- White-label appears as REQ-PLT-002 / 018 / TNT branding / CUS templates — same program.
- Automation health appears as REQ-AUT-010/011/016 and PLT-016 — consolidate under Automation Ops.
- “Client” vs CustomerParty — same entity; prefer CustomerParty language.

### Already covered (do not re-build)
- Multi-tenant isolation foundation  
- CustomerParty 360  
- Finance + Accounting integrity  
- Document PDF engine for commercial docs  
- Notifications in-app  
- Automation v2 + ADR-027 approvals  
- MFA / backup drill  

### Stronger than original spec
- **Accounting GL** (journals/periods/TB/P&L/BS) beyond many CRM sales decks  
- **CustomerParty** as shared identity SoR  
- **ADR-027** critical-action approval discipline  
- **Real Chromium PDF** verification for Quote/Invoice/CN/DN  
- **Live tenant isolation** test culture  

### Dangerous gaps (real business problems)
1. **Automation sidebar empty** on existing tenants (module not backfilled) — feature invisible.  
2. **No global search** — kills daily usability.  
3. **Engine default OFF + entitlement gaps** — published automations won’t run; teams think product is broken.  
4. **Dual automation islands** (PM/pipeline vs v2) without clear UX labeling — wrong config risk.  
5. **Incomplete lead bulk import** — sales ops cannot migrate.  
6. **Subscriptions missing** — cannot sell ThinkAIQ to agencies that bill recurring customers (tenant-side).  
7. **Critical money actions** must stay domain + ADR-027 — do not “automate payments” without approval (architecture conflict if sales asks for auto-pay).  

### Should NOT implement (architecture conflicts)
- Separate WhatsApp customer identity silo  
- Replacing / forking existing Voice Calling into Automation  
- Per-industry forked codebases / niche packs that mutate core schemas deeply  
- Auto-approve critical actions / NL-as-approval  
- Parallel Finance ledger inside Automation  
- Second automation versioning system  

---

## Prioritized roadmap (coherent major phases)

### Phase A — First usable daily (internal team) — **NOW**
1. Fix Automation module entitlement backfill + permissions for existing workspaces (sidebar children visible).  
2. Global CRM search (Lead, Contact, Company, CustomerParty, Deal, Invoice).  
3. Engine ON/OFF discoverability + empty states already shipped — verify in real tenants.  
4. Lead bulk import (CSV) + assignment at volume.  
5. Task/follow-up UX consolidation for sales daily ritual.  
6. Clarify labeling: Project Automation vs ThinkAIQ Automation.  

### Phase B — First paying customer readiness
1. Quote versioning/approval polish + reliable send.  
2. GST/tax settings completeness for India.  
3. Sales forecasting / weighted pipeline report.  
4. AR reminder automation productionized (still ADR-027 for customer-critical messages).  
5. White-label domain/email/PDF parity checklist.  
6. Platform plan entitlements enforcement (modules/limits).  
7. Expand automation Class A actions (CRM/task/notify) safely; keep money in Finance.  

### Phase C — After first customers
1. Customer subscriptions (tenant billing of end customers) — ADR-021 aligned.  
2. DPR + org structure.  
3. AP vendor bills.  
4. Richer automation (wait-for-event, more triggers, debugger).  
5. Helpdesk tickets.  
6. Document library DMS.  
7. Custom form builder / deeper customization.  

### Phase D — Future (explicit)
- WhatsApp module + packaging  
- Voice adapter + analytics (do not replace Voice)  
- Automation Copilot / advanced AI  
- Reseller hierarchy  
- Process mining / marketplace  

---

## Explicit answers

### A. Required before ThinkAIQ can be used by our own team daily?
- Automation **visible & usable** (module backfill + permissions + engine ON when intended)  
- Global search  
- Stable Lead → Deal → Quote → Invoice → Payment path (already mostly ✅)  
- Tasks/follow-ups that sales actually opens every morning  
- Notifications + MFA already ✅  
- No empty “broken” nav groups  

### B. Required before onboarding the first paying customer?
- Everything in A  
- White-label branding parity (login, PDF, emails)  
- India tax/GST practical settings  
- Quote→Invoice reliability + PDF  
- Sales forecast or at least weighted pipeline report  
- Backup/restore confidence (✅ drill exists — document runbook for customer)  
- Clear support path (even if tickets are manual initially)  
- Commercial plan/module limits so you don’t over-entitle  
- ADR-027 respected on any critical outbound/money actions  

### C. What can wait until after first customers?
- DPR, commissions  
- Subscriptions (unless the first customer’s business is recurring SaaS)  
- Helpdesk module  
- Full AP bills  
- Automation AI / marketplace  
- Deep customization (forms, custom objects)  

### D. What should remain future?
- WhatsApp (REQ-WA-*)  
- Voice provider/runtime + voice analytics + voice billing  
- Advanced AI agents / Copilot auto-publish  
- Reseller  
- Per-industry forked products  

---

## First-client readiness checklist

| # | Check | Status |
|---|-------|--------|
| 1 | Tenant isolation green | ✅ |
| 2 | ThinkAIQ branding default | ✅ |
| 3 | Lead→Deal→CustomerParty | ✅/🟡 |
| 4 | Quote→Invoice→Payment→GL | ✅ |
| 5 | PDF commercial docs | ✅ |
| 6 | MFA available | ✅ |
| 7 | Backup drill documented | ✅ |
| 8 | Automation module visible in sidebar for **this** tenant | ❌ observed empty |
| 9 | Automation permissions on admin role | ❓ verify |
| 10 | Engine v2 flag ON intentionally | ❓ |
| 11 | Global search | ❌ |
| 12 | Lead CSV import | ❌/🟡 |
| 13 | Sales forecast | ❌ |
| 14 | Customer subscriptions | ❌ (defer if N/A) |
| 15 | WhatsApp/Voice | 🔵 deferred |
| 16 | ADR-027 understood by ops | ✅ policy |

---

## Exact next implementation phase recommendation

**Recommended next phase name:**  
### Phase 6.5 — Daily Usability & Entitlement Hardening (pre–Round 2B)

**In scope (only):**
1. Backfill `workspace_modules` + role permissions for `automation` on existing tenants; verify sidebar children render (Home / My Automations / Templates / Approvals / Activity / Settings).  
2. Global CRM search (RBAC-scoped).  
3. Lead CSV import/export MVP.  
4. Sales weighted pipeline / forecast MVP report.  
5. Nav/copy separation: “Project Automation” vs “Automation”.  
6. First-client white-label + GST checklist pass (docs + small gaps only).  

**Out of scope:** Round 2B AI/Voice/WhatsApp, subscriptions engine, DPR, helpdesk, billing monetization overhaul.

**Why this phase:** Unlocks daily internal use and removes “product looks broken” defects before more automation channels.

---

## Matrix rollup counts (approx.)

| Status | Count (REQ-level rows in this audit) |
|--------|--------------------------------------|
| ✅ COMPLETE | ~35 |
| 🟡 PARTIAL | ~55 |
| ❌ MISSING | ~15 |
| 🔵 FUTURE / DEFERRED | ~15 |

*(Counts are requirement-rows across sections; some sales themes map to multiple REQs.)*

---

## Sources of evidence (primary)

- `docs/product/PRODUCT_REQUIREMENTS.md`  
- `docs/product/REQUIREMENTS_TRACEABILITY.md`  
- `docs/modules/*.md` (Sales, CRM, Finance, TEAM_DPR, WhatsApp, Voice, Support, …)  
- Phase closeouts: 3A, 4, 5, 6 R1, 6 R2A  
- Code: `apps/web`, `apps/api`, `packages/db`, `packages/automation-engine`, `packages/modules`  

**Observed defect (sidebar):** Automation group empty — entitlement/module row missing for existing workspace; not a missing route tree (`apps/web/app/(dashboard)/automation/**` exists).

---

*End of audit. No code was modified.*
