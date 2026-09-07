# ADR-019 — Transactional Outbox & BullMQ Publisher

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1D planning) |
| Date | 2026-09-04 |
| Relates to | ADR-004 (automation async), ADR-007/015 (queue), [EVENTS.md](../api/EVENTS.md), [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md), [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md) |
| Scope | Durable outbox, publisher → `JobQueue`, reconciliation, event taxonomy |

**Constraint:** Architecture only — no code in this phase.

---

## 1. Context

Critical side effects (automation evaluate, webhooks, notifications, PDF jobs, metering) must not be “best-effort enqueue inside a DB transaction.”

Anti-pattern:

```text
BEGIN
  UPDATE invoice …
  bullmq.add(...)   -- Redis commit ≠ Postgres commit
COMMIT
```

If Redis succeeds and Postgres rolls back → phantom jobs.  
If Postgres commits and Redis fails → lost work.

**Pattern:**

```text
Business transaction
  → DB mutations
  → INSERT outbox_events
  → COMMIT
Publisher
  → JobQueue.enqueue()   // ADR-015 port — not BullMQ types in domain
Worker
  → idempotent handlers
```

Postgres remains **truth**; Redis/BullMQ is **dispatch**. Outbox is the bridge (also Redis-failure recovery path in ADR-015).

---

## 2. Outbox model

### 2.1 Conceptual fields — `outbox_events`

| Field | Purpose |
|-------|---------|
| `id` | UUID PK |
| `tenant_id` | Nullable only for pure platform events |
| `event_type` | Namespaced type string (§7) |
| `aggregate_type` | e.g. `invoice`, `contact`, `workflow_run` |
| `aggregate_id` | UUID/string of aggregate |
| `payload` | JSONB — versioned envelope (§7) |
| `occurred_at` | Business time of fact |
| `available_at` | Earliest publish time (delays / backoff) |
| `status` | `pending` \| `publishing` \| `published` \| `failed` \| `dead` |
| `attempts` | Publisher attempts |
| `published_at` | When successfully handed to JobQueue |
| `dedupe_key` | UNIQUE where not null — prevent duplicate facts |
| `correlation_id` | Trace across graph |
| `causation_id` | Parent event/job |
| `last_error` | Publisher/handler diagnostic |
| `job_name` | Optional hint: which JobQueue name to enqueue (`automation.evaluate`, `webhook.deliver`, …) |
| `job_handle` | External id after enqueue (for reconcile) |

**Schema note:** Current [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md) sketch (`processed_at` only) is **superseded in detail** by this model — update schema doc in a later doc sync; no silent drift.

### 2.2 Write path

Same DB transaction as the business write. Domain services emit via an `EventRecorder` / unit-of-work helper — they never call BullMQ.

---

## 3. Guarantees (honest semantics)

| Claim | Reality |
|-------|---------|
| Exactly-once delivery across DB + Redis | **Not claimed** |
| At-least-once publish to queue | **Yes** (publisher retries) |
| At-least-once worker execution | **Yes** (queue retries) |
| Effectively-once **business outcome** | **Target** via `dedupe_key` + consumer idempotency keys + unique constraints |

**Formula:** transactional DB write + durable outbox + idempotent consumer.

---

## 4. Publisher design

Process (or worker role) that moves `pending` → BullMQ via `JobQueue` port.

| Concern | Design |
|---------|--------|
| **Polling / batching** | `SELECT … WHERE status=pending AND available_at<=now() ORDER BY available_at, id LIMIT N FOR UPDATE SKIP LOCKED` |
| **Locking** | Row lock + status=`publishing` + lease (`locked_until`, `locked_by`) so multi-publisher is safe |
| **Retries / backoff** | On enqueue failure: `attempts++`, set `available_at` exponential; after max → `failed` then `dead` |
| **Visibility / lease** | If publisher crashes mid-`publishing`, lease expiry returns row to `pending` |
| **Duplicate prevention** | `dedupe_key`; JobDefinition `idempotencyKey` derived from outbox id or dedupe_key |
| **Crash recovery** | Lease reclaim + reconciler (§6) |
| **Poison events** | After N failures → `dead`; Ops incident; no infinite loop |
| **Ordering** | **Per aggregate** best-effort: publisher can process FIFO per `(tenant_id, aggregate_type, aggregate_id)` but global total order is **not** guaranteed. Consumers must not assume global order. |
| **Tenant fairness** | Batch with round-robin / cap per `tenant_id` per tick so one tenant cannot starve the outbox |

**Domain packages** call `JobQueue` only from the **publisher adapter** (infrastructure), not from use-cases.

```text
Outbox row (committed)
  → Publisher
  → JobQueue.enqueue(JobDefinition{ name, tenantId, payload: envelope, idempotencyKey, trace })
  → mark published + store job_handle
```

---

## 5. BullMQ integration boundary

| Allowed | Forbidden |
|---------|-----------|
| Publisher depends on `JobQueue` port | Domain transaction imports `bullmq` |
| Payload = versioned event envelope | Queue stores workflow graphs |
| Worker handlers re-load entities by id | Trust outbox payload as sole authz |

Typical job names seeded from outbox:

- `automation.evaluate`  
- `webhook.deliver`  
- `notification.dispatch`  
- `document.render`  
- `search.index` (later)  
- `metering.record`

One outbox event may fan out to **multiple** jobs via a single “router” job or multiple outbox rows written in the original transaction (prefer explicit rows for observability).

---

## 6. Reconciliation

Periodic reconciler (also Super Admin “Fix it” actions):

| Detection | Signal | Action |
|-----------|--------|--------|
| Stuck `publishing` past lease | Ops metric + Pulse | Requeue to `pending` |
| `pending` older than SLO | Alert | Scale publisher / inspect DB |
| `published` but no BullMQ job / never consumed | Compare `job_handle` vs Redis/BullMQ + domain progress | Re-enqueue with same idempotencyKey |
| Redis outage gap | Jobs missing after recovery | Sweep `published` without terminal consumer ack **or** domain “waiting” runs without wake | Re-enqueue from outbox / workflow_runs |
| Duplicate jobs | Same idempotencyKey | Consumer no-op |
| `dead` permanent | Incident linked to tenant | Manual replay → clone event new id or reset status with audit |

**Ops Center / Pulse**

- Queue depth, outbox lag (`now - available_at` for pending), dead count, per-tenant lag  
- Incident types: `outbox.lag`, `outbox.dead`, `queue.redis_unavailable`  
- Recovery playbooks: pause tenant jobs, replay dead letter, reconcile sweep  

---

## 7. Event taxonomy & envelope

### 7.1 Naming

```text
{domain}.{entity}.{action}
```

Examples (canonical for new work):

| Event | Notes |
|-------|-------|
| `crm.contact.created` | |
| `crm.deal.won` | |
| `finance.invoice.finalized` | Prefer over bare `invoice.paid` for new emitters |
| `finance.payment.received` | |
| `automation.run.started` | |
| `automation.step.failed` | |
| `whatsapp.message.received` | |
| `tenant.status_changed` | Platform/tenant lifecycle |
| `document.render.completed` | |

**Conflict flagged:** [EVENTS.md](../api/EVENTS.md) currently lists short names (`lead.created`, `invoice.paid`).  

**Resolution:** Adopt **namespaced** forms as canonical going forward. Maintain a **compatibility alias map** in the automation trigger registry so existing doc examples and early seeds resolve. Update EVENTS.md in a doc-sync pass (not silently diverge forever).

### 7.2 Envelope (payload versioning)

```text
EventEnvelope v1
  id            // = outbox id or separate event id (prefer same)
  type          // namespaced
  spec_version  // "1"
  occurred_at
  tenant_id
  actor: { type: user|api_key|system|automation, id }
  aggregate: { type, id }
  data          // event-specific
  metadata: { correlation_id, causation_id, idempotency_key?, schema_hash? }
```

Breaking payload changes → bump `spec_version` or new type suffix (`.v2` only if unavoidable).

---

## 8. Automation relationship (boundary reminder)

```text
Domain command
  → TX: mutate + outbox(crm.deal.won)
  → COMMIT
Publisher → JobQueue(automation.evaluate)
Worker → AutomationEngine (Postgres runs/steps)
  → may write more outbox / enqueue step jobs
```

Outbox/BullMQ are **not** the workflow model (ADR-015 §6).

---

## 9. Decision

# DECISION: PostgreSQL transactional outbox + leased publisher → ThinkAIQ `JobQueue` (BullMQ adapter); at-least-once + idempotent consumers

**Implementation boundary**

- **In:** `outbox_events` enriched schema, `EventRecorder`, publisher service, reconciler, Ops metrics, namespaced event types.  
- **Out:** Direct BullMQ calls from domain transactions; claiming distributed exactly-once.  
- **Affirms ADR-015** Redis-failure recovery via outbox.  
- **Supersedes** thin `outbox_events` sketch in DATABASE_SCHEMA for field-level design.

**Status:** Accepted for Phase 1D planning.
