# REQUIREMENTS_TRACEABILITY.md — ThinkAIQ

## 1. Purpose

Trace each requirement to module, priority, dependencies, data, APIs, UI, automation, permissions, tests, and completion status.

**Status legend:** `Documented` · `Ready for build` · `In progress` · `Done` · `Deferred`

Completion starts at `Documented` during this phase.

---

## 2. Traceability matrix

### Platform / tenancy / WL / admin

| Requirement ID | Feature | Module | Priority | Dependencies | DB entities | APIs | UI | Automation | Permissions | Tests | Status |
|----------------|---------|--------|----------|--------------|-------------|------|----|------------|-------------|-------|--------|
| REQ-PLT-001 | Multi-tenant isolation | core | P0 | — | tenants + all tenant tables | tenancy middleware | — | pause on suspend | platform/tenant auth | isolation suite | Documented |
| REQ-PLT-002 | White-label branding | core | P0 | tenants | tenant_branding, files, tenant_domains | branding/domains | Super Admin + Tenant settings | domain expiry ntf | branding.manage | branding resolve tests | Documented |
| REQ-PLT-018 | Platform identity ThinkAIQ CRM | core | P0 | ADR-018, PLATFORM_IDENTITY | platform branding | branding resolver | shell/login/meta | — | platform config | no Vencore UI scan | Documented |
| REQ-PLT-019 | Responsive + future mobile identity | core | P1 | REQ-PLT-018 | — | — | responsive shell / future app | — | — | breakpoint brand QA | Documented |
| REQ-PLT-003 | Super Admin console (tenant/commercial) | platform | P0 | auth | platform_users, tenants, plans | /platform/* | Super Admin UI | — | platform.* | admin authz | Documented |
| REQ-PLT-013 | Platform Ops Center (visual observability) | platform | P0 | observability, auth | health_snapshots, error_groups | /platform/ops/pulse | Platform Pulse | ops.* events | platform.ops.view | pulse payload tests | Documented |
| REQ-PLT-014 | Tenant/module health, errors, timelines | platform | P0 | REQ-PLT-013 | error_*, health_snapshots | /platform/ops/tenants/health, /errors, /timeline | Health + Error explorer | threshold → incident | platform.ops.telemetry.view | fingerprint tests | Documented |
| REQ-PLT-015 | Incidents, root cause, affected records | platform | P1 | REQ-PLT-014 | platform_incidents* | /platform/ops/incidents | Incident detail | auto_incident rules | platform.ops.incidents.manage | dedupe/blast radius | Documented |
| REQ-PLT-017 | Autonomous OS (events→automate→monitor→explain; no CRUD-only features) | core | P0 | all modules | outbox_events | — | — | always | — | design review gate | Documented |
| REQ-WA-001 | WhatsApp first-class + CRM deep integration | whatsapp | P2 | crm, communications | whatsapp_* | WA APIs | Inbox | message.* | whatsapp.* | phone match/timeline | Documented |
| REQ-WA-002 | WhatsApp SaaS packaging on same core | whatsapp | P3 | WL, billing | — | — | WA SKU | — | plan packs | packaging | Documented |
| REQ-FIN-010 | Estimates, orders, recurring, credit/debit notes | finance | P1 | clients | estimates, orders, credit/debit_notes | CRUD | Finance UI | invoice.* | finance.* | history integrity | Documented |
| REQ-FIN-011 | No unsafe erase of financial history | finance | P1 | audit | invoices* | void/credit | — | — | finance.invoices.* | delete blocked tests | Documented |
| REQ-AI-001 | AI Business Assistant (authorized tools only) | core/ai | P3 | RBAC | — | assistant tools | Assistant UI | — | scoped tools | no bypass tests | Documented |
| REQ-PLT-004 | User role hierarchy + custom roles | core | P0 | tenants | users, roles, user_roles | users/roles | Team settings | — | tenant.roles.manage | RBAC matrix | Documented |
| REQ-PLT-005 | Granular RBAC verbs/scopes | core | P0 | roles | permissions, role_permissions | all APIs | — | — | all verbs | scope tests | Documented |
| REQ-PLT-006 | Module entitlements | core | P0 | plans, modules | modules, plan_modules, tenant_modules | modules enable | Super Admin / settings | module disable pauses flows | platform.modules / entitlement | entitlement deny tests | Documented |
| REQ-PLT-007 | Secure authentication | core | P0 | users | users, sessions | auth/* | login | — | — | auth security tests | Documented |
| REQ-PLT-008 | Audit log | core | P0 | auth | audit_logs | audit query | Super Admin / Tenant admin | — | audit.view | append-only tests | Documented |
| REQ-PLT-009 | Soft-delete + metadata | core | P0 | — | deleted_at columns | DELETE soft | — | — | delete verb | soft-delete tests | Documented |
| REQ-PLT-010 | Storage abstraction | core | P0 | files | files | upload/sign | uploaders | — | documents/files perms | storage adapter tests | Documented |
| REQ-PLT-011 | Jobs + scheduler foundations | core | P0 | queue | scheduler defs | — | — | reminders | — | job retry tests | Documented |
| REQ-PLT-012 | Observability foundations | core | P0 | — | logs sinks | — | ops dashboards | failure alerts | — | log correlation tests | Documented |
| REQ-TNT-001 | Tenant entity fields | core | P0 | plans | tenants | /platform/tenants | Super Admin | tenant.* events | platform.tenants.manage | CRUD tests | Documented |
| REQ-TNT-002 | Tenant statuses | core | P0 | tenants | tenants.status | status endpoints | Super Admin | pause jobs | platform.tenants.manage | transition tests | Documented |
| REQ-TNT-003 | Provisioning flow | core | P0 | branding, modules, users | many seeds | provision | Super Admin wizard | — | platform.tenants.manage | e2e provision | Documented |
| REQ-TNT-004 | Settings separation | core | P0 | — | platform vs tenant settings | settings APIs | both consoles | — | configure | isolation of settings | Documented |
| REQ-TNT-005 | Domains (sub + custom) | core | P0/P2 | branding | tenant_domains | domains APIs | domain settings | domain expiring | domains.manage | DNS verify tests | Documented |

### CRM

| Requirement ID | Feature | Module | Priority | Dependencies | DB entities | APIs | UI | Automation | Permissions | Tests | Status |
|----------------|---------|--------|----------|--------------|-------------|------|----|------------|-------------|-------|--------|
| REQ-CRM-001 | Lead creation & fields | crm | P1 | tenant, user, perms | leads, tags, custom fields | POST /leads | Leads | lead.created | crm.leads.create | lead CRUD | Documented |
| REQ-CRM-002 | Assignment, dedup, bulk | crm | P1 | leads | leads, jobs | assign/import/export | Leads | lead.assigned | crm.leads.assign/import/export | import suite | Documented |
| REQ-CRM-003 | Lead conversion lineage | crm | P1 | contacts, companies, deals, clients | lead_conversion_links | POST /leads/{id}/convert | Convert wizard | lead.converted | crm.leads.edit | conversion tests | Documented |
| REQ-CRM-004 | Contacts & companies | crm | P1 | tenant | contacts, companies, company_contacts | CRUD | CRM UI | contact.created | crm.contacts/companies.* | relation tests | Documented |
| REQ-CRM-005 | Customer 360 | crm | P1 | many modules | clients + joins | GET /clients/{id}/360 | Client profile | — | crm.clients.view + module gates | 360 assembly | Documented |
| REQ-CRM-006 | Notes/tags/fields/attachments | crm | P1 | storage | notes, tags, custom_*, files | nested routes | entity panels | — | crm.notes.* etc | attachment ACL | Documented |
| REQ-CRM-007 | Activity timeline | crm | P1 | activities | activities | timeline GET | Timeline | writes on events | view entity | timeline order | Documented |
| REQ-CRM-008 | Global search CRM | crm | P1 | entities | indexes/search | GET /search | Search | — | per-entity view | search scope | Documented |

### Sales / Finance / Billing

| Requirement ID | Feature | Module | Priority | Dependencies | DB entities | APIs | UI | Automation | Permissions | Tests | Status |
|----------------|---------|--------|----------|--------------|-------------|------|----|------------|-------------|-------|--------|
| REQ-SAL-001 | Custom pipelines | sales | P1 | crm | pipelines, stages | pipelines CRUD | Kanban settings | stage events | sales.pipelines.configure | stage move | Documented |
| REQ-SAL-002 | Deals | sales | P1 | pipelines | deals | deals CRUD | Kanban | deal.* | sales.deals.* | deal tests | Documented |
| REQ-SAL-003 | Forecasting reports | sales | P1 | deals | deals aggregates | forecast GET | Reports | — | sales.forecast.view | calc tests | Documented |
| REQ-SAL-004 | Quotes & convert invoice | sales | P1 | finance contract | quotes* | quotes + convert | Quotes | quote.* | sales.quotes.* | convert tests | Documented |
| REQ-SAL-005 | Products catalog | sales | P1 | — | products | products CRUD | Catalog | — | sales.products.* | SKU unique | Documented |
| REQ-FIN-001 | Finance dashboard | finance | P1 | invoices/expenses | aggregates | dashboard GET | Finance home | — | finance.reports.view | KPI tests | Documented |
| REQ-FIN-002 | Invoicing | finance | P1 | clients | invoices* | invoices CRUD/send/pdf | Invoices | invoice.* | finance.invoices.* | status machine | Documented |
| REQ-FIN-003 | Payments | finance | P1 | invoices | payments | record payment | Payments | payment.received | finance.payments.* | partial/refund | Documented |
| REQ-FIN-004 | AR aging + reminders | finance | P1 | scheduler | invoices | AR reports | AR dashboard | invoice.overdue | finance.reports.view | aging buckets | Documented |
| REQ-FIN-005 | AP vendor bills | finance | P1 | vendors | vendor_bills | CRUD | AP UI | — | finance.vendors.* | AP tests | Documented |
| REQ-FIN-006 | Expenses | finance | P1 | — | expenses | CRUD/approve | Expenses | expense.approved | finance.expenses.* | approval flow | Documented |
| REQ-FIN-007 | Vendor management | finance | P1 | — | vendors | CRUD | Vendors | — | finance.vendors.* | vendor profile | Documented |
| REQ-FIN-008 | GST/tax configurable | finance | P1 | tax tables | tax_rates, tax_rules | tax config | Tax settings | — | finance.tax.configure | India pack tests | Documented |
| REQ-FIN-009 | Financial reports export | finance | P1 | jobs | — | reports/export | Reports | — | finance.reports.view + export | export perm | Documented |
| REQ-BIL-001 | Customer subscriptions | billing | P1 | clients, products | customer_subscriptions* | subscriptions | Billing | subscription.* | billing.subscriptions.* | lifecycle | Documented |
| REQ-BIL-002 | Subscription states/actions | billing | P1 | REQ-BIL-001 | same | lifecycle actions | Billing | expiring/past_due | billing.subscriptions.manage | state machine | Documented |
| REQ-BIL-003 | Platform plans/limits | platform | P1 | modules | plans* | /platform/plans | Super Admin | plan.changed | platform.billing.manage | entitlement sync | Documented |
| REQ-BIL-004 | Usage metering | core/billing | P1 | plans | usage_counters | /usage | Admin usage | limit warning | platform/tenant view | limit enforce | Documented |

### Tasks / team / automation / notifications

| Requirement ID | Feature | Module | Priority | Dependencies | DB entities | APIs | UI | Automation | Permissions | Tests | Status |
|----------------|---------|--------|----------|--------------|-------------|------|----|------------|-------------|-------|--------|
| REQ-TM-001 | Team structures | team | P1 | users | departments, teams, employees | team CRUD | Team | — | team.employees.* | org tests | Documented |
| REQ-TSK-001 | Tasks views | tasks | P1 | users | tasks | tasks CRUD | List/Board/Cal | task.* | tasks.tasks.* | views | Documented |
| REQ-TSK-002 | Follow-ups recurring | tasks | P1 | tasks | recurrence_rules | follow-ups | Follow-ups | reminders | tasks.tasks.* | recurrence | Documented |
| REQ-TSK-003 | Meetings calendar | tasks | P1 | users | meetings | meetings | Calendar | meeting.scheduled | tasks.meetings.* | participants | Documented |
| REQ-DPR-001 | DPR + targets | team | P1 | activities | dpr_entries, targets | dpr/targets | DPR | dpr.submitted | team.dpr.* | rollup | Documented |
| REQ-COM-001 | Commissions rules | team | P2 | deals/payments | commission_* | commissions | Commissions | commission.calculated | team.commissions.* | rule engine | Documented |
| REQ-AUT-001 | Workflow graph engine (delay/branch/loop/parallel) | automation | P1 | events, jobs | workflows* | workflows CRUD | Visual builder | self | automation.workflows.* | graph/guards | Documented |
| REQ-AUT-002 | Full trigger catalog | automation | P1 | modules | workflow_triggers | — | Builder | all listed | configure | catalog tests | Documented |
| REQ-AUT-003 | Retry/logs/version/test/simulator/override | automation | P1 | workers | workflow_runs* | retry/test/override | Run history + debugger | failure alerts | manage/debug | retry+idempotency | Documented |
| REQ-AUT-004 | No-code WHEN/CHECK/THEN visual builder | automation | P1 | REQ-AUT-001 | workflow_steps | builder APIs | Canvas | — | create/edit | UX validation | Documented |
| REQ-AUT-005 | Approvals + human-in-the-loop | automation | P1 | users | workflow_approvals | approve/reject | Approval inbox | wait human | execute/approve | gate tests | Documented |
| REQ-AUT-006 | Wait-for-event + calendar/timezone | automation | P1 | scheduler | run wait states | — | Wait nodes | resume on event | configure | durable wait | Documented |
| REQ-AUT-007 | Cross-module + API/webhook + mapping | automation | P1 | crm/sales/finance/comms | steps + vars | action APIs | Mapper | action events | + integrations | mapping tests | Documented |
| REQ-AUT-008 | Idempotency, fallbacks, rate/concurrency | automation | P1 | outbox | run keys | — | — | failure paths | — | double-event tests | Documented |
| REQ-AUT-009 | Templates/blueprints + lifecycle states | automation | P1 | — | workflow_templates | templates install | Library | — | publish | lifecycle tests | Documented |
| REQ-AUT-010 | Health + history + visual debugger | automation | P1 | runs | health_rollups | runs detail | Debugger UI | — | debug/view_logs | step inspect | Documented |
| REQ-AUT-011 | Tenant/Super Admin auto dashboards + incidents | automation/platform | P1 | ops center | — | /automation/analytics, /platform/ops/automations | Dashboards | incident link | view + platform.ops | dashboard contracts | Documented |
| REQ-AUT-012 | NL builder + Copilot (no auto-publish) | automation | P2 | AI provider | workflow_ai_sessions | /workflows/ai/* | Copilot panel | draft only | manage_ai | no-autopublish test | Documented |
| REQ-AUT-013 | AI explain/optimize/debug + suggestions | automation | P2 | REQ-AUT-012 | suggestion_events | ai explain/optimize | Copilot | opt-in suggest | manage_ai | fact/inference labeling | Documented |
| REQ-AUT-014 | Quotas, cost, premium packaging | automation/billing | P1 | metering | usage + costs | /usage | Plan limits UI | quota warnings | — | limit enforce | Documented |
| REQ-AUT-015 | Emergency pause controls | platform | P1 | ops | tenant_job_controls + flags | emergency APIs | Ops Center | emergency.paused | platform.ops.recover | audit emergency | Documented |
| REQ-AUT-016 | Event replay + automation API | automation/api | P2 | webhooks | — | replay + workflow API | — | — | api scopes | replay idempotent | Documented |
| REQ-AUT-017 | Process mining / discovery | automation | P3 | activity | patterns | suggestions | Discovery UI | — | manage_ai | opt-in only | Documented |
| REQ-AUT-018 | Automation marketplace | automation | P3 | templates | marketplace pkgs | install APIs | Marketplace | — | Super Admin gate | install sandbox | Documented |
| REQ-NTF-001 | Notification system | core | P1 | channels | notifications* | notifications | Bell + prefs | router on events | prefs self | delivery idempotency | Documented |

### API / webhooks / P2 / P3

| Requirement ID | Feature | Module | Priority | Dependencies | DB entities | APIs | UI | Automation | Permissions | Tests | Status |
|----------------|---------|--------|----------|--------------|-------------|------|----|------------|-------------|-------|--------|
| REQ-API-001 | REST API platform | api | P1 | RBAC, entitlements | api_keys | /api/v1/* | API keys UI | — | api keys perms | contract tests | Documented |
| REQ-WHK-001 | Tenant webhooks | api | P1 | outbox | webhook_* | webhooks CRUD | Webhooks | — | webhooks.manage | retry/signature | Documented |
| REQ-INT-001 | Modular integrations | integrations | P2 | secrets | tenant_integrations | integrations | Integrations | provider actions | integrations.configure | secret redaction | Documented |
| REQ-SUP-001 | Helpdesk tickets | support | P2 | clients | tickets* | tickets | Support | ticket.* | support.tickets.* | SLA fields | Documented |
| REQ-DOC-001 | Document management | documents | P2 | storage | documents* | documents | Docs | document.expiring | documents.* | version ACL | Documented |
| REQ-MSG-001 | Communication center | communications | P2 | integrations | messages | send/list | Inbox | message.* | communications.* | channel metering | Documented |
| REQ-PRT-001 | Client portal | portal | P3 | many | portal sessions | portal APIs | Portal | — | portal perms | portal ACL | Documented |
| REQ-VAI-001 | Voice AI optional | voice_ai | P3 | crm | voice_* | voice APIs | Voice | voice.call.* | voice.* | metering | Documented |
| REQ-TEL-001 | Telephony inventory | telephony | P3 | — | telephony_* | channels | Telephony | channel.expiring | telephony.* | assignment | Documented |
| REQ-VBL-001 | Voice usage billing | voice_ai/billing | P3 | metering, finance | usage + invoice lines | usage bill | Billing | — | billing/finance | invoice lines | Documented |
| REQ-RSL-001 | Reseller system | platform | P3 | tenancy | parent/reseller fields | reseller APIs | Reseller console | — | reseller.* not platform.* | subtree isolation | Documented |
| REQ-CUS-001 | Fields/statuses/pipelines/views/layouts | core/customization | P1 | tenant | custom_field_*, layouts, pipelines | settings APIs | Settings Center | custom.* | *.configure | field key stability | Documented |
| REQ-CUS-002 | Forms + conditional logic | customization | P2 | fields | custom_forms* | forms CRUD | Form builder | form.submitted | configure | conditional tests | Documented |
| REQ-CUS-003 | Validation + business rules | customization | P2 | CRM/Sales | validation_rules, business_rules | rules APIs | Rules UI | gate transitions | configure | rule enforce | Documented |
| REQ-CUS-004 | Dashboards + report builder | reporting/customization | P2 | fields | dashboard_*, report_definitions | reports CRUD | Builder | — | reporting.* | custom dim reports | Documented |
| REQ-CUS-005 | Templates, numbering, calendar | customization | P1 | branding | templates, numbering_series, calendars | settings | Settings | schedule uses calendar | configure | concurrency numbering | Documented |
| REQ-CUS-006 | Config audit/deps/archive | customization | P1 | audit | config_change_log, config_dependencies | impact APIs | Impact UI | — | configure | block unsafe delete | Documented |
| REQ-CUS-007 | Export/import/clone/blueprints | customization | P2 | — | config_packs, blueprint_installs | export/import | Blueprints | — | config.export | no secrets export | Documented |
| REQ-CUS-008 | Plan quotas + Settings Center | customization/billing | P1 | plans | tenant_limits | /usage | Settings nav | quota warn | — | limit enforce | Documented |
| REQ-CUS-009 | Custom objects + relationships | customization | P3 | ADR-013 | custom_objects*, relationships | objects CRUD | Object builder | custom.object.* | configure | isolation tests | Documented |
| REQ-CUS-010 | Config API + custom events | api/customization | P2 | outbox | — | /settings/* | — | automation consume | api scopes | key≠label | Documented |
| REQ-CUS-011 | Sandbox configuration | customization | P3 | enterprise | sandbox workspaces | promote APIs | Sandbox | — | configure | promote audit | Documented |
| REQ-CUS-012 | AI config assistant | customization/ai | P3 | AI | ai sessions | ai propose | Assistant | draft only | manage_ai | no silent apply | Documented |
| REQ-CUS-013 | Custom module requests | platform | P3 | Super Admin | custom_module_requests | request APIs | Request form | — | platform review | request lifecycle | Documented |
| REQ-PLG-001 | Plugin architecture | core | P2 | module registry | manifests | — | — | register actions | — | registry boot | Documented |
| REQ-EMB-001 | Embedding model | api | P3 | API | — | public API | — | webhooks | api keys | partner sandbox | Documented |

---

## 3. Example detailed record

### REQ-CRM-001 — Lead Creation

| Field | Value |
|-------|-------|
| Feature | Lead Creation |
| Priority | Critical / P1 |
| Module | CRM |
| Dependencies | Tenant, User, Permissions |
| Database | `leads`, optional tags/custom fields |
| API | `POST /api/v1/leads` |
| UI | Leads → New Lead |
| Automation trigger | `lead.created` |
| Notifications | New lead / assignment |
| Permissions | `crm.leads.create` (+ view) |
| Tests | Required — validation, tenancy, authz, event emit |
| Status | Documented |

---

## 4. NFR traceability

| ID | Area | Spec doc | Status |
|----|------|----------|--------|
| NFR-001 | Scalability | SYSTEM_ARCHITECTURE, DEPLOYMENT | Documented |
| NFR-002 | Performance | SYSTEM_ARCHITECTURE, TESTING | Documented |
| NFR-003 | Security | SECURITY | Documented |
| NFR-004 | Availability | DEPLOYMENT, BACKUP_RECOVERY | Documented |
| NFR-005 | Backup | BACKUP_RECOVERY | Documented |
| NFR-006 | Recovery | BACKUP_RECOVERY | Documented |
| NFR-007 | Maintainability | SYSTEM_ARCHITECTURE, PLUGIN_SYSTEM | Documented |
| NFR-008 | Extensibility | MODULE_SYSTEM, PLUGIN_SYSTEM | Documented |
| NFR-009 | API compatibility | API_VERSIONING | Documented |
| NFR-010 | Observability | OBSERVABILITY | Documented |
| NFR-011 | Tenant isolation | MULTI_TENANCY, TESTING | Documented |

---

## 5. Maintenance rule

Any new feature adds a REQ row **before** implementation. Status updates during build. Do not silently drop requirements — mark `Deferred` with rationale/ADR if needed.
