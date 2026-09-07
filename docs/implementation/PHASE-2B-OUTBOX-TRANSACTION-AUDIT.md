# PHASE-2B-OUTBOX-TRANSACTION-AUDIT.md

**Date:** 2026-09-05  
**Task:** Phase 2B Task 6 — same-transaction outbox hardening  
**Pre-fix baseline:** Task 5 report (best-effort post-mutation appends)

Classification key: **A** same TX · **B** after commit · **C** unknown · **D** sync by design

| Location | Business mutation | Event / job | Boundary (pre) | Class | Required change | Status |
|----------|-------------------|-------------|----------------|-------|-----------------|--------|
| `pipeline-items` POST create | insert `pipeline_items` + activity | `crm.pipeline.item_created` → `automation.pipeline.evaluate`; `deal.created` webhook | Mutation then `onPipelineItemCreated` (separate) | **B** | Wrap mutate + outbox + webhook in one TX | **FIXED** |
| `pipeline-items` PATCH update stage | update item + activity | `crm.pipeline.stage_changed`; `deal.stage_changed` / `deal.won` | After mutate | **B** | Same TX | **FIXED** |
| `pipeline-items` PATCH move | update stage/position | stage_changed + webhooks | After mutate | **B** | Same TX | **FIXED** |
| `pipeline-items` field change | update fields + activity | `crm.pipeline.field_changed` | After mutate | **B** | Same TX | **FIXED** |
| `project-tasks` status update | update `project_tasks` | `pm.task_status_changed` → `automation.pm.evaluate` | After mutate | **B** | Same TX | **FIXED** |
| `sprints` status ACTIVE/COMPLETED | update sprint | `pm.sprint_*` | After mutate | **B** | Same TX | **FIXED** |
| `milestones` COMPLETED | update milestone | `pm.milestone_completed` | After mutate | **B** | Same TX | **FIXED** |
| `portal` approval respond | update approval | `pm.client_*` | After mutate | **B** | Same TX | **FIXED** |
| `queueWebhook` internal | deliveries + outbox | `webhook.deliver` | Own TX for deliveries+outbox only | **A** internals / **B** vs caller | Accept caller `trx` | **FIXED** |
| contacts/tasks/alerts `queueWebhook(...).catch` | prior contact/task mutate | webhook | After commit, errors swallowed | **B** | Document TEMPORARY for non-automation CRM; deal path fixed via pipeline TX | **DOCUMENTED** |
| `emitCrmEvent` / plugin bus | n/a | in-process | Sync | **D** | Keep | OK |
| `maybeSpawnProjectOnDealWon` | project create | none via outbox | Fire-and-forget after stage | **B** | Intentional post-commit side effect (not automation evaluate) | **DOCUMENTED** |
| Recurring BullMQ sweeps | n/a | `pipeline.reminder`, etc. | Scheduler | **D**/ops | Keep | OK |
| Publisher → JobQueue | n/a | enqueue | After outbox commit | **B** by design | Keep (not DB/Redis XA) | OK |

## Canonical pattern (post-fix)

```ts
await withUnitOfWork(db, async (trx, recorder) => {
  // mutate with trx
  // recorder.append / append*Outbox(trx) / queueWebhook(trx, ...)
});
// COMMIT — then publisher may dispatch
```

Outbox insert failure → entire unit rolls back. Mutation rollback → no outbox row.
