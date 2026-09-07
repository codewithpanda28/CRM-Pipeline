# ADR-006 — Authentication Strategy

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Need secure auth for Super Admin, tenant users, API keys, and future OAuth/SSO.

## Decision (proposed)

- Password hashing: argon2id (or bcrypt fallback)  
- Tenant users: session cookies (HTTP-only, Secure, SameSite) + short-lived access tokens for SPA/API  
- Super Admin: separate realm; MFA strongly recommended (required before production scale)  
- API: hashed API keys with scopes; OAuth2 architecture-ready for partners  
- SSO (SAML/OIDC): Enterprise phase; store external subject ids without blocking v1  

## Consequences

Clear separation of platform vs tenant principals; no shared cookie jar across brands without host binding.

## Follow-on (Phase 1D / 1E)

Multi-tenant **memberships** (one user → many tenants) and Host-matched active tenant are specified in [ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md) and locked for auth in [ADR-020](../adr/ADR-020-AUTH-AND-MULTI-MEMBERSHIP.md). Hardening phases: [ADR-023](../adr/ADR-023-AUTH-SECURITY-HARDENING.md).

**ADR-006 is not silently rewritten** — accept ADR-020 as the membership amendment.

