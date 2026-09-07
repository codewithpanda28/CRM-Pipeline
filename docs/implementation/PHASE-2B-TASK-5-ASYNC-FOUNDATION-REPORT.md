# PHASE-2B-TASK-5-ASYNC-FOUNDATION-REPORT.md

**Milestone:** Phase 2B Task 5 — Final async foundation hardening + burn-in  
**Date:** 2026-09-04  
**Runtime:** `JOBS_RUNTIME=bullmq` only (production-supported)

---

## Pipeline automation migration

| Old path | New path |
|----------|----------|
| `processAutomationEvent` never invoked (dead) | Domain mutation → `EventRecorder` (`crm.pipeline.*`) → publisher → JobQueue → BullMQ `automation.pipeline.evaluate` → `processAutomationEvent` |
| Deal stage/create webhooks unwired | `onPipelineStageChanged` / `onPipelineItemCreated` → `queueWebhook` (outbox → `webhook.deliver`) |
| PM `pmEvents` + `initAutomationEngine` sync listener | Under bullmq: listener **disabled**; `emitPmDomainEvent` → outbox `pm.*` → `automation.pm.evaluate` → `@vencore/automation` evaluator |
| `JOBS_RUNTIME=legacy` | Interval workers + sync PM listener (rollback only; not dual-run) |

Canonical flow:

```
Business TX / mutation
  → outbox_events (EventRecorder)
  → OutboxPublisher
  → JobQueue (BullMQ)
  → worker handler
  → automation / webhook domain work
```

Shared PM evaluate logic lives in `@vencore/automation` (API + worker).

---

## Background runtime

```
Postgres (source of truth for domain + outbox)
  → OutboxPublisher (worker, 2s tick + lease reclaim)
  → BullMQ (Redis ≥5, prefix thinkaiq:)
  → Workers:
       - apps/worker: publisher + event-driven (webhook, automation.*) + recurring sweeps
       - apps/api: API-bound consumers only (plugin/license/notifications/metrics/hub)
```

Operational sweeps (`pipeline.reminder`, website/infra/PM health, etc.) remain **direct recurring BullMQ** (documented; not domain-event outbox).

---

## Legacy paths

| Item | Classification | Why retained |
|------|----------------|--------------|
| `JOBS_RUNTIME=legacy` interval starters | TEMPORARY | Staging rollback only; disabled by default; removal after ops sign-off |
| `pmEvents.emit` still called from `emitPmDomainEvent` | VALID for tests / legacy listener | Under bullmq, no in-process automation listener — emit is harmless fan-out |
| Messaging rate-limit prune / SSE heartbeat `setInterval` | VALID | Request-scoped platform helpers, not job runtime |
| Chat/UI polling intervals | VALID | Client UX, not backend job dual-run |
| Direct `bullmq` imports outside `@vencore/job-runtime` | None | — |

**Decision:** `JOBS_RUNTIME=bullmq` is the **only supported production runtime**. Legacy must not run simultaneously.

---

## Idempotency

| Mechanism | Behavior |
|-----------|----------|
| Outbox `dedupe_key` UNIQUE | Duplicate domain append → same outbox row (`deduped: true`) |
| BullMQ `jobId` from idempotencyKey | Duplicate enqueue coalesces at queue |
| Pipeline actions | `move_stage` / `assign_user` noop if already applied |
| PM rules | Successful `automation_logs.detail = idem:<key>` skips re-execution |
| Webhooks | Existing delivery claim / dedupe (Task 3) |

**Concurrency:** At-least-once delivery. Handlers may run more than once; business outcomes are idempotent. **Not** exactly-once.

---

## Recovery

Live outbox suite (Postgres + MemoryJobQueue / Redis for BullMQ package):

| Scenario | Result |
|----------|--------|
| Redis enqueue failure | Outbox stays `pending`, attempts++, `last_error` |
| Redis recovery | Republish → `published` |
| Lease expiry / publisher crash mid-publish | Reclaim → pending → republish |
| Duplicate outbox append | Single row |
| Dead after max publish attempts | `dead` |
| Automation job mapping | `automation.pipeline.evaluate` → queue `automation`, tenant scope |

Burn-in runtime (local): API restart, worker restart, publisher loop + observability snapshots verified with Redis 7.4.9 on `:6380`.

---

## Tenant lifecycle

Worker middleware `assertJobAllowed` / `canRunBusinessJobs`:

| Status | Business jobs |
|--------|---------------|
| ACTIVE | Execute |
| SUSPENDED / ARCHIVED / DELETING (+ jobsPaused) | Rejected (`TENANT_JOBS_BLOCKED`); observable via metrics |
| Platform lifecycle allow-list | Only explicitly allowed job names |

Contract tests cover suspended + archived rejection and active accept.

---

## Observability

| Area | Source |
|------|--------|
| Outbox pending/publishing/dead/oldest/retries/reclaims | `outboxMetrics` + reconciler report |
| Queue / worker heartbeat, last success/failure, latency, rejected | `jobRuntimeMetrics` |
| Snapshot log every 30s | `queue observability snapshot` (worker) |
| Automation trigger/execution/duplicate/step failure | Structured logs (`pipeline automation *`, `pm automation *`) — no full sensitive payloads |

---

## CI

`.github/workflows/ci.yml` adds **`live-async`** job:

- Postgres 16 + **Redis 7** service
- Dedicated DB `vencore_queue_test` + migrate
- `@vencore/job-runtime` unit/contract
- `@vencore/events` + `@vencore/job-runtime` integration (`ALLOW_LIVE_QUEUE_TESTS=1`, `REDIS_URL_TEST=.../15`)
- Worker catalog unit tests

Does **not** depend on developer laptop Redis.

---

## Tests

| Suite | Result |
|-------|--------|
| API unit | **415 / 415** |
| job-runtime unit + contract | **17 / 17** |
| Worker catalog | **4 / 4** |
| Outbox live | **11 / 11** |
| Webhook live | **3 / 3** |
| BullMQ live | **6 / 6** |
| Live isolation | **40 / 40** (8 files) |
| API `tsc --noEmit` | PASS |
| Worker `tsc --noEmit` | PASS |

---

## Browser/runtime

| Process | Status | Port / URL |
|---------|--------|------------|
| Frontend (Next) | Running | http://localhost:3002 |
| API | Running (`JOBS_RUNTIME=bullmq`, API-bound BullMQ consumers) | http://localhost:3001 |
| Worker | Running (publisher + consumers + 17 schedulers) | process |
| Outbox publisher | Running (2s tick inside worker) | — |
| Redis | **7.4.9** | `127.0.0.1:6380` (`REDIS_URL`) |
| Redis 3.0 (legacy Windows service) | Present but **unused** | `:6379` |

Smoke (isolation user `usera@isolation.test`):

- ThinkAIQ CRM branding intact  
- Login loads / signs in  
- Dashboard shell loads  
- Pipeline board loads (`/crm/pipeline/...`)  
- Contacts loads (`/crm/contacts`)  
- No blank crash / no unexpected API 500 during smoke  
- Pre-existing Next hydration warning on login overlay (non-blocking)

---

## Responsive

| Width | Result |
|-------|--------|
| 390 | PASS — nav usable, ThinkAIQ logo, no horizontal overflow |
| 768 | PASS — layout stable |
| 1280 | PASS — sidebar + contacts/pipeline usable |

---

## Remaining production blockers

1. **Managed Redis HA not provisioned** — production blocked without HA + TLS + persistence + monitoring (see `docs/operations/REDIS-JOB-RUNTIME.md`).  
2. **Legacy `JOBS_RUNTIME=legacy` still in tree** — rollback only; schedule deletion after burn-in sign-off.  
3. Pipeline/PM outbox append is **best-effort after mutation** (not always same SQL TX as CRM write) — durable outbox after successful append; tightening same-TX wraps is a follow-up hardening item, not a dual-runtime issue.

---

## Phase 2B foundation status

| Area | Status |
|------|--------|
| tenant isolation | **GREEN** |
| authentication | **GREEN** |
| storage isolation | **GREEN** |
| cache isolation | **GREEN** |
| outbox | **GREEN** |
| BullMQ | **GREEN** |
| worker runtime | **GREEN** |
| automation event path | **GREEN** |
| Redis production readiness | **RED** (no managed HA yet) |
| WebSocket security | **YELLOW** (prior hardening; not re-scoped here) |
| platform admin security | **YELLOW** (prior; Super Admin UI out of scope) |
| branding | **GREEN** |
| responsive web | **GREEN** |

**Do not treat RED items as production-ready.**

---

## Definition of Done checklist

- [x] Pipeline async automation uses outbox → JobQueue → BullMQ  
- [x] No accidental duplicate production runtime under bullmq  
- [x] Idempotency proven (outbox + handler + contract tests)  
- [x] Redis failure / publisher lease / worker path proven in live suites + local burn-in  
- [x] Tenant suspension gate proven in contract tests  
- [x] Observability snapshots available  
- [x] CI live-async with Redis service  
- [x] Live isolation + unit suites green  
- [x] App / worker / publisher start with `JOBS_RUNTIME=bullmq`  
- [x] Browser + responsive smoke  
- [x] This report  

**STOP.** Do not start Finance, CRM expansion, WhatsApp, Voice, Super Admin UI, Temporal, or another phase automatically.
