# PHASE-5-PRODUCTION-BUSINESS-CORE-PLAN.md

**Phase:** 5 — Production Business Core  
**Wave:** Planning **COMPLETE** → Main implementation **NOT STARTED**  
**Date:** 2026-09-05  
**Depends on:** [PHASE-5-PRODUCTION-BUSINESS-CORE-AUDIT.md](./PHASE-5-PRODUCTION-BUSINESS-CORE-AUDIT.md)  
**Execution style:** One planning wave · One main implementation round · One final verification · **No micro-phases**

**Governing ADRs (reuse — no new ADR required to start planning):**  
ADR-015 (BullMQ) · ADR-019 (outbox) · ADR-016/022 (PDF/templates) · ADR-004 (automation target model) · ADR-021 (billing worlds) · ADR-024/025/026 (CRM)

---

## 0. Phase statement

Phase 5 makes ThinkAIQ **usable for real day-to-day business operations** by delivering:

1. **Production automation** (durable, auditable, approval-capable)  
2. **Full accounting** (double-entry on top of frozen commercial Finance)  
3. **Documents / PDF** (shared renderer; Quote + Invoice + CN/DN)  
4. **Notifications / reminders** (CRM + Finance event bus)  
5. **Production-critical ops** (backup/export, failed jobs, operator visibility, security hardening)

**Out of Phase 5:** WhatsApp · Voice · Support expansion · Platform SaaS billing · reseller marketplace · optional differentiators.

---

## 1. Production-use gate

### MUST HAVE BEFORE PRODUCTION USE (18)

| # | Requirement |
|---|-------------|
| M1 | Double-entry COA + journals with posting from Invoice/Payment/Refund/Expense/CN/DN |
| M2 | Immutable posted journals; commercial docs not rewritten by accounting |
| M3 | Trial balance + P&L + Balance Sheet + Cash Flow (management books — not certification) |
| M4 | Accounting periods + close (at least soft close) |
| M5 | Shared DocumentRenderer (HTML→PDF) for Quote + Invoice (+ CN/DN) |
| M6 | Tenant branding + historical snapshot on PDF artifacts |
| M7 | Secure document download (tenant-scoped) |
| M8 | Notification bus: in-app delivery for CRM/Finance critical events |
| M9 | Reminders: task due, quote follow-up, invoice due / overdue |
| M10 | Email channel for those critical notifications (tenant-configurable SMTP or platform relay) |
| M11 | Automation MVP: reliable triggers→actions→retries→logs for CRM+Finance events (upgrade path from current rule engines) |
| M12 | Critical automation actions support human approval |
| M13 | All automation/jobs remain outbox → JobQueue (never domain→BullMQ) |
| M14 | Backup + documented restore drill (RPO/RTO recorded) |
| M15 | Tenant data export (core CRM + Finance + documents metadata) |
| M16 | Failed job / dead outbox visibility + safe replay for operators |
| M17 | Security audit coverage for finance mutations + admin actions; MFA for admin/platform privileged users |
| M18 | Live isolation regression still green after Phase 5 surfaces |

### IMPORTANT BUT CAN FOLLOW AFTER PRODUCTION (SHOULD)

| # | Item |
|---|------|
| S1 | Full visual workflow graph builder + wait-for-event + versioning UI |
| S2 | AI NL→workflow / AI debugger |
| S3 | Bank feed reconciliation UI |
| S4 | Multi-currency FX books |
| S5 | Statutory GST filing packs |
| S6 | Async report export farm (Excel/CSV at scale) |
| S7 | Full Super Admin Ops Center (Pulse, incidents) |
| S8 | Redis-backed global rate limits on all replicas |
| S9 | Advanced retention automation for all artifact classes |
| S10 | Inventory valuation / COGS automation |

### LATER (explicitly after Phase 5)

WhatsApp SaaS · Voice · Support module · Platform billing · Reseller white-label marketplace · Advanced AI agents as product surface.

---

## 2. Architecture dependencies (no redesign of frozen domains)

```
CRM (Deal/Lead/Party)
  → Products / Quotes
    → Finance commercial docs (Invoice/Payment/CN/DN/Expense)   [FROZEN]
      → Accounting posting adapters → Journals / COA            [NEW]
      → DocumentRenderer ← branding snapshots                   [NEW]
      → Notification bus ← finance.* / crm.* events             [NEW]
Automation engine ← same events via outbox                     [UPGRADE]
Operator / backup / export                                      [NEW/HARDEN]
```

**Hard rules:**  
- Do not mutate issued invoice commercial history to “fix” books — post adjusting journals / CN/DN/refunds.  
- World 1 platform billing stays separate (ADR-021).  
- DocumentRenderer is a shared package/port — Finance/CRM do not own Chromium.

---

## 3. Automation (Phase 5 design)

### 3.1 MVP in Phase 5 (MUST)

Evolve from today’s rule engines toward ADR-004 durability **without** requiring a greenfield rewrite of PM rules:

| Capability | Phase 5 MVP |
|------------|-------------|
| Triggers | CRM + Finance domain events (deal stage, quote accepted, invoice issued/overdue, payment received, …) |
| Conditions | Field predicates + simple AND groups |
| Actions | Notify, create task, update deal stage, webhook, assign owner, enqueue document render |
| Delays | Time delay via scheduled job (BullMQ delayed / recurring) |
| Approvals | Human approval gate for money-adjacent / external webhook actions |
| Retries / idempotency | Job-runtime retries + per-run idempotency key |
| History | Run log + step outcomes (queryable UI) |
| Enable/disable | Per automation + per tenant job pause |
| Test / manual replay | Operator replay of failed run |
| UI | List + form builder sufficient for MVP; visual graph **SHOULD** |

### 3.2 Later (after MVP)

Full visual canvas · wait-for-event · complex branching · AI draft/debug/optimize · workflow versioning UI polish.

### 3.3 Substrate (already exists — extend)

Outbox → publisher → BullMQ · `tenant_job_controls` · never domain→BullMQ.

### 3.4 AI automation

Phase 5: **optional SHOULD** behind feature flag (NL→draft rule only). Not a production-use MUST.

---

## 4. Full accounting (Phase 5 design)

### 4.1 Core model

| Entity | Purpose |
|--------|---------|
| `accounts` (COA) | Asset/Liability/Equity/Revenue/Expense (+ control accounts) |
| `accounting_periods` | Open / soft-closed / locked |
| `journal_entries` | Header: date, period, source, status (draft/posted/reversed) |
| `journal_lines` | Debit/credit, account, party optional, amount NUMERIC |
| `posting_rules` / adapters | Map commercial events → journals |

### 4.2 Posting sources (commercial Finance unchanged)

| Event | Typical postings (defaults) |
|-------|-----------------------------|
| Invoice issued | Dr AR · Cr Revenue · Cr Tax payable |
| Payment received | Dr Cash/Bank · Cr AR |
| Refund | reverse payment pattern |
| Credit note | reduce AR / revenue/tax per policy |
| Debit note | increase AR |
| Expense recorded | Dr Expense (+tax) · Cr AP/Cash |

### 4.3 Immutability

- Posted journals immutable.  
- Corrections = reversing entry + new entry.  
- Commercial invoice totals never rewritten by GL.  
- Optional `journal_entry_id` link on source docs (nullable, additive).

### 4.4 Statements (MUST)

Trial balance · P&L · Balance sheet · Cash flow (indirect OK for MVP).

**Non-claim:** Not audited GAAP/IFRS certification · not statutory GST filing.

### 4.5 Inventory

Only if product stock movements already exist and are required for COGS — default **LATER** unless already in runtime.

---

## 5. Documents / PDF (Phase 5 design)

### 5.1 Shared renderer

```
Domain snapshot (quote/invoice/CN/DN)
  → DocumentRenderer port
    → Handlebars/HTML template (versioned)
      → Playwright PDF
        → tenant-scoped artifact store
```

| Rule | Detail |
|------|--------|
| Ownership | New shared package / worker job — not Finance domain |
| Branding | Use `seller_branding_snapshot` for issued docs |
| Regeneration | Issued PDFs regenerate only from snapshot; policy flag |
| Access | Tenant RBAC + signed/short-lived download |
| Templates | Versioned; default ThinkAIQ layout; tenant override later |

### 5.2 MVP documents

Quote PDF · Invoice PDF · Credit note PDF · Debit note PDF.

---

## 6. Notifications (Phase 5 design)

### 6.1 MUST

| Channel | Use |
|---------|-----|
| In-app | All critical events |
| Email | Task due, quote follow-up, invoice due/overdue, payment received, automation approval |

### 6.2 Event set (minimum)

`deal.stage_changed` (selectable) · `quote.sent/accepted/expiring` · `finance.invoice.issued/overdue` · `finance.payment.received` · `finance.payment.refunded` · `task.due` · `automation.approval_required` · `automation.run_failed`

### 6.3 Implementation notes

- Prefer catalog table + deliveries for idempotency.  
- Fix misleading automation “notify” that only writes activities.  
- Keep WhatsApp **out**.  
- Mail inbox module remains **legacy** — do not resurrect as Phase 5 dependency.

---

## 7. Reporting (Phase 5)

| Area | MUST | SHOULD |
|------|------|--------|
| CRM | Pipeline / conversion / sales performance views (extend analytics) | Deep cohort |
| Finance ops | Keep Phase 4 registers | CSV export |
| Accounting | TB / P&L / BS / CF | Comparative periods |
| Automation | Success/fail counts | Duration/cost |

Read models must not invent a second financial truth — GL reports read journals; AR aging remains commercial.

---

## 8. Production security / ops (Phase 5)

### MUST

- Backup + restore drill documented and executed once  
- Tenant export job  
- Failed jobs + dead outbox list + replay (API; minimal UI OK)  
- Security audit on finance + settings + automation mutations  
- MFA for workspace admin + platform admin  
- Health endpoints with DB/Redis dependency checks (API + worker)  
- Isolation suite green  

### SHOULD

- Super Admin mutations (suspend tenant)  
- Redis-backed rate limits  
- Managed Redis HA (environment requirement — may be infra checklist item)

### Platform control MVP

Operator must see: **what / when / tenant / why / how to fix** for failed jobs, dead outbox, automation failures — not raw logs alone. Full Ops Center can be SHOULD.

---

## 9. Data / export / recovery

| Topic | Phase 5 rule |
|-------|----------------|
| Export | JSON/CSV package: parties, deals, quotes, invoices, payments, journals, document metadata |
| Backup | Postgres PITR or nightly snapshot + Redis AOF/persistence policy |
| Soft delete | Preserve; exports include deleted flag where relevant |
| Retention | Finance + journals + audit: configurable years (default ≥ 7 policy doc); automated purge **SHOULD** |
| Migrations | Additive only; no destructive rewrite of posted money |

---

## 10. Mobile / responsive

| Surface | Requirement |
|---------|-------------|
| Accounting lists / statements | Stacked cards @ 390; tables scroll |
| Invoice/PDF | HTML preview mobile; PDF download OK |
| Automation | Form builder usable on tablet; complex canvas desktop-first with read-only mobile run history |
| Notifications | Bell + list fully mobile |
| Reports | Cards / scroll tables |
| Operator views | Usable on tablet minimum |

No critical hover-only actions. Touch targets ≥ 40px.

---

## 11. Phase boundary

### IN Phase 5

Advanced-enough automation · Full accounting · Documents/PDF · Notifications/reminders · Production ops checklist · Production reporting (ops + GL)

### OUT of Phase 5

WhatsApp · Voice · Support expansion · Platform SaaS billing · Reseller marketplace · Full AI agent product · Statutory filing certification

---

## 12. Open decisions (minimal)

| ID | Decision | Recommended default | Blocks? |
|----|----------|---------------------|---------|
| D1 | Accounting books basis | Single company book per workspace; accrual | No — recommend |
| D2 | Automation SoR | Extend ADR-004 run model; migrate PM/pipeline rules as first-class triggers | No — recommend |
| D3 | PDF worker hosting | Same worker fleet with Chromium sidecar / dedicated document worker | Soft — pick at impl start |
| D4 | Email transport | Workspace SMTP settings first; platform relay optional | Soft |
| D5 | Formal ADR for posting adapters | Draft ADR-027 at implementation kickoff if team wants lock | Optional |

No product-gate decision blocks planning completion.

---

## 13. Production-use checklist

**Question:** Can ThinkAIQ safely be used for a real business?

| Area | Item | Class |
|------|------|-------|
| Functionality | CRM + Quotes + commercial Finance usable | MUST (mostly done) |
| Functionality | Double-entry + statements | MUST |
| Functionality | Quote/Invoice PDF | MUST |
| Functionality | Reminders + in-app + email | MUST |
| Functionality | Reliable automation for core events | MUST |
| Security | Tenant isolation | MUST (done + keep green) |
| Security | RBAC on new surfaces | MUST |
| Security | MFA privileged | MUST |
| Security | Audit money/admin mutations | MUST |
| Financial integrity | Posted journals immutable; no fake netting | MUST |
| Automation | Outbox-only enqueue; approvals for critical | MUST |
| Documents | Snapshot branding; secure download | MUST |
| Notifications | Delivery for critical events | MUST |
| Reports | Ops + GL consistent | MUST |
| Backup/recovery | Restore drill | MUST |
| Monitoring | Failed jobs + health | MUST |
| Export | Tenant export | MUST |
| Responsive | 390/768/1280 critical paths | MUST |
| Redis HA | Managed HA | SHOULD / env gate |
| Visual automation canvas | Full builder | SHOULD |
| Bank reconciliation | — | LATER |
| WhatsApp/Voice/Support | — | LATER |
| Platform billing | — | LATER |
| Certifications | — | LATER (never claim in Phase 5) |

---

## 14. Suggested implementation shape (single round — not micro-phases)

Within **one** main implementation wave, deliver vertical slices in dependency order inside the same phase:

1. Accounting foundation + posting adapters  
2. DocumentRenderer + Quote/Invoice PDF  
3. Notification catalog + CRM/Finance wiring + email  
4. Automation upgrade (runs/approvals/logs) on existing events  
5. Ops: export, failed-job API/UI, audit/MFA, health  
6. Reporting: GL statements + automation stats  

Final verification wave after implementation (isolation, posting integrity, PDF snapshot, notification idempotency, automation replay).

---

## 15. Summary for kickoff

### Already complete
CRM commercial chain · Finance MVP · Branding freeze · Outbox/BullMQ · Isolation culture · Business UX

### Must implement (Phase 5)
Accounting · PDF documents · Notifications · Automation durability/approvals · Ops gate items (export, backup drill, failed jobs, MFA, audit)

### Can safely wait
Full visual AI automation · Bank feeds · Statutory packs · Super Admin luxury · WhatsApp/Voice/Support · Platform billing

### Dependencies
Frozen Finance docs → Accounting + PDF + Notifications; Outbox → Automation + jobs; Ops wraps all

### Blocking decisions
None for planning; D3/D4 soft picks at implementation start

---

## 16. Gate lines

```
PHASE 5 PLANNING = COMPLETE
PRODUCTION-USE MUST-HAVES = 18
READY FOR MAIN IMPLEMENTATION = YES
```

**No code · No migrations · No micro-phases in this wave.**
