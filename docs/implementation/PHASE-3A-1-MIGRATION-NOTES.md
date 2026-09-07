# PHASE-3A-1-MIGRATION-NOTES.md

**Phase:** 3A.1 Canonical Deal  
**Date:** 2026-09-05  
**Migration:** `packages/db/migrations/20260905_001_canonical_deals.ts`

---

## Strategy: expand → backfill → dual-read → validate → contract

### Expand

- Created **`deals`** (canonical) with typed commercial columns.
- Created **`deal_migration_traces`** for provenance (`source_pipeline_item_id` unique).
- **Did not** drop `pipeline_items`, `field_values`, or rewrite existing item IDs.

### Backfill

- Same-UUID strategy: `deals.id = pipeline_items.id` when migrated.
- `source_pipeline_item_id` always set for item-originated deals.
- Field mapping:

| field_values key | Deal column |
|------------------|-------------|
| `name` / `title` | `name` |
| `amount` / `value` | `amount` (NUMERIC) |
| `currency` | `currency` (default `INR`) |
| `owner_id` | `owner_id` (else first workspace user) |
| `close_date` / `expected_close_at` | `expected_close_at` |
| `contact_id` / `primary_contact_id` | `primary_contact_id` (tenant-validated) |
| `company_id` | `company_id` (tenant-validated) |
| other keys | `custom_fields` (+ retained on item JSONB) |

- Migration SQL is **idempotent** (`ON CONFLICT DO NOTHING`).
- Runtime re-run: `backfillDealsFromPipelineItems(db)` reports:
  - `pipeline_items_total`, `deals_created`, `skipped`, `unmapped`, `failed`, `duplicates`

### Dual-read

| Consumer | Precedence |
|----------|------------|
| `/api/deals`, `/v1/deals` | Canonical `deals` |
| Pipeline Kanban `/api/items` | `pipeline_items` (still authoritative for UI position) |
| Plugin `crm.deal@v1` | Prefer `deals`; fallback `pipeline_items` if empty |
| Projects `deal_id` | Same UUID as Deal / item |

### Dual-write (temporary, same TX)

- Item create/update/move/delete → upsert/soft-delete Deal projection.
- Deal create/update/move/delete → upsert/soft-delete `pipeline_items` projection.
- **Single business truth intent:** both rows updated in one unit-of-work.

### Validation

- Live isolation: A cannot read/write B deals; B pipeline/stage/owner/contact/company denied on create.
- Amount stored as NUMERIC string; currency required.
- Outbox: `crm.pipeline.*` automation once; `crm.deal.*` via `crm.deal.record` (no double automation).

### Rollback

1. Stop dual-write code deploy (revert API).
2. `down()` drops `deal_migration_traces` then `deals` only.
3. `pipeline_items` remain intact — no data loss from expand.

### Future contract (not 3A.1)

- Stop writing opaque commercial fields only to JSONB.
- Optionally drop `source_pipeline_item_id` once dual-read retired.
- Do **not** drop `pipeline_items` until product sign-off.

### Production safety

- **Do not run** experimental backfill against production without backup + dry-run counts.
- Prefer migration on deploy; runtime backfill only for catch-up.
