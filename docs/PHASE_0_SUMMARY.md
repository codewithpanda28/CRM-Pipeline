# PHASE_0_SUMMARY.md — ThinkAIQ Documentation Review Pack

**Phase:** 0 — Documentation-first architecture initialization  
**Status:** Ready for stakeholder review  
**Coding:** Not started (blocked until approval)

---

## 1. Documentation tree

```
docs/
├── README.md
├── PHASE_0_SUMMARY.md
├── product/          MASTER_PRINCIPLES, VISION, REQUIREMENTS, PACKAGING,
│                     IMPLEMENTATION_PLAN, REQUIREMENTS_TRACEABILITY
├── architecture/     SYSTEM, MULTI_TENANCY, WHITE_LABEL, MODULE_SYSTEM,
│                     PLUGIN_SYSTEM, CUSTOMIZATION, SCALABILITY
├── modules/          CRM, SALES, FINANCE, BILLING, TASKS, TEAM, DOCS,
│                     SUPPORT, COMMUNICATIONS, WHATSAPP, NOTIFICATIONS,
│                     REPORTING, VOICE_AI, TELEPHONY, RESELLER
├── database/         DATABASE_SCHEMA, DATABASE_ERD
├── security/         SECURITY, RBAC, AUDIT_LOG, DATA_RETENTION
├── api/              API_SPECIFICATION, API_VERSIONING, WEBHOOKS,
│                     ERROR_HANDLING, EVENTS
├── automation/       AUTOMATION_ENGINE
├── integrations/     INTEGRATIONS
├── operations/       SUPER_ADMIN, PLATFORM_OPS_CENTER, OBSERVABILITY,
│                     BACKGROUND_JOBS, SCHEDULER, USAGE_METERING
├── deployment/       DEPLOYMENT, ENVIRONMENT_CONFIGURATION, STORAGE,
│                     BACKUP_RECOVERY
├── testing/          TESTING_STRATEGY
├── decisions/        ADR-001 … ADR-012
├── roadmap/          FUTURE_ROADMAP
└── diagrams/         (reserved)
```

---

## 2. Architecture summary

ThinkAIQ is a **modular monolith**: one deployable platform with package-level module boundaries, transactional outbox events, async workers, S3-compatible storage, and a platform Super Admin control plane.

```
Edge (domains/TLS)
  → Tenant App (white-label) + Super Admin Ops Center
  → API gateway (authn/authz/tenancy/entitlements)
  → Domain modules (CRM, Sales, Finance, Tasks, Comms/WhatsApp, …)
  → Platform kernel (identity, RBAC, entitlements, audit, metering, outbox)
  → Workers + Scheduler (automation, email, WA, PDF, webhooks, AI)
  → PostgreSQL + Redis + Object Storage + Observability
```

**Default:** ONE CODEBASE → ONE PLATFORM → MANY TENANTS → MANY PLANS → MANY MODULE COMBINATIONS → MANY BRANDS.

North star: **automate as much as safely possible** without bypassing security, accounting correctness, or human approval for risky actions.

---

## 3. Module map

| Module | Priority | Role |
|--------|----------|------|
| `core` | P0 | Auth, tenancy, RBAC, audit, notifications baseline |
| `crm` | P1 | Leads, contacts, companies, clients, 360 |
| `sales` | P1 | Pipelines, deals, quotes, forecast |
| `finance` | P1 | Tenant invoicing, AR/AP, GST, credit/debit notes |
| `billing` | P1 | Tenant→customer subscriptions |
| `tasks` / `team` | P1 | Tasks, DPR, targets |
| `automation` | P1 | Differentiator — no-code + AI-assisted workflows |
| `api` | P1 | Public API + keys |
| `documents` / `support` / `communications` / `whatsapp` | P2 | Ops & messaging |
| `reporting` | P1/P2 | Dashboards & reports |
| `voice_ai` / `telephony` / `portal` / `hr` / reseller | P3 | Optional / future |
| Platform billing | P0/P1 | ThinkAIQ→tenant commercial plane (separate from finance) |

Entitlement chain: **Tenant → Plan → Module → Feature → Usage limit → Permission**.

---

## 4. Tenant model

- Shared PostgreSQL + shared schema + mandatory `tenant_id` (ADR-001)  
- Isolation enforced in middleware, repositories, jobs, storage keys, cache, webhooks, search, reports  
- Statuses: Trial · Active · Suspended · Expired · Cancelled  
- Provisioning: Create → Plan → Modules → Branding → Domain → Admin → Permissions → Limits → Ready  
- No per-client codebase or manual DB setup for normal provision  
- Frontend filtering alone is **not** isolation  

---

## 5. White-label model

Configuration-driven brand runtime (ADR-011): name, logo, favicon, colors, login, email identity, domain/subdomain, modules, plan, limits.  
Hosts: `app.thinkaiq.com`, `{slug}.thinkaiq.com`, custom domain (SSL workflow ADR-005).  
Cached theme injection; assets in object storage.

---

## 6. Super Admin model

Dual role:

1. **Commercial admin** — tenants, plans, modules, billing, branding, domains, users, limits  
2. **Visual ops / incident command center** — Platform Pulse, tenant/module/automation/API/integration/queue/DB/security health, incidents, root cause, affected records, Fix-it recovery actions  

Tenant admins never receive Super Admin powers.

---

## 7. Automation model

Async durable workflows (ADR-004): triggers → conditions (AND/OR/NOT) → actions → delays → branches → parallel → loops → wait-for-event → approvals/HITL → API/webhooks → retry/fallback → idempotency → versioning → test/simulate → visual debugger.

AI: NL draft, Copilot, explain, optimize, debug, discovery — **never auto-publish** by default; respects tenant/RBAC; HITL for money/destructive ops.

Premium packaging driver (Basic → Enterprise). Failures feed Super Admin Automation Incident Center.

---

## 8. Database / ERD summary

Conceptual model in `database/DATABASE_SCHEMA.md` + relationships in `DATABASE_ERD.md`.

Domains: platform (tenants, plans, modules, ops incidents) · identity/RBAC · CRM · sales · finance (tenant-branded invoices, estimates, orders, credit/debit notes) · billing subscriptions · tasks/team · documents/support · communications/WhatsApp · automation runs · metering · audit (append-only) · voice/telephony.

Conventions: UUID PKs, `tenant_id`, soft-delete where appropriate, money `NUMERIC`, outbox events, idempotency keys on payments.

---

## 9. Security model

Tenant isolation everywhere · RBAC + scopes · session security · MFA for Super Admin · hashed passwords · encrypted secrets · signed file URLs · rate limits · security monitoring on Pulse · audit for sensitive actions · backups/PITR · retention policies.  
**Do not claim SOC2/ISO/etc. unless certified.** AI is not a privilege bypass.

---

## 10. API model

Versioned REST `/api/v1` (ADR-009): sessions/JWT + API keys/scopes · pagination/filter/sort · rate limits · Idempotency-Key · standard errors · platform namespace `/platform/*` · webhooks with HMAC, retry, replay · event catalog in `api/EVENTS.md`.

---

## 11. Future WhatsApp compatibility model

First-class `whatsapp` module + provider port (ADR-012). Normalized conversations/messages/templates/campaigns/delivery states. Deep CRM integration (inbound identify → lead/client → workflow). Shared infrastructure: contacts, events, automation, metering, permissions, audit. Future **WhatsApp SaaS** SKU = same core + packaging — no separate platform rewrite.

---

## 12. Open architectural questions (pending ADR acceptance)

| # | Question | ADR |
|---|----------|-----|
| 1 | Shared DB row-tenancy vs schema/DB-per-tenant for enterprise deals | ADR-001 |
| 2 | Exact tech stack (Nest/Fastify/React/Prisma/etc.) | ADR-002 |
| 3 | Platform vs tenant billing table boundaries (confirm) | ADR-003 |
| 4 | Automation runner in-monolith vs extract timing | ADR-004 |
| 5 | Custom domain cert automation tooling | ADR-005 |
| 6 | MFA enforcement timeline for all Super Admins | ADR-006 |
| 7 | Redis queue vs cloud queue in production | ADR-007 |
| 8 | Primary object storage vendor | ADR-008 |
| 9 | Global vs per-tenant email uniqueness for users | (needs ADR if contested) |
| 10 | Break-glass tenant record view in ops (scope/PII) | Ops policy |
| 11 | WhatsApp BSP selection for v1 | ADR-012 |
| 12 | Reseller parent-tenant vs org entity | Reseller P3 ADR later |

---

## 13. ADR list

| ADR | Topic | Status |
|-----|-------|--------|
| 001 | Tenancy isolation model | Proposed |
| 002 | Modular monolith stack | Proposed |
| 003 | Platform vs tenant billing | Proposed |
| 004 | Automation execution model | Proposed |
| 005 | Custom domain & SSL | Proposed |
| 006 | Authentication strategy | Proposed |
| 007 | Queue strategy | Proposed |
| 008 | Storage strategy | Proposed |
| 009 | API surface strategy | Proposed |
| 010 | Plugin extension strategy | Proposed |
| 011 | White-label runtime | Proposed |
| 013 | Customization metadata model (hybrid fields/objects) | Proposed |

---

## 14. Requirements traceability

Living matrix: [product/REQUIREMENTS_TRACEABILITY.md](./product/REQUIREMENTS_TRACEABILITY.md)

Covers REQ-PLT-*, REQ-TNT-*, REQ-CRM-*, REQ-SAL-*, REQ-FIN-*, REQ-BIL-*, REQ-AUT-001…018, REQ-WA-*, REQ-AI-001, NFRs, with Documentation → DB → API → Permissions → Automation → Tests → Status (`Documented`).

---

## 15. Recommended implementation phases

| Phase | Focus | Exit criteria (sketch) |
|-------|--------|-------------------------|
| **0** | Docs + ADRs (this phase) | Review/approval of this summary |
| **1** | P0 foundation | Auth, tenancy, RBAC, WL subdomain, Super Admin shell + Pulse basics, storage, jobs, audit, isolation tests green |
| **1b** | Ops depth | Incidents, recovery actions, health snapshots |
| **2** | CRM + Sales + Tasks | Lead→deal flows, 360, kanban, automation-created tasks |
| **3** | Finance + Billing + Metering | Per-tenant invoices, payments, platform plans, quotas |
| **4** | Automation + API + Webhooks | Visual builder, durable runs, public API |
| **4b** | AI automation assist | NL/Copilot (no auto-publish) |
| **5** | Team/Support/Docs/Comms/WhatsApp | Inbox + CRM deep link |
| **6** | Voice/Telephony/Reseller/Portal/WhatsApp SaaS SKU | Optional packs |

Full detail: [roadmap/FUTURE_ROADMAP.md](./roadmap/FUTURE_ROADMAP.md), [product/IMPLEMENTATION_PLAN.md](./product/IMPLEMENTATION_PLAN.md).

---

## Gate before coding

- [ ] Stakeholder review of Phase 0 summary  
- [ ] Accept or revise ADRs (especially 001, 002, 003, 004, 012)  
- [ ] Confirm stack in ADR-002  
- [ ] Traceability spot-check for critical REQs  
- [ ] Explicit written approval to start Phase 1 scaffolding  

**Until then: no full production implementation.**
