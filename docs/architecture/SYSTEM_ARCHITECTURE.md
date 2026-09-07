# SYSTEM_ARCHITECTURE.md — ThinkAIQ

## 1. Purpose

Design the platform as:

```
CORE PLATFORM → Modules → Automation → Integrations → APIs → White-label → SaaS Billing
```

**ONE CORE → MANY PRODUCTS → MANY TENANTS.** Features are not isolated CRUD; they participate in the event → automate → notify → audit → meter loop ([MASTER_PRINCIPLES.md](../product/MASTER_PRINCIPLES.md)).

Define the technical architecture for ThinkAIQ as a **modular monolith**: one deployable platform with clear internal module boundaries, multi-tenant isolation, white-label configuration, and API/automation-first capabilities.

**Default product identity:** **ThinkAIQ CRM** (company **ThinkAIQ**). See [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md). Responsive / future mobile clients share that identity ([RESPONSIVE_AND_MOBILE.md](./RESPONSIVE_AND_MOBILE.md)). Tenant branding is host-scoped per ADR-018 — never as global platform chrome.

---

## 2. Architecture posture

| Decision | Choice |
|----------|--------|
| Initial shape | Modular monolith |
| Microservices | Not at start; extract later when scale/ownership demands |
| Code forks | Forbidden as default delivery model |
| Deployments | One platform serves many tenants |
| Isolation | Shared database with strict `tenant_id` enforcement (see ADR-001) |
| Stack | Proposed in ADR-002 (open until ratified) |

---

## 3. High-level logical view

```
┌─────────────────────────────────────────────────────────────┐
│                     Edge / Ingress                          │
│  Domains · TLS · Rate limits · WAF (future)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                 Application Platform                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Super Admin │  │ Tenant App  │  │ Public/Client Portal│  │
│  │ Console     │  │ (white-lbl) │  │ (future)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ API Gateway layer (authn/authz, tenancy, entitlements)│  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────┐  │
│  │ Identity │ Tenancy  │ Modules  │ Billing  │ Audit     │  │
│  │ RBAC     │ WL Brand │ Entitle  │ Metering │ Search    │  │
│  └──────────┴──────────┴──────────┴──────────┴───────────┘  │
│  ┌──────────┬──────────┬──────────┬──────────┬───────────┐  │
│  │ CRM      │ Sales    │ Finance  │ Tasks    │ Support   │  │
│  │ Docs     │ Team/DPR │ Comms    │ Notify   │ Reporting │  │
│  └──────────┴──────────┴──────────┴──────────┴───────────┘  │
│  ┌──────────┬──────────┬──────────┬──────────────────────┐  │
│  │Automation│ Webhooks │ API Keys │ Integrations         │  │
│  └──────────┴──────────┴──────────┴──────────────────────┘  │
│  ┌──────────┬──────────┐                                    │
│  │ Voice AI │Telephony │  (optional modules)                │
│  └──────────┴──────────┘                                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Workers · Scheduler · Queue                                  │
│ Emails · Automations · Imports · Webhooks · Reports · Voice  │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│ Data plane                                                   │
│ PostgreSQL · Object Storage · Cache · Search index (future)  │
│ Secrets manager · Observability backend                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Layered responsibilities

### 4.1 Presentation

- Super Admin UI (platform scope) — tenant/commercial admin **and** visual ops/incident control center ([PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md)); always **ThinkAIQ** platform branding
- Tenant UI (branded; module-gated navigation); default unbranded surfaces use **ThinkAIQ CRM**
- Optional client portal UI (tenant-controlled)
- No business logic in UI beyond presentation/state
- Responsive shell: [RESPONSIVE_AND_MOBILE.md](./RESPONSIVE_AND_MOBILE.md)

### 4.2 Application / domain services

Each module owns:

- Use cases / application services
- Domain validation & business rules
- Permission checks (via shared RBAC)
- Domain events emission

### 4.3 Platform kernel (shared)

Must remain thin and stable:

- Authentication & sessions
- Tenancy resolution (host/header/token)
- RBAC evaluation
- Module entitlements
- Audit logging
- Event bus / outbox
- Storage abstraction
- Job enqueue API
- Configuration service
- Metering hooks

### 4.4 Infrastructure

- DB repositories with mandatory tenant filters
- Queue/workers
- Object storage adapters
- Email/SMS/WhatsApp providers
- Payment gateway adapters
- Telephony/Voice providers (optional)

---

## 5. Module boundary rules

A module may:

- Define entities, permissions, settings, APIs, webhooks, automations, nav items, widgets
- Depend on platform kernel
- Depend on **published contracts** of other modules (IDs + events), not internal tables casually

A module must not:

- Bypass tenant scoping
- Call into another module’s private persistence
- Hard-code tax/branding/plan logic that belongs in configuration
- Assume Voice AI is always present

See [MODULE_SYSTEM.md](./MODULE_SYSTEM.md) and [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md).

---

## 6. Request lifecycle

1. Resolve host → tenant (or Super Admin platform context)
2. Authenticate principal
3. Authorize permission + ownership scope
4. Check module entitlement + plan limits
5. Execute use case
6. Write domain data (tenant-scoped)
7. Emit domain event (outbox)
8. Enqueue side effects (notify, webhook, automation, metering)
9. Write audit entry when required
10. Return API response

---

## 7. Event-driven backbone

Internal domain events power:

- Automation engine
- Webhooks
- Notifications
- Timeline/activity
- Metering counters
- Search index updates (future)

Recommended pattern: **transactional outbox** → worker consumers.

---

## 8. Data architecture summary

- All tenant business rows include `tenant_id`
- Platform tables (plans, global modules catalog, super admins) are platform-scoped
- Soft deletes where appropriate (`deleted_at`)
- File bytes in object storage; metadata in DB
- Secrets encrypted at rest

Details: [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md), [MULTI_TENANCY.md](./MULTI_TENANCY.md), [STORAGE.md](../deployment/STORAGE.md).

---

## 9. Cross-cutting concerns

| Concern | Approach |
|---------|----------|
| AuthN | Session + API keys; OAuth-ready |
| AuthZ | RBAC + ownership scopes |
| Tenancy | Middleware + repository enforcement |
| Validation | Schema + domain rules |
| Errors | Typed error model ([ERROR_HANDLING.md](../api/ERROR_HANDLING.md)) |
| Idempotency | Especially payments, webhooks, imports |
| Rate limits | Per tenant / API key / IP |
| Observability | Correlation IDs end-to-end |

---

## 10. Scaling strategy

**Phase A (now):** Vertical app + horizontal workers + shared Postgres  
**Phase B:** Read replicas, cache hot configs/branding, queue partitioning by tenant  
**Phase C:** Extract hot modules (automation, voice, messaging) behind contracts  

Do not split services before operational need.

---

## 11. Security architecture summary

- Tenant isolation tests in CI
- Privilege separation Super Admin ≠ Tenant Admin
- Encrypted integration credentials
- Immutable audit trail style
- Secure file URLs / ACL checks

See [SECURITY.md](../security/SECURITY.md).

---

## 12. Deployment topology (target)

- App instances (stateless)
- Worker instances
- Scheduler (single-leader or distributed locks)
- PostgreSQL
- Redis (cache/queue/locks — candidate)
- Object storage (S3-compatible)
- Reverse proxy / load balancer

See [DEPLOYMENT.md](../deployment/DEPLOYMENT.md).

---

## 13. Open decisions

| Topic | ADR |
|-------|-----|
| Isolation model | ADR-001 |
| Tech stack | ADR-002 |
| Dual billing domains | ADR-003 |
| Automation execution | ADR-004 |
| Custom domain SSL | ADR-005 |

---

## 14. Related documents

- [MULTI_TENANCY.md](./MULTI_TENANCY.md)
- [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md)
- [MODULE_SYSTEM.md](./MODULE_SYSTEM.md)
- [API_SPECIFICATION.md](../api/API_SPECIFICATION.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [IMPLEMENTATION_PLAN.md](../product/IMPLEMENTATION_PLAN.md)
