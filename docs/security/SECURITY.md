# SECURITY.md — ThinkAIQ

## 1. Purpose

Security requirements for multi-tenant white-label SaaS: isolation, RBAC, auth, secrets, rate limits, audit, secure files, encryption, backup/recovery, account export.

Priority: **P0**

---

## 2. Controls

| Area | Requirement |
|------|-------------|
| Tenant isolation | App + data layer; CI tests |
| RBAC | Granular verbs + scopes |
| Sessions | Secure cookies, rotation, revocation on suspend/disable |
| Auth | Password hashing (argon2/bcrypt), lockout, reset flows |
| MFA | Required for Super Admin; optional tenant |
| API auth | Hashed API keys; OAuth-ready |
| Password policy | Configurable complexity + breach checks later |
| Rate limiting | IP, user, API key, tenant |
| Audit logging | Security-sensitive actions immutable style |
| File access | ACL + signed URLs; no public buckets for private docs |
| Encryption | TLS in transit; secrets encrypted at rest; sensitive app fields where appropriate |
| Passwords | Securely hashed (argon2/bcrypt) — never reversible encryption |
| Secrets mgmt | No plaintext credentials in DB/logs/UI; mask after save |
| Security monitoring | Failed logins, suspicious activity, unusual API, session anomalies, permission/credential events — surfaced in Super Admin ops |
| Compliance claims | Never claim SOC2/ISO/etc. unless actually certified; architecture prepared for future audits |
| Backup/recovery | See BACKUP_RECOVERY |
| Account export | Tenant data export capability |

---

## 3. Threat highlights

- Cross-tenant IDOR
- Privilege escalation Tenant→Platform
- Webhook SSRF
- Secret leakage in logs
- Session fixation
- Automation infinite side effects

---

## 4. Secure SDLC

- Threat model per module
- Dependency scanning
- Secret scanning in CI
- Penetration test before major public launch

---

## 5. Related documents

- [RBAC_PERMISSIONS.md](./RBAC_PERMISSIONS.md)
- [AUDIT_LOG.md](./AUDIT_LOG.md)
- [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md)
- [STORAGE.md](../deployment/STORAGE.md)
- [WEBHOOKS.md](../api/WEBHOOKS.md)
