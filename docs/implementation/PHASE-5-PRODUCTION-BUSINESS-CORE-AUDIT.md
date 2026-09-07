# PHASE-5-PRODUCTION-BUSINESS-CORE-AUDIT.md

**Phase:** 5 — Production Business Core  
**Wave:** Planning / audit only — **no application code**  
**Date:** 2026-09-05  

**Prerequisites (frozen / complete):**  
- Phase 3A.1 Deal = **FROZEN**  
- Phase 3A.2 Lead = **COMPLETE**  
- Phase 3A.3 CustomerParty + 360 = **COMPLETE**  
- Phase 3A.4 Products + Quotes = **FROZEN**  
- Phase 4 Commercial Finance = **FROZEN**  
- Business UX / Pipeline / Invoice branding = **COMPLETE**  
- ADR-021 / 024 / 025 / 026 = **Accepted**  
- ADR-015 / 016 / 019 / 022 = governing (jobs / PDF / outbox / templates)

**Classification key:** `runtime` · `partial` · `docs-only` · `missing` · `legacy`

---

## 1. Executive finding

ThinkAIQ today is a **strong commercial CRM + Finance MVP** on a solid multi-tenant / outbox / BullMQ foundation.

It is **not yet a production business operating platform** for day-to-day accounting books, document PDFs, durable advanced automation, or operator-grade ops.

| Layer | Reality |
|-------|---------|
| CRM commercial path | **runtime** (Deal → Party → Quote → Invoice) |
| Commercial Finance (World 2) | **runtime** (no double-entry) |
| Rule-list automation (PM + pipeline) | **runtime / partial** |
| Advanced workflow graph + HITL | **docs-only / missing** |
| Full accounting (COA / journals / statements) | **missing** (Phase 4B deferred) |
| DocumentRenderer / PDF | **docs-only** (+ HTML invoice preview **partial**) |
| Notifications | **partial** (in-app islands; no event catalog) |
| Super Admin / ops center | **partial** API / **docs-only** UI |
| Backup / tenant export | **docs-only** |

**Docs ≠ implementation.** Product specs (`FINANCE_SPECIFICATION`, `NOTIFICATIONS`, `DOCUMENT_MANAGEMENT`, `AUTOMATION_ENGINE`) over-claim vs schema.

---

## 2. Automation

### 2.1 Capability matrix

| Capability | Class | Evidence |
|------------|-------|----------|
| Transactional outbox | **runtime** | `outbox_events`, `@vencore/events`, `domain-outbox.ts`, ADR-019 |
| Outbox → BullMQ publisher | **runtime** | `packages/events` publisher/reconciler; worker runtime |
| JobQueue / retries / tenant pause | **runtime** | `@vencore/job-runtime`, `tenant_job_controls` |
| PM automation rules | **runtime** | `automation_rules` / `automation_logs`; UI under Projects |
| Pipeline automations | **partial** | `pipeline_automations` + worker; **no web UI** |
| Triggers / conditions / actions | **partial** | Flat rule lists; no branching graph |
| Approvals (portal client) | **runtime** | `approval_requests` — not automation HITL |
| Workflow HITL / waits / branches | **missing** | Spec only (`AUTOMATION_ENGINE.md`, ADR-004) |
| Visual builder / versioning / replay | **missing** | — |
| Execution history (step-level) | **partial** | PM logs only; pipeline = `last_fired_at` |
| Idempotency | **partial** | Outbox dedupe + PM log tokens; no run-step model |
| AI NL → workflow | **missing** | — |
| Direct domain → BullMQ | **forbidden / enforced** | Domain TX uses outbox only |

### 2.2 Tables present

`outbox_events`, `automation_rules`, `automation_logs`, `pipeline_automations`, `approval_requests`, `tenant_job_controls`

### 2.3 Tables absent (docs-only)

`workflows`, `workflow_versions`, `workflow_runs`, `workflow_run_steps`, `workflow_approvals`, …

### 2.4 Legacy

`JOBS_RUNTIME=legacy` in-process path still exists beside BullMQ — treat as sunset candidate, not Phase 5 SoR.

---

## 3. Accounting / Finance beyond commercial MVP

| Capability | Class | Notes |
|------------|-------|-------|
| Invoices / payments / refunds / CN / DN / expenses / vendors | **runtime** | Phase 4 World 2 |
| Tax engine (GST-ready math) | **runtime** | Not filing certification |
| Operational reports (sales, AR aging, tax summary, …) | **runtime** | Explicitly not GAAP P&L |
| Seller branding snapshot | **runtime** | Issue-time freeze |
| Chart of accounts | **missing** | Migration 008 explicitly excludes |
| Journal entries / lines | **missing** | — |
| Periods / close / reverse | **missing** | — |
| Reconciliation (bank/GL) | **missing** | — |
| Trial balance / P&L / BS / cash flow | **missing** | Spec over-claims in FINANCE_SPECIFICATION |
| `journal_entry_id` on commercial docs | **missing** | Planned hook only |
| Platform SaaS billing (World 1) | **out of Phase 5** | ADR-021 |

**Verdict:** Commercial AR/AP documents are production-usable as **operational finance**. They are **not** a general ledger.

---

## 4. Documents / PDF

| Capability | Class | Evidence |
|------------|-------|----------|
| ADR-016 / ADR-022 strategy | **docs-only** | Playwright + Handlebars DSL |
| `DocumentRenderer` package | **missing** | Zero package / deps |
| Playwright / pdf-lib / handlebars | **missing** | Not in package.json |
| Template / version / artifact tables | **missing** | Spec only |
| Invoice HTML document UI | **partial** | `InvoiceDocumentHeader` |
| Quote/Invoice PDF download | **missing** | Quote send = status only |
| Branding snapshot for PDF | **runtime** | Ready for future renderer |
| `documents` BullMQ queue | **legacy smell** | Used for hub retention purge, not PDF |

---

## 5. Notifications / communication core

| Capability | Class | Evidence |
|------------|-------|----------|
| In-app notifications + bell | **runtime** | `notifications` table + routes + UI |
| Notification preferences | **partial** | Channel × severity only |
| Push tokens | **partial** | Exists; narrow call sites |
| SMTP (alerts / auth / approvals) | **partial** | Islands, not event bus |
| Task due notifier | **partial** | Worker present |
| Pipeline reminders | **partial** | Writes activity; often **not** `notifications` |
| Automation “notify” | **partial** | Often activity notes, not inbox |
| Event-type catalog + deliveries | **missing** | Spec in NOTIFICATIONS.md |
| Finance event notifications | **missing** | invoice overdue, payment received, … |
| Mail module (Gmail/IMAP) | **legacy** | Empty migrations / no API |
| WhatsApp / SMS | **out of Phase 5** | — |

---

## 6. Reporting

| Capability | Class | Notes |
|------------|-------|-------|
| Finance operational registers | **runtime** | Phase 4 |
| CRM / infra / PM analytics | **runtime** | `/analytics`, dashboards |
| Configurable dashboards | **runtime** | — |
| Full reporting module | **docs-only** | REPORTING_ANALYTICS.md |
| GL statements | **missing** | Depends on accounting |
| Async CSV/Excel export | **missing** | — |
| Automation metrics dashboard | **missing** | — |

---

## 7. Production security / ops

| Capability | Class | Notes |
|------------|-------|-------|
| Live tenant isolation tests | **runtime** | Strong (CRM + Finance + storage + platform boundary) |
| RBAC + module gating | **runtime** | — |
| Rate limits | **partial** | Often per-process memory; Redis adapter unused on API global limiter |
| CSRF (production) | **runtime** | — |
| Env validation | **runtime** | `@vencore/config` |
| Security audit events | **partial** | Login/switch mainly; silent swallow on write fail |
| MFA | **missing** | UI stub / column only |
| Managed Redis HA | **docs-only / blocker** | REDIS-JOB-RUNTIME.md |
| Failed job UI / replay | **missing** | Logs only |
| Backup + restore drill | **docs-only** | BACKUP_RECOVERY.md proposals |
| Tenant data export | **missing** | Spec only |
| Retention enforcement (finance/audit) | **docs-only** | Hub/metrics retention only |
| LB readiness (API+worker deps) | **partial** | Setup-status probe smell |
| Super Admin UI | **docs-only** | — |
| Platform API (read) | **partial** | tenants / outbox / security-audit |
| Platform login + mutations | **missing** | — |

---

## 8. Super Admin / platform control

| Need | Class |
|------|-------|
| List tenants / outbox / audit (API) | **partial** |
| Platform login | **missing** |
| Suspend / activate / module override | **docs-only** |
| Ops Center / Pulse / DLQ | **docs-only** |
| “What / when / where / why / fix” UX | **missing** |

---

## 9. Data / export / recovery

| Need | Class |
|------|-------|
| Soft delete on commercial entities | **runtime** (pattern exists) |
| Tenant export | **missing** |
| PITR / snapshot runbook | **docs-only** |
| Financial record retention policy | **docs-only** |
| Destructive migrations | **forbidden** (policy) |

---

## 10. Mobile / responsive

| Surface | Class |
|---------|-------|
| CRM / Finance UX (post Business UX round) | **partial → good** for core screens |
| Automation visual builder | **N/A** (not built) — must design responsive fallback |
| Accounting screens | **N/A** |
| PDF preview | HTML **partial**; print/PDF **missing** |

---

## 11. Already complete (do not rebuild)

1. Canonical Deal / Lead / CustomerParty / Products / Quotes  
2. Commercial Finance MVP + branding freeze + World 1/2 split  
3. Outbox + BullMQ job substrate  
4. Live isolation test culture  
5. Pipeline / Finance business UX pass  

---

## 12. Gaps that block “real business day-to-day”

Must close for a serious operating platform (see Plan MUST list):

1. Double-entry accounting integrated with commercial docs  
2. Shared DocumentRenderer (Quote/Invoice/CN/DN PDF)  
3. Production notification + reminder bus for CRM/Finance events  
4. Production-grade automation (beyond flat rules) **or** a documented MVP slice that is still reliable  
5. Backup/restore + tenant export + failed-job visibility  
6. Platform operator minimum control plane  
7. Security audit coverage for money/admin mutations + MFA for privileged roles  

---

## 13. Explicit non-claims

Do **not** claim from current runtime:

- Audited GAAP/IFRS books  
- GST filing certification  
- Playwright PDF in production  
- Advanced workflow automation shipped  
- Multi-tenant SaaS ops center complete  
- Managed Redis HA  

---

## 14. Audit status

```
PHASE 5 AUDIT = COMPLETE
IMPLEMENTATION = NOT STARTED
```
