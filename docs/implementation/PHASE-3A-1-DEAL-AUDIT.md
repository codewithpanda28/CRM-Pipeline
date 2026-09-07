# PHASE-3A-1-DEAL-AUDIT.md

**Phase:** 3A.1 — Canonical Deal model  
**Date:** 2026-09-05  
**Status:** Audit complete — implementation follows this document  
**Normative:** [ADR-024](../adr/ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md), [PHASE-3A-CRM-2-0-PLAN](./PHASE-3A-CRM-2-0-PLAN.md)

---

## 1. Executive summary

Live “deals” are **`pipeline_items` + JSONB `field_values`**. The physical `deals` table was **dropped** (`20260602_003`), but TypeScript/`DealTable`/plugin bridge/seed still drift.

**Storage decision for 3A.1:** create a **new canonical `deals` table** (expand), preserve IDs from `pipeline_items` where possible, dual-read/write via same TX, **do not drop** `pipeline_items` or `field_values`.

---

## 2. As-built data model

| Artifact | Reality | Class |
|----------|---------|-------|
| `pipeline_items` | Live opportunity cards | **MIGRATE** (source of truth → Deal) |
| `field_values` JSONB | name/title, value, owner_id, close_date, contact_id, company_id, customs | **MIGRATE** known keys; **KEEP** remainder in Deal.`custom_fields` + item JSONB |
| `pipelines` / `pipeline_stages` / `pipeline_fields` / `pipeline_automations` | Live config | **KEEP** |
| `pipeline_activity` | Stage/item telemetry | **KEEP** (REMOVE-LATER when Activity owns history) |
| `pipeline_records` + `record_field_values` | Stale engine; analytics still hit | **COMPATIBILITY** / **REMOVE-LATER** |
| Physical `deals` (old) | Dropped | — recreate as **new** canonical (not revive columns as-was) |
| Kysely `DealTable` / bridge `selectFrom('deals')` | Schema drift / broken | **MIGRATE** to new Deal |
| `projects.deal_id` | FK → `pipeline_items.id` | **KEEP** (ID continuity = Deal.id) |
| Monday `items` / `item_groups` | Parallel model | **COMPATIBILITY** / **REMOVE-LATER** |

### Field_values dictionary (deterministic backfill)

| Key | Maps to Deal |
|-----|--------------|
| `name` (fallback `title`) | `name` |
| `value` or `amount` | `amount` (numeric string / decimal) |
| `currency` | `currency` (else tenant/workspace default `INR` or `USD` — document chosen default) |
| `owner_id` | `owner_id` (else item creator / workspace owner fallback) |
| `close_date` / `expected_close_at` | `expected_close_at` |
| `contact_id` / `primary_contact_id` | `primary_contact_id` |
| `company_id` | `company_id` |
| `source` | `source` |
| `probability` | `probability` |
| All other keys | `custom_fields` + retain in `pipeline_items.field_values` |

---

## 3. API inventory

| Surface | Class | Action in 3A.1 |
|---------|-------|----------------|
| `/api/pipelines`, stages, fields, automations | **KEEP** | Unchanged config |
| `/api/pipelines/:id/items`, `/api/items` | **COMPATIBILITY** | Dual-write Deal on create/update/move/delete |
| `/v1/deals` | **MIGRATE** (implement) | Canonical CRUD + stage move |
| `/api/deals` (api-client orphans) | **COMPATIBILITY** | Optional thin alias → Deal service |
| Plugin bridge `deals.*` on dead table | **MIGRATE** | Point at canonical `deals` |

---

## 4. Events / webhooks / automation

| Channel | Today | 3A.1 |
|---------|-------|------|
| Outbox | `crm.pipeline.stage_changed` / `item_created` / `field_changed` → `automation.pipeline.evaluate` | **KEEP** + emit **`crm.deal.*`** same TX (dedupe so automation runs **once**) |
| Webhooks | `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost` | **COMPATIBILITY** — keep names |
| Plugin hub | `crm.deal@v1:*` post-commit | **KEEP** |

**Automation rule:** one stage change → one `automation.pipeline.evaluate` job (existing). New `crm.deal.stage_changed` for webhooks/search may share or alias — **must not double-fire** pipeline automation.

---

## 5. Cross-module FKs

| Ref | Class |
|-----|-------|
| `projects.deal_id` → pipeline_items | **KEEP** (same UUID as Deal.id after backfill) |
| `tasks` / `activities`.`record_id` | **COMPATIBILITY** |
| `emails.deal_id` | **MIGRATE** later (document only in 3A.1 if untouched) |

---

## 6. Tenancy / soft-delete / money / RBAC

| Concern | Pattern to copy |
|---------|-----------------|
| Scope | `workspace_id` columns; `tenantScopeId` dual-read |
| Soft delete | `deleted_at` like contacts/items |
| Money | Prefer **decimal string / numeric(18,2)** — no float; explicit `currency` |
| RBAC | Add `deals:view|create|edit|delete|move_stage|win_lose`; pipeline UI may continue using `pipelines:*` for Kanban until UI switches — grant via existing module conventions, not all roles blindly |

---

## 7. Classification catalog (rollup)

| Artifact | Class |
|----------|-------|
| New `deals` table + service | **MIGRATE** (implement) |
| `pipeline_items` | **COMPATIBILITY** (projection) |
| Pipeline config tables | **KEEP** |
| `pipeline_activity` | **KEEP** |
| Outbox automation jobs | **KEEP** (single path) |
| Webhook `deal.*` | **COMPATIBILITY** |
| Dead `DealTable` drift / bridge | **MIGRATE** |
| Analytics on `pipeline_records` | **REMOVE-LATER** (out of 3A.1 unless cheap) |
| Leads / CustomerParty / Products / Quotes | **OUT OF SCOPE** |

---

## 8. Expand → backfill → dual-read → validate → contract

1. **Expand:** create `deals` (+ optional `deal_migration_trace`)  
2. **Backfill:** idempotent script mapping `pipeline_items` → `deals` (same `id`)  
3. **Dual-read:** `/v1/deals` reads `deals`; list/get prefer Deal; items API still works  
4. **Write:** single TX update `deals` + project `pipeline_items` (and vice versa for item routes)  
5. **Validate:** counts + isolation tests  
6. **Contract:** later phase — stop opaque-only writes (not in 3A.1)

---

## 9. Out of scope (hard)

Leads, CustomerParty table (column nullable only), Products, Quotes, Finance, WhatsApp, Meilisearch, destructive drops.
