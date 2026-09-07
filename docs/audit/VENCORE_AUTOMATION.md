# VENCORE_AUTOMATION.md

## Reality check

Do **not** equate Vencore “automation” with ThinkAIQ Advanced Automation Engine.

Vencore implements **rule lists**: trigger → sequential actions (PM), plus pipeline automation CRUD.

## Capability matrix

| Capability | Status | Notes |
|------------|--------|-------|
| PM rule CRUD | READY | `routes/automation.ts`, Zod schemas, max 20/project |
| PM event execution | READY | `lib/automation-engine.ts` |
| PM triggers | READY | status/assign/overdue/milestone/sprint/client approve… |
| PM actions | READY | notify, status, assign, webhook, create task, set field… |
| Action logs | READY | `automation_logs` |
| Conditions DSL | PARTIAL | Minimal (e.g. to_status filter) |
| Delays / wait-for-event | MISSING | |
| Branching / parallel / loops | MISSING | |
| Approvals / HITL | MISSING | |
| Pipeline automation CRUD | READY | `pipeline-automations.ts` |
| Pipeline event executor | PARTIAL/UNSAFE | `processAutomationEvent` **not registered** in worker index |
| Pipeline date reminders | PARTIAL | Writes activity; not full action runner |
| notify_assignee | PARTIAL | Logged stub in places |
| Retries/idempotency/versioning | MISSING | |
| Visual debugger / replay | MISSING | |
| AI generation | MISSING | |
| Templates marketplace | MISSING | |

## Worker fit

Interval/cron workers OK for infra/PM; **not** a durable workflow runtime for delays/branches.

## ThinkAIQ implication

Reuse: event emission habits, webhook action idea, logging table pattern.  
**Replace:** runtime with ThinkAIQ automation engine (ADR-004). Do not market Vencore rules as ThinkAIQ automation parity.
