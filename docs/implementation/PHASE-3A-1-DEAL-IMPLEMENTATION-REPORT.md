# PHASE-3A-1-DEAL-IMPLEMENTATION-REPORT.md

**Phase:** 3A.1 — Canonical Deal model  
**Date:** 2026-09-05  
**Status:** Complete (expand / backfill / dual-read / dual-write)  
**ADR:** [ADR-024](../adr/ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md) → **Accepted**  
**Audit:** [PHASE-3A-1-DEAL-AUDIT.md](./PHASE-3A-1-DEAL-AUDIT.md)  
**Migration notes:** [PHASE-3A-1-MIGRATION-NOTES.md](./PHASE-3A-1-MIGRATION-NOTES.md)

---

## Canonical Deal model

Implemented first-class `deals` table (workspace-scoped):

| Column | Notes |
|--------|--------|
| `id` | Same UUID as `pipeline_items.id` when projected |
| `workspace_id` | Tenant dual-read scope |
| `pipeline_id` / `stage_id` | Integrity-checked |
| `name`, `owner_id` | Required |
| `amount` NUMERIC(18,2) | No float persistence |
| `currency` | Explicit; default `INR` |
| `probability`, `expected_close_at`, `source` | Typed |
| `primary_contact_id`, `company_id` | Tenant-validated |
| `customer_party_id` | Nullable extension stub (rejects non-null writes) |
| `status` | `open\|won\|lost\|abandoned` |
| `won_at` / `lost_at` / `lost_reason` | Terminal lifecycle |
| `custom_fields` | Remainder of `field_values` |
| `source_pipeline_item_id` | Trace (no FK — Deal-first create safe) |
| `deleted_at` | Soft delete |

Helpers: `apps/api/src/lib/deals/*` (money, field-map, integrity, projection, events, backfill).

---

## Migration

- `20260905_001_canonical_deals.ts` — create + idempotent SQL backfill  
- `20260905_002_deals_drop_item_fk.ts` — drop circular FK for Deal-first writes  
- Runtime: `backfillDealsFromPipelineItems()` for catch-up counts  
- **No** drop of `pipeline_items` / `field_values`

---

## Compatibility

| Path | Behavior |
|------|----------|
| `/api/pipelines/.../items`, `/api/items` | Dual-write Deal in same TX |
| `/api/deals`, `/v1/deals` | Canonical read/write + project item |
| Plugin bridge `deals.*` | Points at canonical `deals` |
| Builtin `crm.deal@v1` | Prefer `deals`; fallback items |
| Projects `deal_id` | Same UUID continuity |

**Write strategy:** single TX mutate Deal ↔ item projection (no divergent truth).

**Dual-read precedence:** `/api/deals` & `/v1/deals` → Deal; Kanban UI → items (projected).

---

## API

Session (RBAC `deals:*`):

- `GET/POST /api/deals`
- `GET/PATCH/DELETE /api/deals/:id`
- `POST /api/deals/:id/move`

API key:

- `/v1/deals` (+ `:id`, `:id/move`)

Permissions added: `deals:view|create|edit|delete|move_stage|win_lose`.

---

## Events

Same-TX outbox (no BullMQ in CRM domain):

| Event | Job |
|-------|-----|
| Existing `crm.pipeline.*` | `automation.pipeline.evaluate` (**once**) |
| `crm.deal.created\|updated\|stage_changed\|won\|lost` | `crm.deal.record` (ack) |
| Webhooks `deal.*` | unchanged + `deal.lost` added |

Worker registers `crm.deal.record` handler.

---

## Automation

Stage change still emits **one** `automation.pipeline.evaluate` via `onPipelineStageChanged`. Domain `crm.deal.*` does not re-trigger pipeline automation.

---

## Isolation

Live Postgres suite: **41/41** passed (was 40; + deal isolation).

Verified A→A GET/create; A→B deal/pipeline/stage/owner/contact/company **denied**.

---

## Permissions

Separate `deals:*` with CRM module `defaultRoles` (member: view/create/edit/move/win_lose; admin: +delete). Pipeline Kanban continues on `pipelines:*`.

---

## Tests

| Suite | Result |
|-------|--------|
| `deals.test.ts` + `pipeline-items.test.ts` | 9/9 |
| `@vencore/modules` permission count | 17/17 |
| Live isolation | **41/41** |
| API `tsc --noEmit` | PASS |

---

## Browser / runtime

| Service | URL / note |
|---------|------------|
| Frontend | http://localhost:3002 |
| API | http://localhost:3001 |
| Worker | BullMQ runtime started (`JOBS_RUNTIME=bullmq`) |
| Redis | `redis://127.0.0.1:6380` |
| Postgres | `vencore_isolation_test` |

Smoke: ThinkAIQ branding, login (`usera@isolation.test`), Pipeline A Kanban, create item → Deal dual-write (`Untitled deal` / `0.00` / `INR`), outbox `crm.deal.created` logged. No blank page / unexpected 500 on pipeline path.

Hydration warning on login/sidebar (pre-existing Next.js issue) — not Deal-specific.

---

## Responsive

| Width | Horizontal overflow | Notes |
|-------|---------------------|-------|
| 390 | **none** (`sw===cw`) | Sidebar + brand visible |
| 768 | OK | Kanban Stage A + cards usable |
| 1280 | **none** | Full board + nav |

---

## Remaining legacy references

- Analytics widgets still query `pipeline_records` EAV (**REMOVE-LATER**)  
- Monday-style `items` / `item_groups` parallel model  
- `emails.deal_id` not retargeted  
- UI labels still say “item” / “record” (no CRM UI redesign in 3A.1)  
- Existing workspaces seeded before this wave may lack `deals:*` on Member role until roles re-seeded (Administrator `grants_all` OK)

---

## Remaining risks

1. Dual-write must stay in lockstep until contract phase — drift if a code path mutates only one table.  
2. Default currency `INR` may be wrong for non-IN tenants until tenant currency settings exist.  
3. Cards without `name` field show UUID prefixes in Kanban (pre-existing when no name field configured).  
4. `customer_party_id` accepts no values yet by design.  
5. Redis queue depth showed 1 historical failed job at worker start — unrelated to Deal create path observed.

---

## STOP

Do **not** auto-start Leads, CustomerParty, Products, Quotes, Finance, or WhatsApp.
