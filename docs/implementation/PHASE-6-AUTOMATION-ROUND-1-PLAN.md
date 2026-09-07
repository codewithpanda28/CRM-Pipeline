# PHASE 6 — Automation Round 1 Plan

| Field | Value |
|-------|-------|
| Status | **PLAN ONLY — implementation-ready** |
| Date | 2026-09-05 |
| Binding design | [PHASE-6-AUTOMATION-ARCHITECTURE-CONTRACT.md](./PHASE-6-AUTOMATION-ARCHITECTURE-CONTRACT.md) (**Accepted**) |
| Binding policy | [ADR-027](../adr/ADR-027-CRITICAL-ACTION-APPROVAL-POLICY.md) (**Accepted**) |
| Also governs | ADR-015 · ADR-019 · ADR-004 (refined by Contract) · ADR-021 |
| Explicit non-goals (this plan / Round 1) | Visual builder · AI draft/execution · Voice implementation · WhatsApp implementation · migrations/code in *this* artifact · modifying PM/pipeline islands · replacing Voice |

**Rule:** Do not start Round 1 code until this plan is accepted. This document is the engineering charter for Round 1 only.

---

## 0. Round 1 objective

Ship a **durable, tenant-isolated Automation foundation** that:

1. Defines and publishes immutable workflow versions  
2. Dispatches from the transactional outbox into durable runs/steps  
3. Enforces **ADR-027** for every Class B action  
4. Executes only Class A automatically; hard-blocks Class C  
5. Leaves **PM** and **pipeline** automation behavior unchanged  
6. Exposes API surfaces (not visual builder) for workflows, approvals, runs, replay  

**Architecture one-liner (unchanged):**  
Postgres = SoR for definitions, runs, approvals, audit. BullMQ = dispatch only. **A queue message is never approval.**

---

## 1. ADR-027 invariant — how Round 1 enforces it

### Required flow

```text
Draft (workflow version / action payload preparation)
  → Approval Required (automation_approvals.status = pending)
  → Authorized Approval (status = authorized; human approver; audit row)
  → Execute (RunAdvanceExecutor runs EXACT approved_payload_snapshot)
```

### MUST NOT execute when approval is

| State | Enforcement point |
|-------|-------------------|
| Missing | Action executor refuses Class B without `automation_approvals` row for step |
| Pending | `validateForExecution` returns false |
| Rejected | status ≠ authorized |
| Expired | `now >= expires_at` OR status = expired |
| Revoked | `revoked_at IS NOT NULL` OR status = revoked |

### MUST NEVER count as approval

| Signal | Why rejected |
|--------|----------------|
| BullMQ job / worker lease | Dispatch only (ADR-015) |
| Outbox row `published` | Transport fact, not human authorization |
| Workflow draft / unpublished graph | Not a decision record |
| Natural-language request | Non-inference rule |
| AI output / recommendation | Forbidden by ADR-027 |
| Prior approval for “similar” action | Snapshot + hash must match *this* step |
| Class A path | Irrelevant — Class B always requires gate |

### Payload binding (executable proof)

1. On approval create: canonicalize JSON → store `requested_payload_snapshot` + `payload_hash` (SHA-256).  
2. On authorize: snapshot is frozen; no mutation of snapshot columns.  
3. On execute: recompute hash of snapshot row; compare to `payload_hash`; compare to step’s bound approval id.  
4. Any material change to intended payload → create **new** approval; old authorized row must not execute the new payload.

### Code-path invariant (to implement)

```text
executeClassB(step):
  approval = loadApprovalForStep(FOR UPDATE)
  assert validateForExecution(approval) === true
  assert hash(approval.requested_payload_snapshot) === approval.payload_hash
  runAction(approval.requested_payload_snapshot)  // NOT step.live_computed_payload
```

There is **no** alternate path that reads “job.data.approved=true” or similar.

---

## 2. Dependency / order map

Implement strictly in this order (later layers depend on earlier SoR):

```text
P0  Schema + indexes + Kysely types
P1  AutomationApprovalService          ← no engine yet; pure Postgres + audit
P2  WorkflowDefinitionService          ← draft/publish/immutable version + schema_hash
P3  Action Registry (A/B/C)            ← classification + Class C publish/execute block
P4  TriggerMatcher                     ← tenant + event_name + filters
P5  Event dispatch job wiring          ← outbox → automation.event.dispatch
P6  Run state machine + RunAdvanceExecutor (condition/branch/delay/approval/action)
P7  Reliability (retry/backoff/timeout/idempotency/DLQ/replay)
P8  RBAC + API routes
P9  Usage accounting
P10 Feature flags + legacy coexistence
P11 Tests (unit → API → live isolation → security matrix)
P12 Ops runbook + Round 1 verification gates
```

**Do not** wire dispatch (P5) before approvals (P1) and registry (P3) exist — otherwise Class B stubs cannot be safely blocked.

**Parallelization (only after P0):**

- P1 ∥ early P2 types  
- P8 route stubs after P1+P2 APIs exist  
- P11 tests written alongside each service; full suite green before gate sign-off  

---

## 3. Database schema / migrations (P0)

**Single migration wave** (name suggestion): `YYYYMMDD_NNN_phase6_automation_round1.ts`  
**Also:** extend `packages/db/src/schema.ts` in the same PR as migration.

### 3.1 Tables

#### `workflows`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL → tenants | Isolation |
| `name` | text NOT NULL | |
| `description` | text | |
| `status` | text | `draft` \| `published` \| `archived` |
| `current_draft_version_id` | uuid NULL | Editable tip |
| `current_published_version_id` | uuid NULL | Runs may only start from published |
| `created_by` | uuid | |
| `created_at` / `updated_at` | timestamptz | |

#### `workflow_versions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | Denormalized for isolation |
| `workflow_id` | uuid NOT NULL → workflows | |
| `version_number` | int NOT NULL | Monotonic per workflow |
| `state` | text | `draft` \| `published` \| `superseded` |
| `graph` | jsonb NOT NULL | Nodes/edges; immutable once `published` |
| `schema_hash` | text NOT NULL | Hash of canonical graph + action schemas |
| `published_at` | timestamptz | |
| `published_by` | uuid | |
| `created_at` | timestamptz | |

**Immutability rule:** UPDATE of `graph` / `schema_hash` forbidden when `state = published`. Enforce in service + optional DB trigger/check.

#### `workflow_triggers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `workflow_id` | uuid NOT NULL | |
| `workflow_version_id` | uuid NOT NULL | Published version only |
| `event_name` | text NOT NULL | Canonical |
| `filter` | jsonb | Optional predicate |
| `is_active` | boolean | False when superseded/archived |
| `created_at` | timestamptz | |

Rebuilt on publish (delete prior active triggers for workflow; insert for new published version).

#### `workflow_runs`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `workflow_id` | uuid NOT NULL | |
| `workflow_version_id` | uuid NOT NULL | **Pinned** |
| `status` | text | See §10 |
| `trigger_event_id` | uuid | outbox / envelope id |
| `trigger_event_name` | text | |
| `trigger_payload` | jsonb | Envelope snapshot at start |
| `correlation_id` | text | |
| `causation_id` | text | |
| `run_key` | text NOT NULL | Idempotent create |
| `pause_reason` | text | |
| `error` | jsonb | |
| `started_at` / `finished_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

#### `workflow_run_steps`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tenant_id` | uuid NOT NULL | |
| `workflow_run_id` | uuid NOT NULL | |
| `node_id` | text NOT NULL | Graph node id |
| `step_type` | text | `condition` \| `branch` \| `delay` \| `approval` \| `action` |
| `status` | text | Align with run SM + step-local |
| `attempt` | int NOT NULL DEFAULT 1 | |
| `step_key` | text NOT NULL | Idempotent step identity |
| `input_snapshot` | jsonb | |
| `output_snapshot` | jsonb | |
| `approval_id` | uuid NULL → automation_approvals | Bound gate |
| `error` | jsonb | |
| `scheduled_at` | timestamptz | Delay wakeup |
| `started_at` / `finished_at` | timestamptz | |
| `parent_step_id` | uuid NULL | Future parallel/loop; nullable R1 |
| `created_at` / `updated_at` | timestamptz | |

#### `workflow_run_step_attempts` — **justified: YES for Round 1**

Retry/audit needs attempt history without overwriting step output. Keep lean:

| Column | Notes |
|--------|-------|
| `id`, `tenant_id`, `workflow_run_step_id` | |
| `attempt_number` | |
| `status`, `error`, `started_at`, `finished_at` | |
| `worker_id` / `job_handle` | Concurrency diagnostics |

Skip only if product accepts lossy overwrite of step error — **Contract prefers attempts table; include it.**

#### `automation_approvals`

Exact Contract §8 fields:

| Column | Notes |
|--------|-------|
| `id`, `tenant_id` | |
| `workflow_id`, `workflow_version_id`, `workflow_run_id`, `workflow_run_step_id` | |
| `action_type` | Registry key |
| `requested_payload_snapshot` | jsonb NOT NULL |
| `payload_hash` | text NOT NULL |
| `requester_type`, `requester_id` | |
| `approver_type`, `approver_id` | NULL until decide |
| `status` | `pending` \| `authorized` \| `rejected` \| `expired` \| `revoked` |
| `decision` | approve/reject/revoke/expire |
| `reason`, `comment` | |
| `requested_at`, `decided_at`, `expires_at` | |
| `revoked_at`, `revoked_by` | |
| `audit_link_id` | |
| `idempotency_key` | Unique per tenant |

#### `automation_approval_events`

Append-only:

| Column | Notes |
|--------|-------|
| `id`, `tenant_id`, `approval_id` | |
| `event_type` | `requested` \| `authorized` \| `rejected` \| `expired` \| `revoked` \| `validation_failed` |
| `actor_type`, `actor_id` | |
| `at` | timestamptz |
| `detail` | jsonb (diff, reason, job_id if any — never “approved by queue”) |

#### `automation_dead_letters`

| Column | Notes |
|--------|-------|
| `id`, `tenant_id` | |
| `workflow_run_id`, `workflow_run_step_id` | |
| `reason`, `last_error` | |
| `attempts` | |
| `created_at` | |
| `resolved_at`, `resolved_by` | Optional |

#### `automation_usage_counters`

| Column | Notes |
|--------|-------|
| `tenant_id` | PK or composite |
| `period_start` | date/bucket |
| `runs_started`, `runs_completed`, `runs_failed` | |
| `steps_executed`, `actions_class_a`, `actions_class_b`, `approvals_requested`, `approvals_authorized` | |
| `updated_at` | |

Prefer upsert by `(tenant_id, period_start)`.

### 3.2 Explicit non-tables in Round 1

- Do **not** alter `automation_rules`, `pipeline_automations`, `approval_requests`  
- Do **not** create `voice_*` / `whatsapp_*`  

---

## 4. Indexes and uniqueness (P0)

| Purpose | Index / constraint |
|---------|-------------------|
| Tenant isolation | All tables: index `(tenant_id)`; FKs include tenant where practical |
| Workflow list | `(tenant_id, status, updated_at DESC)` on `workflows` |
| Version uniqueness | `UNIQUE (workflow_id, version_number)` |
| Published tip | Partial unique optional: one published tip via app logic + `workflows.current_published_version_id` |
| Trigger lookup | `UNIQUE (tenant_id, workflow_version_id, event_name, id)` + **lookup** `INDEX (tenant_id, event_name) WHERE is_active` |
| Run idempotency | `UNIQUE (tenant_id, run_key)` |
| Run list | `(tenant_id, created_at DESC)`, `(tenant_id, status)` |
| Step idempotency | `UNIQUE (tenant_id, step_key)` |
| Step by run | `(workflow_run_id, node_id)` |
| Approval idempotency | `UNIQUE (tenant_id, idempotency_key)` |
| Approval by step | `UNIQUE (workflow_run_step_id)` — at most one open/bound approval per step (or unique where status in pending/authorized) |
| Payload hash lookup | `INDEX (tenant_id, payload_hash)` |
| Expiry sweep | `INDEX (status, expires_at) WHERE status = 'pending'` |
| DLQ | `(tenant_id, created_at DESC)` |
| Usage | `UNIQUE (tenant_id, period_start)` |
| Concurrency | Run/step updates use `SELECT … FOR UPDATE` on run row in advance TX; approval validate uses `FOR UPDATE` on approval row |

**Outbox:** reuse existing `outbox_events.dedupe_key` uniqueness; new job names do not require schema change beyond payload conventions.

---

## 5. AutomationApprovalService (P1)

**Package location:** `packages/automation-engine` (new) *or* `apps/api/src/lib/automation-engine/` — prefer **new package** `packages/automation-engine` to keep API thin; worker imports same package.

### 5.1 Operations

| Method | Behavior |
|--------|----------|
| `create(request)` | Insert `pending` approval + snapshot + hash + `expires_at`; append `automation_approval_events.requested`; emit notify `automation.approval_required` via outbox; **does not execute** |
| `authorize(id, approver, comment?)` | Only from `pending`; set `authorized`, approver, `decided_at`; append event; enqueue `automation.run.advance` (dispatch only) |
| `reject(id, approver, reason)` | `pending` → `rejected`; fail/cancel step per graph policy |
| `expire(id)` / sweeper | `pending` past `expires_at` → `expired`; never execute |
| `revoke(id, actor, reason)` | `authorized` → `revoked` **before** execute; if already executed → reject revoke-as-undo (compensation is separate Class B/C) |
| `validateForExecution(id)` | See checklist below |

### 5.2 `validateForExecution` checklist (all required)

1. Row exists; `tenant_id` matches run  
2. `status === 'authorized'`  
3. `revoked_at IS NULL`  
4. `now < expires_at`  
5. `payload_hash === sha256(canonicalize(requested_payload_snapshot))`  
6. Approver had `automation:approvals:decide` at decision time (recorded); optional re-check still active  
7. `workflow_run_step_id` matches the step being executed  
8. Run’s `workflow_version_id` matches approval’s version  

Any failure → append `validation_failed` event → **MUST NOT execute**.

### 5.3 Approver permissions

- Decide API requires `automation:approvals:decide`  
- Requester cannot self-approve if tenant policy `disallow_self_approval` (default **true** for Class B)  
- Platform users cannot authorize tenant Class B unless explicit Super Admin break-glass (default **deny**; out of R1 unless needed)

### 5.4 Audit linkage

- Every create/decide/expire/revoke writes `automation_approval_events`  
- Also `recordSecurityAudit` (existing helper) with action codes: `automation.approval.requested|authorized|rejected|expired|revoked`  
- Store `audit_link_id` on approval row pointing at security audit id when available  

---

## 6. WorkflowDefinitionService (P2)

| Method | Behavior |
|--------|----------|
| `createDraft(tenant, name, graph?)` | `workflows` + initial `workflow_versions` state=`draft` |
| `updateDraft(workflowId, graph)` | Only draft version; recompute `schema_hash`; reject if published tip |
| `publish(workflowId, actor)` | Validate graph schema; **reject any Class C action nodes**; copy/freeze version → `published`; bump `version_number`; set `workflows.current_published_version_id`; rebuild `workflow_triggers`; mark prior published `superseded`; emit `automation.workflow.published` |
| `getPublished(workflowId)` | Read-only |
| `archive(workflowId)` | Deactivate triggers; no new runs |

### Version pinning

- `workflow_runs.workflow_version_id` set at run create; never updated  
- Advance always loads graph from pinned version  

### `schema_hash`

- Canonicalize graph JSON (sorted keys, strip volatile fields)  
- Include action type ids + class labels  
- Used to detect drift and for audit  

---

## 7. TriggerMatcher (P4)

### Inputs

Canonical EventEnvelope v1 (Contract §3):  
`event_id`, `tenant_id`, `event_name`, `occurred_at`, `actor`, `source`, `payload`, `correlation_id`, `causation_id`, `idempotency_key`

### Matching algorithm

1. `canonicalizeEventType(event_name)` via existing aliases  
2. `SELECT` active `workflow_triggers` WHERE `tenant_id = :t AND event_name = :n AND is_active`  
3. Evaluate optional `filter` against envelope (deterministic JSONLogic or subset — pick one library; document)  
4. For each match → compute `run_key = hash(tenant, workflow_version_id, event idempotency_key or event_id, trigger_id)`  
5. `INSERT workflow_runs … ON CONFLICT (tenant_id, run_key) DO NOTHING`  
6. Seed initial steps; enqueue `automation.run.advance`  

### Idempotent trigger handling

- Duplicate outbox delivery / duplicate dispatch job → same `run_key` → no second run  
- Matcher must not create runs for `workflows.status = archived` or inactive triggers  

### Round 1 event sources (consume only)

Wire dispatch consumer to see envelopes from existing CRM/Finance/Documents/Notification-related outbox jobs **without rewriting domain logic** beyond adding a parallel outbox job or a fan-in dispatcher:

**Preferred Round 1 approach:**  
New job `automation.event.dispatch` enqueued **in addition** to existing consumers only when feature flag enabled; payload = normalized envelope. Domain modules keep current `job_name`s. A thin **bridge** in worker may also accept known job payloads and map → envelope (no Class B side effects in bridge).

**Do not** disable `crm.*.record` / `finance.record` / PM / pipeline jobs.

---

## 8. Event dispatch (P5)

```text
Domain TX → outbox_events (existing)
  → OutboxPublisher → BullMQ
  → worker job automation.event.dispatch
       → TriggerMatcher
       → create workflow_run (Postgres)
       → enqueue automation.run.advance
```

| Rule | Detail |
|------|--------|
| Postgres SoR | Run exists before advance does work |
| BullMQ role | Wake matcher / advance only |
| Approval | Never set in job payload as authoritative |
| Tenant gate | `assertJobAllowed` on both jobs |
| Queue name | Prefer existing `automation` queue class (ADR-015) |

### New jobs (catalog)

| Job | Purpose |
|-----|---------|
| `automation.event.dispatch` | Match + create runs |
| `automation.run.advance` | Execute ready steps |
| `automation.approval.timeout` | Expire pending approvals (recurring or delayed) |
| `automation.wait.wakeup` | Resume delay steps |

---

## 9. RunAdvanceExecutor (P6)

### Initial step types only

| Type | Behavior |
|------|----------|
| `condition` | Eval predicate on run context + input; choose true/false edge |
| `branch` | Ordered exclusive branches; first match wins |
| `delay` | Set `scheduled_at`; status `waiting`; wakeup job later → `running` |
| `approval` | Create Class B approval via ApprovalService; status `awaiting_approval`; **stop** |
| `action` | Resolve registry; Class A execute; Class B only after `validateForExecution`; Class C throw |

### Advance loop (single job invocation)

1. `FOR UPDATE` run row; exit if terminal / paused  
2. Select ready steps (no unmet deps)  
3. Execute one batch (R1: serial is OK; parallel join deferred)  
4. Persist step output; checkpoint  
5. If more work → re-enqueue advance (idempotent)  
6. If awaiting_approval / waiting → stop cleanly (success ack of job; state in Postgres)  

**Critical:** Completing the BullMQ job while `awaiting_approval` means “checkpoint saved,” **not** “approved.”

---

## 10. Run state machine (P6)

### Run statuses

```text
queued
  → running
      → waiting              (delay / wait)
      → awaiting_approval    (ADR-027 gate)
      → paused               (tenant or admin)
      → completed
      → failed
      → cancelled
      → dead_lettered        (after exhaustion; may also set via DLQ table)
```

### Allowed transitions (contract)

| From | To |
|------|----|
| queued | running, cancelled |
| running | waiting, awaiting_approval, paused, completed, failed, cancelled |
| waiting | running, cancelled, failed |
| awaiting_approval | running (after authorize), failed/cancelled (reject/expire), paused |
| paused | running, cancelled |
| failed | dead_lettered (optional explicit), cancelled |
| completed / cancelled / dead_lettered | terminal (replay creates **new** attempt semantics — see reliability) |

---

## 11. Action Registry (P3 / P6)

### Class A (Round 1 implement)

| Action key | Behavior |
|------------|----------|
| `task.create` | Create task in tenant context; require shared context ids when present |
| `notification.internal` | In-app notify via existing notification bus; staff recipients only |

### Class B (Round 1)

| Action key | Behavior |
|------------|----------|
| `critical.stub` (or named `external.placeholder`) | Represents approval-required path; **executor calls ApprovalService path**; on authorize, executes a **no-op or safe internal marker** that proves snapshot binding (e.g. write step output `executed_snapshot_hash`) — **MUST NOT** call Finance/Voice/WhatsApp money APIs in R1 |

Publish validation: any Class B node must be preceded by or configured as approval-gated action (approval step or auto-insert gate before action).

### Class C (Round 1)

| Action key examples (registry entries, not implemented) | Behavior |
|-----------------------------------------------------------|----------|
| `data.purge`, `config.privileged`, `billing.platform.*`, `approval.auto_approve`, `ai.execute_critical` | **Hard block** on publish + execute |

### Enforcement

```text
publish: graph contains Class C → reject
execute: class === C → throw FORBIDDEN
execute: class === B → validateForExecution only; else throw
execute: class === A → run with tenant checks + action idempotency_key
```

---

## 12. Reliability (P7)

| Concern | Round 1 design |
|---------|----------------|
| Retries | Retryable errors only; `workflow_run_step_attempts`; max attempts per step (config, default 5) |
| Backoff | Exponential with jitter; `scheduled_at` / outbox `available_at` |
| Timeout | Step wall-clock timeout → fail attempt; run timeout → fail run |
| Idempotency | `run_key`, `step_key`, approval `idempotency_key`, action keys unique per tenant |
| Checkpointing | Step status + snapshots committed before side effects ack; advance is restartable |
| Replay | API `automation:runs:replay`: re-queue advance; **does not** set approval authorized; Class B needs valid approval or new approval |
| Dead letters | After max attempts → `automation_dead_letters` + run `dead_lettered`/`failed` + notify `automation.run.failed` |

### Replay rules (ADR-027)

- Replay ≠ approve  
- If step `awaiting_approval` → re-notify only  
- If Class B already executed with idempotency → no-op  
- If Class B not executed and approval revoked/expired → require new approval  

---

## 13. RBAC (P8)

Add to `packages/modules` (new automation module or finance/admin adjacent — prefer dedicated `automation` module flags):

| Permission | API / capability |
|------------|------------------|
| `automation:workflows:view` | GET workflows, versions |
| `automation:workflows:edit` | Create/update draft |
| `automation:workflows:publish` | Publish |
| `automation:runs:view` | List/get runs, steps |
| `automation:runs:replay` | Replay |
| `automation:approvals:view` | Approval inbox |
| `automation:approvals:decide` | Authorize / reject / revoke |
| `automation:admin` | Pause tenant automation, feature flags, DLQ resolve |

**Unchanged:** `pm.automations:manage`, `ops:jobs` (outbox ops ≠ business approval).

Default roles: admin gets all; member gets view (+ decide only if policy grants).

---

## 14. Audit points (P1–P8)

| Event | When |
|-------|------|
| Workflow draft created/updated | DefinitionService |
| Workflow published | DefinitionService + outbox `automation.workflow.published` |
| Trigger matched / run created | Matcher (run row + optional audit) |
| Step started / succeeded / failed | Executor + attempts |
| Approval requested / authorized / rejected / expired / revoked / validation_failed | ApprovalService + approval_events + security audit |
| Class B execute success/fail | Executor (include payload_hash, approval_id) |
| Replay requested | API |
| Tenant automation paused/resumed | admin |
| Dead-letter written / resolved | Reliability |

Audit payloads must **never** claim approval from job id alone.

---

## 15. Usage accounting (P9)

| Counter | Increment when | Dedupe |
|---------|----------------|--------|
| `runs_started` | Successful insert of `workflow_runs` | `run_key` unique → one increment |
| `runs_completed` / `runs_failed` | Terminal transition | Once per run id |
| `steps_executed` | Step reaches succeeded | Once per `step_key` success |
| `actions_class_a` | Class A action success | Action idempotency key |
| `actions_class_b` | Class B action success **after** validate | Same; pending approval does **not** count as action |
| `approvals_requested` | Approval create | Approval idempotency key |
| `approvals_authorized` | Authorize success | Once per approval id |

Use transactional upsert with conflict do nothing on a `usage_events` optional ledger **or** careful conditional updates — prefer small `automation_usage_events` unique `(tenant_id, dedupe_key)` if double-count risk is high; otherwise document single-writer advance path.

---

## 16. Tenant isolation protection points (P4–P8)

| Layer | Protection |
|-------|------------|
| **API** | `requireAuth` + permission; all queries `WHERE tenant_id = workspace.id` |
| **Database** | NOT NULL `tenant_id`; indexes; no cross-tenant FKs to other tenants’ rows |
| **TriggerMatcher** | Match filter includes `tenant_id`; reject envelope missing/ mismatched tenant |
| **Worker** | `assertJobAllowed`; job `tenantId` === envelope/run tenant |
| **RunAdvanceExecutor** | Load run by id **and** tenantId from job; pinned version tenant check |
| **Action executor** | Domain calls pass tenant/workspace; verify entity.workspace_id |
| **ApprovalService** | All mutations scoped by tenant; decide cannot target other tenant’s approval id |

Live tests must attempt cross-tenant read/decide/execute and expect 403/404.

---

## 17. Legacy compatibility (P10)

| Rule | Detail |
|------|--------|
| PM automation | Keep `automation.pm.evaluate` registered; **do not modify** `@vencore/automation` behavior in R1 |
| Pipeline automation | Keep `automation.pipeline.evaluate`; **do not modify** pipeline evaluator in R1 |
| No silent behavior change | Existing tenants see same PM/pipeline outcomes |
| No duplicate execution | New engine runs **only** for workflows created in new tables; legacy rules do not auto-compile in R1 |

### Feature flags

| Flag | Default | Purpose |
|------|---------|---------|
| `automation.engine.v2.enabled` | **false** (per tenant) | Master switch for dispatch matcher creating runs |
| `automation.engine.v2.dispatch_events` | allowlist CSV / JSON | Which canonical event names fan into v2 when enabled |
| `automation.engine.v2.self_approval` | false | Policy |

Until `v2.enabled=true` for a tenant, Round 1 code may be deployed but **creates zero runs**.

---

## 18. Future Voice / WhatsApp (not implemented in Round 1)

Document adapter seams only:

```text
Round 1: EventEnvelope.source.system may be "voice" | "whatsapp" in types
         Action registry may reserve keys:
           voice.call.enqueue (Class B)
           whatsapp.template.send (Class B)
         Executors: NOT REGISTERED / throw NOT_IMPLEMENTED

Round 2: VoiceEventAdapter → outbox voice.call.*
         VoiceActionAdapter.execute(approved_snapshot) → external Voice API
         WhatsAppProvider (ADR-012) → whatsapp.* events
         Shared context: customer_party_id / lead_id / deal_id / call_id / conversation_id
```

**Round 1 MUST NOT:** create Voice/WhatsApp packages, routes, tables, or replace any Voice system.

---

## 19. Testing plan (P11)

| Suite | Coverage |
|-------|----------|
| **Unit** | Approval validate matrix; schema_hash; filter eval; state transitions; action class gates; payload hash canonicalize |
| **API** | CRUD draft/publish; permission denials; approve/reject/revoke; replay authz |
| **Live tenant isolation** | Two tenants; cross-tenant workflow/run/approval access denied; trigger for tenant A never creates run in B |
| **Approval negatives** | missing, pending, rejected, expired, revoked all block Class B execute |
| **Payload tamper** | Change snapshot or hash between authorize and execute → block + validation_failed |
| **Replay** | Replay does not authorize; authorized + idempotent action → single effect |
| **Idempotency** | Duplicate dispatch job → one run; duplicate advance → safe |
| **Concurrency** | Two advance workers on same run → one winner via row lock |
| **Retry / DLQ** | Fail N times → attempts rows → dead letter |
| **Legacy compatibility** | With v2 flag off: PM + pipeline fixtures still pass; with flag on + no new workflows: legacy still unchanged |
| **AI absent** | Grep/guard: no AI execute path in R1 package |

---

## 20. Security test matrix (P11)

| Case | Expected |
|------|----------|
| Authorize without `automation:approvals:decide` | 403 |
| Self-approve when disallowed | 403 |
| Execute Class B via forged job `{approved:true}` | Ignored; validate fails |
| Execute Class C node | Publish rejected / execute forbidden |
| Cross-tenant approval decide | 404/403 |
| Expired approval execute | Blocked |
| Revoked after authorize before execute | Blocked |
| Replay as approval bypass | Blocked |
| SSRF (if any HTTP action appears) | N/A in R1 Class A; reserve for R2 |
| NL/AI string in comment field treated as approve | Never — only decide API |

---

## 21. Rollback / migration safety (P0 / P12)

| Topic | Plan |
|-------|------|
| Migration | Additive only; no drops of legacy automation tables |
| Rollback | Feature flag off → no v2 runs; deploy revert leaves empty v2 tables harmless |
| Data | Truncating v2 tables does not affect PM/pipeline |
| Expand/contract | Don’t put non-null columns on hot legacy tables |
| Publisher | New job handlers must be registered before emitting new job names; else outbox fails → use flag to control enqueue |
| Dual publish risk | Never remove legacy job registration in R1 |

---

## 22. Exact files / packages to create or modify

### Create (expected)

| Path | Role |
|------|------|
| `packages/db/migrations/YYYYMMDD_NNN_phase6_automation_round1.ts` | Schema |
| `packages/automation-engine/` (new package) | Services: approval, definition, matcher, executor, registry, usage |
| `packages/automation-engine/src/approval/*` | AutomationApprovalService |
| `packages/automation-engine/src/definition/*` | WorkflowDefinitionService |
| `packages/automation-engine/src/trigger/*` | TriggerMatcher |
| `packages/automation-engine/src/runtime/*` | RunAdvanceExecutor, state machine |
| `packages/automation-engine/src/actions/*` | Registry A/B/C |
| `packages/automation-engine/src/usage/*` | Counters |
| `apps/api/src/routes/automation-workflows.ts` | Workflow API |
| `apps/api/src/routes/automation-approvals.ts` | Approval inbox/decide |
| `apps/api/src/routes/automation-runs.ts` | Runs + replay |
| `apps/worker/src/jobs/automation-event-dispatch.ts` | Dispatch consumer |
| `apps/worker/src/jobs/automation-run-advance.ts` | Advance consumer |
| `apps/worker/src/jobs/automation-approval-timeout.ts` | Expiry |
| `docs/operations/AUTOMATION-ENGINE-RUNBOOK.md` | Pause, replay, DLQ |
| Tests under `packages/automation-engine/**/*.test.ts` and `apps/api/src/test/live/automation-*.live.test.ts` | |

### Modify (minimal, allowed)

| Path | Change |
|------|--------|
| `packages/db/src/schema.ts` | New table types |
| `packages/modules/src/*` | Register automation permissions + module flag |
| `apps/worker/src/jobs/bullmq/catalog.ts` | Register new jobs |
| `apps/worker/src/jobs/bullmq/runtime.ts` | Wire handlers |
| `apps/api/src/index.ts` | Mount new routers |
| `packages/events/src/aliases.ts` | Only if new automation event aliases needed |
| `pnpm-workspace` / package.json | Workspace dep for new package |

### Do **not** modify in Round 1

| Path | Why |
|------|-----|
| `packages/automation/**` (PM evaluate) | Legacy island |
| `apps/worker/src/jobs/pipeline-automations.ts` | Legacy island |
| `apps/api/src/routes/automation.ts` (PM) | Legacy CRUD |
| `apps/api/src/routes/pipeline-automations.ts` | Legacy |
| Voice / WhatsApp modules | Not in R1 |
| Finance/Accounting/Documents domain rules | Beyond optional envelope bridge |

---

## 23. Round 1 verification gates (Contract §16)

Record PASS/FAIL only after evidence:

```text
AUTOMATION R1 FOUNDATION = PASS/FAIL
WORKFLOW VERSION IMMUTABILITY = PASS/FAIL
RUN/STEP CHECKPOINTING = PASS/FAIL
OUTBOX→QUEUE→RUN PATH = PASS/FAIL
QUEUE IS NOT APPROVAL = PASS/FAIL
ADR-027 MISSING/PENDING/REJECTED/EXPIRED/REVOKED BLOCKS EXECUTE = PASS/FAIL
PAYLOAD SNAPSHOT BINDING = PASS/FAIL
IDEMPOTENT ACTION REPLAY = PASS/FAIL
TENANT ISOLATION = PASS/FAIL
CLASS C HARD BLOCK = PASS/FAIL
LEGACY PM/PIPELINE UNCHANGED BEHAVIOR = PASS/FAIL
USAGE ACCOUNTING = PASS/FAIL
AI EXECUTION ABSENT = PASS/FAIL
```

**Plus:** one recorded human approval E2E drill (request → authorize → execute bound snapshot → audit) before claiming critical-action readiness.

---

## 24. Out of scope reminder (hard)

- Visual builder, templates gallery, AI draft/publish  
- Voice implementation / replacement  
- WhatsApp implementation  
- Sunset of PM/pipeline engines  
- Real money movements via Automation (payments/refunds/invoice issue) — Class B stub only in R1  
- Creating tables or code in **this planning step**  

---

## 25. Acceptance of this plan

When this plan is accepted:

1. Implementation may begin at **P0** in the order in §2.  
2. Architecture Contract remains binding; conflicts → Contract + ADR-027 win.  
3. Next artifact after implementation: `PHASE-6-AUTOMATION-ROUND-1-IMPLEMENTATION-REPORT.md` + gate sheet.  

**PLAN ONLY — NO IMPLEMENTATION IN THIS ARTIFACT.**
