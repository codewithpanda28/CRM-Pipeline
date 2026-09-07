# SCALABILITY.md — ThinkAIQ Scalability Strategy

## 1. Purpose

Define how ThinkAIQ scales as a multi-tenant modular monolith without premature microservices.

## 2. Principles

- Scale vertically first for the app; horizontally for **workers** early  
- Keep one codebase / one primary deployable API  
- Partition work by tenant where queues are hot  
- Pre-aggregate analytics; paginate all lists  
- Cache tenant branding/config aggressively with invalidation on update  
- Extract services only when a module’s scale or ownership demands it (automation, messaging, voice)

## 3. Phases

| Phase | Shape |
|-------|-------|
| A | Stateless app replicas + worker pool + Postgres + Redis + object storage |
| B | Read replicas, cache, queue partitions, CDN for WL assets |
| C | Extract hot modules behind contracts (automation runner, WhatsApp ingress, voice) |

## 4. Hot paths to watch

- Automation executions & wait-for-event resume  
- WhatsApp inbound webhooks  
- Invoice PDF generation  
- Import/export jobs  
- Super Admin Pulse aggregations (use snapshots)  

## 5. Multi-tenant fairness

- Per-tenant rate limits and concurrency caps  
- Noisy-neighbor isolation via queue priority / tenant pause  
- Usage quotas enforced before expensive side effects  

## 6. Related

[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) · [DEPLOYMENT.md](../deployment/DEPLOYMENT.md) · [USAGE_METERING.md](../operations/USAGE_METERING.md) · [BACKGROUND_JOBS.md](../operations/BACKGROUND_JOBS.md)
