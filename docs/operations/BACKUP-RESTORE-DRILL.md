# Backup & Restore Runbook — ThinkAIQ Production Business Core

**Status:** Operational procedure (verified 2026-09-05)  
**Date:** 2026-09-05  
**Scope:** Postgres primary data + Redis job state + document artifact storage

---

## 1. What to back up

| Asset | Method | Notes |
|-------|--------|-------|
| PostgreSQL | Nightly `pg_dump` **or** managed PITR / continuous WAL | Includes all tenant schemas/tables; financial journals + commercial Finance |
| Redis (jobs) | AOF or RDB snapshot | Jobs are rebuildable from `outbox_events` pending/failed; Redis loss ≠ data loss if outbox intact |
| Document artifacts | Object storage versioning / filesystem copy of `storage/tenants/**` | Keys are tenant-scoped |

---

## 2. Recommended RPO / RTO (targets — measure in your drill)

| Metric | Target |
|--------|--------|
| RPO | ≤ 24h for filesystem dumps; ≤ 5–15 min with PITR |
| RTO | ≤ 4h for full DB restore + smoke checks |

**Do not claim production-ready until a restore drill is executed and recorded below.**

---

## 3. Backup procedure (Postgres dump example)

```bash
# Example — adjust host/db/user for environment
pg_dump "$DATABASE_URL" --format=custom --file="thinkaiq-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Store dump off-host. Encrypt at rest if required by policy.

---

## 4. Restore procedure

1. Provision empty Postgres (same major version).
2. `pg_restore --clean --if-exists --dbname="$DATABASE_URL" thinkaiq-YYYYMMDD.dump`
3. Run app migrations only if dump is pre-migration (normally dump includes schema).
4. Restore Redis optional; if skipped, pending `outbox_events` will republish when worker starts.
5. Restore document storage keys if PDF artifacts required immediately.
6. Smoke: `GET /api/health` → db ok; login; open one invoice; open Trial Balance.

---

## 5. Verification drill log

| Field | Value |
|-------|-------|
| Drill date | 2026-09-05 (UTC drill window ~17:54–17:59Z) |
| Operator | Cursor agent (Phase 5 backup/restore drill) |
| Backup method used | `pg_dump --format=custom` of `vencore_isolation_test` → `tmp/backup-drill/thinkaiq-20260905T175411Z.dump` (440,997 bytes; Postgres **16.15**; backup start `2026-09-05T17:54:11.544Z`, end `2026-09-05T17:54:13.937Z`; exit 0) |
| Restore target | Dedicated DB **`vencore_restore_drill`** (created empty; **not** overwriting source). `pg_restore --no-owner --no-acl` exit 0; start `2026-09-05T17:54:35.919Z`, end `2026-09-05T17:54:45.656Z`. Counts matched source: tenants=2, users=3, tenant_memberships=4, invoices=3, accounts=8, journal_entries=2, document_artifacts=1. |
| Measured RPO | **~22 seconds** (dump completion → restore start; dump-based lag for this drill) |
| Measured RTO | **~4 minutes 52 seconds** (restore start → app smoke complete `2026-09-05T17:59:28.059Z`) |
| Result | **PASS** |
| Notes | Client tools: `C:\Program Files\PostgreSQL\16\bin` (`pg_dump`/`pg_restore`/`psql` 16.15). Integrity SQL on restore DB confirmed expected tables + finance/accounting rows. App smoke via `apps/api/scripts/backup-restore-smoke.ts` against restore URL only: health 200 (db ok), login `usera@isolation.test`, invoice `INV-0001`, Trial Balance balanced payload, 8 COA accounts, tenant B cross-read 404 / no leak, document artifact meta + filesystem PDF (29,308 bytes) download 200. Document **blob** lives outside Postgres (`apps/api/storage/...`); metadata restored from dump; file was present on this host so storage recovery was exercised. No Automation changes. |

**Gate:** `BACKUP RESTORE DRILL = PASS`

---

## 6. Retention

- Financial journals + invoices + audit: retain ≥ 7 years per policy doc (configurable).
- Soft-deleted commercial rows remain in DB until explicit purge (not in Phase 5).
- No destructive migrations of posted money.

---

## 7. Related

- Tenant export: `POST /api/ops/export` (admin + MFA if enrolled)
- Failed jobs: `GET /api/ops/outbox/failed` · `POST /api/ops/outbox/replay`
- Health: `GET /api/health`
- Repeatable smoke: `pnpm exec tsx scripts/backup-restore-smoke.ts` from `apps/api` with `RESTORE_DATABASE_URL=postgresql://…/vencore_restore_drill`
