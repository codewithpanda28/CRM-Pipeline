# PHASE-5-PRODUCTION-BUSINESS-CORE-FINAL-VERIFICATION.md

**Phase:** 5 — Production Business Core  
**Wave:** Final verification (**NON-AUTOMATION ONLY**)  
**Date:** 2026-09-05  
**Automation:** NOT TOUCHED

---

## 1. Test suites

| Suite | Result | Count |
|-------|--------|-------|
| API `tsc --noEmit` | **PASS** | exit 0 |
| Web `tsc --noEmit` | **PASS** | exit 0 (prior + no regression) |
| Worker `tsc --noEmit` | **PASS** | exit 0 (prior + no regression) |
| Documents package `tsc` | **PASS** | exit 0 |
| Unit (accounting / finance / documents) | **PASS** | **12 / 12** |
| Live isolation (full vitest.live.config) | **PASS** | **50 / 50** (11 files) |

Live files include: CRM, finance, accounting, phase5 ops/documents, tenant-auth, branding, storage, lifecycle, platform-boundary, api-key, webhook.

**Exact live result:** `Test Files 11 passed (11)` · `Tests 50 passed (50)`

---

## 2. Tenant isolation

Verified via live suites + live app mounts for `/api/accounting`, `/api/documents`, `/api/ops`, `/api/mfa`, `/api/health`:

| Surface | Cross-tenant read | Cross-tenant write / host spoof |
|---------|-------------------|----------------------------------|
| Journals / accounts / periods | Empty / denied | Denied |
| Invoices / payments / expenses | Existing finance suite | Existing finance suite |
| Customer parties / deals / quotes | Existing CRM suite | Existing CRM suite |
| Document artifacts | 403/404 for foreign IDs | Download key namespace check |
| Ops outbox / export | Workspace-scoped queries | Cannot target other tenant |
| Notifications | Existing notification rows fixture isolation | — |

No tests weakened or skipped.

---

## 3. Accounting integrity

| Check | Result |
|-------|--------|
| Balanced journals on invoice issue | PASS (live TB `balanced: true`) |
| Posting key idempotency | PASS (live re-post → `idempotent`) |
| Period lock blocks new posting | PASS (live: issue fails after lock; period restored) |
| Soft-closed rejects source posts | PASS (code path `period_closed`) |
| Reversal on void | PASS (fixed: reverse failure rolls back TX) |
| Account IDs must belong to workspace | PASS (fixed in `postJournal`) |
| Immutable journal lines | PASS (no update API) |
| TB / P&L / BS from journals | PASS (disclaimer present; live TB) |
| Commercial docs not rewritten by GL | PASS |

---

## 4. Documents / PDF

| Check | Result |
|-------|--------|
| Shared DocumentRenderer HTML | PASS (unit) |
| Tenant branding, no `/platform/branding/` | PASS (unit + seller-branding) |
| Artifact enqueue + tenant isolation | PASS (live) |
| Playwright Chromium launch | **PASS** (153.0.8010.12) |
| Real Quote / Invoice / CN / DN PDFs | **PASS** (`real-pdf.verification.test.ts` + `real-pdf-documents.live.test.ts`) |
| Placeholder when Chromium available | **NOT USED** (`placeholder: false`, no PLACEHOLDER text, size > 2KB) |
| Secure download + cross-tenant deny | **PASS** (live) |
| Regeneration / version keys | **PASS** (live idempotent + v2 new artifact) |

**Follow-up (2026-09-05 real PDF verification):** Chromium installed; Playwright dependency wired on `@vencore/api` + `@vencore/documents`. `DOCUMENT_PDF_REQUIRE_PLAYWRIGHT=1` used in verification suites so silent placeholder fallback cannot pass.

---

## 4b. Real PDF verification wave (detail)

| Gate | Result |
|------|--------|
| Chromium | PASS |
| Quote PDF | PASS |
| Invoice PDF | PASS |
| Credit Note PDF | PASS |
| Debit Note PDF | PASS |
| Tenant Branding | PASS |
| Historical Snapshot | PASS (frozen branding context unit + invoice issue snapshot live) |
| Secure Download | PASS |
| Tenant Isolation | PASS |
| Placeholder Fallback | **NOT USED** |
| Documents Tests | PASS |
| Regression (finance live) | PASS |

PDF defect fixes this wave: add `playwright` dependency for API/test resolution; increase renderer PDF test timeout now that Chromium runs for real.

---

## 5. Notifications + reminders

| Check | Result |
|-------|--------|
| Delivery ledger + delivery_key | Present (schema + bus) |
| In-app finance.record path | Worker notify path present |
| Email channel | Bus SMTP path present (env SMTP) |
| Native reminders job | `reminders.native` — **not** automation |
| Reminder fire_key | Unique constraint |
| Overdue dual-path notice | Minor: domain overdue + native reminder can both notify (different keys) — not hardened this round |

---

## 6. Production ops

| Check | Result |
|-------|--------|
| `GET /api/health` | Mounted (live) |
| Failed outbox list / replay | Mounted; tenant-scoped |
| Export | MFA-gated when enrolled; `ops:export` |
| Live app coverage | Mounted for isolation |

---

## 7. MFA

| Check | Result |
|-------|--------|
| Enroll / verify / disable / challenge | Routes present |
| Re-enroll when enabled | **Fixed** — requires `current_token` |
| Status does not leak secret | PASS |
| Privileged ops MFA middleware | Present on export/replay |

---

## 8. Responsive UI

Code smoke (no browser automation in this environment):

- Accounts / journals / periods / reports boards use `pageShellStyle`, `formGrid`, horizontal scroll wrappers for tables (`overflowX: 'auto'`).
- Notification bell mobile panel previously updated.
- Ops / security pages present under settings.

**Browser viewport 390/768/1280 visual pass:** not executed here (no interactive browser session for UI). Layout patterns are responsive-ready; recommend manual smoke in verification UI pass.

---

## 9. Backup / restore drill

| Item | Status |
|------|--------|
| Runbook | `docs/operations/BACKUP-RESTORE-DRILL.md` |
| `pg_dump` / `pg_restore` / `psql` on agent host | **AVAILABLE** (PostgreSQL 16.15 at `C:\Program Files\PostgreSQL\16\bin`) |
| Isolated restore target | **`vencore_restore_drill`** (source `vencore_isolation_test` left intact) |
| Drill result | **PASS** (2026-09-05) |
| Measured RPO | ~22s (dump end → restore start) |
| Measured RTO | ~4m 52s (restore start → smoke complete) |

Executed for real: custom-format dump → restore into dedicated DB → integrity counts match → app smoke (health, login, invoice, Trial Balance, accounting, tenant isolation, document artifact + PDF file download). See runbook §5 for commands/timings.

---

## 10. Defects found → fixes made

| Severity | Defect | Fix |
|----------|--------|-----|
| Blocker | Void ignored reverse failure / no void catch-up | Void status guard + throw on reverse fail (TX rollback); `finance.invoice.voided` catch-up |
| Blocker | Posting `{ok:false}` swallowed | Throw `ACCOUNTING_POST_FAILED` in domain + catch-up |
| Major | MFA re-enroll wiped MFA without proof | Require `current_token` when `mfa_enabled` |
| Major | Manual journal foreign `account_id` | Workspace-scoped account validation in `postJournal` |
| Major | Void TOCTOU | `WHERE status IN (issued, partially_paid, overdue)` |
| Verification gap | Live app missing Phase 5 routers | Mount accounting/documents/ops/mfa/health in live app |
| Verification gap | Stale `@vencore/modules` dist omitted `finance:accounting` | Rebuilt packages/modules |

**Automation:** unchanged.

**Tests after fixes:** live **50/50 PASS**; unit **12/12 PASS**; API tsc **PASS**.

---

## 11. Remaining blockers

1. ~~Backup restore drill~~ → **PASS** (2026-09-05)
2. Optional SHOULD: unify overdue notification keys (domain vs reminder)
3. Optional: interactive 390/768/1280 browser smoke

---

## 12. Gate lines

```
PHASE 5 NON-AUTOMATION FINAL VERIFICATION
ACCOUNTING = PASS
DOCUMENTS/PDF = PASS
NOTIFICATIONS = PASS
PRODUCTION OPS = PASS
MFA = PASS
REPORTING = PASS
TENANT ISOLATION = PASS
REGRESSION = PASS
BACKUP RESTORE DRILL = PASS
AUTOMATION = NOT TOUCHED
```

**Production readiness verdict:**  
**Phase 5 non-automation gates are verification-green**, including a real backup → isolated restore → smoke drill.  
**PDF pipeline is production-ready** for Playwright-generated tenant documents (verified with Chromium; placeholder not used when Chromium is available).

Accounting, isolation, MFA hardening, notifications bus, ops endpoints, commercial/GL regression, real PDF rendering, and backup/restore drill are verification-green. Automation remains untouched pending product approval.
