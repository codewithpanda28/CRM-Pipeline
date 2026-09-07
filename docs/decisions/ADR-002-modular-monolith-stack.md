# ADR-002 — Modular Monolith Tech Stack

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |
| Deciders | Pending stakeholder ratification |

## Context

Master blueprint requires modular monolith first, API-first, jobs, Postgres-friendly tenancy, S3 storage. Exact languages/frameworks were not mandated.

## Conflict / ambiguity

Choosing stack too early without team constraints vs needing a default to start Phase 1.

## Proposed default (ratify or replace)

| Layer | Proposal |
|-------|----------|
| Language | TypeScript |
| API | Node.js + NestJS **or** Fastify modular packages |
| UI | React + Vite (Super Admin + Tenant app) |
| DB | PostgreSQL |
| ORM | Prisma or Drizzle |
| Queue | Redis + BullMQ |
| Storage | S3-compatible |
| Auth | Session + JWT access for API; argon2 passwords |

Alternative acceptable packs (Java/Spring, .NET, Laravel) may replace this if team strength demands — document replacement in this ADR before coding.

## Consequences

- Enables clear module packages (`modules/crm`, `modules/finance`, …)
- Single deployable artifact
- Workers share codebase

## Action

Do **not** scaffold code until this ADR is Accepted with a concrete choice.
