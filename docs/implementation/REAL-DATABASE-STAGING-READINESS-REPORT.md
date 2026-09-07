# ThinkAIQ — Real Database / Staging Readiness Report

| Field | Value |
|-------|-------|
| Status | **STAGING SCHEMA READY · PRODUCTION BLOCKED** (see blockers) |
| Date | 2026-09-07 |
| Scope | Ops readiness only — **no product feature changes** |
| Fresh DB verified | `thinkaiq_staging` (Postgres 16.15, localhost) |
| Restore target | `thinkaiq_staging_restore` |

---

## Executive verdict

| Area | Result |
|------|--------|
| Fresh Postgres + migrations from zero | **PASS** (83 migrations, 179 tables) |
| Migration idempotency | **PASS** (re-run → “No pending migrations”) |
| No dependency on isolation DB for migrate | **PASS** (staging DB independent) |
| Seed / first-tenant bootstrap | **PARTIAL** — `/setup` works for workspace+admin+modules; gaps for tenants row / employee profile / DPR |
| Redis reachability | **PASS** (PONG on `127.0.0.1:6380`) |
| BullMQ workers start | **NOT EXERCISED this session** (documented; requires `REDIS_URL` + worker process) |
| Object storage (R2) | **NOT CONFIGURED** — local filesystem fallback exists |
| Email / SMTP | **NOT CONFIGURED** — paths documented; no smoke send |
| End-to-end business smoke on fresh staging | **NOT RUN** (schema ready; tenant bootstrap + SMTP/R2 incomplete) |
| Backup dump + restore | **PASS** on fresh staging dump |
| Security hygiene | **MIXED** — `.env` gitignored; **current app `DATABASE_URL` points at isolation test DB** |
| Production launch | **BLOCKED** until blockers in §12 cleared |

---

## 1. Exact environment variables required

### Required to boot API / worker (Zod `apiEnvSchema`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL SoR — **must be real app/staging DB, never `*_isolation_test` / `*_test`** |
| `JWT_SECRET` | Session/JWT signing |
| `CRON_SECRET` | Internal cron auth |
| `SSH_ENCRYPTION_KEY` | 64-char hex (32 bytes) |

Defaults used if unset: `NODE_ENV`, `PORT=3001`, `APP_URL`, `JOBS_RUNTIME=bullmq`, `UPDATER_URL`.

### Required for web

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Browser app origin |
| `NEXT_PUBLIC_API_URL` | API origin |

### Required when `JOBS_RUNTIME=bullmq` (default)

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | BullMQ + messaging; worker **exits** without it in bullmq mode |

### Optional but needed for full staging fidelity

| Variable | Purpose |
|----------|---------|
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | S3-compatible object storage |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` / `EMAIL_FROM`, `SMTP_SECURE` | Notification / auth email env relay |
| `COOKIE_SECURE` | Prod cookie Secure flag override (`false` to disable) |
| `MAIL_ENCRYPTION_KEY` | Mail account ciphertext (64 hex) |

### Test-only (never for running app SoR)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL_TEST` | Live isolation suite only |
| `ALLOW_LIVE_DB_TESTS=1` | Gate for live DB tests (`NODE_ENV=test`) |
| `REDIS_URL_TEST`, `ALLOW_LIVE_QUEUE_TESTS` | Queue integration tests |

### Doc vs code

| Stale doc name | Actual |
|----------------|--------|
| `SESSION_SECRET` | `JWT_SECRET` |
| `STORAGE_*` | `R2_*` |

Updated: `.env.example` now documents staging DB, R2, SMTP, cookies.  
`docs/deployment/ENVIRONMENT_CONFIGURATION.md` remains high-level / partially stale — prefer `.env.example` + this report.

### Critical local finding (this machine)

Current root `.env` has:

```text
DATABASE_URL=…/vencore_isolation_test
```

That is **unsafe for staging/app runtime**. Isolation DB is for `DATABASE_URL_TEST` only. Point app `DATABASE_URL` at `thinkaiq_staging` (or a dedicated production DB) before any client/staging use.

---

## 2. Migration result

| Check | Result |
|-------|--------|
| Command | `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/thinkaiq_staging` → `npx tsx packages/db/src/migrate.ts` (from `packages/db`) |
| Fresh empty DB | Created `thinkaiq_staging` |
| Applied | **83** migrations (`20240101_001_initial_schema` … `20260906_005_crm_search_indexes`) |
| Tables | **179** in `public` |
| Core tables present | `deals`, `leads`, `customer_parties`, `invoices`, `journal_entries`, `employee_profiles`, `tasks`, … |
| Ordering | Lexicographic filename; Kysely `Migrator`; colocated `*.test.ts` / `*.helpers.ts` filtered |
| Idempotent re-run | **PASS** — “No pending migrations.” |
| Isolation DB dependency | **None** — staging DB migrated independently of `vencore_isolation_test` |
| Prod note | API auto-migrates only when `NODE_ENV=production`; staging should always run `pnpm db:migrate` / `scripts/migrate.ps1` explicitly |

---

## 3. Seed / bootstrap result

### Intended path (no code changes)

1. Migrate empty DB.  
2. Start API + web.  
3. Open **`/setup`** → `POST /api/setup` (`apps/api/src/routes/setup.ts`).  
4. Creates: **workspace**, **admin user**, **Administrator/Member roles**, **workspace_modules** from feature flags, optional SMTP in `system_settings`, marks setup configured.  
5. Ops R1 migration **backfills** `employee_profiles` only for users that exist **at migrate time**. Admin created **after** migrate needs **`POST /api/ops/employees`** (or equivalent) before DPR.  
6. Module backfill for older tenants: `pnpm exec tsx apps/api/src/scripts/backfill-modules.ts`.

### Gaps (documented blockers, not fixed in this pass)

| Expectation | Reality |
|-------------|---------|
| Create first **tenant** row | Setup inserts **workspaces** only; `tenants` / `tenant_memberships` created in live fixtures / tenancy backfill for *pre-existing* workspaces at migrate time — **not** on post-migrate setup |
| Auth dual-read | Middleware allows `user.workspace_id === activeTenantId` without membership — may work for single-tenant setup |
| Employee profile | **Not** created by setup; DPR fails without profile (`NO_EMPLOYEE`) |
| Entitlements | Setup seeds selected features; ensure CRM/Finance/Ops enabled in wizard + backfill if registry grew later |

**Bootstrap result this session:** Schema ready; **setup wizard not executed** against `thinkaiq_staging` (would require long-running API against that URL). Treat tenant bootstrap as **operational step remaining**.

---

## 4. Redis / jobs result

| Check | Result |
|-------|--------|
| TCP `127.0.0.1:6380` | Open |
| RESP `PING` | **PONG** |
| Config in local `.env` | `REDIS_URL=redis://127.0.0.1:6380` |
| Guidance | `docs/operations/REDIS-JOB-RUNTIME.md` — Redis ≥5 (7.x recommended); BullMQ prefix `thinkaiq:` |
| Worker start | `pnpm --filter @vencore/worker dev` — **not started in this readiness pass** |
| API BullMQ consumers | Start with API when `JOBS_RUNTIME=bullmq` + `REDIS_URL` |
| Failed jobs | Retries + PermanentJobError; outbox SoR; `GET /api/ops/outbox/failed` + replay — **web/API must not crash on job failure** by design |
| Production Redis HA | **Still required** for production (managed HA + TLS) — staging may use single Redis |

---

## 5. Storage result

| Check | Result |
|-------|--------|
| R2 env vars in local `.env` | **MISSING** |
| Local fallback | `apps/api/storage/` **exists**; document keys `tenants/{workspaceId}/documents/...` |
| Tenant isolation helper | `assertDocumentKeyForWorkspace` / `tenants/{id}/…` |
| Messaging presign | Requires R2 — **503 if unset** |
| Live evidence | Prior `storage-isolation.live.test.ts` / Phase-5 document drills on isolation DB |

**Staging:** usable for local PDF filesystem path; **cloud object storage not verified** this session.

---

## 6. Email result

| Check | Result |
|-------|--------|
| SMTP env in local `.env` | **MISSING** |
| Config paths | Env relay (`notifications/bus.ts`) **or** setup wizard → `system_settings` |
| Auth without SMTP | Password reset / invites → `SMTP_NOT_CONFIGURED` (503) |
| Smoke send | **Not run** (no SMTP credentials) |
| Recommendation | Configure staging SMTP (Mailhog/SES/etc.) and send one invite or notification |

---

## 7. Complete business smoke test result

### Requested chain

Lead → Contact/CustomerParty → Deal → Pipeline move → Quote → Invoice → Payment → GL → Ops task → DPR

### This session on `thinkaiq_staging`

| Step | Status |
|------|--------|
| Schema support for all entities | **PASS** (tables present) |
| Executed end-to-end with real data | **NOT RUN** |

### Existing evidence (composed live suites — isolation DB, not staging)

| Stage | Live suite coverage |
|-------|---------------------|
| Lead / Deal / CustomerParty / Quote | `crm-isolation.live.test.ts` |
| Invoice / Payment | `finance-isolation.live.test.ts` |
| GL / journals | `accounting-isolation.live.test.ts`, Phase-5 ops/documents |
| Ops task | `business-ops-isolation.live.test.ts` |
| DPR | Partial (`GET /api/ops/dpr/me`) — needs `employee_profiles` |

**No single live test** runs the full chain in one flow. Staging sign-off should run a **manual or scripted smoke** after setup against `thinkaiq_staging` with `DATABASE_URL` corrected.

### Suggested staging smoke procedure (ops)

1. Point `DATABASE_URL` → `thinkaiq_staging`; migrate; start API/web/worker.  
2. Complete `/setup` (CRM + needed modules).  
3. Create employee profile for admin (`POST /api/ops/employees`).  
4. Create lead → convert (contact + party + deal) → move stage → quote → accept → invoice from quote → record payment → confirm journal → create ops task with `related_deal_id` → open DPR.  
5. Record pass/fail in this report’s appendix on next drill.

---

## 8. Backup / restore result

| Field | Value |
|-------|-------|
| Source | `thinkaiq_staging` (fresh migrated empty schema) |
| Method | `pg_dump -F c` → `tmp/staging-readiness/thinkaiq-staging-20260907.dump` (**513,308** bytes) |
| Dump time | ~1.1s |
| Restore target | `thinkaiq_staging_restore` |
| Restore | `pg_restore --clean --if-exists --no-owner --no-acl` exit **0** (~6.6s) |
| Integrity | restore DB: **83** migrations, **179** tables |
| Measured RPO (this drill) | Dump-based ≈ seconds (empty schema) |
| Measured RTO (this drill) | **&lt; 10s** dump+restore for empty schema; app smoke not re-run |
| Prior Phase-5 drill | `docs/operations/BACKUP-RESTORE-DRILL.md` — **PASS** on isolation→`vencore_restore_drill` with app smoke (~5 min RTO) |
| Targets (policy) | RPO ≤ 24h dump / ≤ 5–15 min PITR; RTO ≤ 4h |
| Artifact hygiene | `tmp/` added to `.gitignore` |

---

## 9. Security checks

| Check | Result |
|-------|--------|
| `.env` in git | **Ignored** (`.gitignore`); not tracked |
| Secrets committed | No evidence `.env` tracked; do not commit dumps under `tmp/` |
| Test DB as app SoR | **FAIL locally today** — `DATABASE_URL` → `vencore_isolation_test` |
| Test credentials in `.env.example` | Placeholder / local defaults only — rotate for real staging |
| Cookie Secure | Production: Secure unless `COOKIE_SECURE=false` (`auth.ts` / setup) |
| Tenant isolation | Live isolation suite remains gate; staging must not share isolation DB |
| RBAC | Setup seeds Admin/Member; production needs least-privilege review |
| Redis password / TLS | Local Redis open; **prod requires auth + TLS** |
| Backups documented | Yes — this report + `BACKUP-RESTORE-DRILL.md` |

---

## 10. What was changed in-repo (non-product)

| Change | Why |
|--------|-----|
| `.env.example` | Document staging DB, R2, SMTP, cookies; warn against isolation DB as `DATABASE_URL` |
| `.gitignore` → `tmp/` | Keep dump artifacts out of git |
| This report | Staging readiness record |

**No CRM/Finance/Ops/Pipeline/Automation product redesign.**  
**Not started:** Sales Completion, Quote/Cash enhancements, subscriptions, platform billing, Voice, WhatsApp, AI.

---

## 11. How to point local app at fresh staging

```powershell
# DB already created + migrated this session
# In .env (do not commit):
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/thinkaiq_staging
# DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/vencore_isolation_test
# ALLOW_LIVE_DB_TESTS=0   # when running the app
# REDIS_URL=redis://127.0.0.1:6380

pnpm db:migrate   # should say no pending
pnpm --filter @vencore/api dev
pnpm --filter @vencore/worker dev
pnpm --filter @vencore/web dev
# Browser → /setup
```

Re-migrate from absolute zero:

```powershell
$env:PGPASSWORD='postgres'
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -U postgres -h localhost -c "DROP DATABASE IF EXISTS thinkaiq_staging;"
& 'C:\Program Files\PostgreSQL\16\bin\psql.exe' -U postgres -h localhost -c "CREATE DATABASE thinkaiq_staging OWNER postgres;"
cd packages\db
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/thinkaiq_staging'
npx tsx src/migrate.ts
```

---

## 12. Blockers before production

1. **`DATABASE_URL` must not be an isolation/test database** (fix local `.env` now).  
2. **Complete first-tenant bootstrap** on staging: `/setup` + verify login + enable CRM/Finance/Ops modules.  
3. **Create `employee_profiles` for admin** before DPR / ops hierarchy.  
4. **Confirm or patch setup → `tenants` / `tenant_memberships` dual-write** (current setup is workspace-centric; auth dual-read may mask gaps — validate before multi-tenant prod).  
5. **Configure SMTP** and prove one outbound email.  
6. **Configure R2 (or approved S3)** for messaging uploads + durable document blobs (filesystem is staging-only).  
7. **Start worker + API with BullMQ**; confirm queues healthy; failed-job UI/replay.  
8. **Run full business smoke** on staging SoR (chain in §7).  
9. **Managed Redis HA + TLS** for production (see REDIS-JOB-RUNTIME.md).  
10. **Scheduled backups + restore drill** on the *production-candidate* DB (not only empty schema); retain dumps off-host; encrypt at rest.  
11. **Rotate all secrets** (`JWT_SECRET`, `CRON_SECRET`, `SSH_ENCRYPTION_KEY`, DB password) away from local defaults.  
12. **Do not claim production** until Phase-5 style backup restore **with app smoke** is re-logged against the candidate DB.

---

## 13. Summary table for stakeholders

| Gate | Status |
|------|--------|
| Fresh DB migrate from zero | **PASS** |
| Deterministic / idempotent migrate | **PASS** |
| Independent of isolation test DB (migrate) | **PASS** |
| Seed/bootstrap complete | **PARTIAL** |
| Redis PING | **PASS** |
| Workers / BullMQ exercised | **PENDING** |
| Storage R2 | **PENDING** |
| Email smoke | **PENDING** |
| Full Lead→…→DPR smoke on staging | **PENDING** |
| Backup / restore (schema dump) | **PASS** |
| Security / env hygiene | **BLOCKED** until `DATABASE_URL` fixed + secrets rotated |
| Production ready | **NO** |

---

*End of readiness report. Product feature work was intentionally not started.*
