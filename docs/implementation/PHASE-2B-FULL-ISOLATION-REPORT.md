# PHASE-2B-FULL-ISOLATION-REPORT.md

**Milestone:** Phase 2B Coding Task 2 — Full live tenant isolation matrix  
**Date:** 2026-09-04 (re-verified)  
**Status:** **Complete** (live suite + regression + browser smoke)

Related: [PHASE-2B-ROUTE-COVERAGE.md](./PHASE-2B-ROUTE-COVERAGE.md) · [PHASE-2B-IDOR-FINDINGS.md](./PHASE-2B-IDOR-FINDINGS.md) · [PHASE-2B-LIVE-ISOLATION-IMPLEMENTATION.md](./PHASE-2B-LIVE-ISOLATION-IMPLEMENTATION.md) · [THINKAIQ-BRANDING-IMPLEMENTATION-REPORT.md](./THINKAIQ-BRANDING-IMPLEMENTATION-REPORT.md)

---

## Routes

See `PHASE-2B-ROUTE-COVERAGE.md`.

| Metric | Value |
|--------|-------|
| Mount prefixes audited | **40+** |
| Unclassified | **0** |
| Classes | PUBLIC / PLATFORM / TENANT / TENANT-OPTIONAL / WEBHOOK / INTERNAL |
| Critical IDOR fixed | Pipeline `stage_id` ownership (`assertStageOwnedByPipeline`) |

---

## Surfaces tested (live)

Contacts · companies · pipelines/stages/items · tasks · activities · projects · messaging channels/messages · storage keys · API keys (`/v1`) · webhooks + deliveries · notifications · tenant branding/settings · lifecycle statuses · multi-membership · platform boundary (tenants/outbox/audit) · servers list sample.

---

## IDOR

| Finding | Status |
|---------|--------|
| Stage-by-ID without pipeline/tenant ownership | **FIXED** + live regression |
| API key without lifecycle gate | **FIXED** |
| Missing tenant branding SoR APIs | **ADDED** `/api/tenant/branding\|settings` |
| Platform inspection mounts | **ADDED** behind `requirePlatformAdmin` |
| Known critical IDOR remaining | **None** |

Deferred non-critical: plugin/portal/SSH-WS matrix, instance `/api/config` appearance, API-key/webhook *permission* gating (privilege ≠ cross-tenant).

---

## Live PostgreSQL

| Item | Value |
|------|-------|
| Engine | PostgreSQL 16 (local Windows) |
| Database | `vencore_isolation_test` |
| URL | `DATABASE_URL_TEST` only (`safe-db.ts` guards) |
| Migrations | Same `@vencore/db` `migrate()` as app |
| Fixtures | Tenant A/B + multiUser + platform principal |

**Local tip:** If `.env` `DATABASE_URL` equals `DATABASE_URL_TEST`, unset `DATABASE_URL` before live runs (guard rejects equality).

---

## Storage

Live HTTP `/api/__live/storage/check` + messaging attachment reject for cross-tenant keys.  
`assertObjectKeyBelongsToTenant` exercised. R2 signed URLs: **503 STORAGE_NOT_CONFIGURED** when unset — key namespace still tenant-bound.

---

## Cache

Permission/module/branding keys tenant-prefixed. Warm-A → request-B proved no A leak (branding + contacts).

---

## API keys

A/B get/list/revoke + `/v1/contacts` cross-tenant deny. Suspended lifecycle blocks mutations.

---

## Webhooks

Subscription list/delete + delivery list gated by subscription ownership. Secrets not leaked to A.

---

## Settings + branding

Host-bound `tenant_branding` / settings GET/PATCH. A cannot read/patch B. Platform defaults separate (`PLATFORM_IDENTITY` / ThinkAIQ CRM).

---

## Lifecycle

HTTP gates for provisioning / active / suspended / archived / deleting verified.

---

## Membership

Host+JWT mismatch · body tenant reject · multiUser host-bound A/B · userA cannot access/switch to B · switch audited.

---

## Platform boundary

Tenant JWT denied `/api/platform/*`. Platform JWT can list tenants / outbox / security audit.

---

## CI

`.github/workflows/ci.yml` job **`live-isolation`**:

- Postgres 16 service container  
- `ALLOW_LIVE_DB_TESTS=1`  
- `DATABASE_URL_TEST=…/vencore_isolation_test`  
- `pnpm --filter @vencore/api test:live-isolation`  

**Status:** Implementation-ready and wired in CI (no manual local PG required for CI).

---

## Tests (this re-verification)

| Suite | Result |
|-------|--------|
| Live isolation | **40/40 PASS** (8 files) |
| API unit | **415/415 PASS** |
| API `tsc --noEmit` | **OK** (via test/typecheck exit 0) |
| Web `type-check` | **PASS** |

Live breakdown:

| File | Tests |
|------|-------|
| `tenant-auth.live.test.ts` | 8 |
| `crm-isolation.live.test.ts` | 9 |
| `storage-isolation.live.test.ts` | 5 |
| `api-key-isolation.live.test.ts` | 4 |
| `webhook-isolation.live.test.ts` | 2 |
| `settings-branding.live.test.ts` | 4 |
| `lifecycle.live.test.ts` | 5 |
| `platform-boundary.live.test.ts` | 3 |

---

## Browser verification

| Item | Value |
|------|--------|
| Frontend | **http://localhost:3002** |
| Backend | **http://localhost:3001** |
| Branding | **ThinkAIQ CRM** + official mark |
| Login | PASS (`usera@isolation.test`) |
| Dashboard | Pipeline A / Stage A board loads |
| Blank / 500 | None observed |
| Branding regression | None |

### Responsive

| Width | Overflow | Brand / nav |
|-------|----------|-------------|
| **390** | no | ThinkAIQ CRM OK |
| **768** | no | OK |
| **1280** | no | OK |

### Noise (not isolation)

- Pre-existing Sidebar hydration overlay  
- Webhook-delivery worker HMAC object-payload noise in API logs  

---

## Remaining risks

- Full plugin / portal / nested PM / SSH-WS matrix deferred  
- Instance `/api/config` still global appearance (tenant SoR = `tenant_branding`)  
- WS `?token=` + legacy `user.workspace_id` (ADR-023)  
- BullMQ / outbox publisher — **next milestone (not started)**  
- Rate-limit memory fallback / MFA / RLS / custom TLS — open foundation items  

---

## Production status

**Not yet safe for real multi-tenant production traffic.**

Task 2 critical CRM/auth/storage/API-key/webhook/lifecycle/membership/platform isolation is **proven** against real Postgres. Treat as **staging / PR gate passed**, not production go-live, until outbox/BullMQ, WS hardening, and remaining deferred surfaces are closed.

---

## Commands

```text
# Live (unset DATABASE_URL if it equals TEST)
$env:NODE_ENV='test'; $env:ALLOW_LIVE_DB_TESTS='1'
$env:DATABASE_URL_TEST='postgresql://postgres:postgres@localhost:5432/vencore_isolation_test'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
pnpm --filter @vencore/api test:live-isolation   # 40/40

pnpm --filter @vencore/api test                  # 415/415
pnpm --filter @vencore/web type-check
```

**STOP** — do not start BullMQ / outbox / worker migration automatically.
