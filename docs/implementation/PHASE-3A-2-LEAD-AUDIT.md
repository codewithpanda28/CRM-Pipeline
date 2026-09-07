# PHASE-3A-2-LEAD-AUDIT.md

**Phase:** 3A.2 — Canonical Lead system  
**Date:** 2026-09-05  
**Status:** Audit complete — implementation may proceed  
**Frozen prerequisite:** Phase 3A.1 Canonical Deal = **FROZEN** / Gate **PASS**  
**Constraint:** Do **not** modify Deal model except minimal additive integration (e.g. call Deal create service). No CustomerParty / Products / Quotes / Finance / WhatsApp.

---

## Executive verdict

| Question | Answer |
|----------|--------|
| Production `leads` table? | **No** |
| Lead routes / types / UI pages? | **No** |
| `leads:*` permissions? | **No** (docs only) |
| Production Lead data to migrate? | **None** — greenfield expand |
| Safe to build? | **Yes** — greenfield with naming collision awareness |

**Overall:** Lead product is **empty** (docs/spec only). Contact/Company/Deal create paths exist and must be reused. Pipeline stage named `"Lead"` and contact widgets labeled “leads” are **mislabels**, not entities.

---

## 1. Existing Lead-like tables / routes / types

### Absent (confirmed)

- No `createTable('leads')` in any migration  
- No `LeadTable` on Kysely `Database`  
- No `apps/api/src/routes/**/leads*`  
- No `/v1/leads` in v1 router index  
- No `/crm/leads` web pages  
- No `lead_id` FK columns on live tables  
- No `leads:*` in `packages/modules/src/crm/index.ts`

### Present leftovers (not Lead entity)

| Remnant | Path | Risk for 3A.2 |
|---------|------|----------------|
| Pipeline stage name `"Lead"` | `seed-pipeline.ts`, migrations, demo seed | Name collision in UI copy — keep stage; new nav **Leads** must be distinct |
| Contact widgets “New Leads Today” / “Lead Status” | `NewLeadsTodayWidget.tsx`, `ContactStatusWidget.tsx` | Mislabel — still query **contacts**; rename later or leave (do not treat as Lead API) |
| Badge `statusColor.lead` | `Badge.tsx` | Legacy deal-stage color |
| Event alias `lead.created` → `crm.lead.created` | `packages/events/src/aliases.ts` | Placeholder — no emitter yet; **reuse** |
| `deals.customer_party_id` stub | Deal migration + integrity reject | **Out of 3A.2** — do not wire CustomerParty |
| `conversion_templates` / `record_conversions` | Pipeline-engine tables | Generic record conversion — **unused**, not Lead convert |
| Docs APIs `/v1/leads`, `crm.leads.*` | CRM_SPEC / PHASE-3A plan | Spec namespace differs from live `contacts:*` style — **follow live `leads:*` like `deals:*`** |

---

## 2. Duplicate / overlapping customer concepts

| Concept | Live? | Overlap |
|---------|-------|---------|
| **Contact** | Yes — person, email unique per tenant | Post-convert person of record |
| **Company** | Yes — org, no unique website | Optional account on convert |
| **Deal** | Yes — canonical (3A.1 frozen) | Optional opportunity on convert |
| **Lead** | Docs only | Pre-qualification acquisition |
| **CustomerParty** | Stub column only | **Deferred** — not 3A.2 |
| Contact `status` `prospect\|customer\|…` | Yes | Soft “lead-like” on contacts — **keep**; do not replace with Lead table semantics |
| Pipeline stage “Lead” | Yes | Funnel stage ≠ Lead entity |

**Rule for 3A.2:** Lead ≠ Contact ≠ Company ≠ Deal. Conversion links them via explicit lineage; do not silently rename contacts into leads.

---

## 3. Reusable Contact / Company identity fields

### Contact (`ContactTable`)

| Field | Use for Lead / dedup |
|-------|----------------------|
| `email` (required) | Primary duplicate key — `lower(email)` unique index |
| `phone` (nullable) | Soft match after normalize |
| `name` | Display + Contact create |
| `company_id` | Link after Company resolve |
| `owner_id` | Ownership continuity |
| `workspace_id` + `deleted_at` | Tenant scope |

**Missing on Contact (do not add in 3A.2):** `first_name`/`last_name` split — Lead may store them; map to Contact `name` on convert.

### Company (`CompanyTable`)

| Field | Use |
|-------|-----|
| `name` | Soft match |
| `website` | Domain-ish match (parse host); **no unique index** |
| `workspace_id` + `deleted_at` | Tenant scope |

**No `domain` column** — normalize from `website` or Lead provisional company name.

---

## 4. Existing APIs that may conflict

| Spec / leftover | Live | Resolution |
|-----------------|------|------------|
| Docs `POST /api/v1/leads` | Missing | Implement `/api/leads` + `/v1/leads` matching Deal pattern |
| Module `apiPrefixes` includes `/conversions` | No router | Leave orphan; Lead uses `/api/leads/:id/convert` |
| Contact widgets labeled Leads | Contacts API | Do not mount Lead behind contacts routes |
| Plugin `contacts.create` / `deals.create` | Exists | Conversion uses **internal service helpers**, not HTTP round-trip |

---

## 5. Indexes useful for duplicate detection

| Index | Table | Use |
|-------|-------|-----|
| `contacts_workspace_email_unique_idx` `(workspace_id, lower(email)) WHERE deleted_at IS NULL` | contacts | **Hard** contact uniqueness; conversion must reuse on match |
| `contacts_email_trgm_idx` / `contacts_name_trgm_idx` | contacts | Optional search UX |
| Companies | — | **None** for website/name — app-level match only |

**Lead table (proposed):** soft indexes on `(workspace_id, lower(email))`, phone digits — **not** global unique across tenants; soft unique within tenant for open leads optional (prefer warn + candidates over hard block).

---

## 6. All code paths that create contacts / companies / deals

### Contacts

| Path | File | Notes |
|------|------|-------|
| `POST /api/contacts` | `routes/contacts.ts` | Email dupe 409; TX + `contact_count`; activity + webhook + `emitCrmEvent` |
| `POST /api/contacts/import` | same | Bulk; email set dedupe |
| `POST /v1/contacts` | `routes/v1/contacts.ts` | Thinner — DB unique only |
| Plugin `contacts.create` | contacts bridge | No dupe check / events |
| Seeds / fixtures | `seed-demo.ts`, live `fixtures.ts` | Direct insert |

### Companies

| Path | File | Notes |
|------|------|-------|
| `POST /api/companies` | `routes/companies.ts` | No dedupe |
| Import / v1 / bridge | same family | No website unique |
| Seeds / fixtures | — | Direct insert |

### Deals (canonical — **only** path for conversion)

| Path | File | Notes |
|------|------|-------|
| `POST /api/deals` | `routes/deals.ts` | `withUnitOfWork` → insert `deals` → `upsertPipelineItemFromDeal` → `onDealCreated` |
| `POST /v1/deals` | `routes/v1/deals.ts` | Same dual-write |
| Plugin `deals.create` | `pipelines.ts` bridge | Same UoW |
| Item create | `pipeline-items.ts` | Reverse projection — **do not use for Lead convert** |
| Seed-demo Deal insert | `seed-demo.ts` | May skip item projection — **do not copy** |

**3A.2 rule:** Conversion creates Deals **only** via shared Deal create helper / same UoW pattern as `deals.ts` — never mutate `pipeline_items` directly.

---

## 7. Tenant / RBAC / outbox patterns to reuse

| Concern | Pattern |
|---------|---------|
| Scope | `workspace_id` (= tenant id in outbox `tenantId`) + `deleted_at IS NULL` |
| Session RBAC | `requirePermission('leads:…')` via `createRequirePermission` |
| Feature gate | `requireCrmFeature('crm:leads')` + submodule |
| Deal integrity | `assertDealRelations` for pipeline/stage/owner/contact/company |
| Outbox | `withUnitOfWork` + `EventRecorder`; job `crm.lead.record` (ack) like Deal |
| Hub events | `emitCrmEvent(..., 'crm.lead@v1', …)` after commit |
| Isolation tests | Extend `crm-isolation.live.test.ts` + fixtures |

---

## 8. Activity / tasks

| Model | Linkage | 3A.2 posture |
|-------|---------|--------------|
| `activities` | `contact_id`, `record_id` (legacy FK to `pipeline_records`) | **Minimal** — optional `meta.lead_id` or activity after convert with `contact_id`; no polymorphic redesign |
| `tasks` | `contact_id`, `record_id` | Document Lead FK for **3A.5**; optional nullable `lead_id` only if cheap — prefer `meta` / lineage table |
| `pipeline_activity` | Deal/item id | Unchanged |

Larger polymorphic activity cleanup → **Phase 3A.5**.

---

## 9. Recommended canonical Lead shape (audit proposal — finalize in plan)

Proposed columns (workspace-scoped):

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `workspace_id` | Tenant |
| `name` | Display (required) |
| `first_name` / `last_name` | Optional |
| `email` / `phone` / `alternate_phone` | Nullable; normalized helpers for dedup |
| `company_name` | Provisional org text before Company exists |
| `website` | Provisional domain/URL |
| `source` | String |
| `status` | Enum lifecycle (server-validated) |
| `rating` | Optional `hot\|warm\|cold` or int — prefer enum |
| `owner_id` | Required (user in workspace) |
| `contact_id` / `company_id` / `deal_id` | Nullable FKs set on convert |
| `notes` | Text |
| `custom_fields` | JSONB |
| `converted_at` / `converted_by` | Set once |
| `lost_reason` | For lost/unqualified |
| `deleted_at` + timestamps | Soft delete |

**Lineage table:** `lead_conversion_links` (`lead_id`, `entity_type`, `entity_id`, `action` create|reuse, `created_at`, `workspace_id`) — explicit, not JSON-only.

**Status model (proposed):**  
`new → contacted → qualified → converted`  
terminals/side: `unqualified | lost | abandoned`  
Transitions validated server-side; `converted` only via convert endpoint.

---

## 10. Risks & non-goals

| Risk | Mitigation |
|------|------------|
| UI confuses Lead stage vs Lead entity | Clear nav label **Leads**; avoid renaming pipeline stage in 3A.2 |
| Contact email unique blocks convert create | Reuse Contact on email match |
| Double conversion / retry | Idempotent convert: if already `converted`, return existing links (200/409 policy documented) |
| Deal dual-write drift | Call Deal service only |
| Activity FK breakage | Don’t set `activities.record_id` to Lead id |

**Non-goals:** CustomerParty, Products, Quotes, Finance, WhatsApp, Voice, dropping `pipeline_items`, destructive migrations, redesigning Activities.

---

## 11. Audit gate

```
AUDIT = COMPLETE
PRODUCTION LEAD DATA = NONE (greenfield)
SAFE TO IMPLEMENT 3A.2 = YES
```

Next: `PHASE-3A-2-LEAD-IMPLEMENTATION-PLAN.md` then code.
