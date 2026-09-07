# PHASE-2A-MIGRATION-NOTES.md

**Phase:** 2A — Tenant foundation (expand-first)  
**Destructive migration:** **NOT performed**

---

## Legacy fields retained

| Field / table | Status |
|---------------|--------|
| `workspaces` | **Kept** — dual-read SoR for CRM rows still keyed by `workspace_id` |
| `users.workspace_id` | **Kept** — dual-write on user create; not authz source of truth |
| `users.password_reset_token` | **Kept** temporarily — dual-read; new writes use `password_reset_token_hash` |
| `workspace_modules` | **Kept** — entitlements source for 2A |
| `system_settings` | **Kept** — platform/instance only |

---

## workspace → tenant mapping

Migration `20260904_001_thinkaiq_tenancy_foundation.ts`:

1. Creates `tenants` with **`tenants.id = workspaces.id`** for backfilled rows.  
2. Creates `tenant_memberships` from each `users` row (`tenant_id = workspace_id`).  
3. Creates `tenant_domains` `{slug}.thinkaiq.com`.  
4. Seeds `tenant_settings`, `tenant_branding`, `tenant_job_controls`.  
5. Adds `outbox_events`, `security_audit_events`, `platform_users` (empty until provisioned).

**Dual-read rule:** `TenantContext.tenantId === TenantContext.workspaceId` for migrated tenants. Existing `WHERE workspace_id = ?` filters remain valid when `?` is taken from TenantContext.

---

## Dual-read strategy

| Concern | 2A behavior |
|---------|-------------|
| Authz tenant | Membership + Host + JWT `active_tenant_id` |
| CRM queries | Still `workspace_id` column = tenant id |
| Storage keys | Prefer `tenants/{id}/…`; accept legacy `messaging/{id}/…` |
| Cache keys | `t:{tenantId}:…` |
| Reset tokens | Hash preferred; plaintext column readable until purged |

---

## Future backfill / contract (NOT 2A)

1. Ensure every user has ≥1 active membership.  
2. Stop writing `users.workspace_id` (nullable then drop).  
3. Optionally rename `workspace_id` → `tenant_id` on business tables (or add `tenant_id` generated always-as-workspace).  
4. Drop `password_reset_token` plaintext.  
5. Wire full outbox publisher (Phase 2B).  
6. Drop dual-read legacy storage prefixes after rekey.

---

## Rollback strategy

1. App rollback to prior deploy (feature flags / git revert).  
2. Migration `down()` drops **only** new tenancy tables (local/dev).  
3. Do **not** drop `workspaces` / `users.workspace_id` in rollback of 2A.  
4. Production: prefer forward-fix; avoid `down()` on live data.

---

## Validation requirements before future contract

- [ ] Isolation suite green  
- [ ] Every active user has membership  
- [ ] Every workspace has tenant row with same id  
- [ ] No orphan `workspace_id` references  
- [ ] Backup + dry-run on clone  
- [ ] Dual-read period complete  

---

## Migration readiness

**Code is expand-ready.** Safe to run additive migration on staging. **Not** ready to drop legacy columns.
