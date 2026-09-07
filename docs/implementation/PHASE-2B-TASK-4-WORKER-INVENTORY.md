# PHASE-2B-TASK-4-WORKER-INVENTORY.md

**Date:** 2026-09-04  
**Runtime default:** `JOBS_RUNTIME=bullmq`  
**Task 5 update:** `processAutomationEvent` is no longer dead — wired via outbox → `automation.pipeline.evaluate`. PM sync listener disabled under bullmq (see `PHASE-2B-TASK-5-ASYNC-FOUNDATION-REPORT.md`).

| Worker | Old runtime | New runtime | Queue | Tenant scoped | Schedule | Idempotency | Retry | Status | Notes |
|--------|-------------|-------------|-------|---------------|----------|-------------|-------|--------|-------|
| webhook.deliver | API 10s + worker 60s | BullMQ | webhooks | yes | outbox-driven | `webhook.deliver:{tenant}:{sub}:{delivery}` | exp 5 | **DONE** | Task 3 |
| website.check | API checker + worker ping | BullMQ | integrations | platform sweep | every 60s | scheduler + handler domain | exp 3 | **DONE** | Single path; kills dual probe |
| infra.alert.eval | worker 60s | BullMQ | notifications | platform sweep | every 60s | scheduler id | exp 3 | **DONE** | |
| infra.db.health | worker 60s | BullMQ | integrations | platform sweep | every 60s | scheduler id | exp 3 | **DONE** | Feature-gated infra |
| infra.server.staleness | worker 60s | BullMQ | notifications | platform sweep | every 60s | scheduler id | exp 3 | **DONE** | Feature-gated infra |
| pm.due.soon | worker 60s | BullMQ | notifications | platform sweep | every 60s | task+user+day (handler) | exp 3 | **DONE** | |
| pm.overdue.scan | worker 60s | BullMQ | automation | platform | every 60s | hour bucket | exp 3 | **DONE** | Log-only |
| pm.health.recalc | worker 60s | BullMQ | automation | platform sweep | every 60s | project+bucket | exp 3 | **DONE** | |
| pm.sprint.rollover | worker 60s | BullMQ | automation | platform sweep | every 60s | sprintId | exp 3 | **DONE** | |
| pipeline.reminder | worker 60s | BullMQ | automation | platform sweep | every 60s | automation+day | exp 3 | **DONE** | |
| system.update.check | worker 60s/6h | BullMQ | integrations | **platform** | every 60s | internal 6h throttle | bulk | **DONE** | Platform-only |
| metrics.rollup | API 15m | BullMQ (API consumer) | automation | platform | every 15m | hour bucket upsert | exp 3 | **DONE** | Direct schedule OK |
| hub.retention.purge | API daily | BullMQ (API consumer) | documents | platform | cron `0 3 * * *` | day key | exp 3 | **DONE** | |
| plugin.cron.fire | API 60s | BullMQ (API consumer) | automation | platform sweep | every 60s | job row next_run advance | exp 3 | **DONE** | Sandbox-bound → API consumer |
| license.check | API 30m | BullMQ (API consumer) | integrations | platform sweep | every 30m | workspace+bucket | exp 3 | **DONE** | API consumer (disable runtime) |
| tasks.due.notify | API midnight | BullMQ (API consumer) | notifications | platform sweep | cron `0 0 * * *` | tenant+task+day | exp 3 | **DONE** | Push/alert libs on API |
| pm.due.alert | API midnight | BullMQ (API consumer) | notifications | platform sweep | cron `5 0 * * *` | tenant+day | exp 3 | **DONE** | |
| pm.recurring.generate | API hourly | BullMQ (API consumer) | automation | platform sweep | every 1h | rule+next_run_at | exp 3 | **DONE** | |
| pipeline-automations | event sync | **KEEP TEMPORARILY** | — | tenant | event | — | — | OPEN | Outbox→automation later |
| messaging rate prune | in-process | **KEEP SYNCHRONOUS** | — | — | — | — | — | N/A | Memory hygiene |
| SSE heartbeat | in-process | **KEEP SYNCHRONOUS** | — | — | — | — | — | N/A | Connection lifecycle |
| updater sidecar | separate | **PLATFORM-ONLY** | — | — | — | — | — | OUT OF BAND | Not ThinkAIQ worker |

## Dual-runner status (production target)

With `JOBS_RUNTIME=bullmq`:

- API **does not** start `setInterval` workers  
- Worker **does not** run 60s job loop  
- Only BullMQ consumers + outbox publisher  

`JOBS_RUNTIME=legacy` restores intervals for **staging rollback only**.
