# OPEN-SOURCE-COMPONENT-RADAR.md — ThinkAIQ Phase 1B

**Status:** Research & planning only  
**Date:** 2026-09-04  
**Constraints:** No application code changes · No package installs · No migrations · No feature implementation  
**Inputs:** ThinkAIQ architecture/product docs · [VENCORE_AUDIT.md](../audit/VENCORE_AUDIT.md) · ADR-014 (Vencore selective foundation)

---

## How to read this document

### Classification codes

| Code | Meaning |
|------|---------|
| **A** | REUSE DIRECTLY — incorporate code/service into ThinkAIQ with clear boundaries |
| **B** | REUSE AS LIBRARY / COMPONENT — npm/service behind ThinkAIQ interfaces |
| **C** | USE AS ARCHITECTURAL REFERENCE ONLY — study patterns; do not merge the app |
| **D** | DO NOT USE — license, architecture, or risk conflict |

### Licensing posture (strict)

Prefer **MIT / Apache-2.0 / BSD** for embedded code.  
**GPL / AGPL / fair-code / BUSL / Commons Clause / commercial-restricted** → never recommend as **A** without explicit legal review; default to **C** or **D** for SaaS/white-label redistribution.

Stars/forks are **secondary** signals only.

### Architecture filter

Candidates must not push ThinkAIQ into a Frankenstein of full apps. Prefer:

- libraries / engines behind ports  
- multi-tenant-friendly designs  
- TypeScript / Node / PostgreSQL / Next.js fit  
- API-first, modular, white-label safe  

**Stack target:** TypeScript · Next.js · Express (or compatible) · PostgreSQL · Redis · Kysely (Vencore) · modular monolith.

---

# Module research

## 1. CRM

### Candidate: Vencore CRM (selective)
- **URL:** https://github.com/vencorehq/Vencore  
- **License:** MIT  
- **Stack:** TS, Next, Express, Kysely, Postgres  
- **Architecture:** Modular monorepo; workspace-scoped CRM  
- **Maintenance:** Active (2026)  
- **Relevant features:** Contacts, companies, pipelines/items, tasks, tags, CSV, activity  
- **Reuse:** Contacts/companies/pipeline/tasks/RBAC patterns (Option B)  
- **Do not reuse:** Single-workspace setup, instance WL, marketing “full multi-tenant SaaS”  
- **Integration:** Already chosen foundation path  
- **Multi-tenant:** Schema-ready; product not SaaS-ready  
- **Redistribution:** MIT OK with attribution  
- **Security:** See audit (CSRF, login rate limit, etc.)  
- **Lock-in:** Low (own fork/adapt)  
- **TS/PG fit:** Excellent  
- **Recommendation:** **A** (selective modules only)

### Candidate: Twenty CRM
- **URL:** https://github.com/twentyhq/twenty  
- **License:** AGPL-3.0 (+ additional permissions — still high SaaS risk)  
- **Stack:** TS, Nest, Postgres  
- **Architecture:** Modern CRM app  
- **Maintenance:** Active  
- **Relevant features:** Rich CRM UX, objects, workflows  
- **Reuse:** UI/UX and data-model ideas only  
- **Do not:** Merge codebase into proprietary/white-label SaaS without legal counsel  
- **Recommendation:** **C** (or **D** if legal rejects AGPL adjacency)

### Candidate: ERPNext / Dolibarr
- **URLs:** https://github.com/frappe/erpnext (GPL-3) · https://github.com/Dolibarr/dolibarr (GPL-3+)  
- **Stack:** Python/PHP · MariaDB/MySQL primarily  
- **Recommendation:** **D** for incorporation · **C** for domain reference (invoice/GST concepts) only  

---

## 2. Sales / Pipeline / Deals

### Candidate: Vencore pipeline module
- **License:** MIT  
- **Reuse:** Kanban, stages, pipeline fields JSONB  
- **Gaps:** Unify legacy `deals`/`pipeline_records`; Customer 360; products/quotes  
- **Recommendation:** **A** (refactor)

### Candidate: React Flow (@xyflow/react) — for sales visual builders later
- See §7 automation visual builder  
- **Recommendation:** **B** for UI graphs, not sales domain logic  

### Full CRM apps (EspoCRM, SuiteCRM)
- **Licenses:** often AGPL/GPL  
- **Recommendation:** **D** embed · **C** reference only  

---

## 3. Finance / Accounting

### Candidate: Full ERP (ERPNext, Dolibarr, Akaunting)
- **Licenses:** GPL / AGPL family common  
- **Architecture:** Monolithic PHP/Python ERP — not modular TS SaaS  
- **Recommendation:** **D** merge · **C** for chart-of-accounts / GST field models  

### Candidate: Double-entry ledger pattern (reference implementations)
- **Approach:** Append-only ledger; balances derived (not a single “must use” repo)  
- **License:** Study MIT blog/code carefully before copying  
- **Recommendation:** **C** — own ThinkAIQ ledger/AR/AP design  

### Candidate: Immature “billing engines” on GitHub (BillingCore, one-off SaaS kits)
- **Risk:** Low maturity, unclear longevity, license mixed  
- **Recommendation:** **D** as core dependency · **C** skim for invoice state machines only  

**Verdict:** Finance domain logic should be **Build Natively** with tax rule packs; do not embed a GPL ERP.

---

## 4. Invoices / Billing

### Platform SaaS billing (ThinkAIQ → tenant)
### Candidate: Stripe Billing + Stripe SDK
- **License:** Proprietary service + Apache/MIT SDK usage terms  
- **Reuse:** Subscriptions, invoices, webhooks, Customer Portal  
- **Multi-tenant:** Map Stripe Customer → ThinkAIQ tenant  
- **Recommendation:** **B** / **External Provider** for platform billing  

### Candidate: Lago (getlago/lago)
- **URL:** https://github.com/getlago/lago  
- **License:** AGPL-3.0 (verify current) — **SaaS redistribution risk**  
- **Recommendation:** **C/D** — prefer Stripe or native metering unless legal clears AGPL  

### Tenant→customer invoicing
- **Recommendation:** **Build Natively** on ThinkAIQ finance module (tenant-branded PDFs, GST lines, credit/debit notes) using PDF libs (§15)  

---

## 5. GST / Tax

### Candidate: Full tax engines (Avalara, TaxJar)
- **Type:** Commercial SaaS APIs  
- **Recommendation:** **External Provider** optional for US/EU later; India GST = **native configurable tax rules** first  

### Candidate: OSS “India GST” PHP/Python plugins
- **Risk:** Stale rules, GPL, wrong stack  
- **Recommendation:** **D** embed · **C** field checklists (HSN/SAC, CGST/SGST/IGST, place of supply)  

---

## 6. Payments

### Candidate: Stripe / Razorpay / PayU SDKs
- **License:** Vendor SDKs (permissive usage; service ToS)  
- **Architecture:** Adapter port `PaymentGateway`  
- **Recommendation:** **B** + **External Provider**  

### Candidate: Open-source payment gateways (Kill Bill, etc.)
- **Licenses:** Often AGPL/complex  
- **Recommendation:** **D** unless legal clears — too heavy vs Stripe/Razorpay  

---

## 7. Automation / Workflow Engine

### Candidate: BullMQ (queue + Flows)
- **URL:** https://github.com/taskforcesh/bullmq  
- **License:** MIT (Pro features separate commercial)  
- **Stack:** TypeScript, Redis  
- **Architecture:** Jobs, delays, retries, rate limits, parent/child flows  
- **Maintenance:** Very active  
- **Reuse:** ThinkAIQ job substrate + simple delayed automation steps  
- **Do not:** Treat as full BPM with wait-for-event across weeks without careful design  
- **Multi-tenant:** Pass `tenantId` in job data; partition queues if needed  
- **TS fit:** Excellent  
- **Recommendation:** **B** (primary job/automation worker substrate for Phase 1–4)

### Candidate: pg-boss
- **URL:** https://github.com/timgit/pg-boss  
- **License:** MIT  
- **Stack:** Node, PostgreSQL only  
- **Architecture:** DB-backed jobs — fewer moving parts than Redis  
- **Reuse:** Alternative if Redis ops cost is high  
- **Tradeoff:** Less ecosystem than BullMQ; still solid  
- **Recommendation:** **B** (strong alternative; decide in ADR vs BullMQ)

### Candidate: Temporal
- **URL:** https://github.com/temporalio/temporal  
- **License:** MIT (SDKs) / Apache-2.0 (server components — verify deploy mix)  
- **Architecture:** Durable execution, replay, long-running workflows  
- **Reuse:** Ideal for advanced wait-for-event / compensation later  
- **Cost:** Ops complexity (Temporal cluster) or Temporal Cloud  
- **TS fit:** Good SDK; not “drop into Express”  
- **Recommendation:** **B** for Phase 4b+ advanced automation **or** **C** until scale demands — do **not** block Phase 1 on Temporal

### Candidate: n8n
- **URL:** https://github.com/n8n-io/n8n  
- **License:** **Sustainable Use License (fair-code)** — restricts multi-tenant hosting / resale without Enterprise  
- **Architecture:** Full visual automation product  
- **Recommendation:** **D** for embedding in white-label SaaS · **C** for UX reference of nodes  

### Candidate: Activepieces / Windmill / Automatisch
- **Licenses:** Often AGPL or source-available — verify each  
- **Recommendation:** Default **C/D**; do not embed without license clearance  

### Candidate: React Flow (@xyflow/react)
- **URL:** https://github.com/xyflow/xyflow  
- **License:** MIT  
- **Reuse:** ThinkAIQ visual workflow canvas (WHEN/CHECK/THEN nodes)  
- **Recommendation:** **B**  

**Automation conclusion:** Own workflow **domain model** + UI on React Flow; execute on **BullMQ or pg-boss** first; consider Temporal when durability/complexity justifies ops.

---

## 8. Scheduler / Background Jobs

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| BullMQ repeatable jobs | MIT | **B** | Cron-like + delayed |
| pg-boss schedules | MIT | **B** | Postgres-native |
| node-cron alone | MIT | **D** as sole system | Vencore lesson: interval-only is weak |
| Vencore worker setInterval | MIT | **C** | Replace with real queue |

---

## 9. Event Bus

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Transactional outbox (pattern) | — | **C→Build** | Own table + publisher (ThinkAIQ ADR already) |
| Redis Streams / PubSub | Redis license / client MIT | **B** | Fan-out after outbox |
| Kafka | Apache-2.0 | **C** early | Overkill until scale |
| RabbitMQ | MPL/commercial dual | **C** | Extra ops |

**Recommendation:** Own **outbox** + Redis pub/sub or BullMQ events; no Kafka Day 1.

---

## 10. Notification System

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Own notification service + Vencore prefs pattern | MIT | **A/B** | Extend Vencore in-app/email prefs |
| Novu | MIT with cloud | **B/C** | Useful if wanting multi-channel hub; evaluate lock-in |
| OneSignal / Firebase | Proprietary | External | Push only |

---

## 11. Email

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Nodemailer | MIT | **B** | Already in Vencore |
| React Email | MIT | **B** | Tenant-branded templates |
| AWS SES / Resend / Postmark | Proprietary | External | Deliverability |

---

## 12. WhatsApp

| Candidate | License / type | Rec | Notes |
|-----------|----------------|-----|-------|
| Meta Cloud API (official) | Vendor ToS | **External + B SDK** | Only production-safe path |
| Baileys / WWebJS unofficial | Various | **D** | Ban/ToS/security risk for SaaS |
| Chatwoot | MIT (core; check edition) | **C** | Omnichannel inbox UX reference; heavy to embed |
| WATI / Gupshup / BSP SDKs | Commercial | External | Provider adapters |

**Recommendation:** Own `WhatsAppProvider` port (ADR-012) + Meta/BSP adapters — **do not** embed unofficial WhatsApp web scrapers.

---

## 13. Voice / Telephony

| Candidate | Type | Rec | Notes |
|-----------|------|-----|-------|
| Twilio / Exotel / Plivo | Commercial APIs | External | Calls, SIP, SMS |
| LiveKit | Apache-2.0 | **B/C** | Realtime media if building voice UX |
| Vapi / Retell style | Commercial AI voice | External | Optional Voice AI module |

**Recommendation:** External telephony + optional OSS media stack; Voice AI as module adapters.

---

## 14. Documents / File Management

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| AWS SDK S3 / R2 | Apache-2.0 | **B** | Already Vencore pattern |
| Uppy | MIT | **B** | Upload UX |
| FilePond | MIT | **B** | Alternative upload UI |

Own metadata ACL in Postgres (ThinkAIQ STORAGE.md).

---

## 15. PDF Generation

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| PDFKit | MIT | **B** | Server streaming invoices |
| pdf-lib | MIT | **B** | Merge/stamp/watermark |
| Puppeteer / Playwright | Apache-2.0 | **B** | HTML→PDF for branded templates (ops cost) |
| @react-pdf/renderer | MIT | **B** | React→PDF alternative |

**Recommendation:** Template HTML (tenant brand) → Playwright/Puppeteer **or** PDFKit for structured invoices; pdf-lib for post-process.

---

## 16. Search

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Meilisearch CE | **MIT** (EE is BUSL) | **B** | Best permissive fit; stick to CE features |
| Typesense | **GPL-3.0** | **D** embed without legal review | Prefer Meilisearch CE |
| OpenSearch | Apache-2.0 | **B** later | Heavier |
| Postgres `tsvector` / pg_trgm | PostgreSQL | **B** Phase 1 | Enough early |

**Recommendation:** Postgres FTS first → Meilisearch CE when scale needs it. Avoid Typesense for proprietary SaaS embed (GPL).

---

## 17. Analytics / Reporting

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Recharts | MIT | **B** | Already Vencore-adjacent |
| Apache ECharts | Apache-2.0 | **B** | Richer charts |
| Metabase | AGPL | **D** embed | **C** for BI ideas; or external Metabase with isolation |
| Cube.js | Apache-2.0 | **B/C** | Semantic layer later |

Own report definitions + SQL/Kysely builders (ThinkAIQ customization).

---

## 18. Audit Logs

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Own `audit_logs` append-only | — | **Build** | Required by ThinkAIQ SECURITY |
| EventStore DB | Proprietary/open variants | **C** | Overkill early |
| Segment/RudderStack | Mixed | External | Product analytics ≠ security audit |

---

## 19. Realtime / WebSocket

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| `ws` + Redis pubsub | MIT | **A/B** | Keep Vencore pattern |
| Socket.IO | MIT | **B** | If needing rooms/fallback |
| SSE | Platform | **B** | Super Admin Pulse river |

---

## 20. API / Webhooks

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vencore `/v1` + API keys + HMAC webhooks | MIT | **A** | Harden SSRF/rate limits |
| Zod | MIT | **B** | Keep |
| OpenAPI generation (zod-to-openapi / trpc later) | MIT | **B** | Docs |
| Svix | Commercial | External optional | Delivery infrastructure |

---

## 21. Form Builder

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| SurveyJS | Mixed (free vs commercial) | **C** | Check commercial terms for SaaS |
| FormKit / React Hook Form + own schema | MIT | **B** | Build ThinkAIQ form builder on RHF + Zod |
| Formbricks | AGPL | **D** embed | Surveys product |

**Recommendation:** Own form/conditional engine (CUSTOMIZATION.md) on **React Hook Form + Zod**; don’t buy a GPL form product into core.

---

## 22. Custom Fields / Custom Objects

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vencore pipeline_fields JSONB | MIT | **A** pattern | Extend per ADR-013 |
| Twenty data model | AGPL | **C** | Object model inspiration |
| Directus | GPL/BSL history — verify | **C/D** | Headless CMS; license careful |

**Recommendation:** Build metadata engine (ADR-013); reference Twenty/Directus conceptually only.

---

## 23. Dashboard Builder

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| react-grid-layout | MIT | **A/B** | Vencore already uses |
| Recharts / ECharts | MIT/Apache | **B** | Widgets |

Own widget registry (module manifests).

---

## 24. Support / Tickets

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Chatwoot | MIT (verify enterprise) | **C** | Inbox UX |
| FreeScout | AGPL | **D** | |
| Zammad | AGPL | **D** | |

**Recommendation:** Build light ThinkAIQ `support` module; Chatwoot only as optional integration later.

---

## 25. Team / HR / DPR

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| OrangeHRM / similar | GPL | **D** | |
| Vencore projects/time logs | MIT | **C/B** optional | Not DPR |

**Recommendation:** Build DPR/targets natively (ThinkAIQ TEAM_DPR.md).

---

## 26. Authentication / Security

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vencore JWT + bcrypt + RBAC | MIT | **A** | Harden CSRF, rate limits, MFA |
| Better Auth | MIT | **B** | Modern TS auth if rewriting auth package |
| Lucia (legacy/community) | MIT | **C** | |
| Clerk / Auth0 | Proprietary | External | Conflicts with self-host/WL data ownership goals |
| argon2 | MIT/Apache impls | **B** | Prefer over bcrypt long-term |
| Helmet | MIT | **B** | API headers |
| rate-limiter-flexible | MIT | **B** | Redis-backed limits |

---

## 27. Multi-tenancy

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vencore workspace_id pattern | MIT | **A** refactor | Productize multi-tenant provision |
| stefanprodan/podinfo style — N/A | — | — | No magic library replaces design |
| Row Level Security (Postgres) | — | **B** later | Defense in depth |

No OSS “multi-tenancy package” replaces ThinkAIQ design (ADR-001).

---

## 28. White-label

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vencore theme injection | MIT | **C→A patterns** | Move to per-tenant branding |
| next-themes | MIT | **B** | |
| CSS variables design tokens | — | **Build** | ThinkAIQ WL architecture |

---

## 29. Plugin / Extension System

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vencore plugin-runtime / plugin-types | MIT | **A** | Harden sandbox & tenancy |
| Webpack Module Federation | MIT | **C** | Possible UI plugins later |

---

## 30. AI / LLM integration

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Vercel AI SDK | Apache-2.0 | **B** | Streaming, providers |
| OpenAI / Anthropic SDKs | Vendor | External | |
| LangChain.js | MIT | **C/B** | Heavy; use selectively |
| LlamaIndex.TS | MIT | **C** | |

**Rule:** AI behind ThinkAIQ tool permissions — never privileged bypass.

---

## 31. Usage Metering

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Own counters + Redis incr | — | **Build** | Align USAGE_METERING.md |
| Lago | AGPL | **D/C** | License risk |
| OpenMeter | Apache-2.0 (verify) | **B/C** | Evaluate maturity before adopt |
| Stripe metered billing | Proprietary | External | Platform overages |

---

## 32. Observability / Error Tracking

| Candidate | License | Rec | Notes |
|-----------|---------|-----|-------|
| Pino | MIT | **A** | Keep from Vencore |
| OpenTelemetry JS | Apache-2.0 | **B** | Traces/metrics |
| Sentry | Proprietary + SDK | External | Error tracking |
| Grafana Loki / Tempo | AGPL (Loki) — careful | External/hosted | Prefer Apache/MIT stack or SaaS |
| Vencore infra alerts | MIT | **B** optional module | Not ThinkAIQ Pulse core |

Own Platform Ops Center UI; feed with OTEL + pino + audit + automation logs.

---

# Special deep-dive: Automation stack comparison

| Option | License | Durable long waits | Ops burden | Visual builder | SaaS WL safe | Fit |
|--------|---------|--------------------|------------|----------------|--------------|-----|
| BullMQ | MIT | Delays yes; multi-day OK with care | Low (Redis) | No (pair React Flow) | Yes | **Phase 1–4 default** |
| pg-boss | MIT | Yes via PG | Lowest if no Redis jobs | No | Yes | **Alt default** |
| Temporal | Apache/MIT mix | Excellent | High / Cloud | No | Yes if self-host OK | **Phase 4b+** |
| n8n | Fair-code SUL | Yes | Medium | Yes | **No** for multi-tenant resale | **D** |
| Vencore rules | MIT | No | Low | Weak | Yes | **Replace** |

**Decision posture (not final ADR):** BullMQ **or** pg-boss for jobs; React Flow for builder; Temporal only when wait/branch/compensation complexity outgrows queues; never embed n8n into ThinkAIQ SaaS core.

---

# Final sections

## 1. Recommended ThinkAIQ Stack (OSS / providers)

| Layer | Choice |
|-------|--------|
| Foundation | Vencore selective (CRM, auth/RBAC, modules, plugins, `/v1`, ws) |
| Jobs / automation runtime | **BullMQ** (primary) or **pg-boss** (alt) — ADR to lock |
| Workflow UI | **React Flow** + own domain graph |
| Advanced durable workflows (later) | **Temporal** (optional) |
| Events | Own **transactional outbox** + Redis |
| Email | Nodemailer + React Email + SES/Resend |
| PDF | PDFKit and/or Playwright + pdf-lib |
| Files | S3-compatible (R2/S3) + Uppy |
| Search | Postgres FTS → **Meilisearch CE** |
| Charts | Recharts / ECharts |
| Auth hardening | Helmet, rate-limiter-flexible, argon2, MFA libs |
| AI | Vercel AI SDK + provider APIs |
| Platform payments | Stripe (or Razorpay for IN) |
| WhatsApp | Meta Cloud API / BSP adapters |
| Voice | Twilio/Exotel + optional LiveKit |
| Observability | Pino + OpenTelemetry + Sentry (hosted) |

---

## 2. Keep From Vencore

- Monorepo (pnpm/turbo) shape  
- Express API + Zod validation culture  
- Kysely + Postgres migrations approach  
- JWT/cookie auth + bcrypt + RBAC tables  
- CRM: contacts, companies, pipelines/stages/fields/items, tasks, tags, CSV  
- Module registry (`packages/modules`)  
- Plugin runtime/types (harden)  
- Public API keys + webhook delivery patterns (`/v1`)  
- WebSocket + Redis pubsub messaging patterns  
- react-grid-layout dashboards  
- Docker compose baseline  
- MIT license compatibility  

---

## 3. Replace or Refactor From Vencore

- Single-workspace setup guard → multi-tenant provision  
- Instance `system_settings` branding → per-tenant WL  
- `setInterval` workers / dual API+worker overlap → BullMQ/pg-boss  
- PM/pipeline rule “automation” → ThinkAIQ automation engine  
- Legacy deals/pipeline_records drift → single deal model  
- Missing CSRF, login rate limit, webhook SSRF gaps → harden  
- Clerk/Stripe dead deps → remove  
- Infra monitoring as core identity → optional module only  
- Internal messaging ≠ WhatsApp — keep separate  

---

## 4. Build Natively in ThinkAIQ

- Super Admin Platform Ops / Incident Center  
- Multi-tenant SaaS plane (plans, entitlements, metering)  
- Finance/GST/AR/AP/credit-debit (tenant-branded)  
- Advanced automation domain (triggers, HITL, versioning, debugger)  
- Customization engine (forms, layouts, custom objects, validation)  
- Customer 360, quotes, products, DPR/targets  
- Support tickets (light)  
- WhatsApp module (normalized schema + providers)  
- Reseller hierarchy  
- Security audit log  
- Requirements-driven API versioning & idempotency  

---

## 5. External Service / Provider Only

- Card/UPI collection: Stripe, Razorpay, etc.  
- Transactional email delivery: SES, Resend, Postmark  
- WhatsApp: Meta Cloud API / BSP  
- SMS: Twilio/Exotel/MSG91  
- Voice AI / SIP: Twilio, Exotel, specialist AI voice vendors  
- Error SaaS: Sentry (optional)  
- Object storage hosted: R2/S3/GCS  
- Optional: Temporal Cloud (if not self-hosting Temporal)  

---

## 6. License Risk Register

| Item | License risk | Action |
|------|--------------|--------|
| n8n | Fair-code SUL | Do not embed in WL SaaS |
| Twenty CRM | AGPL-3 | Reference only; legal if any code copy |
| ERPNext / Dolibarr / FreeScout / Zammad | GPL/AGPL | No merge |
| Typesense | GPL-3 | Prefer Meilisearch CE |
| Meilisearch EE | BUSL | Stay on CE features |
| Lago | AGPL (verify) | Avoid embed |
| Elasticsearch default distro | Elastic/SSPL variants | Prefer OpenSearch or Meilisearch |
| Grafana Loki | AGPL | Prefer hosted OTEL/Sentry or Apache alternatives |
| SurveyJS commercial clauses | Mixed | Legal review before SaaS embed |
| TimescaleDB image | Product license | Confirm for SaaS hosting (Vencore compose) |
| Unofficial WhatsApp libs | ToS + license | Ban |
| Transitive npm deps | Mixed | CI `license-checker` / FOSSA before ship |

---

## 7. Recommended Implementation Order (dependency-aware)

1. **Lock foundation ADR** — Vencore selective + BullMQ vs pg-boss  
2. **Security hardening libs** — Helmet, Redis rate limits, CSRF strategy, argon2 plan  
3. **Multi-tenant + WL data model** (native) using Vencore workspace patterns  
4. **Outbox + BullMQ/pg-boss workers** replace interval jobs  
5. **Keep/extend CRM** from Vencore  
6. **PDF + storage libs** enable finance invoicing  
7. **Native finance/tax** (no GPL ERP)  
8. **Stripe/Razorpay** for platform billing + metering counters  
9. **React Flow + automation domain** on queue runtime  
10. **Postgres FTS → Meilisearch CE** when needed  
11. **WhatsApp provider adapters** (Meta/BSP)  
12. **AI SDK** for Copilot (after permissions solid)  
13. **Temporal** only if automation durability requires it  
14. **Voice providers** as optional module  

---

## 8. Top 10 Components (investigate / adopt first)

| # | Component | Class | Why |
|---|-----------|-------|-----|
| 1 | **Vencore selective CRM/auth/modules/plugins/API** | A | Fastest path; audited |
| 2 | **BullMQ** (or pg-boss) | B | Replaces weak workers; automation substrate |
| 3 | **React Flow (@xyflow/react)** | B | Visual WHEN/CHECK/THEN builder |
| 4 | **Transactional outbox (native) + Redis** | Build/B | Event spine for automation/webhooks |
| 5 | **PDFKit + pdf-lib** (and/or Playwright) | B | Tenant invoices/docs |
| 6 | **Nodemailer + React Email** | B | Branded notifications |
| 7 | **Helmet + rate-limiter-flexible + argon2** | B | SaaS security baseline |
| 8 | **Meilisearch CE** (after PG FTS) | B | Global search without GPL Typesense |
| 9 | **Stripe / Razorpay SDKs** | B/External | Platform billing without AGPL Lago |
| 10 | **Vercel AI SDK** | B | Controlled Copilot layer |

**Honorable mention (later):** Temporal · LiveKit · OpenTelemetry · Uppy · OpenMeter (license/maturity check).

---

## Closing principle

ThinkAIQ should **compose permissive libraries and providers behind owned domain modules**, reuse **Vencore’s MIT CRM/platform scaffolding**, and **refuse GPL/AGPL/fair-code product merges** that poison white-label SaaS redistribution.

No Frankenstein of ERPNext + n8n + Twenty.  
One core · many tenants · many configs · owned automation/finance/tenancy planes.

---

*Phase 1B complete — research document only. Next step (when approved): ADRs for BullMQ vs pg-boss and finance PDF approach — still no implementation.*
