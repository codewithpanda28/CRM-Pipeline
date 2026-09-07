# PHASE-2B-TASK-4-IMPLEMENTATION-REPORT.md

**Milestone:** Phase 2B Task 4 — Complete worker migration + queue observability  
**Date:** 2026-09-04  
**Product:** ThinkAIQ CRM  
**Status:** Complete — STOP (no Finance / Pulse UI / CRM expansion)

---

## Migrated workers

All interval workloads from API + worker 60s loop, plus Task 3 webhooks:

website.check · infra.alert.eval · infra.db.health · infra.server.staleness · pm.due.soon · pm.overdue.scan · pm.health.recalc · pm.sprint.rollover · pipeline.reminder · system.update.check · metrics.rollup · hub.retention.purge · plugin.cron.fire · license.check · tasks.due.notify · pm.due.alert · pm.recurring.generate · webhook.deliver

Exact mapping: [PHASE-2B-TASK-4-WORKER-INVENTORY.md](./PHASE-2B-TASK-4-WORKER-INVENTORY.md)

---

## Legacy workers remaining

| Item | Reason |
|------|--------|
| `pipeline-automations` (event path) | Not an interval runner; migrate via outbox in a later automation milestone |
| In-process SSE / rate-limit prune | Not background business jobs |
| Updater sidecar | Separate platform process |
| `JOBS_RUNTIME=legacy` interval code | Staging rollback only — not production path |

---

## Dual-runner status

**Production target (`JOBS_RUNTIME=bullmq`): no duplicate interval execution.**

- API: starts **API-bound BullMQ consumers only** (sandbox/push/alert-dependent jobs)  
- Worker: outbox publisher + BullMQ consumers + JobScheduler upserts  
- Verified in logs: `API-bound BullMQ consumers started` and worker `job start` / `job done` for pipeline.reminder, pm.health.recalc, etc.  
- Website dual probe (API checker + worker ping) eliminated under bullmq

---

## Queue architecture

| Queue | Workloads |
|-------|-----------|
| webhooks | webhook.deliver |
| integrations | website.check, infra.db.health, license.check, system.update.check |
| notifications | infra.alert.*, pm.due.*, tasks.due.notify |
| automation | pipeline.reminder, metrics.rollup, pm.*, plugin.cron, recurring |
| documents | hub.retention.purge |

Logical queues by class — **not** one queue per tenant.

---

## Scheduling

- BullMQ `upsertJobScheduler` via `JobQueue.ensureRecurring`  
- `everyMs` for frequent sweeps; UTC `cron` for daily midnight jobs  
- Timezone: domain uses UTC (existing midnight UTC behavior preserved)  
- **Outbox** still used for event-driven webhooks; operational sweeps use **direct recurring** (documented in catalog `scheduleRationale`)

---

## Idempotency

| Pattern | Examples |
|---------|----------|
| Outbox dedupe + delivery claim | webhooks |
| Stable JobScheduler id | all recurring sweeps |
| Domain unique / upsert | metrics rollup buckets; recurring rule `next_run_at` advance before side effects; plugin cron clock advance first |

At-least-once + idempotent handlers — not distributed exactly-once.

---

## Failure recovery

| Scenario | Behavior |
|----------|----------|
| Redis down | Outbox remains pending (Task 3 tests); schedulers pause until Redis returns |
| Worker restart | BullMQ reclaims locks; schedulers persist in Redis; graceful `close()` |
| Publisher restart | Lease reclaim + pending republish |
| Poison / permanent | PermanentJobError → no infinite retry; failed set retained |
| Duplicate job | Idempotency keys / domain claims |

Live: outbox 9/9, BullMQ 6/6, webhook 3/3 re-verified this milestone.

---

## Observability

Structured logs every 30s (`queue observability snapshot`):

- Outbox: pending, publishing, dead, oldest age, retries  
- BullMQ queueDepth (waiting/active/failed)  
- Worker: heartbeat, version, completed/failed/rejected, avg latency, pausedTenantSkips  

Ready for future Pulse consumption — **no Pulse UI built**.

---

## Redis

| Env | Detail |
|-----|--------|
| Local smoke | Redis **7.4.9** at `redis://127.0.0.1:6380` |
| Docs | [docs/operations/REDIS-JOB-RUNTIME.md](../operations/REDIS-JOB-RUNTIME.md) |
| Production | Managed Redis HA ≥5 required before multi-tenant launch; **not provisioned in this task** |

---

## Tests

| Suite | Result |
|-------|--------|
| API unit | **415/415** |
| job-runtime unit | **11/11** |
| worker catalog | **4/4** |
| events unit | **2/2** |
| Outbox live | **9/9** |
| Webhook live | **3/3** |
| BullMQ live | **6/6** |
| typecheck api/worker | pass |

---

## Browser/runtime

| Process | URL / note |
|---------|------------|
| Frontend | http://localhost:3002 |
| API | http://localhost:3001 (+ API-bound BullMQ consumers) |
| Worker | BullMQ publisher + consumers + schedulers |
| Redis | 127.0.0.1:6380 (7.4.9) |

| Check | Result |
|-------|--------|
| ThinkAIQ branding | Pass |
| Login | Pass |
| Pipeline | Pass |
| Contacts | Pass (prior session + reload) |
| 390 / 768 / 1280 | No horizontal overflow |
| Console | Pre-existing login hydration warning only |

---

## Remaining production blockers

1. Managed Redis HA not provisioned  
2. `pipeline-automations` still sync/event — not BullMQ/outbox  
3. Sweep jobs are platform-scoped global scans — per-tenant fairness/rate limits still thin  
4. Legacy `JOBS_RUNTIME=legacy` code path still in tree until burn-in ends  
5. Prior Phase 2B items: WS/CSRF hardening, Pulse UI, finance deferred  

**Not production-ready for paid multi-tenant scale yet** — foundation runtime is BullMQ-only under default config.

---

## Definition of Done

- [x] Suitable legacy workers migrated  
- [x] No accidental duplicate production runners under `bullmq`  
- [x] BullMQ is standard background runtime  
- [x] Tenant middleware on consumers; platform jobs explicit  
- [x] Idempotency documented per workload  
- [x] Retry policies defined  
- [x] Failure recovery tested (prior + this run)  
- [x] Queue/outbox metrics logged  
- [x] Legacy rollback-only  
- [x] Tests / typecheck pass  
- [x] App + worker start; browser + responsive smoke  
- [x] Inventory + report  

**STOP.** Do not start Finance, WhatsApp, Voice, Temporal, or Pulse UI from this milestone.
