# PHASE-2B-FINAL-ASYNC-AUDIT.md

**Date:** 2026-09-05  
**Task:** Phase 2B Task 6 — final async runtime audit  
**Production runtime:** `JOBS_RUNTIME=bullmq` only

---

## Classification legend

| Tag | Meaning |
|-----|---------|
| CANONICAL | Production path under bullmq |
| TEMPORARY | Rollback / non-critical best-effort |
| SYNCHRONOUS | Intentional in-process |
| DEAD | Unused |
| MUST REFACTOR | Blocker if still present |

---

## Asynchronous workloads

| Workload | Trigger | Outbox? | Queue | Worker | Idempotency | Tenant | Lifecycle | Status |
|----------|---------|---------|-------|--------|-------------|--------|-----------|--------|
| Pipeline automation evaluate | Stage/create/field mutate (same TX) | Yes | automation | worker `automation.pipeline.evaluate` | dedupe_key + action noop | tenantId=workspace | gate | **CANONICAL** |
| PM automation evaluate | Task/sprint/milestone/portal (same TX) | Yes | automation | worker `automation.pm.evaluate` | dedupe_key + automation_logs | tenant | gate | **CANONICAL** |
| Webhook deliver (deals) | Same TX as pipeline mutate | Yes | webhooks | worker `webhook.deliver` | delivery claim + dedupe | tenant | gate | **CANONICAL** |
| Webhook deliver (contacts/tasks/alerts) | After mutate, own TX for delivery+outbox | Yes (delivery TX) | webhooks | worker | same | tenant | gate | **TEMPORARY** vs caller (not CRM automation-critical) |
| Outbox publisher | Worker 2s tick | n/a | → JobQueue | worker | lease + attempts | fairness cap | — | **CANONICAL** |
| Recurring sweeps (website, infra, PM health, pipeline.reminder, …) | BullMQ JobScheduler | No (ops) | various | worker/api | scheduler id | platform | — | **CANONICAL** (documented non-outbox) |
| API-bound jobs (plugin.cron, license, due notify, …) | Scheduler | No | various | API consumers | — | platform | — | **CANONICAL** |
| Legacy intervals | `JOBS_RUNTIME=legacy` | n/a | n/a | API/worker intervals | — | — | — | **TEMPORARY** rollback only |
| PM `pmEvents` listener | legacy only | n/a | n/a | in-process | — | — | — | **TEMPORARY** |
| `emitCrmEvent` plugins | Domain mutate | No | n/a | in-process | — | — | — | **SYNCHRONOUS** |
| Messaging Redis pub/sub | Optional | No | n/a | API | — | — | — | **SYNCHRONOUS**/platform |
| Rate-limit prune / SSE heartbeat | setInterval | No | n/a | API | — | — | — | **SYNCHRONOUS** |
| Direct `bullmq` import | job-runtime adapter/worker only | — | — | — | — | — | — | **CANONICAL** infra |
| Domain `JobQueue.enqueue` | Publisher only | — | — | — | — | — | — | **CANONICAL** |
| `processAutomationEvent` | BullMQ handler | — | automation | worker | noop actions | reloads tenant | gate | **CANONICAL** |

---

## Direct BullMQ import audit

| File | Allowed? |
|------|----------|
| `packages/job-runtime/src/bullmq/*` | Yes — adapter |
| All other packages/apps | **None found** |

---

## Goal

**ONE** production async runtime: Postgres outbox → publisher → JobQueue → BullMQ → tenant-gated workers.  
Legacy intervals disabled by default and must not run alongside bullmq.
