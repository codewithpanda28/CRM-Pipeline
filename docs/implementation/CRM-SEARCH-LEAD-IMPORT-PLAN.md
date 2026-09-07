# CRM Block 1 — Global Search + Lead Bulk Import/Export

| Field | Value |
|-------|-------|
| Status | **IMPLEMENTED** — see [CRM-SEARCH-LEAD-IMPORT-IMPLEMENTATION-REPORT.md](./CRM-SEARCH-LEAD-IMPORT-IMPLEMENTATION-REPORT.md) |
| Date | 2026-09-06 |
| Requirements | REQ-CRM-008 · REQ-CRM-002 (import/export/actions hardening) |
| Audit | [THINKAIQ-MASTER-REQUIREMENTS-GAP-AUDIT.md](./THINKAIQ-MASTER-REQUIREMENTS-GAP-AUDIT.md) |
| Canonical PRD | [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md) |
| Positioning | White-Label Business CRM — **not** Voice-optimized |

**Rule:** Do not start Block 2 (quote/cash, subscriptions, Automation R2B, etc.). Do not touch Finance ledger rules, PM task writes, Ops R1/R2 freeze beyond shared CRM task *read* for search.

---

## 0. Discovery summary (reuse map)

### 0.1 What exists

| Asset | Path / evidence | Reuse |
|-------|-----------------|-------|
| PM FTS search | `apps/api/src/routes/pm-search.ts` | Fan-out + limit pattern only — **not** FTS for emails/phones |
| Messaging FTS | `routes/messaging/search.ts` | Zod query + RBAC gate pattern |
| CRM list `q` ILIKE | leads, contacts, companies, parties, quotes, invoices | Match predicates per entity |
| Contact trgm indexes | `20260615_003_contacts_hardening.ts` | Model for new trgm indexes |
| Lead soft duplicates | `apps/api/src/lib/leads/duplicates.ts` | Import preview/commit |
| Contacts/companies CSV | `GET/POST …/export|import` + `CsvImportExport` | Export shape; lead needs **preview+commit** |
| CSV helpers | `apps/api/src/lib/csv.ts`, `web/…/csv.ts` | `toCSV` / `parseCSV` / `downloadCSV` |
| Security audit | `recordSecurityAudit` | Import commit + export |
| Tenant export jobs | `tenant_export_jobs` / ops export | **Not** for everyday lead CSV (point users if over cap) |
| Permission middleware | `requirePermission` + CRM feature gates | Per-entity `:view` for search buckets |
| Topbar | `Topbar.tsx` title + actions | Mount global search entry (no Cmd+K today) |

### 0.2 What is missing

- No `GET /api/crm/search` (or `/api/search`)
- No lead CSV import/export routes
- No lead bulk endpoints
- No global search UI / keyboard palette
- No name/trgm indexes on leads, companies, deals, customer_parties (contacts already have trgm)

### 0.3 Explicit non-reuse

| Do not | Why |
|--------|-----|
| Messaging english FTS for CRM names | Wrong for email/phone/numbers |
| `tenant_export_jobs` for day-to-day lead CSV | MFA/ops package dump; wrong UX |
| Generic multi-entity import framework | Out of scope |
| Destructive merge on import | No supported merge policy for leads |
| PM `project_tasks` write | Read-only task title search on CRM `tasks` only |
| External search (Meilisearch/ES) | PRD/Phase-3A: PostgreSQL first |

---

## 1. Goals / non-goals

### Goals

1. Tenant-scoped **global CRM search** across major CRM + commercial entities listed below, with RBAC and deep links.
2. Lead **CSV export** (sync, capped) with audit.
3. Lead **CSV import** with validate → preview → commit, soft-duplicate policy, audit, summary.
4. **Minimal** bulk actions justified by existing model: assign, status, soft-delete (capped ids) — no convert bulk, no new action framework.

### Non-goals

- Voice/WhatsApp/AI · Automation R2B · billing/subscriptions · Finance accounting rule changes · Ops redesign · lead detail page · custom_fields import · full BI search · streaming CSV farm

---

## 2. Global search design (REQ-CRM-008)

### 2.1 API

```
GET /api/crm/search?q=&types=&limit=
```

| Param | Rules |
|-------|--------|
| `q` | Required; trim; **min 2**, max 200 chars |
| `types` | Optional comma list; default = all permitted types |
| `limit` | Per-type max hits; default **8**, max **15** |

**Envelope:** `{ data: { query, results, counts }, error }`  
**Hit shape (stable):**

```ts
{
  entity_type: 'lead' | 'contact' | 'company' | 'customer_party' | 'deal' | 'quote' | 'invoice' | 'payment' | 'task',
  id: string,
  title: string,          // primary label
  subtitle: string | null, // email, stage, number, etc.
  href: string,           // deep link
  rank: number            // tie-break within type (0 = best)
}
```

**Ordering:** Results grouped in fixed type order (below). Within type: `rank ASC`, then `title ASC`, then `id ASC`. No cross-type relevance score v1 (stable > clever).

**Type order:** lead → contact → company → customer_party → deal → quote → invoice → payment → task

### 2.2 Entity match fields + hrefs

| Type | Match (ILIKE / lower LIKE) | Title / subtitle | `href` |
|------|---------------------------|------------------|--------|
| lead | name, email, company_name, phone | name · email/company | `/crm/leads` (no detail route; optional `?highlight=` later) |
| contact | name, email | name · email | `/crm/contacts` (id in query or existing drawer pattern; prefer `/crm/contacts?focus={id}` if list supports, else list) |
| company | name | name | `/crm/companies` |
| customer_party | display_name | display_name · party_type | `/crm/customer-parties/{id}` |
| deal | name | name · status | `/crm/deals/{id}` |
| quote | quote_number | quote_number · status | `/crm/quotes/{id}` |
| invoice | invoice_number | invoice_number · status | `/finance/invoices/{id}` |
| payment | payment_number; optional join invoice_number | payment_number · amount | `/finance/payments` |
| task | title (CRM `tasks` only) | title · status | `/crm/tasks` |

Always: `workspace_id = auth.workspace.id`, `deleted_at IS NULL` (and parties not `merged` where applicable).

### 2.3 RBAC

Before querying a bucket, require the corresponding permission (skip bucket silently if missing — do not 403 whole search):

| Type | Permission | Module gate |
|------|------------|-------------|
| lead | `leads:view` | crm:leads |
| contact | `contacts:view` | crm |
| company | `companies:view` | crm |
| customer_party | `customers:view` | crm |
| deal | `deals:view` | crm |
| quote | `quotes:view` | crm |
| invoice | `invoices:view` | finance |
| payment | `payments:view` | finance |
| task | `tasks:view` | crm |

Admin / `grants_all`: all buckets.  
Mount: `requireAuth` + CRM module (or soft-skip finance buckets when finance disabled). Prefer single router that checks per-bucket perms.

### 2.4 Query strategy (no N+1)

- One SQL query per enabled type, `Promise.all` fan-out (like `pm-search`).
- Bound parameters; escape `%`/`_` in user `q` for LIKE.
- Select only columns needed for hit shape.
- No per-row follow-up queries in v1.

### 2.5 Indexes (additive, evidence-based)

Contacts already have trgm. Add **only if missing** (verify in migrator before create):

| Index | Justification |
|-------|----------------|
| `leads_workspace_name_trgm` GIN `(workspace_id, name gin_trgm_ops)` or expression on `lower(name)` | List + search ILIKE on name |
| `leads_workspace_phone_trgm` optional if phone search heavy | Same |
| `companies_workspace_name_trgm` | Company search |
| `deals_workspace_name_trgm` or btree `(workspace_id, lower(name))` | Deal name search (list has no text search today) |
| `customer_parties_workspace_display_name_trgm` | 360 search |

Quote/invoice **unique number** indexes already help prefix/equality; LIKE `%q%` still sequential — acceptable at SMB scale with `LIMIT`. Skip payment-specific text index in v1.

Enable `pg_trgm` if not already (contacts migration likely did).

Migration name (tentative): `YYYYMMDD_00N_crm_search_indexes.ts` — indexes only, no new tables.

### 2.6 UI

- **Entry:** Search control in dashboard shell Topbar (right of title / left of notifications) — matches empty Topbar action area.
- **Palette:** Modal/popover panel (reuse ConfirmDialog/Modal tokens; messaging SearchPanel patterns for debounce/empty/error only — do not extend messaging).
- **Behavior:** Debounce ~250ms; min 2 chars; loading skeleton; empty “No results”; error toast; group by `entity_type` with labels; click → `router.push(href)` + close.
- **Keyboard:** `Ctrl+K` / `⌘K` to open (new convention — document in plan; Topbar has no prior Cmd+K). Escape closes; ArrowUp/Down + Enter navigate results.
- **Do not** invent a new design system.

### 2.7 Performance budget

- Target interactive: typical tenant, p95 &lt; 500ms for `q` length ≥2 with all buckets.
- Cap concurrent SQL at number of types (≤9).
- Reject empty/whitespace; rate-limit not required beyond existing API middleware.

---

## 3. Lead export (REQ-CRM-002)

### 3.1 API

```
GET /api/leads/export?status=&owner_id=&q=
```

- Permission: `leads:view` (align with contacts; optional later split `leads:export`)
- Same filters as list where reasonable
- Soft-deleted excluded
- Hard cap: **5_000** rows → if more, `413` / error code `EXPORT_TOO_LARGE` with message to narrow filters (or use ops tenant export for dumps)
- Response: `text/csv` via `toCSV`
- Columns (import-compatible):  
  `name,first_name,last_name,email,phone,alternate_phone,company_name,website,source,status,rating,owner_id,notes`
- Audit: `crm.leads.export` with `{ row_count, filters }`

### 3.2 UI

- Wire `CsvImportExport` (or Lead-specific wrapper) on Leads Topbar / board toolbar — same placement as contacts/companies.
- Preserve current list filters into `exportParams` when exporting from board.

---

## 4. Lead import (REQ-CRM-002)

### 4.1 APIs

```
POST /api/leads/import/preview
POST /api/leads/import/commit
```

Permission: `leads:create` (contacts pattern).  
Body: `{ rows: Record<string,string>[], options?: { skip_email_duplicates?: boolean } }`  
Max rows: **1_000** · Max payload ~5MB (mirror client CSV guard).

**Preview (no writes):**

- Zod-validate each row (required `name` or first+last → composed name)
- Normalize email/phone
- Resolve `owner_id` if provided; else actor; reject unknown owner in tenant
- Status must be allowed create statuses (not `converted` via import)
- Soft-dupe via `findLeadDuplicates` / batch email lookup against open leads + contacts
- Return:

```ts
{
  total: number,
  valid: number,
  invalid: number,
  duplicate_warnings: number,
  rows: Array<{
    index: number,
    status: 'ok' | 'error' | 'duplicate_warn',
    errors?: string[],
    duplicate_refs?: Array<{ kind: string, id: string, label?: string }>,
    normalized?: { …fields }
  }>
}
```

**Commit:**

- Accept only rows that were `ok` or (if `skip_email_duplicates === false`) explicitly allow duplicate_warn — **default: skip email-matched open leads** (no silent overwrite)
- Insert in chunks (≤100) inside workspace-scoped TX(s)
- Never create cross-tenant FKs
- Idempotent-safe: same email open lead → skip with reason `duplicate` (not update)
- Summary: `{ created, skipped, duplicate, failed, errors: […] }`
- Audit: `crm.leads.import` with summary counts

### 4.2 Duplicate policy (locked)

| Signal | Import behavior |
|--------|-----------------|
| Email matches open lead (same tenant) | **Skip** on commit (default); warn on preview |
| Email matches contact only | Warn; still allow create (existing create behavior) |
| Phone / company-name soft matches | Warn only; allow create |
| Explicit overwrite/merge | **Not supported** |

### 4.3 UI

- Entry on Leads page: Import / Export / Template
- Flow: upload → call preview → show table of errors/warnings → Confirm import → show summary
- Optional download of error rows CSV
- Extend `CsvImportExport` with preview mode **or** thin `LeadCsvImportDialog` reusing `parseCSV` — prefer dedicated dialog for preview to avoid breaking contacts/companies sync import

---

## 5. Lead bulk actions (minimal)

```
POST /api/leads/bulk
{ action: 'assign' | 'status' | 'delete', ids: uuid[], owner_id?: uuid, status?: string }
```

| Action | Permission | Rules |
|--------|------------|--------|
| assign | `leads:edit` | Cap **100** ids; owners must be workspace users; skip converted if product rule requires |
| status | `leads:edit` | Same transitions as PATCH; never set `converted` via bulk |
| delete | `leads:delete` | Soft-delete only |

- One workspace filter; return `{ updated, failed, errors }`
- Audit: `crm.leads.bulk` with action + counts
- UI: checkbox column on LeadsBoard + compact bar (pattern from CRM tasks BulkActionBar)
- **No** bulk convert

---

## 6. Permissions

| Key | Use | Default roles |
|-----|-----|---------------|
| Existing `leads:view/create/edit/delete` | Export / import / bulk | Unchanged |
| No new keys in v1 | Avoid entitlement drift | — |

Document that import = create volume; export = view. Split `leads:import|export` only if product later requires.

---

## 7. Files to add/change (planned)

### API

- `apps/api/src/routes/crm-search.ts` (new) + mount in `index.ts`
- `apps/api/src/lib/crm/search.ts` (query helpers, escape LIKE, hit mappers)
- `apps/api/src/routes/leads.ts` — export, import preview/commit, bulk
- `apps/api/src/lib/leads/import.ts` (normalize/validate/commit)
- Tests: `crm-search.test.ts`, `leads-import.test.ts` (+ live isolation cases)

### DB

- Migration: trgm indexes (leads/companies/deals/customer_parties) after `CREATE EXTENSION IF NOT EXISTS pg_trgm`

### Web

- `modules/shared/components/GlobalSearch.tsx` (or `modules/crm/search/…`)
- Wire into shell/Topbar
- Leads page: import dialog + export + bulk bar
- Hooks for search/import

### Docs

- This plan → after impl: `CRM-SEARCH-LEAD-IMPORT-IMPLEMENTATION-REPORT.md` (not in Phase 0)

---

## 8. Testing strategy

| Layer | Cases |
|-------|--------|
| Unit | LIKE escape; hit ranking/order; import normalize; skip-dupe policy |
| API | Search RBAC (member missing `invoices:view` skips invoices); tenant isolation; pagination/limit; import preview no write; commit creates/skips; export cap; bulk assign |
| Live | Two tenants — search/import/export must not leak |
| Regression | CRM leads/contacts/deals suites; web typecheck; Finance only if shared helpers touched; Ops/Automation **not** unless shared infra touched |

Do not claim COMPLETE from unit tests alone.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Lead href has no detail page | Link to `/crm/leads`; accept until detail route exists |
| `%q%` ILIKE on large tables | Limits + trgm indexes; monitor |
| Import double-submit | Skip-on-email-dupe; optional client disable during commit |
| Contacts `CsvImportExport` breakage | Lead uses dedicated preview dialog |
| Permission confusion | Document reuse of create/view/edit |

---

## 10. Acceptance checklist (implementation phase)

- [ ] `GET /api/crm/search` returns RBAC-filtered, tenant-scoped hits with hrefs
- [ ] UI global search with loading/empty/error + keyboard open
- [ ] Lead export CSV + audit + row cap
- [ ] Lead import preview + commit + summary + audit + no silent overwrite
- [ ] Bulk assign/status/delete capped
- [ ] Indexes migration applied where justified
- [ ] Live isolation + CRM regression green
- [ ] Implementation report with limitations

---

## 11. Implementation order (after plan approval)

1. Migration indexes (`pg_trgm` + missing GIN/btree)  
2. `lib/crm/search` + `GET /api/crm/search` + unit/RBAC tests  
3. Global search UI  
4. Lead export + audit  
5. Lead import preview/commit + UI  
6. Lead bulk assign/status/delete + UI  
7. Live isolation + regression + implementation report  

---

*End of Phase 0 design. No code, migrations, or schema changes were made producing this document.*
