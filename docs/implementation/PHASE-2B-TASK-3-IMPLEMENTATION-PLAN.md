# PHASE-2B-TASK-3-IMPLEMENTATION-PLAN.md

**Milestone:** Phase 2B Task 3 — Transactional outbox + JobQueue + BullMQ  
**Date:** 2026-09-04  
**ADRs:** ADR-015, ADR-019

---

## Current state

| Piece | Status |
|-------|--------|
| `outbox_events` table + Kysely types | **Exists** (leases, dedupe_key, job_handle) |
| EventRecorder | **Missing** |
| Outbox publisher | **Missing** |
| `JobQueue` port / BullMQ | **Missing** (no `bullmq` dep) |
| Redis | Messaging pub/sub + optional rate-limit only |
| Webhook enqueue | `queueWebhook` → `webhook_deliveries` only |
| Webhook runners | **Dual** interval pollers: API 10s (SKIP LOCKED + tenant gate) + worker 60s (no lock, no gate, different HMAC body) |

---

## Exact files affected

### New
- `packages/job-runtime/**` — JobQueue port, BullMQ adapter, worker middleware, priorities/retries
- `packages/events/**` — EventEnvelope, EventRecorder, outbox claim/publish helpers, reconciler
- `packages/db/migrations/20260904_002_outbox_publisher_indexes.ts` — additive indexes only
- `apps/worker/src/jobs/bullmq/**` — webhook consumer + publisher bootstrap
- Tests under `packages/job-runtime`, `packages/events`, `apps/api` / worker

### Modify
- `apps/api/src/lib/queue-webhook.ts` — same TX: deliveries + outbox rows
- `apps/api/src/index.ts` — gate legacy webhook interval behind `JOBS_RUNTIME=legacy`
- `apps/worker/src/index.ts` — BullMQ workers + publisher; skip legacy webhook when bullmq
- `apps/worker/src/jobs/webhook-delivery.ts` — keep for legacy only / shared `deliverOne` extract
- `apps/api/src/workers/webhook-delivery.ts` — export shared deliver helper; stop dual-run in bullmq mode
- `packages/config` — `JOBS_RUNTIME`, Redis required-when-bullmq docs
- `pnpm-workspace` already includes `packages/*`
- Root/turbo package wiring

---

## Current workers (relevant)

| Runner | Path | Issue |
|--------|------|-------|
| API webhook delivery | `apps/api/src/workers/webhook-delivery.ts` | 10s poll |
| Worker webhook delivery | `apps/worker/src/jobs/webhook-delivery.ts` | 60s poll, no SKIP LOCKED, different body HMAC |
| Other API intervals | website, tasks, metrics, … | Untouched this milestone |
| Other worker jobs | alerts, PM, … | Untouched |

---

## Outbox schema gaps

ADR-019 fields already present in `20260904_001`. Gaps:

- Index on `(status, locked_until)` for lease reclaim
- Optional index `(tenant_id, status, available_at)` for fairness scans
- No DROP of legacy columns

---

## Redis

- `REDIS_URL` optional today — **required** when `JOBS_RUNTIME=bullmq`
- Compose already provides Redis for api/worker

---

## Migration requirements

1. Additive migration for publisher indexes
2. Install `bullmq` (+ types) on `job-runtime` / worker
3. Env: `JOBS_RUNTIME=bullmq|legacy` (default **bullmq** for new deploys; legacy for rollback)
4. Kill dual webhook pollers when bullmq is active

---

## Implementation order

1. `packages/job-runtime` — types + JobQueue + BullMQ adapter + tenant middleware  
2. `packages/events` — EventRecorder + claim/publish/reclaim + reconciler  
3. Wire `queueWebhook` → outbox in same transaction as deliveries  
4. Worker: publisher loop + `webhook.deliver` consumer  
5. Disable legacy dual runners when `JOBS_RUNTIME=bullmq`  
6. SSRF on deliver path + unified HMAC body (raw payload string — API style)  
7. Tests (PG + Redis) + regression  
8. Runtime/browser smoke + report  

**STOP after Task 3** — no Task 4 / CRM / finance.
