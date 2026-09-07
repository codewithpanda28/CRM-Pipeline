# PHASE-3A-3-STEP-2A-DEAL-CUSTOMERPARTY-REPORT.md

**Phase:** 3A.3 Step 2A — Deal ↔ CustomerParty integration  
**Date:** 2026-09-05  
**Status:** **COMPLETE**  
**Depends on:** Step 1 foundation ([STEP-1-REPORT](./PHASE-3A-3-CUSTOMERPARTY-STEP-1-REPORT.md))  
**ADR:** [ADR-025](../adr/ADR-025-CUSTOMERPARTY-AND-CUSTOMER-360.md)

---

## Scope

| In | Out |
|----|-----|
| FK `deals.customer_party_id → customer_parties` | Lead convert party flag |
| Integrity validates tenant party | Backfill |
| Deal create ensure/reuse (P2/P3) | CustomerParty CRUD API |
| Deal won ensure-when-null | 360 / UI / merge |
| Outbox `created` + `linked` | Products / Quotes / Finance / … |

---

## Migration

**Name:** `20260905_005_deals_customer_party_fk`  
**File:** `packages/db/migrations/20260905_005_deals_customer_party_fk.ts`

- Pre-check: fails if any non-null `customer_party_id` is orphaned / wrong-tenant / soft-deleted / merged  
- Adds FK `ON DELETE SET NULL`  
- Index `(workspace_id, customer_party_id)` for open deals  
- Does **not** touch `primary_contact_id` / `company_id`  
- Additive only — NULL values remain valid  

---

## Integrity changes

`assertDealRelations` / `assertCustomerPartyForDeal`:

| Condition | Result |
|-----------|--------|
| `customer_party_id` null | ok |
| Party missing / other workspace | `customer_party` fail |
| Soft-deleted | fail |
| `status=merged` | fail |
| Identity (contact/company) invalid/deleted | fail |
| Active same-workspace party + valid identity | ok |

Cross-tenant party IDs always fail (workspace scoped select).

---

## Create / won hooks

**Helpers:** `apps/api/src/lib/deals/customer-party.ts`

| Function | Role |
|----------|------|
| `resolveCustomerPartyForDeal` | P3: company → else contact → else null |
| `attachCustomerPartyToDeal` | Ensure/reuse + emit `linked` |
| `ensureCustomerPartyOnDealWon` | If won && party null → attach + persist |

**Wired into:**

- `POST /api/deals` + `POST /v1/deals`  
- `PATCH` / `move` won paths (session + v1)  
- `upsertDealFromPipelineItem` on **create** (dual-write path); preserves existing party on update; won attach on update  

**Not wired:** Lead convert (still `customer_party_id: null` — Step 2B).

### Transaction boundaries

Same `withUnitOfWork` TX as Deal insert/update + pipeline_items projection + Deal outbox + CustomerParty ensure/outbox. Rollback undoes Deal + party create + outbox together.

---

## Events

| Event | When |
|-------|------|
| `crm.customer_party.created` | First ensure for identity |
| `crm.customer_party.linked` | Deal attached to party (`link_type=deal`) |
| Existing `crm.deal.*` | Unchanged |
| `automation.pipeline.evaluate` | Still once per create/stage_change (dedupe intact) |

No BullMQ from domain. No duplicate Deal automation fan-out.

---

## Tests

| Suite | Result |
|-------|--------|
| `customer-parties.test.ts` (13) | PASS |
| `customer-party.test.ts` Deal helpers (13) | PASS |
| `deals.test.ts` | PASS |
| `crm-isolation.live.test.ts` (13) | PASS |
| Full live isolation suite | **44/44 PASS** |
| API `tsc --noEmit` | PASS |
| Worker `tsc --noEmit` | PASS |

Live coverage includes: company party, contact-only, neither→null, reuse/no duplicate, won-null→attach, won-existing→unchanged, cross-tenant party deny, dual-write projection still works.

---

## Compatibility

| Contract | Status |
|----------|--------|
| Deal dual-write ↔ `pipeline_items` | Preserved |
| `primary_contact_id` / `company_id` | Unchanged |
| Lead convert default | Unchanged (party null) |
| Pipeline automation once | Preserved (outbox dedupe) |
| Deal frozen migration strategy | Not altered |

---

## Remaining risks

1. **Lead-created Deals** still leave `customer_party_id` null until won or Step 2B optional flag.  
2. **Plugin bridge** `deals.create` does not yet call attach (low traffic; can harden in 2B).  
3. **Historical Deals** without party need Step 2C backfill.  
4. Clearing party via raw SQL then re-winning reuses ensure — intentional.  

---

## Gate

```
PHASE 3A.3 STEP 2A = COMPLETE
READY FOR STEP 2B = YES
NO LEAD / BACKFILL / CRUD / 360 / UI / MERGE IN THIS STEP
```
