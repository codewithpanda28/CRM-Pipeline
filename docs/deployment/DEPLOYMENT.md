# DEPLOYMENT.md — ThinkAIQ

## 1. Purpose

Deployment topology for modular monolith: one platform, many tenants.

---

## 2. Components

- App (web/API) — stateless, horizontally scalable
- Workers — horizontally scalable
- Scheduler — singleton/leader
- PostgreSQL
- Redis (queue/cache/locks — candidate)
- Object storage
- Reverse proxy / load balancer
- Observability stack

---

## 3. Environments

`local` · `staging` · `production`  
Optional `demo` for sales tenants.

---

## 4. Release strategy

- Rolling deploys
- Migrations expand/contract compatible
- Feature flags for risky modules
- No per-tenant deploys by default

---

## 5. Domains

Platform admin host + wildcard tenant subdomains + custom domain routing (ADR-005).

---

## 6. Related documents

- [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md)
- [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md)
- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
