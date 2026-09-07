# PHASE-2B-TASK-3-IMPLEMENTATION-REPORT.md

**Milestone:** Phase 2B Task 3 — Transactional outbox + JobQueue + BullMQ  
**Date:** 2026-09-04  
**Product:** ThinkAIQ CRM  
**ADRs:** ADR-015, ADR-019  
**Status:** Complete (foundation) — STOP (no Task 4)

---

## Architecture implemented

```text
Postgres TX
  → outbox_events (EventRecorder, same connection)
  → COMMIT
Publisher (SKIP LOCKED + lease)
  → JobQueue.enqueue()
  → BullMQ (logical queue: webhooks)
Worker middleware (tenant/scope/suspension)
  → idempotent webhook.deliver handler
```

| Package | Role |
|---------|------|
| `@vencore/job-runtime` | `JobQueue` port, BullMQ adapter, priorities/retries, worker gate, SSRF helper |
| `@vencore/events` | `EventRecorder`, `OutboxPublisher`, reconciler, webhook delivery executor |
| `apps/worker` | Publisher loop + BullMQ webhooks consumer when `JOBS_RUNTIME=bullmq` |
| `apps/api` | `queueWebhook` writes deliveries + outbox in one TX; legacy poller only if `JOBS_RUNTIME=legacy` |

**Domain / app code does not import `bullmq`.** Only `@vencore/job-runtime` does.

---

## Outbox

### Schema
ADR-019 fields already present from Phase 2A (`20260904_001`). Additive migration:

- `20260904_002_outbox_publisher_indexes.ts` — lease / tenant-pending / job_handle indexes  
- **No DROP** of legacy columns

### Publisher
- Claim: `FOR UPDATE SKIP LOCKED` → `publishing` + `locked_by` / `locked_until`
- Success → `published` + `job_handle`
- Enqueue failure → `attempts++`, backoff `available_at`, status `pending`
- After max attempts → `dead` + ops log
- Multi-publisher safe (no global lock)
- Per-tenant cap per tick for fairness

### Leases / crash recovery
Expired `publishing` leases reclaimed to `pending` by publisher tick + reconciler.

---

## Idempotency

**Guarantee:** at-least-once delivery + idempotent consumers. **Not** distributed exactly-once.

| Layer | Mechanism |
|-------|-----------|
| Outbox | `dedupe_key` unique partial index; `ON CONFLICT DO NOTHING` (TX-safe) |
| JobQueue | `JobDefinition.idempotencyKey` → BullMQ `jobId` |
| Webhook | Claim `pending` → `in_progress`; duplicate jobs → `skipped` if already delivered |

Stable webhook key: `webhook.deliver:{tenantId}:{subscriptionId}:{deliveryId}`

---

## Webhook migration

| Before | After (`JOBS_RUNTIME=bullmq`, default) |
|--------|----------------------------------------|
| API 10s interval poller | **Off** |
| Worker 60s interval poller (different HMAC body, no SKIP LOCKED) | **Off** |
| — | Outbox → publisher → BullMQ `webhooks` → `executeWebhookDelivery` |

**Retained:** HMAC over raw payload body, SSRF guard, delivery records, tenant job gate (reload tenant before execute).

**Escape hatch:** `JOBS_RUNTIME=legacy` restores API interval poller + worker interval (temporary only).

---

## Redis failure handling

**Test 4 (live Postgres + MemoryJobQueue simulating Redis down):**  
DB commit keeps outbox `pending`; publisher increments attempts / backoff; after “Redis” recovers, publisher marks `published`.

**Truth:** Postgres outbox is source of truth. Redis/BullMQ is dispatch only.

**Runtime note:** BullMQ requires Redis ≥ 5. Windows Redis 3.0 service is insufficient. Local smoke used Redis **7.4.9** on `127.0.0.1:6380`.

---

## Worker behavior

- Tenant jobs require `tenantId` (UUID); never inferred from payload alone  
- Payload `tenantId` must match job `tenantId`  
- Suspended / archived / deleting / `jobs_paused` → `PermanentJobError` (`TENANT_JOBS_BLOCKED`); handler does not run  
- Platform jobs use `scope: 'platform'`  
- Graceful shutdown: stop publisher timers, `worker.close()`, `jobQueue.close()`

---

## Tests

### Unit (always)
| Suite | Result |
|-------|--------|
| `@vencore/job-runtime` | **11/11** pass |
| `@vencore/events` | **2/2** pass |
| `@vencore/api` webhook-delivery | **4/4** pass |
| `@vencore/api` full suite | **415/415** pass |

### Integration (`ALLOW_LIVE_QUEUE_TESTS=1`, dedicated `*_test` DB + Redis guards)
| Suite | Result |
|-------|--------|
| Outbox live (rollback, commit, publish, Redis fail/recover, lease, dedupe, dead, reconciler) | **9/9** |
| Webhook live (deliver, duplicate → one outcome, cross-tenant deny) | **3/3** |
| BullMQ live (missing tenant, valid, suspended, priority, platform payload, shutdown) | **6/6** (via `redis-memory-server` when host Redis &lt; 5) |

**Total Task-3 focused:** 11 + 2 + 4 + 9 + 3 + 6 = **35** green in above suites; API regression **415**.

Safety: `NODE_ENV=test`, `ALLOW_LIVE_QUEUE_TESTS=1`, localhost-only DB/Redis, DB name `*_test` / `isolation_test`.

---

## Runtime

| Process | URL / note |
|---------|------------|
| Frontend (Next) | http://localhost:3002 |
| Backend (API) | http://localhost:3001 |
| Worker | BullMQ publisher + `webhooks` consumer (`JOBS_RUNTIME=bullmq`) |
| Redis | `redis://127.0.0.1:6380` (7.4.9) — **required** for BullMQ |
| Postgres | `vencore_isolation_test` (local smoke / live tests) |

API does **not** start the legacy webhook interval when `JOBS_RUNTIME=bullmq`.

---

## Browser

| Check | Result |
|-------|--------|
| ThinkAIQ CRM branding | Pass (login + shell) |
| Login | Pass (`usera@isolation.test`) |
| Pipeline | Pass |
| Contacts | Pass (1 contact visible) |
| Dashboard | Loads (empty dashboard message for this user is expected) |
| Blank / crash | No Task-3 blank page |
| 390px | No horizontal overflow; nav + contacts OK |
| 768px | No horizontal overflow |
| 1280px | No horizontal overflow; full nav |

### Errors observed
- Pre-existing Next.js **hydration warning** on `app/login/page.tsx` (LoginForm) — not introduced by Task 3  
- No new API 500s attributed to outbox/queue during smoke  
- Worker briefly logged Redis 3.0 errors until pointed at Redis 7.4.9 on port 6380

---

## Remaining risks

1. **Other interval workers** (website ping, alerts, PM jobs, etc.) still poll — not migrated this milestone  
2. **Windows Redis 3.0 service** on 6379 conflicts with BullMQ; ops must pin Redis ≥ 5  
3. **Nested `queueWebhook` transaction** when callers already hold a TX uses savepoints — callers should prefer passing the same trx long-term  
4. **Webhook HMAC header** still `X-Vencore-*` (legacy) — brand rename deferred  
5. **Observability** is structured logs + in-process counters — not yet a Pulse/Ops UI  
6. **Production Redis HA** and publisher HA not proven beyond multi-instance SKIP LOCKED design  

---

## Production readiness

**Not production-ready for multi-tenant traffic yet.**

Still required before production:

- Managed Redis ≥ 5 (HA) with dedicated non-prod test instances  
- Confirm `JOBS_RUNTIME=bullmq` only (remove legacy path after burn-in)  
- Migrate remaining critical workers onto JobQueue  
- Wire Pulse metrics from outbox/queue counters  
- Load-test publisher + webhook concurrency  
- Finish deferred security items from Phase 2B plan (WS/CSRF/platform admin, etc.)

**Task 3 DoD for foundation:** met. **STOP** — do not start Task 4 / CRM / finance features from this milestone.
