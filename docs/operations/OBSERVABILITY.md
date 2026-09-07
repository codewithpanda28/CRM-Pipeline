# OBSERVABILITY.md — ThinkAIQ

## 1. Purpose

Operational visibility across the platform: structured logs, metrics, traces, health signals, and the data plane that feeds the **Super Admin Platform Ops Center**.

Telemetry alone is insufficient — operators consume it through [PLATFORM_OPS_CENTER.md](./PLATFORM_OPS_CENTER.md) and [SUPER_ADMIN.md](./SUPER_ADMIN.md).

---

## 2. Requirements

- Structured JSON logs  
- Correlation / request IDs on API, jobs, automation, webhooks  
- Per-tenant labels where safe (avoid PII sprawl)  
- Metrics: latency, error rate, queue depth, worker lag, automation failure rate, webhook success, integration health  
- Distributed traces for request → outbox → worker chains (phase in)  
- Alerting on SLO burn / DLQ growth / provider outages  
- **Error fingerprinting** for grouping  
- **Health snapshots** for tenant + module rollups  
- Feeds for incidents, timelines, affected-record linkage  

---

## 3. Signal → Ops Center mapping

| Telemetry | Ops Center surface |
|-----------|--------------------|
| API/error metrics | Platform Pulse, tenant health, error explorer |
| Job/queue metrics | System activity, recovery retries |
| Automation run failures | Automation failure lane |
| Webhook attempts | Incident rules, replay actions |
| Integration adapter results | Integration health + circuits |
| Auth failures | System activity / security timeline |
| Domain/SSL checkers | Tenant health |

---

## 4. Log classes

| Class | Retention hint |
|-------|----------------|
| Auth logs | Longer (security) |
| API access | Medium |
| Workflow/job | Medium |
| Webhook delivery | Medium |
| App errors | Medium + archive |
| Incident records | Longer (ops history) |
| Error samples | Shorter rolling window |

---

## 5. Instrumentation rules (engineering)

Every module must:

1. Emit structured errors with `module_code`, `tenant_id` (when known), `error_code`  
2. Propagate `correlation_id`  
3. Register a **health probe** (DB dependency, queue, provider ping as applicable)  
4. Tag automation/webhook failures for ops aggregation  
5. Never log secrets or raw credentials  

---

## 6. Related documents

- [PLATFORM_OPS_CENTER.md](./PLATFORM_OPS_CENTER.md)  
- [SUPER_ADMIN.md](./SUPER_ADMIN.md)  
- [ERROR_HANDLING.md](../api/ERROR_HANDLING.md)  
- [AUDIT_LOG.md](../security/AUDIT_LOG.md)  
- [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md)  
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)  
