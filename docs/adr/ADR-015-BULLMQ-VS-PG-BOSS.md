# ADR-015 — BullMQ vs pg-boss (ThinkAIQ Job Runtime)

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1C) |
| Date | 2026-09-04 |
| Relates to | ADR-004 (automation execution), ADR-007 (queue strategy), ADR-014 (Vencore), [OPEN-SOURCE-COMPONENT-RADAR.md](../implementation/OPEN-SOURCE-COMPONENT-RADAR.md) |
| Scope | Phase 1–4 primary job/automation **runtime substrate** (not the workflow domain model) |

---

## 1. Context — ThinkAIQ requirements

ThinkAIQ needs a background execution substrate that supports:

| Requirement | Why it matters |
|-------------|----------------|
| Multi-tenant SaaS | Every job carries tenant scope |
| Tenant isolation | No cross-tenant execution/data |
| Durable background jobs | Survive process restarts |
| Delayed / scheduled jobs | Automation waits, reminders, renewals |
| Retries + exponential backoff | Provider timeouts (email/WhatsApp) |
| Idempotency | Payments, invoices, webhooks |
| Dead-letter / failed handling | Ops Center recovery |
| Prioritization | Critical billing vs bulk import |
| Concurrency + rate limits | Protect DB/providers |
| Per-tenant fairness | Noisy-neighbor control |
| Execution tracing | Correlation IDs, debugger |
| Workloads | Automation steps, webhooks, notifications, PDF, WhatsApp, Voice, AI jobs |
| Long-running workflows | Waits of hours/days (state in Postgres; queue wakes workers) |
| Horizontal workers | Scale worker fleet |
| Graceful shutdown | No dropped in-flight without checkpoint |
| Replay / recovery | Ops “Fix it” |
| Observability | Metrics, failed queues |
| Local + Docker + managed prod | Dev parity |
| Cost / ops complexity | Fit selective Vencore stack (already has Redis + Postgres) |

**Non-goal:** The queue is **not** ThinkAIQ’s automation graph, versioning, HITL, or condition DSL. Those live in the automation domain (Postgres).

Vencore today uses `setInterval` + DB polling (no real queue) — must be replaced ([VENCORE_AUDIT.md](../audit/VENCORE_AUDIT.md)).

---

## 2. Options compared

### 2.1 BullMQ

| Aspect | Assessment |
|--------|------------|
| License | MIT (Pro features separate; core usable under MIT) |
| Backing store | Redis |
| Language | TypeScript-first |
| Delayed / repeatable | Strong |
| Retries / backoff | Strong |
| Priority | Strong |
| Rate limiting | Strong (built-in) |
| Concurrency | Per-worker / per-queue |
| Flows (parent/child) | Available — useful for fan-out batches |
| Ecosystem | Large; Board UI optional |
| Ops | Requires Redis HA for production jobs |
| Fit with Vencore | Redis already in compose (pubsub/messaging) |

### 2.2 pg-boss

| Aspect | Assessment |
|--------|------------|
| License | MIT |
| Backing store | PostgreSQL only |
| Language | Node/TS |
| Delayed / schedules | Strong |
| Retries / backoff | Good |
| Priority | Present but thinner than BullMQ’s controls |
| Rate limiting | Weaker / DIY |
| Concurrency | Good |
| Flows | Limited vs BullMQ |
| Ecosystem | Smaller |
| Ops | No extra broker; shares Postgres load |
| Fit | Aligns with “Postgres is source of truth” |

### 2.3 Comparison matrix (ThinkAIQ-weighted)

| Criterion | BullMQ | pg-boss | Weight |
|-----------|--------|---------|--------|
| Tenant fairness (rate limit, priority) | **Better** | Adequate DIY | High |
| High-throughput side effects (WA/webhooks/AI) | **Better** | Good | High |
| Ops simplicity (components) | Redis + PG | **PG only** | Medium |
| Failure isolation (queue ≠ DB) | Jobs can survive brief PG blips if Redis up | Jobs blocked if PG down | Medium |
| Local/dev with existing stack | Redis already there | Simpler if Redis dropped | Low–Med |
| Coupling risk if abstracted | Same | Same | — |
| Path to Temporal later | Compatible | Compatible | — |
| License for WL SaaS | MIT OK | MIT OK | High |

**Neither** replaces Temporal for complex durable orchestration. Both are acceptable Phase 1–4 runtimes if domain state stays in Postgres.

---

## 3. ThinkAIQ abstraction (mandatory)

Domain/application code talks only to ThinkAIQ ports — **never** imports BullMQ/pg-boss types in finance/CRM/automation domain packages.

### Conceptual interfaces

```text
JobQueue
  enqueue(definition: JobDefinition): Promise<JobHandle>
  schedule(definition: JobDefinition, when: ScheduleSpec): Promise<JobHandle>
  cancel(handle): Promise<void>

JobDefinition
  name: JobName           // e.g. automation.step, webhook.deliver, document.render
  tenantId: TenantId
  payload: JSON           // opaque to queue; schema per job name
  idempotencyKey?: string
  priority?: Priority
  retryPolicy?: JobRetryPolicy
  timeoutMs?: number
  trace: { correlationId, causationId?, workflowRunId?, stepId? }

JobRetryPolicy
  maxAttempts, backoff (exp|fixed), retryableErrorCodes[]

JobExecution
  id, jobName, tenantId, attempt, status
  startedAt, finishedAt, error?, result?

JobResult
  ok | retryable_failure | permanent_failure
  output?, errorCode?, errorMessage?

ScheduledJob
  cron | runAt | relativeDelay
  tenant timezone awareness applied BEFORE enqueue (domain), not inside Redis

AutomationExecution  // DOMAIN — not a queue type
  workflowRunId, versionId, currentStep, waitState, variables
  // Persisted in Postgres; queue only wakes “resume step”
```

### Package boundary

```text
packages/job-runtime          // BullMQ adapter implements JobQueue
packages/automation-domain    // workflows/runs — depends on JobQueue port only
apps/worker                   // registers handlers by JobName
```

Swapping BullMQ → pg-boss or Temporal workers later = new adapter, same ports.

---

## 4. Multi-tenant strategy

| Concern | Design |
|---------|--------|
| **tenantId propagation** | Required on every `JobDefinition`. Worker middleware rejects missing/invalid tenant. Handler loads tenant context before side effects. |
| **Queue naming** | Prefer **logical queues by job class**: `automation`, `webhooks`, `notifications`, `documents`, `integrations`, `ai` — not one queue per tenant (cardinality explosion). Optional **shard suffix** later (`webhooks-0..N`) by hash(tenantId). |
| **Isolation** | Payload never trusted for authorization alone; re-check entitlements/permissions in handler. Artifacts/files keyed `tenants/{tenantId}/...`. |
| **Noisy neighbor** | Per-tenant **concurrency caps** and **rate limiters** (BullMQ rate limit + token bucket in adapter). Global caps on AI/WhatsApp queues. Super Admin can pause tenant jobs (`tenant_job_controls`). |
| **Priority** | Enum: `critical` (payments, security) > `high` (user-visible notify) > `normal` > `bulk` (imports). |
| **Usage metering** | Increment on successful/failed billable job types (automation executions, WA sends, PDF gens). |
| **Security** | No cross-tenant job peek in worker UI without platform auth; redact PII in job logs. |

---

## 5. Failure model

| Failure | Behavior |
|---------|----------|
| Job handler crash | Retry per policy; after max → `failed` + DLQ/failed set + ops event |
| Worker process crash | In-flight job returns to wait/active per BullMQ lock TTL; **domain checkpoint** must make re-entry safe |
| Duplicate execution | **IdempotencyKey** + domain unique constraints (payment, webhook delivery, invoice number allocate) |
| Timeout | Fail attempt as retryable unless marked permanent |
| Poison job | After N failures → quarantine; Ops Center manual replay |
| Partial failure (3 of 5 emails) | Domain step result records partial; automation decides branch — queue does not invent compensation |
| Deploy mid-job | Graceful shutdown waits lock; long steps must be checkpointed in Postgres |
| Network blip to provider | Retryable |
| Database failure | Handlers fail retryable; **workflow state** remains in PG when PG returns |
| **Redis failure (BullMQ)** | New enqueues fail; workers stall. **Mitigation:** (1) Redis HA; (2) domain outbox in Postgres remains source of “work to do”; (3) reconciler job can re-enqueue from outbox/`workflow_runs` waiting state when Redis recovers. Accept Redis as critical path for *latency*, not for *truth*. |

**Truth rule:** Workflow run state, wait-until, approvals, and business records live in **PostgreSQL**. Redis/BullMQ holds **dispatch leases**, not the system of record.

---

## 6. Where the queue ends and automation begins

```text
Domain event committed (Postgres)
  → outbox_events row
  → Outbox publisher enqueues JobName=automation.evaluate (tenantId, eventId)
       【 QUEUE BOUNDARY 】
  → Worker runs AutomationEngine.evaluate(event)
       【 DOMAIN 】
  → Creates/continues workflow_run + steps in Postgres
  → For each ready action/delay:
        enqueue automation.step | automation.wait.resume | …
       【 QUEUE BOUNDARY 】
  → Worker executes action adapter (email, WA, CRM update)
  → Writes step result + emits events
  → If delay: schedule job at wake time; run stays status=waiting in PG
  → If wait-for-event: no job until matching event evaluates again
```

**BullMQ/pg-boss must not store:** workflow graphs, versions, condition trees, HITL forms, variable scopes.  
**They store:** “run this named handler with this payload at this time.”

---

## 7. Decision

### Winner: **BullMQ**

**Why it wins for ThinkAIQ Phase 1–4**

1. **Per-tenant fairness tooling** (rate limit, priority, concurrency) is stronger out of the box — critical for multi-tenant WhatsApp/webhooks/AI.  
2. **Redis is already in the Vencore-derived stack** — not a new infrastructure class for ThinkAIQ.  
3. **Throughput & ecosystem** for many short jobs (notify, webhook, PDF, step actions) is proven.  
4. **Flows** help fan-out/fan-in without inventing orchestration in Redis.  
5. Clearer path to horizontal worker fleets with dedicated queues per workload class.

**Why pg-boss loses (for primary) — not because it is bad**

1. Rate-limit / priority / fairness require more custom code — higher risk of noisy-neighbor bugs.  
2. Smaller ecosystem and fewer operational patterns for mixed SaaS workloads.  
3. Couples job pressure to the same Postgres that serves interactive API latency (under load, worse UX).

**Trade-offs we accept**

- Redis becomes **tier-0** for job dispatch (HA required in prod).  
- Two data stores to monitor (PG + Redis).  
- Team must discipline idempotency (as with any queue).

**Migration path if we later add Temporal**

- Keep `AutomationExecution` / `workflow_runs` in Postgres.  
- Replace only the adapter that schedules `automation.step` / long waits: Temporal workflows call the **same action ports**.  
- BullMQ remains for “dumb” jobs (PDF, webhooks, email) even after Temporal owns long orchestration — hybrid is fine.

---

## 8. Temporal compatibility

| Layer | Stable |
|-------|--------|
| Workflow graph, versions, HITL, variables | Postgres automation domain |
| Action adapters (CRM, email, WA, PDF) | Ports/adapters |
| JobQueue port | Implemented by BullMQ now; Temporal worker or Temporal+BullMQ later |
| Outbox | Still feeds “something happened” |

Introducing Temporal = **new runtime adapter + worker**, not rewrite of CRM/finance/automation schemas.

---

## 9. Final recommendation

# DECISION: BullMQ

**Implementation boundary**

- **In:** `packages/job-runtime` (BullMQ), `apps/worker` handlers, queue metrics for Ops Center.  
- **Out of domain packages:** any `import('bullmq')`.  
- **pg-boss:** retained as documented fallback only if Redis TCO/HA becomes unacceptable (would require a new ADR to switch).  
- **Temporal:** deferred until automation durability/complexity justifies ops cost (Phase 4b+).

**Status:** Accepted for Phase 1–4 planning. Revisit only with production evidence or Temporal adoption ADR.
