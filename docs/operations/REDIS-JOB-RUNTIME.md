# Redis for ThinkAIQ Job Runtime (BullMQ)

BullMQ **requires Redis ≥ 5**. The local Windows Redis 3.0 MSI is **not** production infrastructure.

## Supported production runtime

**`JOBS_RUNTIME=bullmq` is the only supported production runtime** (Phase 2B Task 5).

| Mode | Status |
|------|--------|
| `bullmq` (default) | **ONLY production path** — outbox publisher + JobQueue + BullMQ consumers |
| `legacy` | Staging rollback only — interval pollers; **must not** run alongside bullmq; removal planned after ops sign-off |

## Local / staging

| Setting | Guidance |
|---------|----------|
| Version | Redis **7.x** recommended (tested with 7.4.9); minimum BullMQ-compatible **≥ 5** |
| URL | `REDIS_URL=redis://127.0.0.1:6380` (avoid clashing with Redis 3 service on 6379) |
| Persistence | AOF or RDB acceptable for staging |
| `JOBS_RUNTIME` | `bullmq` (default) |

## Production requirements (blocked without these)

1. **Managed Redis HA** (ElastiCache / Memorystore / Redis Cloud / equivalent) — multi-AZ primary + replica  
2. **TLS** — required when provider offers it; private VPC only  
3. **Persistence** — AOF everysec (or stronger) so repeatable job state survives failover  
4. **Memory** — size for queue depth + BullMQ keys under prefix `thinkaiq:`; alert at >80%  
5. **Monitoring** — PING, replication lag, queue depth, failed count, outbox oldest age  
6. **Backups** — provider snapshots; RPO/RTO documented by ops  
7. **Connection** — `REDIS_URL` with password; reconnect with `maxRetriesPerRequest: null` for workers (adapter)  
8. **Recovery** — Postgres outbox is source of truth; Redis outage delays dispatch; publisher/reconciler recover when Redis returns (no manual DB edit)

Provisioning managed Redis HA is **out of scope** unless already available. Production launch remains **blocked** without it.

## BullMQ compatibility

- Library: `bullmq` ^5.x  
- Prefix: `thinkaiq:`  
- Queues: automation, webhooks, notifications, documents, integrations, ai  
