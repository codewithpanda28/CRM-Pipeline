# ADR-010 — Plugin / Module Extension Strategy

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Future modules (WhatsApp SaaS, HR, verticals) must register without rewriting core.

## Decision (proposed)

In-process module packages with manifests (routes, permissions, events, automations, migrations, widgets). External marketplace plugins later; v1 focuses on first-party modules in monorepo packages.
