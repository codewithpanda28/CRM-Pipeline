# ADR-020 — Auth & Multi-Membership

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1E) |
| Date | 2026-09-04 |
| Relates to | ADR-006 (auth strategy — **not rewritten**), ADR-017 (tenancy), ADR-018 (host/WL), ADR-023 (security hardening) |
| Scope | How authentication interacts with global users, memberships, and active tenant context |

---

## 1. Why this ADR exists

[ADR-006](../decisions/ADR-006-authentication-strategy.md) remains the base auth **mechanism** decision (argon2id, cookies/tokens, separate Super Admin realm, API keys, SSO-ready).

It did **not** fully specify multi-tenant membership. Phase 1D ADR-017 requires:

```text
global user → tenant_memberships → many tenants
```

Silently rewriting ADR-006 would obscure history. This ADR is the **amendment** that locks membership-aware auth.

---

## 2. Decision

### 2.1 Global user identity

- `users` rows are platform-global login identities (email unique).  
- Credentials authenticate the **person**, not a tenant.  
- Platform Super Admins use `platform_users` — separate realm (ADR-006 unchanged).

### 2.2 Tenant membership

- Access to tenant data requires an **active** `tenant_memberships` row.  
- Roles/permissions are resolved **inside** that tenant (via membership → roles).  
- Disabled/invited memberships cannot obtain TenantContext for that tenant.

### 2.3 Active tenant context

Session / access token carries:

| Claim | Rule |
|-------|------|
| `sub` / `userId` | Global user id |
| `active_tenant_id` | Must be set for tenant APIs |
| `sid` / session id | For revocation |

**On tenant hosts (subdomain/custom domain):**

1. Resolve tenant from Host (ADR-017).  
2. Authenticate user.  
3. Verify membership for **that** Host tenant.  
4. Set `active_tenant_id = resolvedTenantId`.  
5. **Reject** if JWT `active_tenant_id` ≠ Host tenant (confusion / spoof).

**On platform API host (multi-tenant tooling):**

- Authenticated user may select `active_tenant_id` only among memberships.  
- Optional `X-Tenant-Id` allowed **only** after membership check — never for anonymous.

### 2.4 Membership switching

- Explicit switch endpoint/UI lists memberships.  
- Switch issues new session/token with new `active_tenant_id` after re-check.  
- Audit `auth.tenant_switched`.  
- Switching does **not** grant Host rights to another tenant’s custom domain cookies.

### 2.5 Tenant-scoped authorization

After TenantContext is built:

1. Permission checks use roles for **active tenant only**.  
2. Repositories receive `tenantId` from context — not from client body.  
3. API keys skip user membership but are permanently bound to one `tenant_id`.

### 2.6 Host / JWT consistency (summary)

| Surface | Tenant source of truth |
|---------|------------------------|
| Browser on tenant Host | Host resolution; JWT must match |
| API key | Key’s tenant_id |
| Worker | JobDefinition.tenantId |
| Platform admin | Selected tenant + platform auth; fully audited |

---

## 3. ADR-006 relationship

| ADR-006 item | Status |
|--------------|--------|
| argon2id / bcrypt fallback | Unchanged |
| HTTP-only Secure cookies + short-lived tokens | Unchanged; cookies are **host-bound** |
| Separate Super Admin realm | Unchanged |
| API key hashing + scopes | Unchanged |
| SSO readiness | Unchanged; external subject maps to global `users` then memberships |

**This ADR adds** membership + active tenant + Host consistency. Hardening details (CSRF, rate limits, MFA mandate) live in [ADR-023](./ADR-023-AUTH-SECURITY-HARDENING.md).

---

## 4. Consequences

- Login UX may show tenant picker when multiple memberships and no Host binding.  
- Vencore “JWT workspace from user.workspace_id” pattern is **retired**.  
- Tests must cover switch authorization and Host/JWT mismatch denial.

---

# DECISION: Multi-membership auth amends ADR-006; Host-matched active_tenant_id is mandatory on tenant hosts

**Status:** Accepted for Phase 1E planning.
