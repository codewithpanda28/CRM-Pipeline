# ThinkAIQ — Real Database Connection Verification Report

| Field | Value |
|-------|-------|
| Status | **CONNECTED · CRM READY FOR REAL DATA (LOCAL → RAILWAY SoR)** |
| Date | 2026-09-07 (updated: tenant provisioning consistency fix) |
| Scope | Runtime connection + bootstrap + smoke + tenant dual-write fix — **no new product features** |
| Verdict | **YES** — user can safely start using the CRM with real data on this setup |

---

## Runtime distinction (critical)

| Instance | What it is | SoR |
|----------|------------|-----|
| **LOCAL APP** | `localhost:3000` (web) + `localhost:3001` (API) + local worker | **Railway Postgres** via public TCP proxy |
| **RAILWAY DATA** | Postgres + Redis services on project `calm-purpose` | Hosted DB/Redis (not a hosted ThinkAIQ web deploy in this pass) |
| **PRODUCTION APP** | Not deployed / not verified here | N/A |

This pass intentionally points the **local** ThinkAIQ processes at the **Railway** database as the application source of truth. It is **not** “production app deploy.” Treat secrets as **staging/local-against-Railway**, not hardened production.

---

## 1. Actual DATABASE_URL target

Verified from live `.env` + `psql` / health (passwords omitted):

| Setting | Value |
|---------|-------|
| App `DATABASE_URL` host | `altaria.proxy.rlwy.net` |
| App `DATABASE_URL` port | `49793` |
| App database name | **`railway`** |
| App DB user | `postgres` |
| `DATABASE_URL_TEST` | `localhost:5432` / **`vencore_isolation_test`** (isolation only) |
| `ALLOW_LIVE_DB_TESTS` | `0` |
| Running API health | `api=ok`, `db=ok`, `redis=ok` |

**Confirmed:** application SoR is **not** `vencore_isolation_test` and not any `*_test` database.

### Other runtime env (local app)

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `development` |
| `APP_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| `REDIS_URL` | Railway public proxy `altaria.proxy.rlwy.net:22073` |
| `JOBS_RUNTIME` | `bullmq` |
| R2 / SMTP | **not set** in `.env` |

---

## 2. Migration status

| Check | Result |
|-------|--------|
| Reachable | **PASS** |
| `pnpm --filter @vencore/db db:migrate` | **No pending migrations** |
| Migration rows (`kysely_migration`) | **84** (includes `20260907_001_backfill_workspace_tenants`) |
| Expected CRM / ops / finance tables present | **PASS** — `deals`, `leads`, `contacts`, `companies`, `customer_parties`, `pipelines`, `pipeline_items`, `quotes`, `invoices`, `payments`, `tasks`, `employee_profiles`, `dpr_entries`, `targets`, `automation_rules` |

Fresh Railway DB was migrated earlier in this effort (empty → full schema). No manual SQL applied.

---

## 3. Tenant / bootstrap status

| Check | Result |
|-------|--------|
| Setup flow | Used existing `/api/setup` on unconfigured Railway DB |
| Workspace | **1** (`workspaces`) |
| Admin user | **1** — `admin@thinkaiq.local` |
| Admin role / modules | CRM, Finance, Operations, Automation enabled via setup |
| Employee profile | **1** (created via existing `/api/ops/employees`) |
| `tenants` / `tenant_memberships` rows | **1 / 1** after backfill — `tenants.id === workspaces.id` |

Auth for interactive CRM resolves via **workspace** + canonical **tenant** dual-read (ADR-017). BullMQ `loadTenant` now finds the row (see §15).

**Login for local use:** `admin@thinkaiq.local` / password set at setup (`ThinkAIQ-Admin-2026!`). Rotate before any shared/staging exposure.

---

## 4. Auth status

| Check | Result |
|-------|--------|
| API `POST /api/auth/login` | **PASS** (JWT returned) |
| Web UI login (`/login` → pipeline) | **PASS** |
| Active workspace resolution on API calls | **PASS** (`workspace_id` on created rows) |
| Data source | Rows verified in DB name **`railway`** on Railway host |

---

## 5. CRM smoke result

| Step | Result |
|------|--------|
| Company / contact / CustomerParty | **PASS** |
| Lead create + read-back | **PASS** |
| Global search `GET /api/crm/search?q=Acme` | **PASS** |
| Lead import preview/commit | **PASS** (`/api/leads/import/*`) |
| Lead export CSV | **PASS** (`GET /api/leads/export`) |
| Task with `related_deal_id` | **PASS** (after fixing `tasks` route not stuffing deal id into `record_id`) |

DB counts after smoke (selected): leads **2**, parties **1**, deals **1**, pipeline_items **1**, deal-linked tasks **1**.

---

## 6. Pipeline smoke result

| Step | Result |
|------|--------|
| Deal via `POST /api/deals` (DealCreate path) | **PASS** — customer attached |
| Appears on `GET /api/pipelines/:id/items` | **PASS** |
| Cards UI shows deal | **PASS** — “Acme expansion deal / Acme Staging Co / ₹125,000” in Qualified |
| Compact Board tab selectable | **PASS** (same pipeline data source) |
| Stage movement | **PASS** (API earlier in session; deal sits in Qualified) |

---

## 7. Finance smoke result

| Step | Result |
|------|--------|
| Quote with line item (₹125,000) | **PASS** |
| Send → accept | **PASS** |
| Invoice from quote | **PASS** |
| Issue invoice + GL journals | **PASS** (2 journal entries) |
| Payment (`method: bank`) | **PASS** |

Note: an earlier zero-line quote/invoice correctly failed issue with `ACCOUNTING_POST_FAILED:invalid_line`. Re-tested with real lines → success. Empty-line quotes are invalid for issue, not a DB connectivity failure.

---

## 8. Operations / DPR result

| Step | Result |
|------|--------|
| Employee profile | **PASS** |
| `GET /api/ops/today` | **PASS** |
| Web `/ops/today` | **PASS** — shows “Follow up proposal” for Acme deal |
| `GET /api/ops/dpr/me` | **PASS** (draft DPR present) |

---

## 9. Redis / worker result

| Check | Result |
|-------|--------|
| Redis host | `altaria.proxy.rlwy.net:22073` (Railway, not local test Redis) |
| `PING` | **True** |
| Worker start (`pnpm --filter @vencore/worker dev` + root `.env`) | **PASS** — BullMQ publisher/consumers/schedulers started |
| Safe jobs | **PASS** — e.g. `infra.db.health`, `pm.due.soon` completed |
| Failed/rejected jobs | **Before fix:** CRM tenant jobs → `TENANT_NOT_FOUND`. **After fix:** `rejectedTotal: 0`; `crm.customer_party.record` **acknowledged** |
| Automation runtime | **Not modified** |

---

## 10. R2 / storage result

| Check | Result |
|-------|--------|
| `R2_*` configured | **NO** |
| Cloud upload/download smoke | **NOT RUN** (would be fabricated if claimed) |

**CRM core can run.** Durable cloud document storage remains **pending**. Local filesystem document fallback may still apply where coded.

---

## 11. SMTP result

| Check | Result |
|-------|--------|
| `SMTP_*` configured | **NO** |
| Test email | **NOT SENT** |

Email delivery remains **pending**. Does not block interactive CRM data entry.

---

## 12. Security checks

| Check | Result |
|-------|--------|
| App SoR ≠ `*_test` / isolation DB | **PASS** |
| Isolation DB only on `DATABASE_URL_TEST` | **PASS** |
| `.env` untracked / gitignored | **PASS** (`gitignore` matches `.env`) |
| Default/placeholder secrets | `JWT_SECRET` is a **local-smoke** placeholder — OK for local, **rotate** before shared staging/production |
| CORS / app URLs | Match localhost web/API for this local runtime |
| Cookie Secure for HTTPS production | N/A (`NODE_ENV=development`, http localhost) |
| `.env.example` Redis credential scrub | Placeholder restored (had briefly contained a live Railway Redis password pattern) — **rotate Redis password in Railway if that example was ever pushed** |
| Tenant isolation | Workspace-scoped writes confirmed; canonical `tenants` row now exists with same UUID as workspace |

**Do not** point this local JWT/placeholder setup at a true production customer environment without rotating secrets and deploying proper hosts/cookies.

---

## 13. Exact remaining blockers

### Do **not** block interactive CRM real-data use on LOCAL → Railway

None for core CRM (leads, customers, deals/pipeline, quotes→invoice→payment, ops today/DPR read paths).

### Remaining gaps (non-blocking for CRM entry, blocking for “full production”)

1. **No Railway-hosted web/API deploy** — only local processes + Railway data.
2. **R2 / SMTP not configured** — documents cloud + email pending.
3. **Local-smoke JWT / secrets** — rotate before any shared staging.
4. **Browser Compact Board visual card list** not exhaustively re-asserted after tab switch (Cards + API items confirmed).

### Code touch during this verification (minimal)

- `apps/api/src/routes/tasks.ts` — stop aliasing `related_deal_id` into `record_id` (FK to `pipeline_records`); required for deal follow-up tasks.
- `.env` (gitignored) — Railway Postgres + Redis SoR.
- `.env.example` — staging warnings / Redis placeholder hygiene.
- Tenant provisioning consistency (§15): setup dual-write + idempotent backfill migration.

No Sales Completion, Finance ledger redesign, Automation runtime changes, or Pipeline product features beyond connection / provisioning consistency.

---

## 14. Exact answer

**Can the user now safely start using the CRM with real data?**

# **YES**

Condition: use the **LOCAL** ThinkAIQ app (localhost) against this **Railway** database as SoR, with the bootstrapped admin account. Do not treat this as a finished production multi-tenant cloud deploy until R2/SMTP, secret rotation, and hosted app deploy are completed.

---

## 15. Tenant provisioning consistency fix (2026-09-07)

### Root cause

ADR-017 / ADR-024: **canonical tenant boundary is `tenants.id`**, dual-read with **`tenants.id === workspaces.id`** (same UUID). Migration `20260904_001` backfilled tenants only for workspaces that already existed at migrate time.

`POST /api/setup` (and first-boot `seedOnFirstBoot`) created **workspace + user + modules/roles** but **did not** insert `tenants` / `tenant_memberships` / companion rows. Interactive auth fell back to legacy `users.workspace_id`, so CRM UI worked. Outbox jobs used `tenantId = workspace_id`; BullMQ `assertJobAllowed` → `loadTenant(tenants)` → **null** → permanent `TENANT_NOT_FOUND`.

### Fix (no second tenant system)

| Change | Purpose |
|--------|---------|
| `apps/api/src/lib/provision-workspace-tenant.ts` | Idempotent dual-write helper (`ensureWorkspaceTenantRecords`) |
| `apps/api/src/routes/setup.ts` | Call helper in the same setup transaction after admin user |
| `apps/api/src/lib/seed.ts` | Same dual-write on first-boot / repair path |
| `packages/db/migrations/20260907_001_backfill_workspace_tenants.ts` | Idempotent `INSERT … ON CONFLICT DO NOTHING` backfill for existing installs |

Setup remains **retry-safe**: existing workspace still returns `ALREADY_CONFIGURED`; helper uses conflict-no-ops (no duplicates).

### Before / after job behavior

| | Before | After |
|--|--------|-------|
| `tenants` / `tenant_memberships` | 0 / 0 | **1 / 1** (`id` matches workspace `370ce195-…`) |
| Worker `crm.customer_party.record` | Rejected `TENANT_NOT_FOUND` | **Acknowledged** (`crm.customer_party.updated`) |
| Worker `rejectedTotal` (post-fix) | >0 for tenant CRM jobs | **0** |
| Outbox CRM events | Published, consumers rejected | Published; tenant gate passes |

### Real CRM data preserved

Non-destructive only. Confirmed after backfill on Railway db `railway`:

| Entity | Count (post-fix) |
|--------|-------------------|
| workspaces | 1 |
| tenants | 1 (same id) |
| leads | 4 (smoke artifacts retained + new) |
| deals | 1 |
| payments | 1 |

No `DROP` / `TRUNCATE` / isolation reset / CRM row deletion.

### Tests run

- Unit: `provision-workspace-tenant.test.ts`, `setup-route.test.ts`, migration safety test — **PASS**
- `pnpm --filter @vencore/api exec tsc --noEmit` — **PASS**
- Web `tsc` — pre-existing `.next` route-type noise (unrelated to this change)
- Live: login, lead create, customer party patch, worker job ack — **PASS**

**Not declared production-ready** — local app + Railway SoR staging posture unchanged (secrets/R2/SMTP/hosted deploy still pending).
