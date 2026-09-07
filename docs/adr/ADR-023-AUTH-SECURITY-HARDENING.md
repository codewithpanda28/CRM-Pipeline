# ADR-023 — Auth & Security Hardening

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1E planning) |
| Date | 2026-09-04 |
| Relates to | ADR-006, ADR-017, ADR-018, ADR-020, Vencore security audit |
| Scope | Concrete security controls & phasing — **not** a compliance certification claim |

**Non-claim:** This ADR does not assert SOC2/ISO/PCI certification. It defines engineering controls ThinkAIQ will implement.

---

## 1. Context

Vencore baseline is a **partial** self-host security posture ([VENCORE_SECURITY.md](../audit/VENCORE_SECURITY.md)): bcrypt OK, RBAC present; gaps include CSRF, login rate limits, plaintext reset tokens, JWT-in-body risks, WS token in query, weak global headers, in-memory rate limits, SSRF surfaces.

ThinkAIQ multi-tenant SaaS + ADR-017/020 raise the bar: Host confusion, membership switch abuse, platform admin blast radius.

---

## 2. Control catalog

### 2.1 Authentication & sessions (with ADR-006/020)

| Control | Direction |
|---------|-----------|
| Password hashing | **argon2id** primary (ADR-006); migrate off weaker hashes; bcrypt acceptable transitional |
| Session management | Server-side session store or rotatable refresh; absolute + idle timeouts |
| JWT / cookies | Prefer **httpOnly Secure SameSite** session cookie on tenant Host; short-lived access token if needed — **do not** encourage persisting long-lived JWT in localStorage |
| Host/JWT match | ADR-020 mandatory |
| Session revocation | Logout + admin revoke + password change invalidates `sid` |
| Tenant switching | Re-authz membership; new session claims; audit |
| Platform admin | Separate cookie jar / host; step-up MFA before sensitive ops (see phasing) |

### 2.2 CSRF / CORS / cookies / headers

| Control | Direction |
|---------|-----------|
| CSRF | SameSite=Lax/Strict + CSRF token for cookie-authenticated state-changing requests **or** Bearer-only API without cookie auth for SPA |
| CORS | Explicit origin allowlist = tenant active domains + platform; never `*` with credentials |
| Secure cookies | `Secure`, `HttpOnly`, `__Host-` prefix where feasible; correct Domain |
| Security headers | Helmet (or equiv): CSP, frame-ancestors, nosniff, referrer-policy, HSTS on TLS hosts |
| CSP | Compatible with ADR-018 theme assets; no `unsafe-eval` for app shell |

### 2.3 Brute force / abuse

| Control | Direction |
|---------|-----------|
| Login rate limit | Per IP + per account; distributed store (Redis) — not process memory alone |
| Lockout / backoff | Progressive delay; anti-enumeration (dummy hash compare — keep Vencore pattern) |
| API rate limits | Per tenant + per key; floor limits platform-enforced |
| Suspicious activity | Failed login spikes, impossible travel-lite, mass 403 — Ops Pulse signals |

### 2.4 Tokens & secrets

| Control | Direction |
|---------|-----------|
| Password reset | **Hash** tokens at rest; single-use; short TTL |
| API keys | Prefix + hash; show secret once; scoped; rotatable |
| Integration secrets | Envelope encryption (KMS/key id); never log plaintext |
| Webhook secrets | Per endpoint; constant-time compare |

### 2.5 SSRF & egress

| Control | Direction |
|---------|-----------|
| Outbound HTTP (automation, webhooks) | Allowlist schemes; block link-local/private ranges; DNS rebinding controls |
| Provider webhooks inbound | Signature verify; no SSRF from attacker URL fields without checks |

### 2.6 WebSockets

| Control | Direction |
|---------|-----------|
| Auth | Authenticate on connect via cookie/session or short-lived ticket — **avoid** long-lived `?token=` query (Vencore gap) |
| Tenant room | Bind channel to TenantContext; no cross-tenant subscribe |

### 2.7 MFA / SSO readiness

| Control | Direction |
|---------|-----------|
| MFA | TOTP/WebAuthn architecture-ready; **required for platform Super Admin before production scale** |
| SSO | OIDC/SAML map to global user + memberships (ADR-020); Enterprise phase enablement |

### 2.8 Audit

Append-only `audit_logs` for authz failures of interest, login success/fail (careful PII), tenant switch, admin actions, key create/revoke, suspend, impersonation-if-ever.

---

## 3. Phasing

### P0 — before production multi-tenant traffic

1. TenantContext + Host/JWT consistency (ADR-017/020)  
2. Isolation test suite (cross-tenant deny)  
3. Login + API **distributed** rate limits  
4. CSRF strategy chosen and implemented for cookie auth  
5. Password hashing argon2id (or documented bcrypt transitional with plan)  
6. Reset tokens hashed  
7. Secure cookie flags + CORS allowlist + baseline security headers  
8. API keys hashed; secrets encrypted at rest  
9. Append-only audit log for security-relevant events  
10. Webhook SSRF / outbound URL blocking for automation  
11. Session revocation on password change/logout  
12. Platform admin on separate host/realm  

### P1 — soon after

1. MFA for Super Admin (then tenant Owner optional/entitlement)  
2. CSP tightened beyond baseline  
3. Suspicious login detection → Pulse  
4. WS auth without query tokens  
5. Refresh-token rotation hardening  
6. Security headers report-only → enforce iteration  

### Later — enterprise readiness

1. SSO (SAML/OIDC) GA  
2. WebAuthn broadly  
3. Formal pen-test remediation track  
4. Optional Postgres RLS (ADR-001 later layer)  
5. Customer-managed keys / advanced compliance programs — **only with explicit product commitment**  

---

## 4. Explicit non-goals (this ADR)

- Claiming PCI DSS / SOC2 / ISO certification by documentation alone  
- Replacing product legal/privacy policies  
- Implementing features in this phase (docs only)

---

# DECISION: Adopt phased hardening above; P0 controls are production blockers for multi-tenant SaaS; MFA/SSO as P1/Later; no compliance claims from this ADR

**Status:** Accepted for Phase 1E planning.
