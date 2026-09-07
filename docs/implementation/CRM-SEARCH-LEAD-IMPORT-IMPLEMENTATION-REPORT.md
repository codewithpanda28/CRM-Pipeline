# CRM Block 1 — Implementation Report

| Field | Value |
|-------|-------|
| Status | **COMPLETE** |
| Date | 2026-09-06 |
| Requirements | REQ-CRM-008 · REQ-CRM-002 |
| Plan | [CRM-SEARCH-LEAD-IMPORT-PLAN.md](./CRM-SEARCH-LEAD-IMPORT-PLAN.md) |
| Scope | Global CRM search + lead import/export/bulk only |

**Block 2 was NOT started.**

---

## 1. Files changed

### DB
- `packages/db/migrations/20260906_005_crm_search_indexes.ts` (new)
- `packages/db/package.json` — migrate `--env-file` fixed to root `.env`

### API
- `apps/api/src/lib/crm/search.ts` (new)
- `apps/api/src/lib/crm/search.test.ts` (new)
- `apps/api/src/routes/crm-search.ts` (new)
- `apps/api/src/routes/crm-search.test.ts` (new)
- `apps/api/src/lib/leads/import.ts` (new)
- `apps/api/src/lib/leads/import.test.ts` (new)
- `apps/api/src/lib/leads/index.ts` — export import helpers
- `apps/api/src/routes/leads.ts` — `/export`, `/import/preview`, `/import/commit`, `/bulk`
- `apps/api/src/index.ts` — mount `GET /api/crm/search`
- `apps/api/src/test/live/app.ts` — mount search for live suite
- `apps/api/src/test/live/crm-isolation.live.test.ts` — Block 1 isolation case

### Web
- `apps/web/modules/shared/components/GlobalSearch.tsx` (new)
- `apps/web/modules/shared/components/Topbar.tsx` — GlobalSearch + Ctrl/⌘K
- `apps/web/modules/crm/leads/components/LeadCsvImportExport.tsx` (new)
- `apps/web/modules/crm/leads/components/LeadsBoard.tsx` — import/export + bulk bar
- `apps/web/modules/crm/leads/lib/leads.ts` — `bulkLeads`

### Dev fix (unrelated blocker)
- `apps/updater/package.json` — `--env-file=../../.env` so `turbo/pnpm dev` no longer dies on missing `apps/updater/.env`

---

## 2. Migration

`20260906_005_crm_search_indexes`

- `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- GIN trgm indexes (`IF NOT EXISTS`):
  - `leads_workspace_name_trgm_idx` on `leads(name)`
  - `leads_workspace_email_trgm_idx` on `leads(email)`
  - `leads_workspace_company_name_trgm_idx` on `leads(company_name)`
  - `companies_workspace_name_trgm_idx` on `companies(name)`
  - `deals_workspace_name_trgm_idx` on `deals(name)`
  - `customer_parties_workspace_display_name_trgm_idx` on `customer_parties(display_name)`
- Contacts trgm indexes left untouched (already present from `20260615_003`)
- No new tables

Applied successfully to local DB; `@vencore/db` build copies migration into `dist/migrations` for live migrator.

---

## 3. API contracts

### `GET /api/crm/search?q=&types=&limit=`
- Auth + CRM module gate
- `q` min 2 / max 200; `limit` default 8 / max 15
- Envelope: `{ data: { query, results, counts }, error }`
- Hit: `{ entity_type, id, title, subtitle, href, rank }`
- Fixed type order: lead → contact → company → customer_party → deal → quote → invoice → payment → task
- Within type: rank ASC, title ASC, id ASC
- Per-type permission skip (no whole-search 403)
- Tenant scope + soft-delete (parties exclude `merged`); CRM `tasks` only (no `deleted_at`)
- Fan-out `Promise.all`, one query per enabled type (no N+1)

### Lead export — `GET /api/leads/export?status=&owner_id=&q=`
- Perm: `leads:view`
- CSV columns match import template
- Cap **5000** → `413 EXPORT_TOO_LARGE`
- Audit: `crm.leads.export`

### Lead import
- `POST /api/leads/import/preview` — no writes
- `POST /api/leads/import/commit` — chunked TX (≤100)
- Perm: `leads:create`
- Max **1000** rows
- Default `skip_email_duplicates: true` (open-lead email → skip, no overwrite/merge)
- Contact-only / phone soft matches: warn, still allow create
- Audit: `crm.leads.import`

### Lead bulk — `POST /api/leads/bulk`
- `{ action: 'assign'|'status'|'delete', ids[], owner_id?, status? }`
- Cap **100** ids; soft-delete only; never bulk-convert
- Perm: `leads:edit` (assign/status) / `leads:delete` (delete)
- Audit: `crm.leads.bulk`

---

## 4. UI changes

- Topbar: global search control + Ctrl/⌘K palette (debounce 250ms, keyboard nav, grouped results)
- Leads: Template / Import CSV (preview→confirm) / Export CSV
- Leads: checkbox selection + bulk status / assign-to-me / soft-delete bar

Deep links match plan (`/crm/leads`, `/crm/contacts?focus=…`, parties/deals/quotes/invoices/payments/tasks).

---

## 5. Permission behavior

| Surface | Behavior |
|---------|----------|
| Search buckets | Silent skip if missing `:view` (or module disabled via `userHasPermission`) |
| Export | `leads:view` |
| Import | `leads:create` |
| Bulk assign/status | `leads:edit` |
| Bulk delete | `leads:delete` |
| No new permission keys | Confirmed |

---

## 6. Audit events

| Action | Meta highlights |
|--------|-----------------|
| `crm.leads.export` | `row_count`, `filters` |
| `crm.leads.import` | `created`, `skipped`, `duplicate`, `failed`, `row_count` |
| `crm.leads.bulk` | `action`, `updated`, `failed`, `id_count` |

Via `recordSecurityAudit` → `security_audit_events`.

---

## 7. Isolation evidence

Live suite `crm-isolation.live.test.ts` — **16/16 passed**, including new case:

`CRM search + lead import/export/bulk isolation (Block 1)`

Evidence covered:
- Tenant A search finds A lead; Tenant B search does not leak A lead id
- Import preview does not change lead counts
- Commit skips open-lead email duplicate; creates non-dupe row
- Export CSV does not contain Tenant B secret contact email
- Bulk status updates A lead; Tenant B bulk-delete of A lead updates 0 and does not soft-delete A row

Command:

```text
ALLOW_LIVE_DB_TESTS=1
DATABASE_URL_TEST=…/vencore_isolation_test
DATABASE_URL=…/vencore_dev   # must differ
vitest run --config vitest.live.config.ts src/test/live/crm-isolation.live.test.ts
```

---

## 8. Performance verification

- Indexes present in `vencore_isolation_test` (catalog check):
  - `leads_workspace_name_trgm_idx`, `leads_workspace_email_trgm_idx`, `leads_workspace_company_name_trgm_idx`
  - `companies_workspace_name_trgm_idx`, `deals_workspace_name_trgm_idx`
  - `customer_parties_workspace_display_name_trgm_idx`
  - plus existing `contacts_name_trgm_idx` / `contacts_email_trgm_idx`
- Sample `EXPLAIN` on tiny fixture data for `leads.name ILIKE '%acme%' LIMIT 8` chose an existing btree (`leads_workspace_owner_idx`) with filter — expected at near-empty scale; trgm usefulness shows up on larger name corpora.
- **No p95 &lt; 500ms claim** — not measured against a representative large dataset

---

## 9. Tests / regression

| Check | Result |
|-------|--------|
| Unit: search helpers | pass |
| Unit: import preview/commit/dupe policy | pass |
| Unit: search RBAC skip | pass |
| Unit: existing leads routes | pass |
| Live CRM isolation (incl. Block 1) | **16/16 pass** |
| Web `tsc --noEmit` | pass |
| Finance / Ops / Automation regression | **not run** — no shared Finance ledger / Ops / Automation runtime code touched (only Topbar UX + CRM/leads/search) |

---

## 10. Known limitations

- Lead search href is list `/crm/leads` (no detail route yet)
- Company search href is list `/crm/companies`
- Payment href is list `/finance/payments`
- Import does not support custom_fields or destructive merge
- Bulk assign UI only offers “Assign to me” (API supports any tenant owner_id)
- Global search does not rate-limit beyond existing API middleware
- `%q%` ILIKE still sequential at very large scale; trgm helps but SMB-scale assumed

---

## 11. Non-goals confirmation

NOT started / NOT touched beyond read for search:
- Block 2 (quote/cash, subscriptions, Automation R2B, etc.)
- Voice / WhatsApp / AI
- Platform billing / subscriptions
- Finance ledger / accounting rules
- Ops R1/R2 redesign
- PM task write model
- CustomerParty identity model changes

---

## 12. Local run note

Previous failure (`ERR_NETWORK_IO_SUSPENDED` on `localhost:3000` + turbo dying on updater `.env`) fixed by:
1. Correct updater env path
2. Starting API (`:3001`) and web (`PORT=3000`)

App responds: web **200** on `http://localhost:3000`, API health **ok** on `:3001`.

---

*End of CRM Block 1 implementation report.*
