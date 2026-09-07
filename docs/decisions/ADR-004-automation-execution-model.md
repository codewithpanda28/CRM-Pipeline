# ADR-004 — Automation Execution Model

| Field | Value |
|-------|-------|
| Status | Proposed (expanded with AI/no-code requirements) |
| Date | 2026-09-04 |
| Updated | 2026-09-04 |

## Context

ThinkAIQ Automation is a premium differentiator: no-code visual builder, NL/AI drafting, delays, wait-for-event, approvals, parallel paths, loops, API/webhooks, idempotent finance-safe side effects, and Super Admin emergency controls. Sync request-thread execution cannot own this.

## Decision (proposed)

**Asynchronous durable execution** with checkpointed runs:

- Domain event → transactional outbox → `workflow_run`
- Workers execute steps; delays/wait-for-event via scheduler + event subscriptions
- In-flight runs pinned to `workflow_version`
- Idempotency keys on irreversible/external actions
- Retries only for classified retryable failures; fallback action chains supported
- Compensating actions when atomic rollback is impossible
- AI may draft/explain/optimize; **never auto-publish** unless explicit trusted policy (default off)
- Emergency platform pauses stop new starts; in-flight policy configurable and audited

## Consequences

- Reliable, scalable, testable; supports visual debugger & incident center
- Eventual consistency for side effects — UX must show current step clearly
- Requires strong observability and quota/rate-limit metering

## Alternatives

- Sync inline automation — insufficient as primary model  
- External BPM engine — defer until complexity justifies extraction  
