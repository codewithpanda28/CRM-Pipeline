# PHASE-3A-3-CUSTOMERPARTY-IMPLEMENTATION-REPORT.md

**Phase:** 3A.3 — CustomerParty + Customer 360 (main implementation round)  
**Date:** 2026-09-05  
**Status:** **COMPLETE**  
**ADR:** [ADR-025](../adr/ADR-025-CUSTOMERPARTY-AND-CUSTOMER-360.md)  
**Prior:** Step 1 foundation · Step 2A Deal integration  

---

## Final schema

| Table | Notes |
|-------|--------|
| `customer_parties` | Contact \| Company commercial role; soft-delete; `merged` + `merged_into_id` |
| `customer_party_merge_events` | Auditable merge log |
| `deals.customer_party_id` | FK → parties `ON DELETE SET NULL` (2A) |
| `lead_conversion_links.entity_type` | Extended with `customer_party` (`20260905_006_…`) |

**Not created:** `customer_party_contacts` (P6).

---

## API

### Session (`/api/customer-parties`) + alias `/api/customers` (same router)

| Method | Path |
|--------|------|
| GET | `/` list (q, party_type, status) |
| POST | `/` create from contact_id **xor** company_id |
| GET | `/:id` |
| PATCH | `/:id` |
| DELETE | `/:id` soft-delete |
| GET | `/:id/360` |
| POST | `/:id/link` `{ deal_id }` |
| POST | `/:id/merge` `{ into_id, reason }` |
| POST | `/backfill` `{ dry_run, limit? }` admin |

### Public `/v1/customer-parties`

CRUD + 360 + link + merge (API key + scopes). No `/clients`.

---

## Lead integration

- `create_customer_party` default **false** (3A.2 compat)
- Optional `customer_party_id` explicit link
- Prefer company party else contact
- Conversion link `entity_type=customer_party`
- Idempotent re-convert can add party link if missing + flag set
- Deal from convert stays party-null unless party opt-in

---

## Deal integration (from 2A)

- Create / won ensure-reuse (P2/P3)
- Link API can attach Deal → party
- Dual-write preserved

---

## Backfill (P4)

`backfillCustomerParties({ workspaceId?, dryRun?, limit? })`

Counts: candidates, created, reused, attached_deals, attached_leads, skipped, ambiguous[], failed[].

Dry-run default on API. Idempotent re-run safe. No silent merge.

---

## Customer 360

CORE: identity, related contacts, leads, deals, activities, tasks, projects (bounded).  
Extensions stubbed `available: false`: finance, whatsapp, support, voice, automation.  
Merged parties → `{ redirected: true, into_party_id }`.

---

## UI

`/crm/customer-parties` — list, search, type/status filters, create/reuse.  
`/crm/customer-parties/[id]` — 360 slices, link deal, admin merge, merged redirect.  
Sidebar + `customers` icon. ThinkAIQ copy. Layout minWidth 0 / overflow hidden for 390–1280.

---

## Merge

Admin `customers:merge`. Explicit source≠target + reason. One TX: Deal FKs + lead conversion links + mark merged + merge_events + outbox `crm.customer_party.merged`.

---

## Permissions / events

`customers:view|create|edit|delete|merge` · submodule `crm:customers`.  
Outbox: created / updated / linked / merged → `crm.customer_party.record` ack. No domain BullMQ. Pipeline automation unchanged (once).

---

## Tests / isolation

| Suite | Result |
|-------|--------|
| CustomerParty + Deal unit | PASS |
| Modules RBAC | PASS |
| API + worker `tsc` | PASS |
| Live isolation | **45/45 PASS** |

---

## Known non-blocking debt

1. Plugin bridge `deals.create` still may skip party attach  
2. Backfill company-via-customer-status overlaps deal-company ensure (idempotent)  
3. 360 lists capped at 50 — no cursor pagination yet  
4. Create UI asks for Contact/Company UUID (no picker)  
5. Historical Deals without identity remain null until backfill/won  

---

## Gate

```
PHASE 3A.3 = COMPLETE
READY FOR NEXT CRM WAVE = NO (stop — Products/Quotes/Finance/WhatsApp/Voice/Activity not started)
```
