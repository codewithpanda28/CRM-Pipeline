# ENVIRONMENT_CONFIGURATION.md — ThinkAIQ

## 1. Purpose

Configuration layers: environment variables, platform settings, tenant settings. Secrets never committed.

---

## 2. Layers

1. **Env / secret manager** — DB URL, redis, storage keys, platform JWT secrets, provider master keys
2. **Platform settings DB** — feature flags, default email provider, plan catalog operational toggles
3. **Tenant settings** — branding, tax, pipelines, integrations

---

## 3. Representative env keys

```
APP_ENV=
APP_URL=
DATABASE_URL=
REDIS_URL=
STORAGE_ENDPOINT=
STORAGE_BUCKET=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
ENCRYPTION_KEY=
SESSION_SECRET=
SMTP_...=
OBSERVABILITY_...=
```

Exact list finalized with ADR-002 stack choice.

---

## 4. Rules

- `.env.example` without secrets
- Different encryption keys per environment
- Tenant integration secrets in DB ciphertext, not env

---

## 5. Related documents

- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [SECURITY.md](../security/SECURITY.md)
- [STORAGE.md](./STORAGE.md)
