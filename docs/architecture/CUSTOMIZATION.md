# CUSTOMIZATION.md — ThinkAIQ Client Self-Customization & Configuration Engine

## 1. Core principle

ThinkAIQ is **not** a rigid hard-coded CRM.

Each tenant configures and extends the platform for its business **without ThinkAIQ developers** for normal changes, and **without forking the core codebase**.

```
Configure → Customize → Extend → Automate
```

> A client should adapt ThinkAIQ to their business without changing the core codebase.

**Hard rules**

- All customization is **tenant-scoped**  
- One tenant’s config never affects another  
- Prefer configuration over plugins over custom modules over code forks (forks = last resort)  
- Preserve isolation, security, permissions, API consistency, automation compatibility, auditability, performance, upgrade compatibility, white-label  

**Long-term goal:** ONE THINKAIQ CORE + MANY BUSINESS CONFIGURATIONS + MANY SaaS PRODUCTS  

Priority: **P1** (fields/layouts/pipelines/views) · **P2** (forms/report builder/import-export) · **P3** (custom objects, sandbox, AI config assistant)  

Related: [MASTER_PRINCIPLES.md](../product/MASTER_PRINCIPLES.md), [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md), [MODULE_SYSTEM.md](./MODULE_SYSTEM.md), [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md), [ADR-013](../decisions/ADR-013-customization-metadata-model.md).

---

## 2. Scope — what tenants can customize

Where plan + permission allow:

Custom fields · sections · forms · layouts · statuses · pipelines · stages · tags · categories · lead sources · task types · ticket types · views · filters · dashboards · tables/custom objects · relationships · validation rules · business rules · automations · notifications · document/email/WhatsApp templates · branding · workflows · numbering series · business calendar  

---

## 3. Success criteria

A normal Tenant Admin can independently:

**Create custom field → add to form → add to layout → use in filter → use in report → use in automation → expose via API (if authorized)**  

…without a developer. Same bar for statuses, pipelines, forms, dashboards, templates, views, workflows, business rules.

---

## 4. User types

| Role | Typical access |
|------|----------------|
| Tenant Owner/Admin | Full Settings Center (plan-gated) |
| Manager | Views, dashboards, limited CRM config |
| Employee | Personal views; no structural config |
| Super Admin | Global templates, blueprints, plan limits, feature flags |
| Platform Operator | Support view of config audit (no silent cross-tenant edit) |

Permissions examples: `tenant.settings.configure`, `crm.fields.configure`, `sales.pipelines.configure`, `automation.workflows.publish`, `reporting.reports.create`, `tenant.config.export`.

---

## 5. Tenant Settings Center (UX)

Non-technical, guided navigation:

```
Settings
├── Company
├── Branding
├── Users / Roles / Permissions
├── CRM
├── Sales
├── Finance
├── Billing
├── Automation
├── Notifications
├── Integrations
├── Documents
├── WhatsApp
├── API
└── Advanced (numbering, calendar, custom objects, import/export config)
```

Feeling target: *“I can make this software fit my business”* — not *“I need a developer.”*

---

## 6. Custom field builder

### 6.1 Field types

Short/long text · Number · Currency · Percentage · Date · Date/time · Boolean · Dropdown · Multi-select · Radio · Checkbox · Email · Phone · URL · Address · File · Image · User · Team · Relation · Formula/calculated (where supported)

### 6.2 Field properties

Label · **Internal key** (stable; never change with label) · Description · Placeholder · Required · Default · Help text · Visibility · Searchable · Filterable · Sortable · Exportable · API accessible · Automation accessible · Role visibility · Validation · Options · Display order

Example: `Property Type` dropdown → Residential / Commercial / Industrial / Land — immediately available on assigned entities/forms.

### 6.3 Storage (see ADR-013)

Definitions in `custom_field_definitions`; values in typed/`JSONB` value store keyed by `(tenant_id, definition_id, entity_type, entity_id)`.

---

## 7. Custom forms & conditional logic

### Forms use cases

Lead capture · intake · onboarding · support · internal entry · applications · custom processes  

Components: text, email, phone, dropdown, multi-select, date, file, address, custom fields, rich text, sections  

**Submission → automation:** create lead → assign → email → start workflow  

### Conditional logic (no code)

IF condition → show/hide field · require field · change options · show section  

Example: Industry = Real Estate → show Property Type; Industry = Education → show Student Information  

---

## 8. Custom layouts (record pages)

Tenant Admin configures sections/fields order/visibility on Client/Lead/Deal/etc. pages.

Example Client page sections: Company Information · Primary Contact · Sales · Custom Information  

Role-based visibility supported.

---

## 9. Statuses, pipelines, stages

### Statuses

Tenant-specific lists (leads, tickets, etc.). System-critical statuses may be flagged immutable but relabelable where safe.

### Pipelines

Multiple pipelines per tenant (Sales, Implementation, Support, …), each with own stages + automations.

### Stage config

Name · description · order · probability · required fields · allowed transitions · automation triggers · notifications · permissions · color/icon · stage-specific fields  

---

## 10. Custom objects & relationships (prepared architecture)

### Objects (P3 commercially; schema-ready earlier)

Examples: Property/Unit/Site Visit · Student/Course/Enrollment · Patient/Appointment/Treatment  

Defined without core source edits via metadata + generic storage (ADR-013). Plan-gated.

### Relationships

Company→Contacts · Client→Properties · Student→Courses · Deal→Documents · Custom A↔Custom B  

Types: one-to-one · one-to-many · many-to-many  

---

## 11. Validation & business rules

### Validation examples

- Customer type = Business → GSTIN required  
- Deal value > ₹100,000 → manager approval required  
- Status = Won → close date required  

### Business rules (gate transitions)

Salesperson cannot move deal to Won unless required fields complete, proposal accepted, payment condition satisfied — integrates with permissions + automation/HITL.

---

## 12. Views, dashboards, reports

### Saved views

Filters · sorting · columns · grouping · visibility · default view  
Examples: My Leads, High Value Leads, Overdue Invoices, Renewals This Month  

### Dashboards

Permitted widgets: number, chart, table, funnel, pipeline, activity, revenue, tasks, finance, automation, support, customer health — role-specific  

### Report builder (P2)

Entity · fields · filters · grouping · sorting · calculations · date ranges · charts · export  
Example: “Revenue by salesperson last 30 days” — custom fields included when authorized  

---

## 13. Templates (documents, email, WhatsApp, workflows)

- **Documents:** invoice, quote, proposal, agreement, letters — variables `{{client.name}}`, `{{invoice.total}}`, tenant branding (ADR-018 / ADR-022); platform default templates use **ThinkAIQ CRM** identity when no tenant brand applies ([PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md))  
- **Email:** reusable subject/body with variables  
- **WhatsApp:** provider-approved tenant templates ([WHATSAPP.md](../modules/WHATSAPP.md))  
- **Workflow templates:** save “Enterprise Client Onboarding”, duplicate & customize  

---

## 14. Tags, categories, numbering, calendar

- Tags: VIP, Hot Lead, At Risk — filter/segment/automate  
- Categories: product, expense, ticket, lead, document, custom  
- **Numbering:** `LD-000001`, `INV/2026/000001`, `QT/…`, `TKT-…` — unique under concurrency (sequence + tenant scope)  
- **Business calendar:** timezone, working days/hours, holidays — used by automation/scheduler  

---

## 15. Customization + automation / reporting / API / events

**Critical:** custom fields, statuses, objects, and events are **first-class** in the automation engine.

Example: Priority = High → assign senior · urgent task · notify  

Events (examples): `custom.field_changed`, `custom.object.created`, `custom.stage.changed`, entity-qualified keys where needed  

API: expose via **stable internal keys**, never display labels; include type, validation metadata, permissions, tenant ownership  

Reporting: custom fields/objects available to authorized report tools  

---

## 16. Safe customization boundaries

Tenant Admin **must not**:

- Access another tenant  
- Alter platform security / Super Admin surface  
- Bypass RBAC  
- Access secrets  
- Modify core system tables unsafely  
- Break other tenants  
- Run unrestricted server code  

All changes run through a **controlled configuration layer** (metadata APIs + validators).

Extension ladder:

```
Configuration → Custom fields/layouts/workflows → Plugin → Custom module → Custom development
```

Unrestricted code execution is **not** exposed to ordinary tenants. Enterprise extensions: approved plugins, webhooks, external functions, APIs ([PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md)).

---

## 17. Versioning, audit, dependency & impact

### Tracked changes

Field/pipeline/validation/workflow/dashboard/layout created or modified — who, what, when, before/after  

### Audit log

Every major config action audited (tenant, actor, action, entity, timestamp).

### Dependencies & impact analysis

Deleting/changing a field used in 7 workflows + 3 reports → block with explanation; offer view dependencies / replace / disable / archive / delete after resolve  

Risky type changes require confirmation listing affected workflows, reports, forms, integrations, dashboards, API consumers  

### Safe deletion

Prefer **archive** over destroy when historical records depend on config (archived field/pipeline/workflow/status remain readable on old records).

### Config search

“Show all workflows using Customer Segment” · “Where is this field used?”

### Config testing

Validate dependencies, required fields, workflows, API mappings, permissions, templates; preview/test mode where practical  

### Sandbox (Enterprise P3)

Staging configuration environment before apply-to-production  

---

## 18. Export / import / clone / blueprints

- **Export/import** supported config packs (fields, layouts, pipelines, statuses, views, automations, templates) — **never** secrets by default  
- **Clone** pipeline/workflow/dashboard/form/layout  
- **Blueprints:** Agency / Real Estate / Education / Service Business — install fields, pipelines, statuses, dashboards, automations, templates into a tenant  
- Super Admin: global modules, templates, optional global field catalogs, automation templates, feature flags  
- Plan gates customization quotas (see §19)  

---

## 19. Plan-based customization

| Band | Typical capability |
|------|--------------------|
| Starter | Basic custom fields, limited views |
| Business | Fields + layouts + forms + workflows + dashboards |
| Enterprise | Custom objects, advanced rules, sandbox, higher quotas, custom module requests |

Limits may include: # custom fields, objects, forms, workflows, reports, dashboards, layouts, advanced features  

Metered/warned like other quotas ([USAGE_METERING.md](../operations/USAGE_METERING.md)).

---

## 20. Custom module request system

When config cannot satisfy need, Tenant Admin submits **Custom Module Request**: requirement, screens, fields, workflow, permissions, integrations, business purpose  

Super Admin reviews → fulfill via configuration, plugin, custom module, or professional services  

---

## 21. Configuration API

Eventually expose (permissioned):

Create/update custom field · pipeline · workflow · layout · template · view  

Always enforce tenant + RBAC + plan limits.

---

## 22. AI Configuration Assistant (P3)

Assist only — propose field/workflow, wait for approval. Never silent production changes.

Examples: “Track annual vs monthly billing” → suggest Billing Cycle dropdown; “Annual → renewal task 30 days before” → propose field + workflow  

Explain: where field used, pipeline change impact, why delete blocked — based on real dependency metadata  

---

## 23. Progressive adoption journey

| Time | Example |
|------|---------|
| Day 1 | CRM + Sales |
| Month 3 | Custom fields + pipeline |
| Month 6 | Finance + automation |
| Year 1 | Custom objects + integrations |

No platform rebuild required.

---

## 24. Data model (summary)

| Table / concept | Purpose |
|-----------------|--------|
| `custom_field_definitions` | Field metadata + stable key |
| `custom_field_values` | Per-record values |
| `custom_forms` / `custom_form_fields` / `form_logic_rules` | Forms + conditionals |
| `layout_definitions` / `layout_sections` | Record page layouts |
| `status_definitions` | Tenant statuses per entity |
| `pipelines` / `pipeline_stages` | (sales + generic) |
| `custom_objects` / `custom_object_fields` / `custom_records` | P3 objects |
| `custom_relationships` | Relationship metadata |
| `validation_rules` / `business_rules` | Config rules |
| `saved_views` | Views |
| `dashboard_layouts` / `dashboard_widgets` | Dashboards |
| `report_definitions` | Saved reports |
| `document_templates` / `email_templates` | Templates |
| `numbering_series` | Concurrent-safe sequences |
| `tenant_calendars` / `holidays` | Business calendar |
| `config_versions` / `config_change_log` | Versioning |
| `config_dependencies` | Impact graph |
| `config_packs` / `blueprint_installs` | Export/import/blueprints |
| `custom_module_requests` | Request queue |

Full columns evolve in [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md).

---

## 25. APIs / events / notifications / audit / analytics

- APIs: `/settings/custom-fields`, `/settings/layouts`, `/settings/pipelines`, `/settings/forms`, config export/import  
- Events: custom field/object/stage changes for automation  
- Notifications: on custom status/field/date/approval triggers per tenant prefs  
- Audit: all structural config mutations  
- Analytics: custom dimensions in reports when entitled  

---

## 26. Error handling & edge cases

- Duplicate internal keys → reject  
- Type change with incompatible values → block or migrate wizard  
- Concurrent numbering → transactional sequence  
- Blueprint install conflict → merge report  
- Quota exceeded → clear upgrade CTA  
- Archived field still on old records → read-only display  

---

## 27. Security requirements

Tenant isolation on every config row · no cross-tenant blueprint leak of secrets · permission checks on configure vs use · API keys cannot escalate via custom field metadata · formula fields sandboxed (no arbitrary code)  

---

## 28. Future extension points

- Marketplace config packs  
- Vertical blueprint marketplace  
- Sandbox promote-to-prod pipelines  
- AI bulk config from process documents  
- Enterprise signed plugins consuming custom object schema  

---

## 29. Phased delivery

| Phase | Scope |
|-------|-------|
| P1 | Fields, statuses, pipelines/stages, tags/categories, views, layouts (basic), numbering, calendar, Settings Center shell, audit |
| P2 | Forms + conditionals, dashboards, report builder, templates, export/import/clone, dependency/impact UI, validation rules |
| P3 | Custom objects/relationships, business rules engine depth, sandbox, AI config assistant, module request portal |

---

## 30. Related documents

- [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md)  
- [RBAC_PERMISSIONS.md](../security/RBAC_PERMISSIONS.md)  
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)  
- [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md)  
- [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md)  
- [AUDIT_LOG.md](../security/AUDIT_LOG.md)  
