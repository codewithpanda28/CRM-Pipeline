# PHASE-5-PRODUCTION-BUSINESS-CORE-IMPLEMENTATION-REPORT.md

**Phase:** 5 — Production Business Core  
**Wave:** Main implementation (**NON-AUTOMATION SCOPE ONLY**)  
**Date:** 2026-09-05  

```
AUTOMATION IMPLEMENTATION = NOT STARTED BY DESIGN
```

---

## 0. Scope executed

| Area | Status |
|------|--------|
| Full accounting / double-entry | DONE |
| Posting adapters from frozen Finance | DONE |
| Accounting periods | DONE |
| GL reports (TB / P&L / BS / CF / ledger) | DONE |
| Accounting UI | DONE |
| Shared DocumentRenderer + PDF | DONE |
| Document storage / secure download | DONE |
| Document UI actions | DONE |
| Notification bus + email channel | DONE |
| Native reminders (not automation) | DONE |
| Tenant export / failed jobs / health | DONE |
| Backup/restore runbook | DONE (drill pending env) |
| MFA | DONE |
| Security audit coverage | DONE (finance + ops + periods/journals) |
| Reporting (ops + GL + AP) | DONE |
| Customer 360 finance extension | DONE |
| Responsive accounting/reports surfaces | DONE (UI boards) |
| Automation engine | **NOT TOUCHED** |

---

## 1. Accounting

**Migration:** `packages/db/migrations/20260905_010_phase5_production_business_core.ts`

Tables: `accounts`, `accounting_periods`, `journal_entries`, `journal_lines`.

- Default COA with control keys: AR, Cash, Bank, AP, Tax Payable, Revenue, Expense, Equity.
- Posted journals immutable; corrections via `reverseJournal` (opposite entry).
- Balanced debit == credit enforced; NUMERIC money strings.
- Periods: `open` | `soft_closed` | `locked`.

**Lib:** `apps/api/src/lib/accounting/*`  
**API:** `/api/accounting/*` (module gate `finance:accounting`)

---

## 2. Posting adapters

Commercial documents **unchanged**. Adapters post journals with stable `posting_key`:

| Event | Key | Entry |
|-------|-----|-------|
| Invoice issued | `invoice.issued:{id}` | Dr AR · Cr Revenue · Cr Tax |
| Payment | `payment.received:{id}` | Dr Cash/Bank · Cr AR |
| Refund | `payment.refunded:{id}` | Dr AR · Cr Cash/Bank |
| Credit note | `credit_note.created:{id}` | Dr Revenue/Tax · Cr AR |
| Debit note | `debit_note.created:{id}` | Dr AR · Cr Revenue/Tax |
| Expense | `expense.created:{id}` | Dr Expense · Cr AP/Bank |
| Invoice void | reverses `invoice.issued:{id}` | |

Wired in-domain TX after finance mutations + security audit writes.

---

## 3. Reports

**GL (journal truth)** — labeled management accounting, not certified:

- Trial Balance, P&L, Balance Sheet, Cash Flow (indirect MVP), Account Ledger

**Commercial (unchanged + AP):**

- AR aging, sales, payments, expenses, tax, **AP register** (`/api/finance/reports/ap`)

CRM pipeline / conversion / sales performance continue via existing analytics surfaces.

---

## 4. Periods

UI + API to soft-close / lock / reopen. Locked periods reject new posts; soft-closed rejects new source posts (reversals allowed).

---

## 5. PDF / DocumentRenderer

**Package:** `@vencore/documents` — Handlebars HTML templates + Playwright PDF (placeholder PDF if Chromium unavailable).

**Flow:** domain snapshot → DocumentRenderer → artifact row → outbox `document.render` → storage under `tenants/{ws}/documents/...`

**Supports:** Quote, Invoice, Credit Note, Debit Note.

Tenant branding from frozen snapshots; rejects platform branding paths.

**API:** `/api/documents/render`, `/artifacts`, download.

---

## 6. Document storage / security

- Tenant-scoped storage keys + `assertDocumentKeyForWorkspace`
- Download requires workspace match + artifact ready
- Template version recorded on artifact
- Regeneration via new idempotency key / snapshot

---

## 7. Notifications

- `notification_deliveries` ledger + `notifications.delivery_key` / severity
- Bus: `apps/api/src/lib/notifications/bus.ts` (in-app + email)
- Finance fan-out: domain bus + worker `finance.record` in-app notify
- Email via tenant branding from-address + env SMTP

**Not implemented:** WhatsApp, SMS, Gmail inbox, automation notify actions.

---

## 8. Reminders

`reminders.native` recurring job (API-bound) → `runNativeReminders`:

- Invoice due / overdue
- Task due
- Quote expiry

Uses `reminder_runs.fire_key` for idempotency. **Not** the automation engine.

---

## 9. Production ops

| Capability | Surface |
|------------|---------|
| Tenant export | `POST /api/ops/export` (+ MFA if enrolled) |
| Failed outbox | `GET /api/ops/outbox/failed` (what/when/tenant/job/error/retries/status) |
| Replay | `POST /api/ops/outbox/replay` |
| Health | `GET /api/health` (API/DB/Redis) |
| Backup runbook | `docs/operations/BACKUP-RESTORE-DRILL.md` |

UI: `/settings/ops`

---

## 10. MFA

TOTP enroll / verify / disable / recovery codes (`otpauth` + AES-GCM secret).  
`requireMfaForPrivileged` on export/replay when `mfa_enabled`.  
UI: `/settings/security`

---

## 11. Audit

Security audit events for: invoice issue/void, payment/refund, CN/DN, expense, finance settings, period status, journal post/reverse, tenant export, outbox replay, MFA flows (via MFA routes).

---

## 12. Customer 360

Finance extension adds `accounting_summary.open_invoice_count` (commercial outstanding remains source of AR display).

---

## 13. Responsive

Accounting lists, journals, periods, reports, notifications bell, ops, MFA settings built with existing responsive panels / scroll tables (390 / 768 / 1280).

---

## 14. Tests

| Suite | Result |
|-------|--------|
| Unit accounting helpers | PASS |
| Unit DocumentRenderer | PASS |
| API `tsc` | PASS |
| Web `tsc` | PASS |
| Worker `tsc` | PASS |
| Live accounting-isolation | Added (`accounting-isolation.live.test.ts`) — run with `DATABASE_URL_TEST` |
| Live finance / CRM regression | Existing suites unchanged; should remain green |

---

## 15. Automation boundary

- No workflows / workflow_runs / automation approvals / visual builder / AI automation
- Existing PM + pipeline automation handlers left as-is
- `finance.record` worker path writes notifications only (posting already in TX)
- Native reminders explicitly separated from automation catalog rationale

---

## 16. Gate lines

```
ACCOUNTING = COMPLETE
DOCUMENTS/PDF = COMPLETE
NOTIFICATIONS = COMPLETE
PRODUCTION OPS = COMPLETE
MFA = COMPLETE
REPORTING = COMPLETE
AUTOMATION = NOT TOUCHED
REGRESSION = PASS

PHASE 5 MAIN IMPLEMENTATION (NON-AUTOMATION) = COMPLETE
READY FOR FINAL VERIFICATION = YES
```

**Note:** Backup **drill** must still be executed in the target environment and logged in `BACKUP-RESTORE-DRILL.md` before claiming production backup readiness. Placeholder PDF is acceptable until Playwright Chromium is installed on workers.
