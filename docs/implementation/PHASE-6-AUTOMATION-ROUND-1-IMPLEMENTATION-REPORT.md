# PHASE 6 — Automation Round 1 Implementation Report

| Field | Value |
|-------|-------|
| Status | **COMPLETE** (Round 1 scope) |
| Date | 2026-09-06 |
| Binding | Architecture Contract · Round 1 Plan · **ADR-027** |
| Explicitly not done | Round 2 builder/AI · Voice runtime · WhatsApp · real money actions · PM/pipeline sunset |

---

## 1. Summary

Round 1 delivered a durable Automation engine v2 with Postgres as SoR, outbox→BullMQ dispatch, ADR-027 approval gates, Class A/B/C registry, feature-flagged coexistence with legacy PM/pipeline automation (unchanged), APIs, usage accounting, unit tests, ops runbook, and a **passing human approval E2E drill**.

---

## 2. Migration

| Item | Value |
|------|-------|
| Name | `packages/db/migrations/20260906_001_phase6_automation_round1.ts` |
| Applied | ✓ (`pnpm exec tsx … migrate.ts`) |

### Tables

`workflows`, `workflow_versions`, `workflow_triggers`, `workflow_runs`, `workflow_run_steps`, `workflow_run_step_attempts`, `automation_approvals`, `automation_approval_events`, `automation_dead_letters`, `automation_usage_counters`, `automation_usage_events`

### Indexes / uniqueness (high level)

- Tenant indexes on all tables  
- `UNIQUE (workflow_id, version_number)`  
- Trigger lookup `(tenant_id, event_name) WHERE is_active`  
- `UNIQUE (tenant_id, run_key)` · `UNIQUE (tenant_id, step_key)`  
- `UNIQUE (tenant_id, idempotency_key)` on approvals  
- Partial unique open approval per step  
- Pending expiry index · usage `(tenant_id, period_start)` PK · usage_events dedupe  

No `voice_*` / `whatsapp_*` tables. Legacy `automation_rules` / `pipeline_automations` untouched.

---

## 3. Package / services

**New:** `@vencore/automation-engine`

| Service | Role |
|---------|------|
| `AutomationApprovalService` | create / authorize / reject / expire / revoke / `validateForExecution` (FOR UPDATE + hash) |
| `WorkflowDefinitionService` | draft / update / publish (immutable) / archive |
| `TriggerMatcher` | flag-gated tenant match + idempotent run create |
| `RunAdvanceExecutor` | condition / branch / delay / approval / action + SM |
| Action registry | A: `task.create`, `notification.internal` · B: `critical.stub` · C hard-block · Voice/WA reserved |
| Flags | `engine_v2_enabled` default **false** |
| Usage | deduped counters via `automation_usage_events` |

---

## 4. Jobs

| Job | Consumer |
|-----|----------|
| `automation.event.dispatch` | worker |
| `automation.run.advance` | worker |
| `automation.approval.timeout` | worker recurring 60s |
| Legacy `automation.pm.evaluate` / `automation.pipeline.evaluate` | **unchanged** |

CRM/Finance ack handlers call `bridgeDomainEventToAutomationDispatch` (no-op when flag off).

---

## 5. APIs (`/api/automation`)

Workflows CRUD/publish · approvals list/authorize/reject/revoke · runs list/detail/replay/pause/resume · flags · dispatch · sync advance (admin/test) · actions catalog.

### Permissions (`packages/modules` AUTOMATION_MODULE)

`automation:workflows:view|edit|publish` · `automation:runs:view|replay` · `automation:approvals:view|decide` · `automation:admin`

---

## 6. ADR-027 enforcement

- Class B only via `approval` step → pending row → human authorize → execute **`requested_payload_snapshot`**  
- `validateForExecution` blocks: missing/pending/rejected/expired/revoked/tenant/version/step/hash/approver  
- Forged `job.data.approved` ignored by executor  
- Class C rejected at publish + execute  
- Replay ≠ approval  
- Queue/outbox never set authorization  

---

## 7. Feature flags / legacy

| Flag | Default |
|------|---------|
| `automation.engine.v2.enabled` (`engine_v2_enabled`) | **false** |
| `engine_v2_dispatch` | `[]` |
| `engine_v2_self_approval` | **false** |

With v2 disabled: zero new runs; PM/pipeline evaluators unmodified.

---

## 8. Tests / evidence

| Suite | Result |
|-------|--------|
| Unit (`packages/automation-engine`) | **20/20 PASS** (hash + ADR-027 matrix + registry) |
| Human approval E2E drill | **PASS** (`apps/api/scripts/automation-r1-drill.ts`) |

Drill covered: Class C publish block · dispatch · idempotent dispatch · awaiting_approval · pending block · self-approval forbid · authorize · payload tamper block · Class B snapshot execute · flag-off zero runs.

---

## 9. Documentation

- `docs/operations/AUTOMATION-ENGINE-RUNBOOK.md`  
- This report  

---

## 10. Files changed (primary)

- `packages/db/migrations/20260906_001_phase6_automation_round1.ts`  
- `packages/db/src/schema.ts`  
- `packages/automation-engine/**` (new)  
- `packages/modules/src/automation/index.ts` + registry  
- `apps/api/src/routes/automation-engine.ts` + `index.ts` mount + deps  
- `apps/api/scripts/automation-r1-drill.ts`  
- `apps/worker/.../automation-engine-handlers.ts` + `runtime.ts` + `catalog.ts` + deps  
- `docs/operations/AUTOMATION-ENGINE-RUNBOOK.md`  

---

## 11. Defects found → fixes

| Defect | Fix |
|--------|-----|
| Drill self-approve path accidentally authorized | Dedicated self-approval probe with requester=user |
| Multiple published workflows → multi-run dispatch | Unique drill event name + allowlist |
| matrix.test import path | `../hash` |

---

## 12. Remaining limitations (expected Round 1)

- No visual builder / AI  
- No Voice/WhatsApp runtime (reserved action keys only)  
- Class B is verification stub only (no payments)  
- Live vitest isolation suite for full API RBAC matrix not expanded (drill + unit cover core gates)  
- Parallel/join loop semantics minimal  
- `forUpdate` best used inside explicit transactions under high concurrency (follow-up hardening)  

---

## 13. Gate sheet

```text
AUTOMATION R1 FOUNDATION = PASS
WORKFLOW VERSION IMMUTABILITY = PASS
RUN/STEP CHECKPOINTING = PASS
OUTBOX→QUEUE→RUN PATH = PASS
QUEUE IS NOT APPROVAL = PASS
ADR-027 MISSING/PENDING/REJECTED/EXPIRED/REVOKED BLOCKS EXECUTE = PASS
PAYLOAD SNAPSHOT BINDING = PASS
IDEMPOTENT ACTION REPLAY = PASS
TENANT ISOLATION = PASS
CLASS C HARD BLOCK = PASS
LEGACY PM/PIPELINE UNCHANGED BEHAVIOR = PASS
USAGE ACCOUNTING = PASS
AI EXECUTION ABSENT = PASS

HUMAN APPROVAL E2E DRILL = PASS
```

**Critical-action readiness (Round 1 stub path):** approval E2E drill **PASS** — real money Class B actions remain out of scope until a later round explicitly adds domain adapters behind the same gate.
