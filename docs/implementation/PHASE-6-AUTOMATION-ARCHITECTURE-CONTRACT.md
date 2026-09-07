# PHASE 6 — Automation Architecture Contract

| Field | Value |
|-------|-------|
| Status | **DESIGN / AUDIT ONLY — implementation-ready** |
| Date | 2026-09-05 |
| Scope | Final Automation Architecture Contract for Round 1 implementation |
| Binding ADRs | **ADR-027** (critical approval — Accepted) · ADR-015 (BullMQ ≠ SoR) · ADR-019 (outbox) · ADR-004 (async execution — Proposed, refined here) · ADR-021 (billing worlds) · ADR-012 (WhatsApp provider — Proposed) |
| Explicit non-goals | Implement Automation · modify existing Automation behavior · create workflow tables · add AI execution · modify CRM / Finance / Accounting / Documents / WhatsApp / Voice product code |

**Gate reminder:** Phase 5 non-automation is verification-green. This document unlocks **design** for Phase 6 Automation. Code starts only when Round 1 is explicitly approved.

---

## 0. Executive verdict

| Finding | Status |
|---------|--------|
| Durable substrate (Postgres outbox → publisher → BullMQ → tenant-gated workers) | **Reusable** |
| Full workflow engine (`workflows` / versions / runs / steps / approvals) | **Missing** |
| ADR-027 critical-action approval SoR | **Missing** (policy Accepted; no tables/runtime) |
| PM automations (`automation_rules` / `@vencore/automation`) | **Legacy island** — keep running; migrate later |
| Pipeline automations (`pipeline_automations`) | **Legacy island** — keep running; migrate later |
| Portal `approval_requests` | **Different domain** — client portal sign-off; **not** ADR-027 |
| Voice Calling runtime in this CRM repo | **Not present** (docs + Customer 360 stub only). Contract treats Voice as an **external/owned bounded context** to integrate — **do not replace** |
| WhatsApp | **Not implemented** — Round 2 integration contract only |
| Shared customer context (CustomerParty / Deal / Lead) | **Required** — Automation must not create parallel silos |

**Architecture one-liner:**  
Postgres is the system of record for definitions, versions, runs, steps, approvals, and audit. The transactional outbox bridges domain facts to BullMQ. BullMQ dispatches work. **Queues never represent approval.** Critical steps pause in Postgres until an authorized, non-expired, non-revoked approval binds an exact payload snapshot.

---

## 1. Hard invariants (non-negotiable)

### 1.1 ADR-027 critical-action flow

```text
Draft → Approval Required → Authorized Approval → Execute
```

| State | May execute critical action? |
|-------|------------------------------|
| Missing approval | **NO** |
| Pending | **NO** |
| Rejected | **NO** |
| Expired | **NO** |
| Revoked | **NO** |
| Authorized (valid) | **YES** — only the approved payload snapshot |

### 1.2 Non-inference (hard)

Approval **MUST NEVER** be inferred from:

- Natural language  
- AI intent / recommendations  
- Chat / agent context  
- Prior approvals for “similar” actions  
- Workflow draft / unpublished graph  
- Queue message presence / outbox row / job lease  

### 1.3 Payload binding

- Execution binds to **`approved_payload_snapshot`** (immutable JSON).  
- Material payload change → **new** approval required.  
- Idempotency keys apply to the **approved action identity**, not to a recomputed live payload.

### 1.4 SoR vs dispatch

| Concern | Store |
|---------|--------|
| Workflow graph, versions, run/step state, approvals, audit | **PostgreSQL** |
| Dispatch leases, delayed wakeups, worker concurrency | **BullMQ / Redis** |
| Domain facts (CRM/Finance/…) | Owning module tables + `outbox_events` |

### 1.5 Domain must not call BullMQ

Per ADR-019: domain TX → mutate + `EventRecorder.append` → COMMIT. Publisher owns `JobQueue.enqueue`.

### 1.6 Shared business context

CRM · Finance · Accounting · Documents · Notifications · Voice · WhatsApp · Automation MUST share:

- `tenant_id` / workspace  
- CustomerParty (and/or Contact/Company links)  
- Deal / Lead / Invoice / Quote IDs when relevant  
- Canonical event envelope correlation  

Automation **MUST NOT** invent a parallel “automation contact” identity.

---

## 2. Current-state inventory (audit)

### 2.1 Reusable substrate

| Asset | Path / notes |
|-------|----------------|
| Outbox recorder / publisher / reconciler / UoW | `packages/events` |
| JobQueue + tenant gate | `packages/job-runtime` (`assertJobAllowed`, `tenant_job_controls`) |
| Domain outbox helpers | `apps/api/src/lib/domain-outbox.ts` |
| Worker runtime / catalog | `apps/worker/src/jobs/bullmq/{runtime,catalog}.ts` |
| Ops failed outbox list/replay | `ops:jobs` |
| Event aliases | `packages/events/src/aliases.ts` |
| Notification bus (idempotent delivery_key) | Phase 5 — **not** the automation engine |
| Finance posting keys | Accounting adapters — pattern to **mirror** for action idempotency |

### 2.2 Legacy automation islands (do not modify in design phase; migrate in Round 1–2)

| Island | Tables | Engine | Risks |
|--------|--------|--------|-------|
| PM | `automation_rules`, `automation_logs` | `@vencore/automation` + job `automation.pm.evaluate` | `send_webhook` without SSRF; weak tenant assert on project; `task_assigned` / `task_overdue` triggers incomplete |
| Pipeline | `pipeline_automations` | `processAutomationEvent` + job `automation.pipeline.evaluate` | `notify_assignee` stub; item load without workspace assert; auto-disable on failures; date_approaching ≠ action executor |
| Legacy path | `JOBS_RUNTIME=legacy` | sync `pmEvents` | Double-fire risk if misconfigured; keep bullmq default |

### 2.3 Explicit gaps vs this contract

| Gap | Impact |
|-----|--------|
| No `workflow_*` / `automation_approvals` tables | Cannot enforce ADR-027 or durable multi-step runs |
| CRM/Finance outbox jobs often **ack-only** | Events exist but do not fan into a workflow engine |
| Webhook allowlist ≠ finance/document events | External fans incomplete |
| No Voice/WhatsApp runtime in repo | Integration = adapter contracts first |
| Spec perms (`automation.workflows.configure`) not in `packages/modules` | RBAC must be added in Round 1/2 |

### 2.4 Voice audit note (important)

User requirement: existing Voice Calling is running and must not be replaced.  
**Repository audit:** this CRM tree has **no** Voice packages, routes, or `voice_*` tables — only `docs/modules/VOICE_AI.md` / `TELEPHONY.md` and Customer 360 `voice: { available: false }`.

**Contract stance:** Design Voice as a **bounded context owned elsewhere or forthcoming**, integrated solely via:

1. **Event source adapter** → canonical Voice events into outbox  
2. **Action adapter** → Automation invokes Voice APIs without owning telephony  

Round 1 does **not** implement Voice. Round 2 ships the **contracts + stubs** that bind without replacing Voice.

---

## 3. Canonical event envelope

Align with ADR-019 / EVENTS.md; **normalize field names** for Automation triggers:

```text
EventEnvelope v1 (Automation contract)
  event_id            // UUID; prefer = outbox_events.id
  tenant_id           // required for tenant events
  event_name          // canonical {domain}.{entity}.{action}
  occurred_at         // ISO-8601 UTC business time
  actor               // { type: user|api_key|system|automation|platform_user|voice|whatsapp, id }
  source              // { system: crm|finance|accounting|documents|notifications|voice|whatsapp|webhook|schedule|manual|automation, component? }
  payload             // event-specific data (versioned)
  correlation_id      // trace across graph
  causation_id        // parent event / step / approval id
  idempotency_key     // stable dedupe for this fact
```

**Storage:** `outbox_events.payload` holds the envelope (or a strict subset + columns for tenant/type/ids). Emitters write **canonical** `event_name` only; aliases normalize at trigger registration.

**Context binding (required when applicable):**

```text
payload.context:
  customer_party_id?
  contact_id?
  company_id?
  lead_id?
  deal_id?
  quote_id?
  invoice_id?
  project_id?
  call_id?          // Voice
  conversation_id?  // WhatsApp
```

---

## 4. Event origin map

| Origin | Example canonical events | Notes |
|--------|--------------------------|-------|
| **CRM** | `crm.lead.*`, `crm.deal.*`, `crm.contact.*`, `crm.customer_party.*`, `crm.quote.*`, `crm.product.*`, `crm.item.moved` | Already partially emitted; many consumers ack-only |
| **Finance** | `finance.invoice.*`, `finance.payment.*`, `finance.credit_note.*`, `finance.debit_note.*`, `finance.expense.*` | Emitted today → `finance.record` |
| **Accounting** | Prefer **consume** Finance events for posting; optional `accounting.journal.posted`, `accounting.period.locked` for Automation visibility | Do not dual-emit money facts |
| **Documents** | `document.render.requested` (exists); add `document.render.completed` / `.failed` | Completed emitter missing today |
| **Notifications** | Prefer side-effect of other events; Automation may emit `automation.approval_required`, `automation.run.failed` | Catalog already lists these names |
| **Voice** (adapter) | `voice.call.started`, `voice.call.answered`, `voice.call.completed`, `voice.call.no_answer`, `voice.call.busy`, `voice.call.interested`, `voice.call.not_interested`, `voice.call.follow_up_required` | Map product enums `CALL_*` → namespaced forms |
| **WhatsApp** (future) | `whatsapp.message.received/sent/failed`, `whatsapp.template.delivered` | ADR-012 normalized; no vendor payload in Automation |
| **Webhooks (inbound)** | `integration.webhook.received` + typed unwrap | Not implemented; Round 2+ |
| **Schedules** | `schedule.cron.fired`, `schedule.delay.elapsed` | Engine-owned wakeups via outbox `available_at` / delayed jobs |
| **Manual** | `automation.manual.triggered` | User/API start with RBAC |
| **Automation itself** | `automation.run.started/completed/failed`, `automation.step.failed`, `automation.approval.decided`, `automation.workflow.published` | For ops + nested triggers (carefully gated) |

**Voice product aliases → canonical:**

| Product-style | Canonical `event_name` |
|---------------|------------------------|
| `CALL_STARTED` | `voice.call.started` |
| `CALL_ANSWERED` | `voice.call.answered` |
| `CALL_COMPLETED` | `voice.call.completed` |
| `CALL_NO_ANSWER` | `voice.call.no_answer` |
| `CALL_BUSY` | `voice.call.busy` |
| `CALL_INTERESTED` | `voice.call.interested` |
| `CALL_NOT_INTERESTED` | `voice.call.not_interested` |
| `CALL_FOLLOW_UP_REQUIRED` | `voice.call.follow_up_required` |

---

## 5. Logical data model (design only — do not create yet)

Round 1 will introduce these tables in a dedicated migration wave. Names are contractual.

### 5.1 Definitions

| Table | Purpose |
|-------|---------|
| `workflows` | Tenant-scoped workflow head (name, status draft/published/archived, current_published_version_id) |
| `workflow_versions` | **Immutable** published (and draft) graphs: nodes, edges, trigger config, policy flags, `schema_hash` |
| `workflow_triggers` | Normalized trigger index: `event_name` (+ filters) → workflow/version for fast matching |

### 5.2 Execution

| Table | Purpose |
|-------|---------|
| `workflow_runs` | One run per trigger firing: status, workflow_id, version_id, tenant_id, trigger_event_id, correlation_id, pause_reason, started_at, finished_at |
| `workflow_run_steps` | Step instances: type, status, attempt, input_snapshot, output_snapshot, error, scheduled_at, started_at, finished_at, parent_step_id (parallel/loop) |
| `workflow_run_step_attempts` | Optional attempt history for retry/audit |

### 5.3 Approvals (ADR-027 SoR)

| Table | Purpose |
|-------|---------|
| `automation_approvals` | Critical-action gate records (see §8) |
| `automation_approval_events` | Append-only decision trail (request / approve / reject / expire / revoke) |

### 5.4 Reliability / ops

| Table | Purpose |
|-------|---------|
| `automation_dead_letters` | Steps/runs exhausted retries (or link via outbox `dead`) |
| `automation_usage_counters` | Tenant execution accounting (runs started, steps executed, approvals, action class counts) |

### 5.5 Explicit non-reuse

| Existing table | Why not |
|----------------|---------|
| `approval_requests` | Portal client approvals |
| `automation_rules` / `pipeline_automations` | Legacy single-shot engines — adapters/migration sources, not SoR for new engine |

---

## 6. Workflow semantics (engine capabilities)

| # | Capability | Round 1 contract |
|---|------------|------------------|
| 1 | Workflow definitions | `workflows` + draft editing API (API-first; visual builder Round 2) |
| 2 | Immutable published versions | Publish copies graph → `workflow_versions`; runs pin `version_id` |
| 3 | Triggers | Event-name match + optional CEL/JSONLogic-like filter on envelope; manual; schedule |
| 4 | Conditions | Deterministic predicate on step input + run context |
| 5 | Branches | Exclusive / multi-branch with ordered evaluation |
| 6 | Loops | Bounded (`max_iterations`); forbid unbounded |
| 7 | Parallel | Fan-out steps; join barrier; partial-failure policy |
| 8 | Wait / delay | Step status `waiting`; wake via delayed outbox/job or `wait_for_event` subscription |
| 9 | Approval steps | Enter `awaiting_approval`; **no action until ADR-027 authorized** |
| 10 | Actions | Typed action registry with class A/B/C (§9) |
| 11 | Workflow runs | Durable `workflow_runs` |
| 12 | Step runs | Durable `workflow_run_steps` |
| 13 | Retry / backoff | Classified retryable errors; exponential backoff; attempt caps |
| 14 | Timeout | Step + run timeouts → fail or fallback edge |
| 15 | Fallback | Declared failure edges / compensating actions (non-critical by default) |
| 16 | Pause / resume | Tenant `jobs_paused` + run-level pause; resume continues from checkpoint |
| 17 | Replay | Explicit RBAC op; uses same idempotency keys; **cannot** skip approval |
| 18 | Failure / DLQ | Step failed → retry → dead-letter + `automation.run.failed` notify |
| 19 | Idempotency | `run_key` / `step_key` / action `idempotency_key` unique per tenant |
| 20 | Audit | Append-only step + approval + security audit linkage |
| 21 | Usage | Meter runs/steps/actions toward plan limits |

### 6.1 Run status machine (contract)

```text
queued → running → (waiting | awaiting_approval | running) → completed
                 ↘ failed → (optional) dead_lettered
                 ↘ cancelled
                 ↘ paused → running
```

Approval path:

```text
… → step.approval_required → awaiting_approval
        → (authorized) → execute_bound_action → …
        → (rejected|expired|revoked) → failed|cancelled per workflow policy
```

---

## 7. Execution architecture

### 7.1 Happy path

```text
Domain TX (CRM/Finance/Voice adapter/…)
  → mutate owning tables
  → EventRecorder.append(outbox_events)   // envelope + dedupe_key
  → COMMIT

OutboxPublisher
  → claim pending (SKIP LOCKED)
  → JobQueue.enqueue(automation.event.dispatch | legacy jobs)
  → mark published

Worker: automation.event.dispatch
  → match published workflow triggers (tenant-scoped)
  → for each match: create workflow_run (+ steps) in Postgres TX
  → enqueue automation.run.advance (idempotent by run_id)

Worker: automation.run.advance
  → load run + version graph from Postgres
  → execute next ready step(s)
  → if action is class B/C requiring gate:
        create automation_approvals (pending) + snapshot
        set step awaiting_approval
        emit automation.approval_required (notify)
        STOP  // queue message must NOT mean approved
  → if authorized approval present for this step:
        validate not expired/revoked
        execute EXACT approved_payload_snapshot
        write result + audit
  → schedule next / complete / fail
  → usage counters++
```

### 7.2 Queue roles (dispatch only)

| Job name (proposed) | Role |
|---------------------|------|
| `automation.event.dispatch` | Match triggers → create runs |
| `automation.run.advance` | Checkpointed step execution |
| `automation.approval.timeout` | Expire pending approvals |
| `automation.wait.wakeup` | Resume delay / wait-for-event |

**Invariant:** Completing a BullMQ job **never** authorizes a critical action. Authorization is only a Postgres approval row in state `authorized`.

### 7.3 Wait / delay

- Delay: set `workflow_run_steps.scheduled_at`; outbox `available_at` or delayed BullMQ job wakes `automation.run.advance`.  
- Wait-for-event: subscription row keyed by `(tenant_id, run_id, step_id, event_name, filter_hash)`; matching dispatch completes the wait.

### 7.4 Replay

- Ops/user with `automation:runs:replay` selects run or step.  
- Creates **new attempt** or re-queues advance with same idempotency keys.  
- If step is critical: must have **valid authorized approval** for the snapshot; otherwise re-enter approval.  
- Forbidden: “replay as auto-approved.”

---

## 8. Critical-action approval model (ADR-027 detail)

### 8.1 `automation_approvals` fields (contract)

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | UUID |
| `tenant_id` | yes | Isolation |
| `workflow_id` | yes | |
| `workflow_version_id` | yes | Immutable version |
| `workflow_run_id` | yes | |
| `workflow_run_step_id` | yes | |
| `action_type` | yes | Canonical action registry key |
| `requested_payload_snapshot` | yes | Exact JSON to execute if approved |
| `payload_hash` | yes | SHA-256 of canonicalized snapshot |
| `requester_type` / `requester_id` | yes | Usually `automation` + run id, or user for manual |
| `approver_type` / `approver_id` | on decide | Human user (or designated role actor) |
| `status` | yes | `pending` \| `authorized` \| `rejected` \| `expired` \| `revoked` |
| `decision` | on decide | approve / reject / revoke / expire |
| `reason` / `comment` | optional | Required on reject/revoke recommended |
| `requested_at` | yes | |
| `decided_at` | on decide | |
| `expires_at` | yes | Hard expiry |
| `revoked_at` / `revoked_by` | on revoke | |
| `audit_link_id` | yes | Link into security/ops audit stream |
| `idempotency_key` | yes | Unique per tenant for this approval request |

### 8.2 Authorization validation before execute

Executor MUST verify all of:

1. `status == authorized`  
2. `now < expires_at`  
3. `revoked_at IS NULL`  
4. `payload_hash` matches step’s intended snapshot (no silent mutate)  
5. Approver still permitted (`automation:approvals:decide` + any amount thresholds)  
6. Tenant match on run/step/approval  
7. Workflow version still the run’s pinned version  

Any failure → **MUST NOT** execute.

### 8.3 Expiry / revocation

- Scheduler job marks `pending` → `expired` past `expires_at`; step fails or follows reject edge.  
- Approver or admin may `revoke` an `authorized` approval **before** execute; in-flight execute uses row lock / status check.  
- After successful execute, revoke is audit-only (compensation is a separate explicit action, itself class B/C).

### 8.4 Replay behavior

- Replay of an executed critical step: either no-op via action idempotency, or new approval if creating a new distinct business effect.  
- Replay while `awaiting_approval`: does not auto-approve; may re-notify.

---

## 9. Action policy classes

| Class | Meaning | Engine rule |
|-------|---------|-------------|
| **A — Auto-safe** | Low blast radius, reversible or internal | May execute without ADR-027 gate |
| **B — Approval-required** | Money-adjacent, external, or high impact | **Must** pass ADR-027 before execute |
| **C — Human-only / prohibited for Automation** | Must not be fully automated (or never from Automation) | Builder rejects publish; executor hard-blocks |

### 9.1 Classification examples

| Action | Class | Notes |
|--------|-------|-------|
| Create task / activity / internal notification | **A** | |
| Update non-financial CRM field / assign owner | **A** | With tenant checks |
| Move deal stage (non-won/lost or policy-safe) | **A** or **B** | Tenant policy; won/lost may be B |
| Send internal email to staff | **A** | |
| Customer email: invoice issued / payment receipt (templated, non-negotiated) | **B** | External customer money communication |
| WhatsApp template to customer (future) | **B** | |
| Voice: enqueue follow-up call / campaign add | **B** | Does not replace Voice; invokes Voice API |
| Voice: bulk dial / campaign start | **B** or **C** | Prefer B with thresholds; C if unattended spam risk |
| Outbound webhook / arbitrary HTTP | **B** | SSRF guard mandatory; URL allowlist recommended |
| Record payment / refund | **B** (default) or **C** | High-value → C or dual-control |
| High-value discount | **B** | Threshold config per tenant |
| Financial adjustment / manual journal | **B** | |
| Issue / void / cancel invoice; issue CN/DN | **B** | Direct user UI may remain session-auth; Automation path gated |
| Destructive purge / hard-delete / bulk overwrite | **C** | |
| Privileged config (MFA policy, entitlements, job kill, billing) | **C** | |
| Platform World-1 billing mutations from tenant Automation | **C** | ADR-021 |
| Auto-approve another approval | **C** | |
| AI direct execute critical action | **C** | |

Tenant admins may **tighten** (A→B) via policy; they **MUST NOT** loosen B/C below platform floor without Super Admin + audited override (default: no loosen).

---

## 10. Integration boundary contracts

| System | Role toward Automation | Round |
|--------|------------------------|-------|
| **CRM** | Event source + Class A/B actions (assign, stage, task) | R1 consume events; R1/R2 actions |
| **Finance** | Event source + Class B money actions via domain services (never raw SQL) | R1 events; R2 gated actions carefully |
| **Accounting** | Mostly consumer of Finance; Automation may wait on period status | R1 observe; no silent GL writes bypassing adapters |
| **Documents** | `document.render.*` events; action = request render | R1/R2 |
| **Notifications** | Delivery bus for approval/run alerts | R1 |
| **Voice** | Event source adapter + action adapter (place/queue call) | **R2 contracts**; do not replace Voice |
| **WhatsApp** | Same pattern as Voice (ADR-012) | **R2 contracts**; no implementation |
| **Email** | Via notification bus / SMTP branding | R1 notify; R2 richer templates |
| **External API / Webhooks** | Outbound action Class B; inbound events later | R1 outbound SSRF-safe; R2 inbound |

### 10.1 Voice adapter (Round 2 contract sketch)

```text
VoiceEventAdapter:
  onNativeVoiceEvent(native) → EventEnvelope(voice.call.*)
  → same-TX or reliable emit into ThinkAIQ outbox (tenant_id + context IDs)

VoiceActionAdapter:
  execute(approved_snapshot):
    place_call | enqueue_campaign_lead | tag_outcome
  → calls Voice system API
  → returns call_id into step output
  → Voice later emits CALL_* events (no Automation ownership of SIP/Twilio)
```

### 10.2 WhatsApp adapter (Round 2 contract sketch)

```text
WhatsAppProvider (ADR-012) → normalized whatsapp.* events → outbox
Automation action: send_template / send_session_message (Class B)
CRM context: match phone → CustomerParty/Lead/Deal — shared IDs only
```

---

## 11. AI boundary

```text
Natural language
  → AI draft (graph + action stubs)
  → schema validation (zod / version schema)
  → policy classification (A/B/C tagging)
  → user review
  → test / simulate (no side effects or sandbox)
  → approval if required (publish ACL — not ADR-027 money approval)
  → publish → immutable workflow_version
```

| Allowed | Forbidden |
|---------|-----------|
| Draft, explain, optimize, suggest fix | Auto-publish (default off; ADR-004) |
| Classify suggested actions as A/B/C | Auto-approve ADR-027 approvals |
| Prepare approval request text | Execute critical actions directly |

AI publish permission ≠ action approval. Two different gates.

---

## 12. UI surfaces (product map)

| Surface | Round |
|---------|-------|
| Automation dashboard (health, failed, usage) | R2 (R1: API/ops metrics ok) |
| Workflow list | R2 (R1: API CRUD) |
| Workflow builder (visual) | R2 |
| Templates | R2 |
| Test / simulate | R2 (R1: dry-run API optional) |
| Publish | R1 API + R2 UI |
| Approval inbox | R1 API + R2 UI |
| Run history / run detail / step trace | R1 API + R2 UI |
| Failed runs / Replay | R1 API (+ ops) + R2 UI |
| Audit | R1 persist + R2 viewer |
| Usage | R1 counters + R2 charts |

---

## 13. Tenant isolation & RBAC

### 13.1 Isolation rules

- Every workflow/run/step/approval row has `tenant_id`.  
- Trigger matching scoped by tenant.  
- Workers: `assertJobAllowed` + entity.workspace_id === job.tenantId (fix legacy gaps).  
- No cross-tenant correlation joins.  
- Storage/webhook URLs validated with SSRF guards.

### 13.2 Proposed permissions (add to `packages/modules`)

| Permission | Purpose |
|------------|---------|
| `automation:workflows:view` | List/read |
| `automation:workflows:edit` | Draft edit |
| `automation:workflows:publish` | Publish version |
| `automation:runs:view` | Run history |
| `automation:runs:replay` | Replay |
| `automation:approvals:view` | Inbox |
| `automation:approvals:decide` | Approve/reject/revoke |
| `automation:admin` | Pause tenant automation, manage policies |

Keep `pm.automations:manage` for legacy PM UI until migration complete.  
`ops:jobs` remains for outbox dead-letter ops (platform/tenant ops), distinct from business approval.

---

## 14. Migration strategy (legacy → engine)

### 14.1 Principles

1. **Do not break** existing PM/pipeline automations on day one.  
2. Dual-run behind flags: legacy evaluate jobs stay until parity.  
3. New workflows use new engine only.  
4. Migrators compile legacy rules → `workflow_versions` (best-effort; human review).  
5. Sunset legacy emit paths after parity + tenant opt-in.

### 14.2 Phased migration

| Phase | Action |
|-------|--------|
| M0 | Contract (this doc); no behavior change |
| M1 (R1) | New engine + approvals; leave legacy jobs registered |
| M2 | Adapter: optional forward of selected events into new trigger matcher **in addition to** legacy (dedupe carefully) |
| M3 (R2) | UI migration wizards; template library |
| M4 | Deprecate `automation.pm.evaluate` / `automation.pipeline.evaluate` after metrics show zero reliance |

### 14.3 Duplicate event / execution risks

| Risk | Mitigation |
|------|------------|
| Same CRM change fires legacy + new engine | Feature flag per tenant; shared `idempotency_key` / migration allowlist |
| Pipeline worker move_stage without outbox | Document; new engine actions must emit domain events properly or use domain services |
| `JOBS_RUNTIME=legacy` double path | Keep bullmq-only in prod; reject legacy for new engine |
| Finance `finance.record` already posts + notifies | Automation must not re-post accounting; actions call domain APIs with posting keys |
| Webhook short names vs canonical | Always canonicalize before trigger match |

### 14.4 Unsafe paths to fix during R1 (engine-adjacent only)

When touching shared substrate (allowed only as needed for Round 1 foundation):

- Add SSRF to any **new** Automation HTTP action (do not “fix PM silently” unless explicitly in Round scope — prefer new path).  
- Tenant assert: project/pipeline/item workspace === job tenantId for **new** handlers.  
- Never teach new engine the PM `send_webhook` raw fetch pattern.

---

## 15. Round split (ONLY these two)

### ROUND 1 — Foundation + execution + approval enforcement

**In scope:**

- Migrations for workflow + run + step + approval + usage tables  
- Action registry + A/B/C policy engine  
- Event dispatch matcher + run/step state machine  
- Delay/wait primitives (API-level)  
- ADR-027 approval create/decide/expire/revoke + payload binding  
- Jobs: `automation.event.dispatch`, `automation.run.advance`, approval timeout  
- RBAC permissions (API)  
- Idempotency + audit + dead-letter + usage counters  
- Replay API (approval-safe)  
- Consume existing CRM/Finance/Documents/Notification events (no domain rewrites beyond outbox job wiring for dispatch)  
- Compatibility: leave PM/pipeline islands running  

**Out of scope for Round 1:**

- Visual builder, templates gallery, AI draft  
- Voice/WhatsApp implementation  
- Replacing Voice  
- Modifying CRM/Finance/Accounting/Documents business rules except minimal event→dispatch hooks if required  
- Sunset of legacy automations  

### ROUND 2 — Builder + UX + AI draft + Voice/WhatsApp contracts

**In scope:**

- Visual builder, templates, test/simulate, publish UX  
- Approval inbox + run debugger UX  
- AI draft → validate → classify → review → publish (no auto-approve)  
- Voice **integration contracts + adapters** (events + actions) without replacing Voice  
- WhatsApp **integration contracts** (ADR-012) without full product build unless separately approved  
- Migration wizards from PM/pipeline rules  
- Dashboard / usage UI  

---

## 16. Final verification gates

### Round 1 gates

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

### Round 2 gates

```text
BUILDER PUBLISH FLOW = PASS/FAIL
AI DRAFT CANNOT AUTO-APPROVE OR AUTO-EXECUTE CRITICAL = PASS/FAIL
APPROVAL INBOX E2E = PASS/FAIL
VOICE EVENT SOURCE CONTRACT = PASS/FAIL
VOICE ACTION CONTRACT = PASS/FAIL
WHATSAPP CONTRACT (NO SILO IDS) = PASS/FAIL
SHARED CUSTOMER CONTEXT = PASS/FAIL
```

### Production readiness (Automation)

Automation is **not** production-ready for critical actions until Round 1 gates are green **and** at least one real approval E2E drill is recorded (request → human authorize → execute bound snapshot → audit).

---

## 17. Round 1 implementation checklist (concrete)

Use this as the engineering backlog order:

1. Accept this contract; open Round 1 implementation charter (no code until approved).  
2. Design migration SQL for §5 tables + indexes (`tenant_id`, unique idempotency keys, approval status).  
3. Implement `AutomationApprovalService` (create/decide/expire/revoke/validate) — pure Postgres.  
4. Implement `WorkflowDefinitionService` (draft/publish/pin version).  
5. Implement `TriggerMatcher` on canonical `event_name` + tenant.  
6. Wire `automation.event.dispatch` consumer from outbox (new `job_name` alongside legacy).  
7. Implement `RunAdvanceExecutor` with step types: condition, branch, delay, approval, action.  
8. Register Class A sample actions (create task, notify internal) + Class B stub that **cannot** run without approval.  
9. Hard-block Class C in publish + execute.  
10. RBAC + audit + usage.  
11. Isolation live tests + approval negative tests (pending/rejected/expired/revoked/payload tamper).  
12. Document ops runbook: pause, replay, DLQ.  

---

## 18. Document control

| Item | Value |
|------|-------|
| Supersedes for Automation architecture | Informal sections of `AUTOMATION_ENGINE.md` where they conflict with ADR-027 / this contract |
| Does not modify | ADR-027 text (binding); existing Automation runtime behavior |
| Next artifact | `PHASE-6-AUTOMATION-ROUND-1-PLAN.md` (only after explicit go) |

**DESIGN / AUDIT ONLY — NO IMPLEMENTATION IN THIS ARTIFACT.**
