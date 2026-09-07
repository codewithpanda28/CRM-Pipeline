# ADR-007 — Queue / Background Jobs Strategy

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Automation delays, emails, WhatsApp, PDFs, webhooks, imports require durable async processing with tenant context.

## Decision (proposed)

Redis-backed queue (e.g. BullMQ) or equivalent; every job payload carries `tenant_id` + `correlation_id`; retries with backoff + DLQ; scheduler separate with leader lock.

**Superseded for selection detail by [ADR-015](../adr/ADR-015-BULLMQ-VS-PG-BOSS.md): BullMQ accepted as Phase 1–4 primary runtime behind `JobQueue` port.**

## Alternatives

DB-polling queues (simpler ops, weaker throughput); cloud queues (SQS) later if needed; **pg-boss** retained as documented fallback in ADR-015.
