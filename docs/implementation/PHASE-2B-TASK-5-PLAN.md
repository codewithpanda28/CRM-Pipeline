# PHASE-2B-TASK-5-PLAN.md

**Milestone:** Phase 2B Task 5 — Final async foundation hardening + burn-in  
**Date:** 2026-09-04

---

## Audit findings (exact)

| Path | Classification | Action |
|------|----------------|--------|
| `processAutomationEvent` (pipeline-automations.ts) | **DEAD CODE** — never called | **Wire via outbox** → `automation.pipeline.evaluate` |
| `runPipelineReminders` / `pipeline.reminder` | Recurring BullMQ sweep | **KEEP** (operational; not domain event) |
| `initAutomationEngine` + `pmEvents` | **TEMPORARY LEGACY** sync bus | **Migrate** → outbox → `automation.pm.evaluate`; disable in-process listener under bullmq |
| `logStageChanged` / activity | **SYNCHRONOUS BY DESIGN** | Keep + add outbox emit |
| `emitCrmEvent` / plugin bus | In-process plugins | Keep for plugins; **add** outbox for automation/webhooks |
| `queueWebhook` | **OUTBOX→BULLMQ** | Model; wire deal stage webhooks |
| Direct `bullmq` outside job-runtime | **None** | — |
| `JOBS_RUNTIME=legacy` intervals | Rollback only | Document removal plan; default bullmq |

---

## Target flows

### Pipeline stage / field / create
```
TX: mutate pipeline_items + activity
  → EventRecorder (crm.deal.stage_changed | …, job=automation.pipeline.evaluate)
  → optional queueWebhook deal.*
COMMIT → publisher → BullMQ automation → processAutomationEvent
```

### PM rules
```
TX: mutate task/sprint/…
  → EventRecorder (pm.*, job=automation.pm.evaluate)
COMMIT → publisher → BullMQ → evaluatePmRules (former executeActions path)
```
Disable `pmEvents.on` listener when `JOBS_RUNTIME=bullmq`.

### Idempotency
- Pipeline: `{tenant}:pipeline:{automationId}:{itemId}:{eventType}:{from}:{to}` (or activity id)
- PM: `{tenant}:pm:{ruleId}:{aggregateId}:{eventType}:{detail}`

---

## Burn-in / CI
- Local: JOBS_RUNTIME=bullmq only
- CI: Redis 7 service + outbox/BullMQ integration tests
- Contract tests for JobDefinition invariants

## Out of scope
Finance, Pulse UI, Temporal, destructive workspace_id migration, Super Admin UI.
