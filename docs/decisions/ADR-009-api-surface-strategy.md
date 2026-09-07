# ADR-009 — API Surface Strategy

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

API-first platform for UI, partners, and future embedding.

## Decision (proposed)

Versioned REST JSON (`/api/v1`); resource-oriented; standard error envelope; pagination/filter/sort; Idempotency-Key on creates/payments; platform routes under `/api/v1/platform`. GraphQL deferred unless product demand appears.
