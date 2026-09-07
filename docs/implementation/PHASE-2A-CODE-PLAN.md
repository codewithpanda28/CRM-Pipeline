# PHASE-2A-CODE-PLAN.md — Inventory & Classification

**Phase:** 2A — Open coding gate: tenant foundation  
**Date:** 2026-09-04  
**Source tree:** `_audit/Vencore` (MIT) → promoted into ThinkAIQ working tree as selective foundation (ADR-014)  
**Rule:** Inventory completed **before** code modification. Classifications: `KEEP` | `REFACTOR` | `REPLACE` | `DEFER`

---

## 0. Working-tree strategy

| Item | Decision |
|------|----------|
| `_audit/Vencore` | Remains read-only audit clone (gitignored) |
| ThinkAIQ app root | Copy Vencore `apps/`, `packages/`, tooling into CRM root **without** nested `.git` |
| ThinkAIQ `docs/` | **KEEP** (do not overwrite with Vencore docs) |
| Destructive migration | **Forbidden** in 2A |

---

## 1. Users / workspace / identity

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `packages/db/src/schema.ts` — `UserTable`, `WorkspaceTable` | Schema | REFACTOR | Add `tenants`, `tenant_memberships`, etc.; keep `users.workspace_id` + `workspaces` |
| `packages/db/migrations/20240101_001_initial_schema.ts` | History | KEEP | Do not rewrite history |
| `packages/db/migrations/20240103_001_self_hosted_refactor.ts` | Auth columns | KEEP | |
| `packages/db/migrations/20260602_002_users_groups.ts` | Invites | REFACTOR | Invites eventually membership-aware |
| `packages/db/migrations/20260714_001_rbac3.ts` | Roles | KEEP | Roles stay workspace-scoped initially; dual-map to tenant |
| **NEW** migration `*_thinkaiq_tenancy_foundation.ts` | Tenants + memberships + domains + branding + settings | REPLACE (additive) | Expand-first |
| `packages/types/src/index.ts` — `User`, `Workspace` | Types | REFACTOR | Add Tenant, Membership; deprecate single-workspace assumption in types docs |
| `apps/api/src/routes/users.ts` | User CRUD | REFACTOR | Scope via TenantContext; stop treating `user.workspace_id` as authz source |
| `apps/api/src/routes/invites.ts` | Invites | REFACTOR | Create membership + optional legacy workspace_id fill |
| `apps/api/src/lib/seed.ts` | First boot | REFACTOR | Provision tenant + membership + dual-write workspace |
| `apps/api/src/routes/setup.ts` | Single-workspace installer | REFACTOR | Platform bootstrap vs tenant provision; keep compat for existing installs |
| `apps/api/src/lib/setup-db.ts` | `isConfigured` = any workspace | REFACTOR | Platform configured ≠ single tenant forever |

---

## 2. Authentication / JWT / cookies

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `apps/api/src/middleware/auth.ts` | `requireAuth` loads workspace from `user.workspace_id` | **REPLACE** core path | Resolve membership + Host tenant → TenantContext |
| `apps/api/src/routes/auth.ts` | Login/logout/reset | REFACTOR | Global user login; set active tenant; rate limit; hashed reset tokens |
| `apps/api/src/middleware/api-key-auth.ts` | API key → workspace | REFACTOR | Map to tenantId (dual-read workspace_id) |
| Cookie `vencore_token` | Session | REFACTOR | Secure flags; Host-bound; claims include `active_tenant_id` |
| `apps/web/store/auth-slice.ts` | localStorage JWT | REFACTOR | Prefer cookie; reduce XSS surface (ADR-023) |
| `apps/web/middleware.ts` | Edge auth gate | REFACTOR | Setup cookie + token presence |
| `apps/web/modules/shared/lib/AuthContext.tsx` | Client auth | REFACTOR | Expose tenant list later; 2A minimal |
| WS `?token=` | Leak risk | DEFER harden fully | Document; prefer cookie for WS when possible (ADR-023 P1) |
| Portal cookies | Separate realm | KEEP | Out of 2A CRM path; do not break |

---

## 3. Middleware / request context

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| **NEW** `packages/tenancy` or `apps/api/src/tenancy/*` | TenantContext, host resolve, lifecycle | REPLACE (new) | Canonical ADR-017/020 |
| `apps/api/src/middleware/permission.ts` | Perm cache `{ws}:{user}` | REFACTOR | Key `t:{tenantId}:u:{userId}`; fix inheritance WS filter if missing |
| `apps/api/src/middleware/module.ts` | Module cache | REFACTOR | Key `t:{tenantId}:m:{moduleId}` |
| `apps/api/src/middleware/messaging-rate-limit.ts` | In-memory RL | REFACTOR | Distributed Redis baseline for login/API (ADR-023 P0) |
| `apps/api/src/middleware/errors.ts` | Errors | KEEP | |
| `apps/api/src/index.ts` | App mount | REFACTOR | Order: host → auth → tenant context → routes; security headers/CORS |

---

## 4. API routes (tenant-owned data)

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| CRM: `contacts`, `companies`, `pipelines`, `tasks`, tags/activities routes | CRUD | REFACTOR | Force `tenantId`/`workspace_id` from context only |
| `routes/v1/*` | Public API | REFACTOR | Same isolation |
| `routes/api-keys.ts` | Keys | REFACTOR | Tenant scope |
| `routes/webhooks.ts` | Webhooks | REFACTOR | Tenant scope + SSRF keep |
| `routes/workspace.ts` | Workspace settings | REFACTOR | Alias to tenant settings/branding dual-write |
| `routes/workspace-modules.ts` | Modules | REFACTOR | Dual-map tenant entitlements later; keep table |
| `routes/config.ts` | Instance branding | REFACTOR | Platform defaults; tenant branding separate (ADR-018) |
| `routes/activity.ts` | Activity feed | REFACTOR | Context scope |
| Finance / WhatsApp / Voice routes | — | DEFER | Not in Vencore / out of 2A |
| Super Admin UI | — | DEFER | Platform principal stub only |

---

## 5. Repositories / DB helpers

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| *(none — inline Kysely)* | Data access | REFACTOR | Introduce `tenantWhere(ctx)` / `assertTenantScope` helpers; optional thin `tenantRepo` wrapper |
| `packages/db/src/client.ts` | Pool | KEEP | |
| `apps/api/src/lib/rbac/*` | RBAC | REFACTOR | Resolve via membership’s workspace/tenant |
| `apps/api/src/lib/log-activity.ts` | Activity | REFACTOR | Require tenant/workspace from context |

---

## 6. System settings / modules / branding

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `system_settings` | Instance KV | KEEP | Platform only; not tenant brand SoR |
| `packages/config/*` | Instance config | KEEP / REFACTOR | Defaults for ThemeSnapshot fallback |
| `workspace_modules` | Module flags | KEEP | Dual-read as entitlements source in 2A |
| **NEW** `tenant_branding`, `tenant_settings`, `tenant_domains` | WL | REPLACE (new tables) | ADR-018 minimum |
| Full theme CSS injection polish | UI | DEFER | Runtime load + tests; fancy UI later |

---

## 7. Files / storage

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `messaging/upload.ts` | R2 keys `messaging/{workspace.id}/` | REFACTOR | Prefer `tenants/{tenantId}/…`; accept legacy prefix dual-read |
| `plugin_storage` / `plugin_files` | Keys | REFACTOR | Namespace + authz by tenant |
| Plugin `files.*` bridge gap | Unimplemented | DEFER | Don’t fake; document |
| Signed URL binding | Security | REFACTOR | Validate tenantId + key prefix + auth |

---

## 8. Cache

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| Module/permission in-memory Maps | Cache | REFACTOR | Mandatory `t:{tenantId}:…` |
| Redis messaging pubsub | Fanout | REFACTOR | Channels include tenantId |
| General Redis cache | — | DEFER | Not primary today |
| Cross-contamination tests | Tests | REPLACE (new) | Required DoD |

---

## 9. Jobs / webhooks / outbox

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `setInterval` workers (API + apps/worker) | Jobs | REFACTOR | Skip suspended tenants; carry tenantId |
| Full BullMQ + outbox (ADR-015/019) | Queue | DEFER (2B) | Stub `tenant_job_controls` + gate in existing workers |
| `queue-webhook.ts` / delivery workers | Webhooks | REFACTOR | Isolation tests; SSRF keep |
| `outbox_events` table | Outbox | DEFER schema full | Minimal table optional for tests; full publisher 2B |

---

## 10. Audit / API keys / security

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `activities` via `logActivity` | CRM activity | KEEP pattern | Not security audit log |
| **NEW** `security_audit_events` or `audit_logs` | Security audit | REPLACE (new) | ADR-023 P0 minimum |
| API key SHA-256 | Keys | KEEP | Already hashed |
| Login rate limit | Missing | REPLACE | Redis/distributed baseline |
| CSRF | Missing | REPLACE | Token or Bearer-only strategy |
| Security headers / CORS | Weak | REFACTOR | Helmet + explicit origins |
| Password reset plaintext | Gap | REFACTOR | Hash at rest |
| MFA / SSO | — | DEFER | ADR-023 Later/P1 |
| Platform vs tenant principals | Missing | REPLACE | `platform_users` stub + middleware |

---

## 11. Tests

| Location | Concern | Class | Notes |
|----------|---------|-------|-------|
| `apps/api/src/__tests__/auth.test.ts` etc. | Existing | KEEP + extend | Regression |
| **NEW** isolation suite | Cross-tenant | REPLACE (new) | Mandatory DoD list |
| Web E2E | — | DEFER | API-level isolation first |

---

## 12. Implementation order (after this plan)

1. Promote Vencore → ThinkAIQ working tree  
2. Additive tenancy migration + types  
3. `TenantContext` + host resolution + auth membership  
4. Lifecycle gates + storage/cache key helpers  
5. Route/query scoping helpers on critical CRM paths  
6. P0 security baseline  
7. Isolation + regression tests  
8. `PHASE-2A-MIGRATION-NOTES.md` + `PHASE-2A-IMPLEMENTATION-REPORT.md`  
9. **STOP** — no Phase 2B

---

## 13. Explicit non-goals (2A)

CRM expansion · Finance/GST/Payments · WhatsApp · Voice · Automation UI · Super Admin dashboards · Reseller · Meilisearch · Temporal · Destructive drop of `workspace_id` · Full BullMQ/outbox production publisher · Full custom-domain TLS automation

---

**Status:** Inventory complete. Coding may proceed per this plan.
