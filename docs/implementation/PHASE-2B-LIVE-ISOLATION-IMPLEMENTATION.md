# PHASE-2B-LIVE-ISOLATION-IMPLEMENTATION.md

**Milestone:** Phase 2B Coding Task 1 — Live PostgreSQL isolation harness  
**Status:** Complete  
**Constraint:** Real Postgres only; no BullMQ/outbox/feature work  

---

## Existing test infrastructure (inventory)

| Piece | Location | Notes |
|-------|----------|-------|
| Unit test runner | Vitest via `apps/api` `pnpm test` | Mocks DB heavily |
| Existing isolation unit tests | `apps/api/src/__tests__/isolation*.ts` | Mocked `TenantContext` / DB — **not** live |
| Route tests (projects, etc.) | `*.test.ts` colocated | `supertest` + mocked Kysely chains |
| Docker Postgres | `docker-compose.yml` service `db` | Timescale PG15; DB name `vencore` (optional) |
| Local Postgres | Windows service `postgresql-x64-16` | Used for this milestone validation |
| Migrations | `packages/db` `migrate()` / `runMigrations()` | Same path as app |
| HTTP helpers | ad-hoc per test file | Live harness adds shared helpers |
| Seed helpers | `seedWorkspaceRoles`, `seedWorkspaceModules`, `assignRole` | Reused by fixtures |

### Reuse

- Vitest + supertest  
- `createDb` + `migrate` from `@vencore/db`  
- `createRequireAuth`, contacts/companies routers  
- `seedWorkspaceRoles` / `seedWorkspaceModules` / `assignRole`  
- Same migration folder as production app  

### Must add (done)

- `DATABASE_URL_TEST` + multi-layer production URL guard  
- Live harness (`apps/api/src/test/live/`)  
- Deterministic fixtures A/B/multiUser  
- Minimal Express app mounting real auth + CRM routes  
- Vitest live config (serial)  
- Integration suite + IDOR findings doc  

### Test DB lifecycle

1. Assert safety guards (`assertSafeTestDatabaseUrl`)  
2. Ensure DB `vencore_isolation_test` exists (`CREATE DATABASE` via admin `postgres` DB)  
3. `migrate(db)` to latest (same migrations as app)  
4. Truncate tenant-owned tables (`RESTART IDENTITY CASCADE`) + seed fixtures  
5. Run serial HTTP tests (`fileParallelism: false`, single fork)  
6. `db.destroy()`  

### Production DB safety

Refuse to run unless **all** of:

- `NODE_ENV=test`  
- `ALLOW_LIVE_DB_TESTS=1`  
- `DATABASE_URL_TEST` set (never fall back to `DATABASE_URL`)  
- `DATABASE_URL_TEST !== DATABASE_URL` when both set  
- URL host is `localhost` / `127.0.0.1` / `::1` / `db` only  
- Database name matches `/isolation_test|_test$/`  
- URL must not look production-like (`prod` / `production` / `staging` / `live` patterns)  

---

## Implemented

| Path | Role |
|------|------|
| `apps/api/src/test/live/safe-db.ts` | Production DB URL guards |
| `apps/api/src/test/live/db.ts` | Ensure DB + migrate + truncate |
| `apps/api/src/test/live/fixtures.ts` | tenantA/B, users, CRM + branding/settings/api/webhook/outbox fixtures |
| `apps/api/src/test/live/app.ts` | Minimal Express: real `requireAuth` + contacts/companies |
| `apps/api/src/test/live/http.ts` | JWT + supertest helpers |
| `apps/api/src/test/live/isolation.live.test.ts` | Live isolation suite (11 tests) |
| `apps/api/vitest.config.ts` | Excludes live suite from default `pnpm test` |
| `apps/api/vitest.live.config.ts` | Serial live Vitest config |
| `apps/api/package.json` | `test:live-isolation` script |
| `package.json` | root `test:live-isolation` |
| `.env.example` | `DATABASE_URL_TEST`, `ALLOW_LIVE_DB_TESTS` |
| `docs/implementation/PHASE-2B-IDOR-FINDINGS.md` | Contact/company/pipeline spot-check IDOR classifications |
| `docs/implementation/PHASE-2B-LIVE-ISOLATION-IMPLEMENTATION.md` | This report |

**Contact/company route code:** no critical IDOR fix required — already scoped by `workspace_id` from auth context. Live suite proves deny/allow behavior.

---

## Test environment

- Real PostgreSQL 16 (local Windows service), database `vencore_isolation_test`  
- Connection: `DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5432/vencore_isolation_test`  
- Migrations applied via `@vencore/db` `migrate()` — **not** a parallel fake schema  
- Serial Vitest fork; truncate + reseed in `beforeAll`  
- Host resolution via `TRUST_PROXY=true` + `X-Forwarded-Host` (`a.thinkaiq.com` / `b.thinkaiq.com`)  

Docker Compose `db` remains a supported alternative (host `db` or `localhost` with `vencore` credentials); Docker CLI was not available in this validation environment.

---

## Fixtures

| Entity | Notes |
|--------|-------|
| `tenantA` / `tenantB` | `workspaces` + `tenants` (same UUID), domains, settings, branding, job controls, modules, roles |
| `userA` → membership A | admin role on A |
| `userB` → membership B | admin role on B |
| `multiUser` → A + B | admin on both |
| Per tenant | contact, company, pipeline, stage, pipeline_item, task, activity, tag |
| Also | api_key, webhook_subscription, outbox_event, file object-key strings (`tenants/{id}/…`) |

Closest-real notes: file “metadata” is represented as storage key strings (no object-store row required for this milestone). No separate ThemeSnapshot UI table seeded.

---

## Tests

File: `apps/api/src/test/live/isolation.live.test.ts`

| # | Case | Result |
|---|------|--------|
| 1 | userA + Host A GET contact A (positive) | PASS |
| 2 | userA + Host A GET contact B (IDOR) → 403/404, no leak, no mutation | PASS |
| 3 | Host A + JWT A | PASS |
| 4 | Host B + JWT A → `HOST_JWT_MISMATCH` | PASS |
| 5 | Host A + JWT B → `HOST_JWT_MISMATCH` | PASS |
| 6 | body `tenantId=B` → `BODY_TENANT_REJECTED` | PASS |
| 7 | multiUser Host A / Host B access | PASS |
| 8 | userA attempting tenant B | PASS (deny) |
| 9 | userA GET company B deny | PASS |
| 10 | userA GET company A allow | PASS |
| 11 | userA create contact with B `company_id` deny + no insert | PASS |

**Live suite:** **11 passed / 11** (`pnpm test:live-isolation`)  
**Default unit suite:** **73 files / 412 passed** (`*.live.test.ts` excluded via `vitest.config.ts`).

---

## IDOR findings

See `PHASE-2B-IDOR-FINDINGS.md`.

Summary:

- Contacts + companies CRUD / v1: **safe by existing context** (`id` + `workspace_id`)  
- Cross-tenant `company_id`: **safe** (`INVALID_COMPANY`)  
- Pipeline/task primary paths: **safe by existing context**  
- Stage mutations after pipeline gate: **requires later Phase 2B** defense-in-depth (`pipeline_id` on stage update) — not a silent critical contact/company IDOR  

---

## Remaining risks

- Full isolation matrix (messaging, plugins, portal, infra, finance) not live-tested  
- Pipeline stage-by-id after pipeline ownership check still wants composite asserts  
- Live suite is opt-in (guards) — not yet a required CI job  
- Truncate list is curated; new tenant tables need adding to `resetLiveFixtureTables`  

---

## Production DB safety

Implemented in `safe-db.ts` (see inventory). Harness **never** reads `DATABASE_URL` for connections. Admin connect uses `/postgres` only to `CREATE DATABASE` the test DB name.

---

## Commands run

```powershell
# Create dedicated test DB (local PG16)
# CREATE DATABASE vencore_isolation_test;

$env:NODE_ENV='test'
$env:ALLOW_LIVE_DB_TESTS='1'
$env:DATABASE_URL_TEST='postgresql://postgres:postgres@localhost:5432/vencore_isolation_test'
$env:TRUST_PROXY='true'

pnpm --filter @vencore/db build
pnpm --filter @vencore/tenancy build
pnpm --filter @vencore/api exec vitest run --config vitest.live.config.ts
# → 11/11 passed

pnpm --filter @vencore/api lint
# → tsc --noEmit OK (after Express return-type fix)

pnpm --filter @vencore/api test
# → 73 files / 412 tests passed (live excluded)
```

No production database was configured or connected. Docker was unavailable; local Postgres 16 was used exclusively for `vencore_isolation_test`.

---

## Git/change summary

Additive test harness + docs + env example + scripts. No BullMQ/outbox/worker/finance/CRM-expansion changes. No destructive `workspace_id` migration. Contact/company production routes unchanged (already tenant-scoped; proven by live HTTP tests).

**STOP** — Phase 2B Task 1 complete. Do not proceed to full matrix / BullMQ / Outbox publisher in this milestone.
