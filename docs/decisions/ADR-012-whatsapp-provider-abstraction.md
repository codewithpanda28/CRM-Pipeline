# ADR-012 — WhatsApp Provider Abstraction

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

WhatsApp must be first-class and future SaaS-ready without locking forever to one BSP.

## Decision (proposed)

`WhatsAppProvider` port with adapters (Meta Cloud API / BSP). Normalize conversations/messages/templates/delivery states in platform schema. Automation and CRM depend on normalized events, not vendor payloads.
