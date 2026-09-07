# ADR-017 — Multi-Tenant Provisioning & Host Resolution

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1D planning) |
| Date | 2026-09-04 |
| Relates to | ADR-001 (row tenancy), ADR-005 (domains/SSL), ADR-006 (auth), ADR-011 (WL), ADR-014 (Vencore), ADR-015 (BullMQ), [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md), [VENCORE_TENANCY.md](../audit/VENCORE_TENANCY.md) |
| Scope | Canonical SaaS tenancy hierarchy, membership, host resolution, isolation layers, job/tenant lifecycle |

**Constraint:** Architecture decision only — no application code, installs, or migrations in this phase.

---

## 1. Context

Vencore today is **one install ≈ one workspace**: `users.workspace_id` is singular; setup blocks a second workspace; JWT loads workspace from the user row ([VENCORE_TENANCY.md](../audit/VENCORE_TENANCY.md)).

ThinkAIQ must be a **true multi-tenant SaaS**: many tenants per platform, host-based white-label, Super Admin ops, optional future resellers — while **keeping** Vencore’s useful patterns (query scoping by workspace/tenant id, API-key binding, module flags).

**Conflict flagged (do not silently ignore):**

| Source | Says | This ADR |
|--------|------|----------|
| [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md) §9 | “Users belong to one tenant” | **REJECTED** — users may belong to **many** tenants via memberships |
| [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md) `users.tenant_id` | User row owned by one tenant | **REFACTOR** — global `users` + `tenant_memberships` (see §6) |
| Vencore `users.workspace_id` | Single workspace | Same refactor under ADR-014 selective foundation |

ADR-001 (shared DB + `tenant_id`) remains **affirmed**. This ADR productizes provision, resolution, and membership on top of it.

---

## 2. Platform hierarchy

```text
Platform (ThinkAIQ control plane)
  → Reseller (optional, deferred product; schema-ready)
    → Tenant (business customer / workspace)
      → Users (global identity)
      → Roles (per-tenant)
      → Memberships (user ↔ tenant + role set)
      → Business data (CRM, finance, automation, …)
```

### Identity types (must not be conflated)

| Concept | What it is | What it is not |
|---------|------------|----------------|
| **Platform identity** | ThinkAIQ ops principal (`platform_users` / Super Admin) | A tenant user |
| **Tenant identity** | `tenants.id` — isolated business boundary | A login account |
| **User identity** | Global `users.id` (email/credentials) | Automatic data access |
| **Tenant membership** | `tenant_memberships` row: user may act in that tenant | “Owns” the user exclusively |
| **Tenant admin** | Membership with Owner/Admin role in a tenant | Platform Super Admin |
| **Platform Super Admin** | Platform principal; audited cross-tenant tools | Implicit membership in every tenant |
| **Reseller admin** | Admin of reseller subtree only (future) | Platform Super Admin |

**Rule:** Authorization always answers: *which principal, in which tenant (if any), with which permissions?* Never “user’s only workspace.”

---

## 3. Tenant model — canonical entities

### 3.1 `tenants`

| Field (conceptual) | Notes |
|--------------------|-------|
| `id` | UUID PK — **canonical tenant id** everywhere |
| `slug` | Unique URL-safe; maps to `{slug}.thinkaiq.com` |
| `display_name` / `legal_name` | Product vs legal |
| `status` | See lifecycle |
| `plan_id` | Commercial plan |
| `reseller_id` / `parent_tenant_id` | Nullable; reserved (RESELLER deferred) |
| `created_at` / `updated_at` / `provisioned_at` | |
| `trial_ends_at` / `suspended_at` / `archived_at` | |

Vencore `workspaces` maps → `tenants` (rename or dual-read during migration — Phase 1D plan P4).

### 3.2 `tenant_memberships`

| Field | Notes |
|-------|-------|
| `id` | UUID |
| `tenant_id` | FK |
| `user_id` | FK to global users |
| `status` | `invited` \| `active` \| `disabled` |
| `is_owner` | Convenience flag; Owner role remains source of truth for perms |
| `joined_at` / `invited_by` | |
| UNIQUE(`tenant_id`, `user_id`) | |

### 3.3 `tenant_domains`

Per ADR-005 / WHITE_LABEL: `host` UNIQUE → exactly one tenant; type `tenant_subdomain` \| `custom` \| aliases later; verification + SSL state machine.

### 3.4 `tenant_settings`

Structured + JSONB for non-brand keys (locale, timezone, finance defaults, feature toggles that are not entitlements). Branding lives primarily in `tenant_branding` (ADR-018).

### 3.5 `tenant_entitlements`

Modules enabled, plan snapshot, limit overrides — replaces “instance module flags only.” Maps from Vencore workspace module enablement cache pattern, but **per tenant**.

### 3.6 `tenant_usage`

Period counters (API, automation, storage, WA, PDF, …) — metering; not the entitlement ceiling.

### 3.7 `tenant_status` (lifecycle)

Canonical states for Phase 1D:

```text
provisioning → active → suspended → archived → deleting
                 ↑         │
                 └─────────┘  (reactivate)
```

| Status | Meaning | API / UI | Jobs | Data |
|--------|---------|----------|------|------|
| **provisioning** | Seed in progress; not ready | Block business APIs; Super Admin may observe | Only provision jobs | Partial seed OK; must be idempotent |
| **active** | Normal SaaS use | Full per entitlements | Normal (subject to `tenant_job_controls`) | Read/write |
| **suspended** | Billing/abuse/admin hold | Auth may succeed; mutations blocked (read-only policy configurable); clear error | **Pause** tenant queues / skip new enqueues except allowlisted (`billing.*`, `tenant.lifecycle.*`) | Read for export/support; no business writes |
| **archived** | Soft-closed; retention window | Login denied or read-only export portal | No business jobs; retention/purge schedulers only | Soft-deleted / frozen |
| **deleting** | Hard purge in progress | None | Purge workers only | Progressive delete |

**Trial / expired / cancelled** from MULTI_TENANCY.md map onto this machine:

- Trial = `active` + `trial_ends_at` (or substatus flag)  
- Expired = typically `suspended` with reason `subscription_expired`  
- Cancelled = transition to `archived` then eventually `deleting`

Document reason codes on status change (`tenant.status_changed` event).

---

## 4. Tenant resolution (request path)

### 4.1 Resolution order

```text
1. Custom domain Host  → tenant_domains (type=custom, status=active)
2. Tenant subdomain    → {slug}.thinkaiq.com → tenants.slug / tenant_domains
3. Authenticated tenant context
     - Session/JWT carries active_tenant_id ONLY after membership check
     - Browser: Host already bound tenant; JWT tenant must MATCH resolved host tenant
     - Platform admin tooling: explicit tenant selection (not Host spoof)
4. Internal platform routes  → /platform/* or admin host → NO tenant from Host; optional selectedTenantId
5. API key routes            → tenant from api_keys.tenant_id (never from body)
6. Webhook routes            → provider signature + route binding (tenant_id from subscription/channel row)
7. Background jobs           → JobDefinition.tenantId (ADR-015); re-load tenant; refuse if missing
```

Example:

```text
client.example.com
  → normalize Host (lowercase, strip port)
  → lookup tenant_domains.host
  → tenantId
  → authenticate (cookie/JWT/API key)
  → authorize membership + permission
  → open tenant-scoped DB context (AsyncLocalStorage / request context)
  → handler
```

### 4.2 Anti–host-header spoofing

| Control | Rule |
|---------|------|
| Trusted Host list | Only resolve against known domain table + platform base domains |
| No body tenant | Ignore `tenantId` / `workspaceId` in JSON for scoping |
| JWT vs Host | On tenant hosts: `claim.tenantId === resolvedTenantId` or reject |
| Forwarded headers | Trust `X-Forwarded-Host` **only** from configured reverse-proxy hop |
| Cache keys | Include resolved `tenantId`, never raw Host alone for authz |
| Confusion | Unknown host → generic safe page; **no** data from “nearest” tenant |

### 4.3 API / worker entry (no inference from body)

| Channel | Tenant source |
|---------|---------------|
| Browser | Host → tenant; session membership |
| REST `/v1` | Host and/or API key binding; optional `X-Tenant-Id` **only** for multi-membership users on platform API host after membership verify — never alone for anonymous |
| API keys | Key row’s `tenant_id` |
| Webhooks | Verified channel/subscription → `tenant_id` |
| Internal services | mTLS/service auth + explicit tenant in signed internal envelope |
| Workers | `JobDefinition.tenantId` + reload |

---

## 5. Defense in depth

| # | Layer | Phase 1 mandatory? | Notes |
|---|-------|--------------------|-------|
| 1 | Application authorization | **Yes** | Permission checks on use-cases |
| 2 | Service/domain authorization | **Yes** | Domain services refuse missing TenantContext |
| 3 | Repository query scoping | **Yes** | Every tenant table query includes `tenant_id`; lint/CI where feasible |
| 4 | Database constraints | **Yes** | FK composites, UNIQUE(`tenant_id`, natural_key) |
| 5 | PostgreSQL RLS | Later (P2+) | Optional belt; ADR-001 already planned |
| 6 | Storage object-key isolation | **Yes** | `tenants/{tenant_id}/...` (ADR-008) |
| 7 | Cache key isolation | **Yes** | `t:{tenantId}:...` |
| 8 | Queue/job isolation | **Yes** | tenantId on jobs; pause controls (ADR-015) |
| 9 | Search index isolation | **Yes** when search ships | Filter/tenant routing; Meilisearch deferred |
| 10 | Logs/audit isolation | **Yes** | `tenant_id` on audit; Super Admin access audited |

**Phase 1 P0:** layers 1–4, 6–8, 10. RLS and search are phased.

---

## 6. Membership & RBAC

```text
users (global identity)
  ↔ tenant_memberships
       → tenant_roles / role_permissions
       → effective permissions in that tenant
```

| Role | Scope |
|------|-------|
| Tenant roles | Owner, Admin, Manager, Sales, Finance, Support, Employee (seeded) |
| Role inheritance | Optional role hierarchy later; Phase 1 = flat permission sets on roles |
| Tenant admin | Owner/Admin membership |
| Platform admin | Separate `platform_users` + platform roles |

**Do not** use `users.workspace_id` / `users.tenant_id` as the final SaaS model.

**Login email policy (proposed):** globally unique email for password login UX; memberships attach that user to N tenants. Flag for product confirmation if B2B requires same email per tenant as distinct accounts (not recommended).

---

## 7. Database strategy

### 7.1 Tenant-owned tables

| Pattern | Rule |
|---------|------|
| `tenant_id` | UUID NOT NULL on every tenant-owned row |
| PK | Prefer UUID |
| Indexes | Leading `tenant_id` on hot filters |
| Uniqueness | `UNIQUE(tenant_id, …)` for business keys (invoice number, slug, tag name) |
| FKs | Child FKs within tenant; prefer composite FK `(tenant_id, parent_id)` where engine supports, or app+trigger checks |
| Soft-delete | `deleted_at`; unique indexes use partial `WHERE deleted_at IS NULL` |
| Cross-tenant refs | **Forbidden** for business entities. Platform tables may reference `tenant_id` as customer pointer (billing) |

### 7.2 Platform-owned / shared tables

Examples: `plans`, `module_catalog`, `platform_users`, `platform_incidents`, feature flags — **no** tenant filter required for reads; writes are platform-auth only.

### 7.3 Vencore tables needing refactor (conceptual)

| Vencore | ThinkAIQ |
|---------|----------|
| `workspaces` | `tenants` |
| `users.workspace_id` | remove; `tenant_memberships` |
| JWT `workspaceId` from user row | active membership + host match |
| `system_settings` instance brand | platform defaults + `tenant_branding` (ADR-018) |
| Module cache `workspaceId:moduleId` | `tenantId:moduleId` |
| API keys `workspace_id` | `tenant_id` |
| Business `workspace_id` columns | `tenant_id` (rename + backfill) |

---

## 8. Background jobs (ADR-015)

Every `JobDefinition` includes `tenantId` when the work is tenant-scoped. Platform jobs use explicit `tenantId: null` + `scope: platform` and never touch tenant tables without an explicit target list.

| Situation | Behavior |
|-----------|----------|
| Tenant **suspended** | Publisher/workers consult `tenant_job_controls` / status; skip or delay business jobs; allow billing/lifecycle |
| Tenant **archived/deleting** | Cancel scheduled tenant jobs; drain or fail running with permanent_failure; purge jobs only |
| **Queued** jobs | Remain until worker pickup; worker re-checks status → no-op/cancel |
| **Running** jobs | Finish current attempt if safe; checkpoint; do not start new side effects if suspended mid-flight (domain policy) |
| **Scheduled** jobs | Cron registrations keyed by tenant; deactivate on suspend/archive |

---

## 9. Security tests (mandatory CI)

Isolation suite must prove tenant A cannot:

| Capability | Assertion |
|------------|-----------|
| Read B’s entities | 404/403 |
| Update / delete B | 404/403 |
| Access B’s files / signed URLs | deny |
| Access B’s search documents | deny (when search exists) |
| Execute / view B’s automations & runs | deny |
| View B’s jobs / outbox | deny |
| Use B’s API keys | deny |
| Read B’s audit logs | deny |
| Resolve Host for B while authed as A on A’s host | deny confusion |

Plus: provision idempotency, suspend blocks mutations, host spoof negatives, membership switch only to allowed tenants.

---

## 10. Decision

# DECISION: Shared-DB multi-tenant SaaS with global users + per-tenant memberships; host-first resolution; defense-in-depth isolation

**Implementation boundary**

- **In:** `tenants`, `tenant_memberships`, `tenant_domains`, entitlements/usage/status, TenantContext middleware, repository scoping, isolation test pack.  
- **Out:** Per-tenant databases; trusting body `tenantId`; single-workspace Vencore setup as product model.  
- **Affirms ADR-001.** **Overrides** MULTI_TENANCY.md “one user one tenant” and Vencore `users.workspace_id`.  
- Reseller product deferred; nullable hierarchy fields only.

**Status:** Accepted for Phase 1D planning.
