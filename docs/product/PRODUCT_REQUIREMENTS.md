# PRODUCT_REQUIREMENTS.md — ThinkAIQ

## 1. Document control

| Field | Value |
|-------|-------|
| Product | ThinkAIQ CRM — White-Label Autonomous Business Platform |
| Platform / company | ThinkAIQ |
| Status | Baseline requirements (pre-implementation) |
| North star | Automate as much as safely possible — [MASTER_PRINCIPLES.md](./MASTER_PRINCIPLES.md) |
| Default identity | **ThinkAIQ CRM** — [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md) |
| Priority model | P0 Foundation · P1 Core · P2 Important · P3 Optional |
| Traceability | See [REQUIREMENTS_TRACEABILITY.md](./REQUIREMENTS_TRACEABILITY.md) |

All requirements below preserve prior blueprints. Conflicts/ambiguities → ADR, not silent deletion.

### REQ-PLT-017 — Autonomous OS posture

Every major feature must emit events, consider automation/notifications/audit/reporting/API/webhooks/usage/permissions, and prefer safe automatic next steps. Disconnected CRUD-only features are out of product policy.

---

## 2. Functional requirement domains

### 2.1 Platform foundations (P0)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-PLT-001 | Multi-tenant workspaces with enforced tenant isolation | P0 |
| REQ-PLT-002 | White-label branding (name, logo, favicon, colors, login, email, domain) | P0 |
| REQ-PLT-018 | Canonical platform identity **ThinkAIQ CRM** on default UI, browser metadata, favicon, emails, platform docs, PWA/future app; no customer-facing Vencore branding; Super Admin stays platform-branded | P0 |
| REQ-PLT-019 | Responsive web identity: ThinkAIQ logo/name readable across breakpoints; future mobile/Play Store display name ThinkAIQ CRM (framework deferred) | P1 |
| REQ-PLT-003 | Super Admin platform console (tenant/commercial admin) | P0 |
| REQ-PLT-013 | Super Admin Platform Ops Center (visual observability & incident control) | P0 |
| REQ-PLT-014 | Tenant health, module health, error groups, event timelines | P0 |
| REQ-PLT-015 | Incidents with root cause, affected records, blast radius | P1 |
| REQ-PLT-016 | Automation failure lane + integration health + recovery actions | P1 |
| REQ-PLT-004 | Tenant Owner/Admin/Manager/User role hierarchy + custom roles | P0 |
| REQ-PLT-005 | Granular RBAC (view/create/edit/delete/export/import/approve/assign/share/manage/configure) | P0 |
| REQ-PLT-006 | Module entitlement engine (plan + tenant) | P0 |
| REQ-PLT-007 | Secure authentication + session management | P0 |
| REQ-PLT-008 | Audit log for security-sensitive actions | P0 |
| REQ-PLT-009 | Soft-delete + created/updated metadata on core entities | P0 |
| REQ-PLT-010 | Storage abstraction for files (not DB blobs) | P0 |
| REQ-PLT-011 | Background jobs + scheduler foundations | P0 |
| REQ-PLT-012 | Observability foundations (errors, jobs, auth logs) | P0 |

### 2.2 Tenant lifecycle (P0)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-TNT-001 | Tenant entity with id, name, slug, status, plan, branding, domain, modules, limits | P0 |
| REQ-TNT-002 | Tenant statuses: Trial, Active, Suspended, Expired, Cancelled | P0 |
| REQ-TNT-003 | Provisioning flow: Create → Plan → Modules → Branding → Domain → Admin → Ready | P0 |
| REQ-TNT-004 | Platform settings vs tenant settings separation | P0 |
| REQ-TNT-005 | Domain support: platform subdomain, tenant subdomain, custom domain (SSL workflow future-ready) | P0/P2 |

### 2.3 CRM (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-CRM-001 | Leads with capture, source, owner, status, score, tags, custom fields, notes, attachments | P1 |
| REQ-CRM-002 | Lead assignment/reassignment, duplicate detection, bulk import/export/actions | P1 |
| REQ-CRM-003 | Lead conversion Lead→Contact→Company→Deal→Client without history loss | P1 |
| REQ-CRM-004 | Contacts & Companies (multi-contact per company) | P1 |
| REQ-CRM-005 | Client 360 unified profile | P1 |
| REQ-CRM-006 | Activities, notes, tags, custom fields, attachments | P1 |
| REQ-CRM-007 | Activity timeline per major entity | P1 |
| REQ-CRM-008 | Global search across CRM entities | P1 |

### 2.4 Sales (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-SAL-001 | Kanban pipelines with custom stages & probabilities | P1 |
| REQ-SAL-002 | Deals with value, currency, owner, stage, next action | P1 |
| REQ-SAL-003 | Sales forecasting reports | P1 |
| REQ-SAL-004 | Quotes & proposals with versioning, tax, approval, convert to invoice | P1 |
| REQ-SAL-005 | Products, services, packages, plans catalog | P1 |

### 2.5 Finance & tax (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-FIN-001 | Finance dashboard (revenue, expenses, profit, AR/AP, cash flow) | P1 |
| REQ-FIN-002 | Invoicing with statuses, PDF, send, payment recording; **per-tenant branded invoice engine** | P1 |
| REQ-FIN-010 | Estimates, orders, recurring invoices, credit notes, debit notes | P1 |
| REQ-FIN-011 | Financial history protected (no unsafe hard-delete of posted money docs) | P1 |
| REQ-FIN-003 | Payments: full/partial/multiple/refund; configurable methods | P1 |
| REQ-FIN-004 | Accounts receivable aging + automated reminders | P1 |
| REQ-FIN-005 | Accounts payable / vendor bills | P1 |
| REQ-FIN-006 | Expense management + approval + recurring | P1 |
| REQ-FIN-007 | Vendor management | P1 |
| REQ-FIN-008 | India-ready GST fields; configurable tax rules (not hard-coded engine) | P1 |
| REQ-FIN-009 | Financial reports + export | P1 |

### 2.6 Billing & subscriptions (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-BIL-001 | Tenant-facing subscription management (cycles, trial, usage/hybrid) | P1 |
| REQ-BIL-002 | Subscription states and lifecycle actions | P1 |
| REQ-BIL-003 | Platform commercial plans controlling modules/limits | P1 |
| REQ-BIL-004 | Usage metering with warning/limit/overage | P1 |

> **Ambiguity:** Platform SaaS billing to ThinkAIQ tenants vs tenant billing of their end customers. Documented in [ADR-003](../decisions/ADR-003-platform-vs-tenant-billing.md).

### 2.7 Team, tasks, performance (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-TM-001 | Employees, departments, teams, designations | P1 |
| REQ-TSK-001 | Tasks with list/calendar/board views | P1 |
| REQ-TSK-002 | Follow-ups with reminders and recurrence | P1 |
| REQ-TSK-003 | Meetings & calendar (integrations future-ready) | P1 |
| REQ-DPR-001 | Daily Progress Reports + targets | P1 |
| REQ-COM-001 | Configurable commission/incentive rules | P2 |

### 2.8 Automation (P1 — platform differentiator)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-AUT-001 | Workflow engine: trigger → conditions → actions → delay → branch → loop → parallel | P1 |
| REQ-AUT-002 | Rich trigger catalog (record, business, time, communication, external, manual) | P1 |
| REQ-AUT-003 | Retry, logs, failed inspection, manual retry/override, versioning, test/simulator modes | P1 |
| REQ-AUT-004 | No-code visual builder with business-friendly WHEN/CHECK/THEN language | P1 |
| REQ-AUT-005 | Approvals + human-in-the-loop gates for sensitive actions | P1 |
| REQ-AUT-006 | Wait-for-event, business calendar, tenant timezone schedules | P1 |
| REQ-AUT-007 | Cross-module record/comms/document/API/webhook actions + data mapping/expressions | P1 |
| REQ-AUT-008 | Idempotency, failure/fallback paths, durable queue, rate limits, concurrency control | P1 |
| REQ-AUT-009 | Templates/blueprints library; draft→test→review→publish lifecycle | P1 |
| REQ-AUT-010 | Workflow health, execution history, visual debugger | P1 |
| REQ-AUT-011 | Tenant + Super Admin automation dashboards; ops incident integration | P1 |
| REQ-AUT-012 | Natural language builder + Automation Copilot (draft only; no auto-publish default) | P2 |
| REQ-AUT-013 | AI explain / optimize / debug (facts vs inference); smart suggestions opt-in | P2 |
| REQ-AUT-014 | Automation quotas, cost awareness, plan packaging as premium upgrade driver | P1 |
| REQ-AUT-015 | Emergency Super Admin controls (pause tenant/global automations, stop retry storms) | P1 |
| REQ-AUT-016 | Event replay; automation API; external event subscriptions | P2 |
| REQ-AUT-017 | Process mining / automation discovery | P3 |
| REQ-AUT-018 | Automation marketplace (installable packages, future paid templates) | P3 |

### 2.9 Support, documents, communications (P2)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-SUP-001 | Helpdesk tickets with SLA-ready architecture | P2 |
| REQ-DOC-001 | Document management with versions & ACL | P2 |
| REQ-MSG-001 | Communication center: email, WhatsApp, SMS, calls, in-app | P2 |
| REQ-WA-001 | First-class WhatsApp module with CRM deep integration | P2 |
| REQ-WA-002 | Future WhatsApp SaaS packaging on same core (inbox, campaigns, usage billing) | P3 |
| REQ-NTF-001 | Notification system across channels | P1 |
| REQ-PRT-001 | Optional client portal (future-ready) | P3 |
| REQ-AI-001 | AI Business Assistant architecture (authorized tools only; no security bypass) | P3 |

### 2.10 API, webhooks, integrations (P1)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-API-001 | REST API for major entities with auth, pagination, filter, sort, rate limits, versioning | P1 |
| REQ-WHK-001 | Tenant webhooks with retry + logs | P1 |
| REQ-INT-001 | Modular integrations + secure credential storage | P2 |

### 2.11 Voice AI & telephony (P3)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-VAI-001 | Optional voice agents, campaigns, call data | P3 |
| REQ-TEL-001 | Channel/number inventory (full/half channel) | P3 |
| REQ-VBL-001 | Voice usage billing integrated with invoicing | P3 |

### 2.12 Reseller (P3)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-RSL-001 | Future reseller/agency hierarchy without Super Admin leakage | P3 |

### 2.13 Extensibility (P2/P3)

| ID | Requirement | Priority |
|----|-------------|----------|
| REQ-CUS-001 | Tenant customization: fields, statuses, tags, pipelines, views, layouts | P1 |
| REQ-CUS-002 | Custom form builder + conditional logic; submission triggers automation | P2 |
| REQ-CUS-003 | Validation rules + business rules (transition gates) | P2 |
| REQ-CUS-004 | Custom dashboards + no-code report builder (incl. custom fields) | P2 |
| REQ-CUS-005 | Templates (document/email/WhatsApp), numbering series, business calendar | P1 |
| REQ-CUS-006 | Config audit, versioning, dependency/impact analysis, archive-safe delete | P1 |
| REQ-CUS-007 | Config export/import/clone + installable business blueprints | P2 |
| REQ-CUS-008 | Plan-gated customization quotas; Settings Center UX | P1 |
| REQ-CUS-009 | Custom objects + relationships (schema-ready; commercially gated) | P3 |
| REQ-CUS-010 | Config API + custom events for automation | P2 |
| REQ-CUS-011 | Sandbox/staging configuration (Enterprise) | P3 |
| REQ-CUS-012 | AI configuration assistant (propose only; no silent apply) | P3 |
| REQ-CUS-013 | Custom module request portal for Super Admin fulfillment | P3 |
| REQ-PLG-001 | Plugin/extension architecture for routes/UI/entities/permissions | P2 |
| REQ-EMB-001 | Future embedding model via API products | P3 |

---

## 3. User types (required)

1. Super Admin  
2. Tenant Owner  
3. Tenant Admin  
4. Manager  
5. Employee/User  
6. Sales User  
7. Finance User  
8. Support User  
9. Custom Roles (tenant-defined)

Detailed capability matrix: [RBAC_PERMISSIONS.md](../security/RBAC_PERMISSIONS.md), [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md).

---

## 4. Non-functional requirements (NFR)

| ID | Area | Requirement |
|----|------|-------------|
| NFR-001 | Scalability | Support growth of tenants/users/records without redesign; horizontal worker scale |
| NFR-002 | Performance | Interactive p95 API targets defined per env; list endpoints paginated |
| NFR-003 | Security | Tenant isolation, RBAC, secure secrets, rate limits, encrypted credentials |
| NFR-004 | Availability | Document RTO/RPO targets; health checks; graceful degradation for non-critical channels |
| NFR-005 | Backup | Automated backups; tested restores |
| NFR-006 | Recovery | Documented recovery runbooks |
| NFR-007 | Maintainability | Modular packages; clear ownership; docs/ADR for decisions |
| NFR-008 | Extensibility | Module/plugin boundaries; entitlement-gated features |
| NFR-009 | API compatibility | Versioned APIs; deprecation policy |
| NFR-010 | Observability | Structured logs, metrics, job/workflow/API/webhook/auth logs |
| NFR-011 | Tenant isolation | Application + data-layer enforcement; automated isolation tests |
| NFR-012 | Platform branding | Default product identity ThinkAIQ CRM; branding cache never cross-tenant; release scan for customer-facing Vencore strings |

---

## 5. Architectural rule (mandatory)

Every feature design must pass the 10-point checklist in [README.md](./README.md).

---

## 6. Documentation quality rule

Major features must document: purpose, roles, user flow, business rules, data model, permissions, APIs, events, automation triggers, notifications, validation, edge cases, errors, audit, reporting impact, extension points.

---

## 7. Development gate

**Coding must not start until:**

1. Existing requirements read & preserved  
2. Docs organized  
3. Gaps identified  
4. Architecture docs complete  
5. Database schema documented  
6. Module boundaries defined  
7. API contracts defined  
8. Permission model defined  
9. Automation model defined  
10. White-label/tenant provisioning defined  
11. Development phases defined  
12. Requirements traceability created  

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).
