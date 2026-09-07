# PHASE-1C-DECISIONS.md — ThinkAIQ

**Phase:** 1C — Architecture Decision Records  
**Date:** 2026-09-04  
**Constraint:** Planning only — no application code, installs, or migrations  

Sources: ThinkAIQ docs · Vencore audit · ADR-014 · [OPEN-SOURCE-COMPONENT-RADAR.md](./OPEN-SOURCE-COMPONENT-RADAR.md) · [ADR-015](../adr/ADR-015-BULLMQ-VS-PG-BOSS.md) · [ADR-016](../adr/ADR-016-PDF-GENERATION-STRATEGY.md)

---

## 1. ADR-015 decision

**DECISION: BullMQ** as Phase 1–4 primary job/automation **runtime substrate**.

- Domain automation stays in Postgres (runs, steps, waits, HITL).  
- All producers use a ThinkAIQ `JobQueue` port — no BullMQ imports in domain packages.  
- pg-boss is the documented fallback (new ADR required to switch).  
- Temporal remains compatible later via the same ports.

---

## 2. ADR-016 decision

**DECISION: Hybrid C — Playwright (HTML/CSS) primary + pdf-lib post-process.**

- Tenant-branded invoices/quotes/GST docs render from HTML templates.  
- pdf-lib for merge/stamp/watermark.  
- Async `document.render` jobs on the BullMQ `documents` queue.  
- Finance never calls Playwright directly (`DocumentRenderer` port).

---

## 3. Updated ThinkAIQ infrastructure stack (locked for planning)

| Layer | Choice |
|-------|--------|
| Foundation | Vencore selective (ADR-014) |
| Job runtime | **BullMQ** on Redis (ADR-015) |
| Workflow domain | Native ThinkAIQ automation (Postgres) |
| Workflow UI (later) | React Flow (radar; not locked by 1C ADR) |
| PDF | **Playwright + pdf-lib** (ADR-016) |
| Object storage | S3-compatible (unchanged intent) |
| DB | PostgreSQL + Kysely path |
| Realtime | ws + Redis pubsub (Vencore pattern) |
| Email | Nodemailer (+ React Email later) |
| Platform payments | Stripe/Razorpay (external) |
| WhatsApp / Voice | Provider adapters (external) |

---

## 4. What remains Vencore-based

- Monorepo shape (pnpm/turbo)  
- CRM contacts/companies/pipelines/tasks/tags patterns  
- JWT/RBAC/module registry/plugin runtime concepts  
- Public API key + webhook delivery patterns  
- Redis presence (now also BullMQ, not only pubsub)  
- Dashboard grid / chart libraries as optional UI  

---

## 5. What is now locked

| Item | Lock |
|------|------|
| Foundation approach | Selective Vencore (ADR-014) |
| Phase 1–4 queue | BullMQ behind `JobQueue` (ADR-015) |
| PDF strategy | Playwright HTML + pdf-lib (ADR-016) |
| Queue ≠ workflow domain | Explicit boundary (ADR-015 §6) |
| PDF ≠ finance coupling | `DocumentRenderer` port (ADR-016) |
| Truth in Postgres | Workflow state & artifacts metadata in PG; Redis/BullMQ for dispatch |

---

## 6. Intentionally deferred

| Item | Until |
|------|-------|
| Temporal | Automation complexity/ops justifies (4b+) |
| pg-boss switch | Only if Redis HA/TCO fails (new ADR) |
| PDFKit adapter | Concrete niche need |
| @react-pdf primary | Not planned |
| React Flow ADR | Phase when automation builder UI starts |
| Meilisearch | After Postgres FTS proves insufficient |
| WhatsApp/Voice provider pick | Module phase ADRs |
| MFA/SSO vendor | Security hardening phase |

---

## 7. Architectural decisions that must happen next

1. **ADR — Multi-tenant provision & host resolution** (productize beyond single workspace)  
2. **ADR — Tenant white-label storage & theme runtime**  
3. **ADR — Platform vs tenant billing schema freeze** (confirm ADR-003)  
4. **ADR — Outbox publisher design** (exactly-once-ish enqueue to BullMQ)  
5. **ADR — Document template DSL** (Handlebars/Liquid vs React email-like)  
6. **ADR — React Flow automation builder** (when UI phase starts)  
7. **Legal** — Timescale image + npm license CI gate (radar register)  
8. **Accept/revise** ADR-001, ADR-002 (exact Nest vs Express on adapted Vencore), ADR-006 auth hardening  

---

## 8. Phase 1D recommended order

**Phase 1D is written** — see [PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md](./PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md) and ADR-017/018/019.

Remaining after 1D ratification:

1. Doc-sync conflicts (MULTI_TENANCY membership, schema users/outbox, EVENTS aliases).  
2. Skeleton (still gated): `JobQueue` + outbox publisher spike **only after** coding gate opens.  
3. `DocumentRenderer` spike after finance templates sketched.  
4. Do **not** implement CRM/finance features until P0 tenancy/security controls are green.

---

## Document index

| Doc | Path |
|-----|------|
| ADR-015 | [docs/adr/ADR-015-BULLMQ-VS-PG-BOSS.md](../adr/ADR-015-BULLMQ-VS-PG-BOSS.md) |
| ADR-016 | [docs/adr/ADR-016-PDF-GENERATION-STRATEGY.md](../adr/ADR-016-PDF-GENERATION-STRATEGY.md) |
| Prior ADRs | [docs/decisions/](../decisions/) (001–014) |
| OSS radar | [OPEN-SOURCE-COMPONENT-RADAR.md](./OPEN-SOURCE-COMPONENT-RADAR.md) |

**Still no application code.**
