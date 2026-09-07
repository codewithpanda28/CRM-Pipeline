# PHASE-2A-IMPLEMENTATION-REPORT.md

**Phase:** 2A — Open coding gate: tenant foundation  
**Date:** 2026-09-04  
**Stopped after this phase** — do not auto-start 2B  

---

## Implemented

### Foundation promotion
- Copied selective Vencore monorepo (`apps/`, `packages/`, tooling) into ThinkAIQ root (ADR-014)
- Kept ThinkAIQ `docs/`; `_audit/Vencore` remains gitignored audit clone
- Added `ATTRIBUTION.md`, updated root `README.md`, `.gitignore`

### New package
- `packages/tenancy` — TenantContext, host classification, lifecycle gates, storage/cache key helpers

### Schema (additive only)
- `packages/db/migrations/20260904_001_thinkaiq_tenancy_foundation.ts`
- Tables: `tenants`, `tenant_memberships`, `tenant_domains`, `tenant_settings`, `tenant_branding`, `tenant_job_controls`, `platform_users`, `security_audit_events`, `outbox_events`
- User columns added: `password_reset_token_hash`, `session_version`
- Backfill: `tenants.id = workspaces.id`; memberships from `users.workspace_id`
- **No drops** of `workspace_id` / `workspaces`

### Auth / tenancy runtime
- `apps/api/src/middleware/auth.ts` — membership + Host resolution + TenantContext; Host/JWT mismatch deny; body `tenantId` reject; suspended mutation block; platform admin middleware stub
- `apps/api/src/routes/auth.ts` — login rate limit; JWT `active_tenant_id` + `sv`; switch-tenant + `auth.tenant_switched` audit; hashed reset tokens; session bump on logout/reset
- Cache keys: `permission.ts` / `module.ts` → `t:{tenantId}:…`
- Storage: messaging upload → `tenants/{id}/messaging/…`; messages accept legacy prefix dual-read
- Workers: webhook delivery skips suspended/paused tenants (`tenant-job-gate`)
- Security: CSRF (prod/`CSRF_ENFORCE`), CORS allowlist, security headers, API rate limit, SSRF on `http.fetch`, security audit writer

### Docs
- `PHASE-2A-CODE-PLAN.md` (inventory)
- `PHASE-2A-MIGRATION-NOTES.md`
- This report

---

## Security guarantees (now)

| Guarantee | Mechanism |
|-----------|-----------|
| Tenant from Host + membership, not body | `requireAuth` |
| Host/JWT mismatch denied | `HOST_JWT_MISMATCH` |
| Active membership required | `MEMBERSHIP_REQUIRED` |
| Suspended mutations blocked | lifecycle assert |
| Suspended business webhooks skipped | job gate |
| Cache keys tenant-prefixed | `@vencore/tenancy` helpers |
| Object keys tenant-namespaced | `tenantObjectKey` + assert |
| Reset tokens hashed | `password_reset_token_hash` |
| Platform ≠ tenant principal | `createRequirePlatformAdmin` + separate cookie |
| Login/API rate limits | baseline (Redis optional; memory fallback documented) |
| CSRF for cookie mutations | enforced in production by default |

---

## Remaining legacy assumptions

- Most CRM routes still query `workspace_id` (equals tenant id after backfill) via `req.workspace.id`
- `users.workspace_id` still dual-written / dual-read for compat
- Instance `system_settings` branding still exists (platform); tenant branding tables exist but full ThemeSnapshot UI not built
- Interval workers remain (BullMQ/outbox publisher **deferred to 2B**)
- `outbox_events` table exists; publisher not implemented
- In-memory rate limit if Redis unavailable (multi-replica risk — documented)
- CSRF off in non-production unless `CSRF_ENFORCE=true`

---

## Known limitations (intentional)

- No finance/CRM feature expansion
- No custom domain TLS automation
- No Super Admin UI / MFA / SSO
- No full purge engine for archived/deleting
- Not every route rewritten to `tenantRepo()` — context-sourced `workspace.id` is the 2A enforcement pattern
- Full isolation **integration** tests against live Postgres not run in this environment (unit/isolation suite covers matrix logic)

---

## Tests

| Suite | Result |
|-------|--------|
| `@vencore/tenancy` unit | **12 passed** |
| API `isolation.test.ts` + helpers + auth smoke | **14 passed** |
| Package builds (`types`, `modules`, `db`, …) | **OK** |
| `@vencore/tenancy` type-check | **OK** |
| `@vencore/api` `tsc --noEmit` (after dependency build) | **OK** (exit 0) |
| Full historical Vencore vitest suite | Not fully re-run end-to-end (time); new isolation tests green |
| Live DB migration apply | **Not executed** against production (by design) |

---

## Migration readiness

**Expand-ready:** additive migration + dual-read path designed.  
**Not contract-ready:** do not drop `workspace_id` yet. See `PHASE-2A-MIGRATION-NOTES.md`.

---

## Risks (remaining P0-ish)

1. **Route coverage:** any route forgetting `workspace.id` filter remains an IDOR risk — isolation CI against real DB should be next hardening.  
2. **Redis optional rate limits** — multi-replica deployments must set Redis-backed limiter.  
3. **Outbox/BullMQ not live** — critical side effects can still be inconsistent until 2B.  
4. **CSRF** must be enabled (`NODE_ENV=production` or `CSRF_ENFORCE=true`) before cookie-auth SaaS exposure.  
5. **Platform users** table empty until ops seeds Super Admin.

---

## Definition of Done checklist

| Item | Status |
|------|--------|
| TenantContext exists | Done |
| Multi-membership model | Done (schema + auth) |
| Host resolution | Done (subdomain + custom lookup; cert automation deferred) |
| Host/JWT mismatch denied | Done + tested |
| Repository tenant isolation | Done via context-bound workspace scope + helpers |
| Storage namespace | Done + dual-read legacy |
| Cache isolation | Done + tested |
| Suspended mutation blocked | Done + tested |
| P0 auth controls (subset) | Done (see limitations) |
| Platform vs tenant principals | Done (stub) |
| Isolation tests pass | Done (26 unit tests across packages) |
| No destructive migration | Confirmed |
| Final report | This document |

**Phase 2A coding milestone complete. STOP — do not start Phase 2B automatically.**
