# ADR-003 — Platform Billing vs Tenant Customer Billing

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Requirements describe:

- Plans/limits/modules sold by ThinkAIQ to tenants (platform SaaS billing)
- Subscriptions/invoices tenants sell to their clients (business billing)

These can be confused into one “billing module.”

## Decision (proposed)

Treat as **two bounded contexts**:

1. `platform_billing` — Super Admin commercial control plane  
2. `tenant_billing` + `finance` — tenant operational billing/invoicing  

Share libraries for money/tax/PDF primitives, **not** identical tables.

## Consequences

- Clearer permissions and analytics (MRR of ThinkAIQ ≠ MRR of a tenant’s customers)
- Slightly more schema surface
- Prevents accidental Super Admin leakage into tenant finance UX

## Alternatives considered

Single billing schema with `scope` flag — rejected due to cognitive/security risk.

## Follow-on (Phase 1E)

**Accepted detail:** [ADR-021](../adr/ADR-021-PLATFORM-VS-TENANT-BILLING.md) — two worlds, tables, providers, SoR, suspension effects. ADR-003’s bounded-context decision is unchanged.

