# MULTI_TENANCY.md — ThinkAIQ

## 1. Purpose

Define how ThinkAIQ isolates businesses (tenants), provisions them, and enforces tenant boundaries across application, data, API, jobs, storage, and search.

**Canonical decision sources:** [ADR-001](../decisions/ADR-001-tenancy-isolation-model.md) (row isolation) · [ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md) (provision, membership, host resolution) · [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md) (tenant branding) · [PLATFORM_IDENTITY_AND_BRANDING.md](./PLATFORM_IDENTITY_AND_BRANDING.md) (platform default **ThinkAIQ CRM**) · [ADR-020](../adr/ADR-020-AUTH-AND-MULTI-MEMBERSHIP.md) (auth membership).

**Supersession note:** Earlier drafts assumed `one user → one tenant`. That model is **rejected**. Canonical model:

```text
global user → tenant_memberships → one or more tenants
```

Platform Super Admins are a **separate principal type** — not tenant memberships by default.

---

## 2. Tenant definition

A **tenant** is an isolated business workspace with its own memberships, data, branding, modules, plan, limits, and settings.

### Core fields

| Field | Description |
|-------|-------------|
| `tenant_id` | Stable UUID primary key (`tenants.id`) |
| `display_name` / `legal_name` | Product vs legal |
| `slug` | Unique URL-safe identifier → `{slug}.thinkaiq.com` |
| `status` | `provisioning` → `active` → `suspended` → `archived` → `deleting` (ADR-017) |
| `plan_id` | Commercial plan |
| Platform subscription | Link via `platform_subscriptions` (ADR-021) — not tenant finance |
| Branding | `tenant_branding` (ADR-018); platform default identity is ThinkAIQ CRM when WL does not apply |
| Domains | `tenant_domains` |
| Settings | `tenant_settings` / structured JSON |
| Entitlements | `tenant_modules` + `tenant_limits` (+ overrides) |
| Usage | `usage_counters` / `tenant_usage` metering |
| Lifecycle dates | `trial_ends_at`, `suspended_at`, `archived_at`, … |

Trial / expired / cancelled map onto the ADR-017 status machine (e.g. expired → `suspended` with reason; cancelled → `archived`).

---

## 3. Tenant statuses & transitions

| Status | Meaning | API / jobs (summary) |
|--------|---------|----------------------|
| `provisioning` | Seed in progress | Business APIs blocked; provision jobs only |
| `active` | Normal use | Full per entitlements |
| `suspended` | Billing/abuse/admin hold | Mutations blocked; business jobs paused (allowlist: platform billing/lifecycle) |
| `archived` | Soft-closed; retention | Login denied or export-only; no business jobs |
| `deleting` | Hard purge | Purge workers only |

Super Admin status changes are audited. Mid-run automation checkpoints and pauses on suspend (ADR-015/017).

---

## 4. Identity & membership model

| Concept | Table / type | Rule |
|---------|--------------|------|
| Global user | `users` | Credentials/identity; **no** owning `tenant_id` |
| Membership | `tenant_memberships` | `(user_id, tenant_id)` UNIQUE; status invited/active/disabled |
| Role | `roles` + `user_roles` / membership roles | **Per tenant** |
| Tenant admin | Owner/Admin role on membership | Not platform admin |
| Platform Super Admin | `platform_users` | Separate realm (ADR-020/023) |

**Do not** use Vencore `users.workspace_id` or a final `users.tenant_id` as the SaaS model.

Login email policy (proposed, ADR-017): **globally unique** email; one identity, many memberships.

---

## 5. TenantContext

Every authenticated tenant request/job carries a **TenantContext** (conceptual):

```text
TenantContext
  tenantId
  principal: { type: user|api_key|system|automation, id }
  membershipId?          // when principal is user
  permissions[]          // resolved for this tenant
  entitlements snapshot  // modules/limits needed for gate checks
  correlationId
  resolvedHost?          // for browser/WL
```

**Rules**

- Domain services and repositories **refuse** work without TenantContext (except pure platform routes).
- Handlers never take “tenant id from body” as authority.
- Workers rebuild TenantContext from `JobDefinition.tenantId` + principal metadata.

---

## 6. Tenant resolution (host-first)

Canonical order ([ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md)):

```text
1. Custom domain Host     → tenant_domains (active)
2. Tenant subdomain       → {slug}.thinkaiq.com
3. Authenticated context  → active_tenant_id MUST match Host-resolved tenant on tenant hosts
4. Platform routes        → admin/platform host; optional selectedTenantId for support tools
5. API keys               → api_keys.tenant_id
6. Webhooks               → verified channel/subscription → tenant_id
7. Background jobs        → JobDefinition.tenantId
```

Anti-spoof: trusted Host list; ignore body `tenantId`; trust `X-Forwarded-Host` only from configured proxy; unknown host → safe generic page.

---

## 7. Isolation model

**ADR-001:** Shared PostgreSQL, shared schema, `tenant_id` on tenant-owned rows.

Enforcement layers (Phase 1 mandatory vs later — ADR-017 §5):

1. Application authorization — **P0**
2. Service/domain authorization — **P0**
3. Repository query scoping — **P0**
4. Database constraints / composite uniques — **P0**
5. PostgreSQL RLS — later
6. Storage object-key isolation — **P0**
7. Cache key isolation — **P0**
8. Queue/job isolation — **P0**
9. Search index isolation — when search ships
10. Logs/audit isolation — **P0**

### Isolation testing (required)

Cross-tenant IDOR suite must fail (403/404) for read/update/delete, files, jobs, outbox, automation, API keys, audit. See Phase 1E gate.

---

## 8. Provisioning flow

```text
Create Tenant (status=provisioning)
→ Select Plan / Modules
→ Configure Branding / Domain
→ Create/link Tenant Owner (membership)
→ Seed defaults
→ status=active (or trial-as-active + trial_ends_at)
```

Idempotent by `slug`. Partial failure leaves `provisioning` or rolls back safely.

### Seeded defaults

Default roles · CRM statuses/sources · sales pipeline · optional India GST starters · notification prefs · task types · module nav · usage counters zeroed.

---

## 9. Platform vs tenant settings

| Layer | Examples |
|-------|----------|
| Platform | Module catalog, plan catalog, Super Admin, feature flags, system email |
| Tenant | Branding, pipelines, tax rules, roles, integration credentials, invoice numbering |

Tenant settings never override platform security invariants.

---

## 10. Limits & entitlements

Plan + overrides control modules, seats, storage, API, automation, Voice/WhatsApp quotas, etc. Enforcement: UI, API 402/403, worker pre-checks, metering.

See [MODULE_SYSTEM.md](./MODULE_SYSTEM.md), [USAGE_METERING.md](../operations/USAGE_METERING.md), [ADR-021](../adr/ADR-021-PLATFORM-VS-TENANT-BILLING.md).

---

## 11. Soft delete & offboarding

Soft-delete where history matters; cancellation → archive → retention → purge per [DATA_RETENTION.md](../security/DATA_RETENTION.md); account export required.

---

## 12. Events

Namespaced (ADR-019 / EVENTS.md):

| Event | When |
|-------|------|
| `tenant.created` | After successful provision |
| `tenant.status_changed` | Status transition |
| `tenant.plan_changed` | Plan change |
| `tenant.modules_changed` | Entitlement change |
| `tenant.branding_updated` | Branding change |
| `tenant.domain_updated` | Domain mapping change |

---

## 13. Edge cases

- Slug / custom domain collision  
- Plan missing requested modules  
- Same email invited to multiple tenants (allowed via memberships)  
- Suspended mid-automation (checkpoint & pause)  
- Membership switch only to tenants where membership is active  

---

## 14. Related documents

- [WHITE_LABEL_ARCHITECTURE.md](./WHITE_LABEL_ARCHITECTURE.md)
- [ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md)
- [ADR-020](../adr/ADR-020-AUTH-AND-MULTI-MEMBERSHIP.md)
- [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md)
- [SECURITY.md](../security/SECURITY.md)
- [PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md](../implementation/PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md)
