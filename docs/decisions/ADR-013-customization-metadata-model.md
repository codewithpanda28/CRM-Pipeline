# ADR-013 — Customization Metadata Model

| Field | Value |
|-------|-------|
| Status | Proposed |
| Date | 2026-09-04 |

## Context

Tenants need custom fields, layouts, forms, and eventually custom objects without schema migrations per tenant or code forks. Trade-off between flexibility, query performance, and upgrade safety.

## Options

1. **Pure EAV** (entity-attribute-value rows only)  
2. **JSONB bag on each record** (`custom JSONB`)  
3. **Hybrid:** definitions table + `custom_field_values` (typed/JSONB) + optional JSONB denormalized cache on parent row for hot filters  
4. **Physical columns per tenant** — rejected (unmaintainable)

## Decision (proposed)

Adopt **Option 3 (hybrid)**:

- `custom_field_definitions` with stable `field_key`  
- `custom_field_values` for storage  
- Optional denormalized projection/index strategy for searchable/filterable fields  
- Custom objects (P3): metadata tables + `custom_records` JSONB/typed values — not DDL per tenant  

## Consequences

- Safe multi-tenant upgrades  
- Automation/API use stable keys  
- Need careful indexing and plan limits on field counts  
- Formula fields must be sandboxed interpreters, not `eval`
