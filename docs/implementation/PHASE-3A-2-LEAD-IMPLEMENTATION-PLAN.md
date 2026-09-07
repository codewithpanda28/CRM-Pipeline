# PHASE-3A-2-LEAD-IMPLEMENTATION-PLAN.md

**Phase:** 3A.2 Canonical Lead  
**Date:** 2026-09-05  
**Audit:** [PHASE-3A-2-LEAD-AUDIT.md](./PHASE-3A-2-LEAD-AUDIT.md)  
**ADR:** ADR-024 (no new ADR unless decision diverges)

---

## Goals

1. Tenant-scoped canonical `leads` + `lead_conversion_links`
2. Server-validated status lifecycle
3. Soft duplicate detection (email / phone / company domain)
4. Idempotent transactional conversion → Contact ± Company ± Deal
5. Outbox `crm.lead.*` (no BullMQ in domain)
6. Session + v1 APIs + RBAC `leads:*`
7. Minimal responsive Lead UI
8. Live isolation + unit tests

**Frozen Deal:** create Deal only via existing Deal UoW (`insert deals` + `upsertPipelineItemFromDeal`). Never touch `pipeline_items` alone.

---

## Schema (final)

### `leads`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| workspace_id | UUID FK workspaces | Tenant |
| name | TEXT NOT NULL | Display |
| first_name / last_name | TEXT NULL | Optional |
| email | TEXT NULL | Soft-indexed lower() |
| phone / alternate_phone | TEXT NULL | Soft match via digits |
| company_name | TEXT NULL | Provisional |
| website | TEXT NULL | Provisional domain |
| source | TEXT NULL | |
| status | TEXT NOT NULL | CHECK enum |
| rating | TEXT NULL | `hot\|warm\|cold` |
| owner_id | UUID FK users | Required |
| contact_id / company_id / deal_id | UUID NULL | Set on convert |
| notes | TEXT NULL | |
| custom_fields | JSONB | Default `{}` |
| converted_at / converted_by | timestamptz / UUID NULL | Once |
| lost_reason | TEXT NULL | |
| created_at / updated_at / deleted_at | | Soft delete |

**Status CHECK:** `new`, `contacted`, `qualified`, `converted`, `unqualified`, `lost`, `abandoned`

### `lead_conversion_links`

| Column | Notes |
|--------|-------|
| id | UUID |
| workspace_id | Tenant |
| lead_id | FK leads |
| entity_type | `contact` \| `company` \| `deal` |
| entity_id | UUID |
| action | `created` \| `reused` |
| created_at | |

Unique `(lead_id, entity_type)` — one link per entity type per lead.

---

## Status transitions (server)

| From | Allowed to |
|------|------------|
| new | contacted, qualified, unqualified, lost, abandoned |
| contacted | qualified, unqualified, lost, abandoned, new |
| qualified | contacted, unqualified, lost, abandoned |
| unqualified / lost / abandoned | new, contacted (reopen) |
| converted | **none** via PATCH — only via convert endpoint |
| * → converted | **only** `POST .../convert` |

---

## Duplicate detection

Tenant-scoped candidates (never cross-tenant):

1. Contact: `lower(email)` exact  
2. Contact: phone digits exact (min length)  
3. Company: normalized website host or ILIKE name  
4. Open Lead: same email/phone (warn, do not hard-block create unless policy later)

API: surface on create/update/convert as `duplicates: [{ entity, id, reason }]` — no silent merge.

---

## Conversion service

`convertLead(trx, opts)` in one UoW:

1. Lock lead (`FOR UPDATE`); if `status=converted` → return existing links (idempotent 200)
2. Resolve Contact: reuse by email or create  
3. Optional Company: reuse by website/name or create; attach to contact  
4. Optional Deal: call Deal create helpers inside same trx (assert relations, insert deal, upsert item, onDealCreated)  
5. Write `lead_conversion_links`; set lead FKs + `converted_at/by` + status  
6. Append `crm.lead.converted` (+ status_changed) outbox once  
7. Do **not** emit duplicate pipeline automation beyond Deal path’s single `onPipelineItemCreated`

Outcomes: A Contact · B Contact+Company · C +Deal · D reuse.

---

## Events

| Event | Job |
|-------|-----|
| `crm.lead.created` / `updated` / `status_changed` / `converted` / `lost` | `crm.lead.record` (ack) |

Same-TX via EventRecorder. Worker mirrors Deal ack handler.

---

## API / permissions

Session: `/api/leads` CRUD + `POST /:id/convert`  
Public: `/v1/leads`  

Perms: `leads:view|create|edit|delete|convert`  
Defaults: member view/create/edit/convert; admin +delete  
Submodule `crm:leads` → `/crm/leads`

---

## Migration

expand only — no production Lead data → empty backfill. See MIGRATION-NOTES.

---

## Tests

Unit: status machine, normalize, convert idempotency, rollback  
Live: cross-tenant get/create/update/delete/convert/dupes/FK denies  
tsc api + worker  

---

## STOP

No CustomerParty / Products / Quotes / Finance / WhatsApp.
