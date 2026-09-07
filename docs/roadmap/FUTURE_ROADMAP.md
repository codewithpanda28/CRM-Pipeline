# FUTURE_ROADMAP.md — ThinkAIQ

## 1. Purpose

Phased product roadmap aligned to P0–P3 priorities. Dates are relative phases, not calendar commitments.

---

## 2. Phase 0 — Documentation & architecture (CURRENT)

- Complete documentation set
- ADRs for open decisions
- Requirements traceability baseline
- **No application coding until gate passes**

---

## 3. Phase 1 — Platform foundation (P0)

Auth · Tenancy · RBAC · Super Admin · White-label basics · Module entitlements · Audit · Storage · Jobs/Scheduler skeleton · Observability baseline · **Platform Ops Center shell (Platform Pulse, tenant health, error groups, basic timeline, job retry)** · DB migrations for core + ops tables

Exit criteria: Create tenant → branded login → tenant admin → isolation tests green → Super Admin Pulse shows live health signals

**Phase 1b / early P1:** Incidents object, affected records, automation failure lane, integration health, recovery actions, SSE/realtime river (see [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md))

---

## 5. Phase 2 — CRM + Sales + Tasks (P1)

Leads/contacts/companies/clients · conversion · pipelines/deals · tasks/follow-ups · timeline · search v1 · import/export v1 · **customization P1:** fields, statuses, pipelines, layouts (basic), views, numbering, Settings Center shell

**Phase 2b (P2 customization):** forms + conditionals, dashboards, report builder, templates, config export/import, dependency/impact UI — [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md)

---

## 5. Phase 3 — Finance + Billing + Metering (P1)

Invoices/payments/AR · GST config pack · subscriptions · platform plans · usage limits

---

## 6. Phase 4 — Automation + API + Webhooks (P1)

**Advanced automation engine (major differentiator):** visual no-code builder (WHEN/CHECK/THEN) · durable runs · conditions/branches/delays/wait-for-event · approvals/HITL · templates/blueprints · health + execution history + visual debugger · quotas · Super Admin automation incident lane  

Workflow engine · public API keys · webhooks · notification fan-out  

**Phase 4b (P2):** NL builder · Copilot · AI explain/optimize/debug · simulator polish · cost awareness  

**Later (P3):** process mining · marketplace

---

## 7. Phase 5 — Team/DPR + Support + Documents + Comms/WhatsApp (P1/P2)

DPR/targets · tickets · documents · email · **WhatsApp first-class inbox + CRM deep integration** · automation send/wait-for-reply

**Later WhatsApp SaaS SKU (P3):** team inbox, campaigns (policy-safe), usage billing packaging — [WHATSAPP.md](../modules/WHATSAPP.md)

**AI Business Assistant (P3):** authorized Q&A / draft tools; no security bypass

---

## 8. Phase 6 — Voice/Telephony + Reseller + Portal + Embedding (P3)

Optional voice · channel inventory · reseller hierarchy · client portal · embeddable API products

---

## 9. Continuous

Security hardening · performance · advanced analytics · plugin marketplace maturity · vertical packs

---

## 10. Related documents

- [IMPLEMENTATION_PLAN.md](../product/IMPLEMENTATION_PLAN.md)
- [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md)
- [REQUIREMENTS_TRACEABILITY.md](../product/REQUIREMENTS_TRACEABILITY.md)
