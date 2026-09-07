# PHASE-3A-2-LEAD-IMPLEMENTATION-REPORT.md

**Phase:** 3A.2 — Canonical Lead system  
**Date:** 2026-09-05  
**Status:** Complete  
**Audit:** [PHASE-3A-2-LEAD-AUDIT.md](./PHASE-3A-2-LEAD-AUDIT.md)  
**Plan:** [PHASE-3A-2-LEAD-IMPLEMENTATION-PLAN.md](./PHASE-3A-2-LEAD-IMPLEMENTATION-PLAN.md)  
**Migration:** [PHASE-3A-2-LEAD-MIGRATION-NOTES.md](./PHASE-3A-2-LEAD-MIGRATION-NOTES.md)  
**Frozen Deal:** Phase 3A.1 untouched except conversion **calls** Deal create helpers (no Deal schema redesign)

---

## Final Lead schema

### `leads`

Typed, workspace-scoped soft-delete table (migration `20260905_003_canonical_leads.ts`).

Key columns: `name`, `first_name`, `last_name`, `email`, `phone`, `alternate_phone`, `company_name`, `website`, `source`, `status`, `rating` (`hot|warm|cold`), `owner_id`, `contact_id`, `company_id`, `deal_id`, `notes`, `custom_fields`, `converted_at`, `converted_by`, `lost_reason`, timestamps + `deleted_at`.

### `lead_conversion_links`

Explicit lineage: `(lead_id, entity_type)` unique → `contact|company|deal` + `action` `created|reused`.

**Production Lead data before this wave:** **NONE** (greenfield).

---

## Conversion state machine

| Path | Rule |
|------|------|
| PATCH status | Server `canTransitionLeadStatus` — cannot set `converted` |
| Convert | `POST /api/leads/:id/convert` only → `converted` |
| Converted | PATCH blocked (409); re-convert idempotent 200 |

Open path: `new ↔ contacted ↔ qualified` with side exits `unqualified|lost|abandoned` (reopen allowed).

---

## Duplicate detection

Tenant-scoped soft candidates via `findLeadDuplicates`:

- Contact / open Lead: normalized email  
- Contact / open Lead: phone digits (≥7)  
- Company: website host or company name  

Surfaced in create `meta.duplicates` and GET detail — **no silent merge**, no global unique.

---

## Lineage strategy

1. FKs on lead: `contact_id`, `company_id`, `deal_id`  
2. Rows in `lead_conversion_links` with create vs reuse  
3. Deal `source` = `lead_conversion` / `lead:{source}`; `custom_fields.lead_id`

Answers: which Lead created/reused Contact/Company/Deal.

---

## API

| Surface | Routes |
|---------|--------|
| Session | `GET/POST /api/leads`, `GET/PATCH/DELETE /api/leads/:id`, `POST /api/leads/:id/convert` |
| API key | `/v1/leads` equivalents (`read_write` on mutations) |

Feature gate: `crm:leads`. RBAC: `leads:view|create|edit|delete|convert`.

---

## Events

Same-TX outbox (`EventRecorder`), job `crm.lead.record` (worker ack-only):

- `crm.lead.created` / `updated` / `status_changed` / `converted` / `lost`

Conversion: one logical `crm.lead.converted` (+ status_changed). Deal path still emits **one** `automation.pipeline.evaluate` via existing Deal helpers — Lead events do **not** double-fire pipeline automation.

---

## Permissions

| Key | Member | Admin |
|-----|--------|-------|
| view/create/edit/convert | ✓ | ✓ |
| delete | | ✓ |

Nav + submodule `crm:leads` → `/crm/leads`. Migration enables module for workspaces with CRM parent.

---

## Deal integration

`convertLead` inserts Deal + `upsertPipelineItemFromDeal` + `onDealCreated` / `onPipelineItemCreated` inside the **same** conversion TX. Never mutates `pipeline_items` alone. Frozen Deal contract preserved.

---

## UI

`/crm/leads` — list / create / status / convert confirm. Mobile-first column layout, `overflowX: hidden`, wrap controls (390/768/1280 capable). Terminology: Lead ≠ Contact ≠ Company ≠ Deal.

---

## Tests

| Suite | Result |
|-------|--------|
| Lead unit (status + normalize) | **7/7** |
| Lead route unit | **2/2** |
| Modules permission count (32) | **PASS** |
| Live isolation | **43/43** (incl. Lead CRUD + convert + Deal projection) |
| API / worker `tsc` | Clean (post-fixes) |

---

## Isolation result

A→A create/update/convert (+ Deal dual-write) OK.  
A→B owner/contact attach denied.  
Idempotent re-convert returns existing links.

---

## Responsive result

UI built without desktop-only drag; list/stack + wrap; page `overflowX: hidden`. Browser MCP re-smoke deferred (prior flaky tooling); layout constraints match 3A.1 responsive rules.

---

## Remaining risks

1. Existing Member roles seeded **before** `leads:*` may lack perms until re-seed (admin `grants_all` OK).  
2. Contact widgets still mislabeled “Leads” — cosmetic debt.  
3. Pipeline stage named `"Lead"` ≠ Lead entity.  
4. Activities still not polymorphic to Lead (3A.5).  
5. `crm.lead@v1` hub contract not registered — durable outbox only.  
6. Convert without email cannot create Contact (400 `EMAIL_REQUIRED`) unless `contact_id` reuse.

---

## Exact blockers for Phase 3A.3

**None** from Lead freeze perspective.

3A.3 (whatever product chooses next — typically CustomerParty or Products) may begin after product sign-off. Do **not** auto-start CustomerParty / Products / Quotes / Finance / WhatsApp.

---

## STOP

```
PHASE 3A.2 = COMPLETE
READY FOR PHASE 3A.3 = YES (product-gated)
DO NOT START: CustomerParty | Products | Quotes | Finance | WhatsApp | Voice
```
