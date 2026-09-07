# PHASE-3A-3-CUSTOMERPARTY-STEP-1-REPORT.md

**Phase:** 3A.3 Step 1 — CustomerParty database + domain foundation  
**Date:** 2026-09-05  
**Status:** **COMPLETE**  
**ADR:** [ADR-025](../adr/ADR-025-CUSTOMERPARTY-AND-CUSTOMER-360.md) (Accepted)  
**Checklist:** [PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md](./PHASE-3A-3-IMPLEMENTATION-CHECKLIST.md)

---

## Scope delivered

| In | Out |
|----|-----|
| `customer_parties` + `customer_party_merge_events` migration | Deal hooks / FK activation |
| Schema + types | Lead convert party flag |
| `ensureCustomerParty` + resolve/validate helpers | Backfill execution |
| Outbox helpers + worker ack job | Customer 360 / UI / merge API |
| `crm:customers` + `customers:*` RBAC | Full `/api/customer-parties` CRUD |
| Focused unit tests | Products / Quotes / Finance / WhatsApp / Voice / Activity |

---

## Migration

**Name:** `20260905_004_customer_parties`  
**File:** `packages/db/migrations/20260905_004_customer_parties.ts`

### Final schema — `customer_parties`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `workspace_id` | UUID NOT NULL | FK → `workspaces` CASCADE |
| `party_type` | TEXT | CHECK `contact \| company` |
| `party_id` | UUID | Contact or Company id (app-validated; no polymorphic FK) |
| `display_name` | TEXT NOT NULL | Cached list/360 label |
| `status` | TEXT | CHECK `active \| inactive \| merged` (default `active`) |
| `primary_owner_id` | UUID NULL | FK → `users` SET NULL |
| `merged_into_id` | UUID NULL | Self-FK → `customer_parties` |
| `custom_fields` | JSONB | default `{}` |
| `created_at` / `updated_at` | TIMESTAMPTZ | |
| `deleted_at` | TIMESTAMPTZ NULL | Soft delete |

**Consistency CHECK:** `merged` requires `merged_into_id`; non-merged requires `merged_into_id IS NULL`.

### Indexes / constraints

| Name | Definition |
|------|------------|
| `customer_parties_workspace_identity_uidx` | UNIQUE `(workspace_id, party_type, party_id)` WHERE `deleted_at IS NULL AND status <> 'merged'` |
| `customer_parties_workspace_status_idx` | `(workspace_id, status)` WHERE not deleted |
| `customer_parties_workspace_owner_idx` | `(workspace_id, primary_owner_id)` WHERE owner set |
| `customer_parties_merged_into_idx` | `(workspace_id, merged_into_id)` WHERE merged |

### Final schema — `customer_party_merge_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `workspace_id` | UUID | FK workspaces |
| `from_party_id` / `into_party_id` | UUID | FK parties RESTRICT; must differ |
| `actor_user_id` | UUID NULL | FK users |
| `reason` | TEXT NOT NULL | |
| `snapshot` | JSONB | metadata / pre-merge snapshot |
| `created_at` | TIMESTAMPTZ | |

**Not created:** `customer_party_contacts` (P6).

**Also:** seeds `workspace_modules` row `crm:customers` for workspaces with CRM enabled.

---

## Service API

**Package path:** `apps/api/src/lib/customer-parties/`

| Function | Purpose |
|----------|---------|
| `ensureCustomerParty({ workspaceId, partyType, partyId, ... })` | Idempotent create/reuse; TX-safe; race → re-select |
| `validatePartyIdentity` | Contact/Company same-workspace + not soft-deleted |
| `getCustomerParty` | Tenant-scoped get by id |
| `resolvePartyByContact` / `resolvePartyByCompany` | Find reusable party |
| `findReusablePartyByIdentity` | Active/inactive only (skips merged + soft-deleted) |
| `isReusableParty` | Pure helper |

**Behaviors:**

- Reuses active/inactive non-deleted party for same identity  
- Soft-deleted → **new** active party (no silent revive)  
- Merged-only → **new** active party (no silent merge)  
- Wrong-tenant / missing / deleted identity → `{ ok: false, fail }`  
- Emits `crm.customer_party.created` only when a row is inserted  

**Not wired:** Deal create/won, Lead convert, merge writers.

---

## Outbox

| Event | Job | Step 1 usage |
|-------|-----|--------------|
| `crm.customer_party.created` | `crm.customer_party.record` | On ensure insert |
| `crm.customer_party.updated` | same | Helper ready; unused |
| `crm.customer_party.linked` | same | Helper ready; unused until Deal/Lead |
| `crm.customer_party.merged` | same | Helper ready; unused until merge |

Worker: ack-only handler registered in `apps/worker/src/jobs/bullmq/runtime.ts` (same pattern as Deal/Lead). Domain never calls BullMQ.

---

## RBAC / module

| Key | Default roles |
|-----|---------------|
| `customers:view` | admin, member |
| `customers:create` | admin, member |
| `customers:edit` | admin, member |
| `customers:delete` | admin |
| `customers:merge` | admin |

Submodule: `crm:customers` (path reserved `/crm/customer-parties` — **no UI in Step 1**).

CRM permission count: **37** (was 32).

---

## Tests run

| Suite | Result |
|-------|--------|
| `apps/api` `customer-parties.test.ts` (13) | PASS |
| `packages/modules` `index.test.ts` (18) | PASS |
| `apps/api` `tsc --noEmit` | PASS |
| `apps/worker` `tsc --noEmit` | PASS |

Coverage: contact/company create, ensure/reuse, duplicate prevention, soft-deleted, merged, wrong-tenant contact/company, resolve/get, RBAC defaults.

---

## Compatibility impact

| Surface | Impact |
|---------|--------|
| Deal `customer_party_id` | **Unchanged** — still nullable stub; **integrity still rejects non-null** |
| Deal dual-write / pipeline_items | Untouched |
| Lead convert | Untouched — still sets `customer_party_id: null` |
| Contacts / Companies | Untouched |
| No Deal FK added | Safe expand; Step 2 will add FK + flip integrity |

---

## Rollback strategy

1. Stop writing CustomerParty domain code (no production writers yet beyond ensure).  
2. Run migration `down`: drops `customer_party_merge_events` then `customer_parties`.  
3. Revert module seed is non-destructive (`crm:customers` rows can remain disabled/orphaned).  
4. Deal/Lead behavior needs no rollback — never changed.

---

## Remaining Step 2 work (do not auto-start)

1. Add FK `deals.customer_party_id → customer_parties`  
2. Flip Deal integrity to validate tenant party  
3. Deal create + won ensure/reuse hooks (P2/P3)  
4. Lead convert optional `create_customer_party` + link entity_type  
5. Session/v1 CRUD API under `/api/customer-parties`  
6. Deterministic backfill (P4)  
7. Admin merge (P5)  
8. Customer 360 + UI  

---

## Gate

```
PHASE 3A.3 STEP 1 = COMPLETE
READY FOR STEP 2 = YES
NO DEAL / LEAD / BACKFILL / 360 / UI / MERGE IN THIS STEP
```
