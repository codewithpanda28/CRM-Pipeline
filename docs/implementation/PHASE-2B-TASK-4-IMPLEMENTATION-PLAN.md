# PHASE-2B-TASK-4-IMPLEMENTATION-PLAN.md

**Milestone:** Phase 2B Task 4 — Complete worker migration + queue observability  
**Date:** 2026-09-04  
**Depends on:** Task 3 (JobQueue + outbox + webhook.deliver)

---

## Exact legacy inventory (repo search)

### API `setInterval` / startup workers
| Worker | Interval | Classification |
|--------|----------|----------------|
| website-checker | 60s | **MIGRATE** (dedupe vs website-ping → single job) |
| task-due-notifier | daily midnight UTC | **MIGRATE** |
| pm-due-alert | daily midnight UTC | **MIGRATE** |
| recurring-task-generator | hourly | **MIGRATE** |
| metrics-rollup | 15m | **MIGRATE** |
| plugin-cron | 60s poll | **MIGRATE** |
| hub-retention | daily | **MIGRATE** |
| license-check | 30m | **MIGRATE** |
| webhook-delivery | 10s | **ALREADY BULLMQ** (legacy only) |

### Worker 60s loop
| Job | Classification |
|-----|----------------|
| website-ping | **MIGRATE** (keep as canonical website probe; kill API checker) |
| alert-eval | **MIGRATE** |
| db-health | **MIGRATE** (feature-gated infra) |
| server-staleness | **MIGRATE** |
| pm/due-date-alerts | **MIGRATE** |
| pm/overdue-scan | **MIGRATE** (log-only; keep as cheap platform sweep) |
| pm/health-recalc | **MIGRATE** |
| pm/sprint-rollover | **MIGRATE** |
| pipeline-reminders | **MIGRATE** |
| update-check | **PLATFORM-ONLY** MIGRATE (scope=platform) |
| webhook-delivery | **ALREADY BULLMQ** |

### Event-driven (not interval)
| Job | Classification |
|-----|----------------|
| pipeline-automations | **KEEP TEMPORARILY** event path (outbox→automation later); not started on interval today |

### Keep synchronous / not jobs
| Piece | Why |
|-------|-----|
| messaging rate-limit prune | in-process memory hygiene |
| SSE heartbeats | connection lifecycle |
| useChat poll | client UI |
| SSH/SQL run helpers | request-scoped |
| updater sidecar | separate process |

---

## Outbox vs direct schedule

| Path | Use |
|------|-----|
| **Outbox → publisher → BullMQ** | Event-driven business side effects (webhooks already; future automation events) |
| **Direct BullMQ recurring** | Operational sweeps (metrics, health, due scans, website ping, update-check). Not domain facts — no duplicate “business event” enqueue. Documented as intentional. |

---

## Target queues (instantiate only these)

- `webhooks` — webhook.deliver  
- `integrations` — website.check, infra.db.health, license.check, system.update.check  
- `notifications` — tasks.due, pm.due.*, infra.alert.eval, infra.server.staleness  
- `automation` — recurring, pipeline.reminder, metrics.rollup, pm.health/sprint/overdue, plugin.cron  
- `documents` — hub.retention  

---

## Dual-runner removal

When `JOBS_RUNTIME=bullmq` (default):

- API: **do not** call any `start*` interval workers  
- Worker: **do not** run the 60s `setInterval` job loop  
- Only: outbox publisher + BullMQ consumers + JobScheduler repeatables  

`JOBS_RUNTIME=legacy`: restore intervals (staging rollback only).

---

## Implementation order

1. Extend `JobQueue` with recurring (`every` / cron) via BullMQ JobScheduler  
2. Observability snapshot (queue + outbox + worker heartbeat)  
3. Register handlers wrapping existing `run*` functions in worker  
4. Relocate API-only `run*` into `apps/worker/src/jobs/` (or shared import)  
5. Gate API + worker legacy loops  
6. Tenant gate inside sweeps where rows carry `workspace_id`  
7. Tests + browser smoke + inventory + report  

**STOP** after Task 4 — no Finance / Pulse UI / CRM expansion.
