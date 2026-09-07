# VENCORE_SECURITY.md

## Strengths (evidence-based)

| Control | Evidence |
|---------|----------|
| Password hashing | bcrypt cost 12 |
| Login anti-enum | Dummy bcrypt compare on unknown email |
| AuthZ | `requirePermission` / RBAC resolution |
| Workspace binding | User→workspace; API keys workspace-scoped |
| Secrets encryption | AES helpers for SMTP/SSH/plugin settings |
| Upload guards | MIME/size; path guards on SFTP |
| API errors | Hide stacks in production |

## High-risk findings

| Risk | Severity | Notes |
|------|----------|-------|
| No CSRF tokens | High for cookie SPA | SameSite=lax + credentialed CORS |
| No login rate limit | High | Setup limited; login not |
| SSRF via automation / outbound webhooks | High/Medium | User/server-side fetch; subscription webhooks have hostname blocklist — still verify completeness vs private IP ranges |
| Password reset token at rest | Medium | Stored plaintext on user row (hash tokens) |
| Login returns JWT in JSON body | Medium | Plus httpOnly cookie — XSS/storage misuse risk if clients persist body token |
| WS `?token=` query | Medium | Log/referrer leakage |
| No security audit log table | Medium | Cannot meet ThinkAIQ audit reqs |
| No global security headers (Helmet) | Medium | Only plugin iframe CSP |
| In-memory rate limits | Medium | Broken under multi-replica |
| Updater secret = host control | High (ops) | Expected for updater; protect fiercely |
| Default compose passwords | Medium | Ops hygiene |
| Clerk leftover dependency | Low/Medium | Confusion / attack surface clutter |

## ThinkAIQ gap

Enterprise SaaS needs: MFA (esp. Super Admin), CSRF strategy or pure Bearer, login+API rate limits, SSRF allowlists, append-only audit_logs, security Pulse lane, secret scanning in CI, isolation regression tests.

## Classification

**PARTIAL** secure self-host baseline · **not** ready to claim enterprise SaaS security without remediation.
