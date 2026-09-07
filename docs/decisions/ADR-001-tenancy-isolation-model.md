# ADR-001 — Tenancy Isolation Model

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |
| Deciders | ThinkAIQ product + engineering (pending) |

## Context

ThinkAIQ requires strong multi-tenant isolation, white-label many-tenants-on-one-platform, and future reseller hierarchy. Options conflict on cost, isolation strength, and operational complexity.

## Options

1. **Shared DB + shared schema + `tenant_id` on rows** (row-level tenancy)
2. **Schema-per-tenant** in shared DB
3. **Database-per-tenant**

## Decision (proposed)

Adopt **Option 1** for v1 modular monolith, with:

- Mandatory `tenant_id` on tenant tables
- Repository/middleware enforcement
- Automated isolation tests
- Nullable `parent_tenant_id` / `reseller_id` reserved for future

## Consequences

- **Pros:** Simple ops, easy cross-tenant Super Admin analytics, lowest cost, fits modular monolith
- **Cons:** Higher risk of app bugs causing leaks; must invest in tooling/tests; noisy-neighbor risk
- **Mitigations:** CI isolation suite, careful indexing, rate limits, optional future Postgres RLS

## Rejected for now

Schema/DB per tenant — revisit if enterprise contracts demand physical isolation.

## Follow-on

Productization of provision, host resolution, and **multi-tenant memberships** is specified in [ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md). ADR-001’s isolation model is unchanged; single-workspace user binding is not.
