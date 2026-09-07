# VENCORE_AUDIT.md — ThinkAIQ Foundation Assessment

**Audit date:** 2026-09-04  
**Source:** `https://github.com/vencorehq/Vencore` (cloned read-only to `_audit/Vencore`)  
**Commit inspected:** latest `main` at clone time (post messaging merge)  
**Method:** Source inspection of apps, packages, migrations, middleware, workers, tests — **not** README-only  
**Constraint:** READ-ONLY — no Vencore code modified  

Companion reports:  
[VENCORE_TENANCY.md](./VENCORE_TENANCY.md) · [VENCORE_DATABASE.md](./VENCORE_DATABASE.md) · [VENCORE_SECURITY.md](./VENCORE_SECURITY.md) · [VENCORE_DEPENDENCIES.md](./VENCORE_DEPENDENCIES.md) · [VENCORE_AUTOMATION.md](./VENCORE_AUTOMATION.md) · [VENCORE_WHITE_LABEL.md](./VENCORE_WHITE_LABEL.md) · [VENCORE_REUSE_MAP.md](./VENCORE_REUSE_MAP.md)

---

## 1. Executive summary

Vencore is a **real, MIT-licensed, self-hosted company OS** (v0.2.0) with:

- Solid **CRM basics** (contacts, companies, pipelines/`pipeline_items`, tasks, tags, CSV I/O, activity)
- **Workspace-scoped RBAC**, JWT cookie auth, Kysely + Postgres
- **Module registry**, plugin SDK/runtime/marketplace scaffolding
- Public **`/api/v1`** + API keys + outbound webhooks
- Worker for infra/PM/cron-style jobs
- Instance-level white-label via `vencore.config` / `system_settings`

It is **not** a multi-customer SaaS control plane. Setup **blocks creating a second workspace**. Platform billing/Stripe SaaS was **intentionally removed**. Finance/GST/invoicing **do not exist**. Automation is a **limited rule engine** (PM + partial pipeline), **not** ThinkAIQ’s advanced workflow product. White-label is **instance-level**, not per-tenant SaaS branding at scale. Messaging is **internal team chat**, not WhatsApp.

### Verdict (preview)

**OPTION B — Use Vencore selectively** as technical foundation for CRM/module/plugin/API/worker patterns and monorepo shape; build ThinkAIQ’s multi-tenant SaaS plane, finance, advanced automation, Super Admin ops, WhatsApp, and customization engine as **new platform layers** (heavily adapting Vencore where contracts fit).

---

## 2. Architecture

### Repository structure

| Path | Responsibility |
|------|----------------|
| `apps/web` | Next.js App Router dashboard, portal, plugin UI |
| `apps/api` | Express REST API, auth, modules, `/api/v1`, plugin host, in-process workers (webhooks) |
| `apps/worker` | Background jobs: infra pings, alerts, PM jobs, pipeline reminders |
| `apps/updater` | Self-host updater (docker compose pull/up, secret-gated) |
| `packages/db` | Kysely client, `schema.ts`, ~72 migrations |
| `packages/types` | Shared TS types (some stale Stripe/plan leftovers) |
| `packages/config` | `vencore.config.json` schema + loader |
| `packages/modules` | Module definitions (CRM, projects, infra, analytics, messaging, admin, …) |
| `packages/plugin-runtime` / `plugin-types` | Plugin execution + SDK types |
| `packages/api-client` | Typed client for web/plugins |
| `docker/` | Dockerfiles for api/web/worker/updater |
| `install/`, `scripts/` | Install/deploy helpers |
| `plugin-docs/` | Plugin developer docs |
| `docs/superpowers/` | Internal planning docs |
| `docker-compose.yml` | Postgres(+Timescale), Redis, api, web, worker |

**Shape:** Turborepo + pnpm workspaces — aligns with ThinkAIQ modular-monolith intent.

**Data flow (as implemented):** JWT/cookie → `requireAuth` loads user + `user.workspace_id` workspace → routes filter by `workspace_id` → worker jobs generally workspace-aware for infra/PM → webhooks polled for delivery.

---

## 3. Tech stack (verified from manifests)

| Layer | Actual |
|-------|--------|
| Language | TypeScript ^5.4 |
| Package manager | **pnpm@10.33.2** |
| Monorepo | Turborepo ^2 |
| Frontend | **Next.js 16.2.6**, React 19.x, TanStack Query ^5, Tailwind 4 |
| Backend | **Express ^4.19**, Zod ^3.23 |
| DB access | **Kysely ^0.27** + `pg` |
| Database | PostgreSQL 15 (+ optional **TimescaleDB** for metrics hypertables) |
| Cache / pubsub | **Redis** via `ioredis` |
| Auth | **JWT** (`jsonwebtoken`) + **httpOnly cookie** `vencore_token`; **bcrypt** ^6 |
| Realtime | **WebSockets** (`ws`) + Redis pubsub; some SSE mentions in README |
| Files | Local/R2 via **@aws-sdk/client-s3** presign |
| Email | nodemailer |
| Tests | **Vitest** (~96 test files) |
| Build | `tsc` / Next build / turbo |

**Note:** README still says “Next.js 14” in places — **code is Next 16**. Clerk dependency remains in `package.json` but auth is local JWT (Clerk columns dropped historically).

---

## 4. Authentication

| Capability | Status | Evidence |
|------------|--------|----------|
| Login / logout | READY | `apps/api/src/routes/auth.ts` |
| Password hashing | READY | bcrypt cost 12 |
| JWT + cookie | READY | `middleware/auth.ts` — Bearer or `vencore_token` |
| Cookie flags | PARTIAL | httpOnly; SameSite **lax** (README claimed Strict — code is lax); secure in prod |
| Session expiry | PARTIAL | JWT expiry exists; no rich session store/device list |
| Password reset | READY | `POST /api/auth/forgot`, `POST /api/auth/reset/:token` (1h token; SMTP) — token stored plaintext (hygiene risk) |
| First admin / setup wizard | READY | `routes/setup.ts` — seeds workspace+admin |
| MFA / SSO | MISSING | |
| Login rate limit | MISSING | High risk |
| CSRF | MISSING | Cookie session + credentials CORS |

Key files: `middleware/auth.ts`, `routes/auth.ts`, `routes/setup.ts`, `routes/users.ts`, `routes/me.ts`.

---

## 5. Multi-tenancy

**Critical finding:** Schema is **multi-workspace capable** (`workspace_id` everywhere), but product/setup is **single-workspace self-host**.

- Auth binds workspace from **`users.workspace_id`**, not host header multi-tenant resolution.
- Setup returns `ALREADY_CONFIGURED` if any workspace exists.
- Isolation relies on **application query filters**, not Postgres RLS.
- No platform Super Admin across many customer tenants.

Full analysis: [VENCORE_TENANCY.md](./VENCORE_TENANCY.md).

---

## 6. Database

See [VENCORE_DATABASE.md](./VENCORE_DATABASE.md).

Reusable: workspaces, users, RBAC tables, companies, contacts, tags, pipelines/stages/fields/items, tasks, activities, dashboards, webhook_*, api_keys, messaging, plugins, infra metrics.

Must redesign/add for ThinkAIQ: finance, platform plans/billing, ops incidents, advanced automation graph, WhatsApp, true multi-tenant branding, custom objects engine, usage metering (historical meters dropped).

Legacy drift: `deals` / `pipeline_records` vs live `pipeline_items`; analytics may still hit older tables.

---

## 7. CRM

| Feature | Status |
|---------|--------|
| Contacts | READY |
| Companies | READY |
| Pipeline + stages | READY |
| Deals (as pipeline_items) | PARTIAL (naming/model evolution) |
| Tasks | READY |
| Activities | READY |
| Tags | READY |
| Pipeline custom fields | READY |
| Contact/company custom fields | MISSING |
| Owners | PARTIAL |
| Import/export contacts & companies | READY |
| Customer 360 | PARTIAL (activity/widgets; not ThinkAIQ 360) |
| Quotes / products catalog | MISSING |

---

## 8. White-label

**INSTANCE LEVEL** (config file + `system_settings`), not true per-tenant SaaS white-label.

Details: [VENCORE_WHITE_LABEL.md](./VENCORE_WHITE_LABEL.md).

---

## 9. Module system

- Modules defined in `packages/modules` (permissions, nav, apiPrefixes, workers).
- Enablement: **per-workspace** DB flags + instance `features.*` in config.
- Middleware `module.ts` caches `{workspaceId}:{moduleId}`.
- Strong enough as a **starting module registry** for ThinkAIQ; needs plan/entitlement coupling, Super Admin overrides, and cleaner package boundaries for finance/automation/whatsapp.

---

## 10. Plugin system

Typed SDK (`plugin-types`), runtime (`plugin-runtime`), marketplace/install flows, permissions bridges, UI frames with CSP on iframe route.

**Reusable** as extensibility foundation with security hardening (plugin trust model, tenant isolation of plugin data, no unrestricted code for normal tenants). Semver/host_version checks exist in recent work.

---

## 11. APIs

| Capability | Status |
|------------|--------|
| Envelope `{data,error}` | READY |
| Cookie/JWT auth | READY |
| Public API + API keys + scopes | READY | Mounted at **`/v1`** (not `/api/v1`); keys `vnt_read_` / `vnt_rw_`; scopes read \| read_write |
| Webhooks subscribe/deliver/retry | READY (polling worker) |
| Pagination on some lists | PARTIAL |
| Filtering/sorting | PARTIAL (varies by route) |
| API versioning beyond v1 policy | PARTIAL |
| Global rate limiting | MISSING (some route-local) |
| Idempotency-Key | MISSING |

---

## 12. Workers

- Separate `apps/worker` process (`setInterval` ~60s) **plus** overlapping in-API workers (webhooks, PM due, plugin-cron, etc.) — dual-runner risk if both enabled.
- Jobs: website ping, DB health, alert eval, metrics rollup, PM overdue/due, pipeline reminders, etc.
- Queue: **not** BullMQ/`node-cron` (dep unused) — interval + DB polling; Redis is pub/sub/health, not the job broker.
- Retry: ad hoc per job; not a unified durable workflow runner.
- **Insufficient alone** for ThinkAIQ advanced automation (delays, wait-for-event, versioning) — needs new automation execution substrate (can still share worker process model).

---

## 13. Automation

See [VENCORE_AUTOMATION.md](./VENCORE_AUTOMATION.md).

**PARTIAL** rule engines; pipeline event executor **not wired** into worker index; no delays/branches/approvals/AI/visual debugger.

---

## 14. Finance

**MISSING** — invoices, payments, expenses, vendors, AR/AP, GST, credit/debit notes, subscriptions (customer billing). Platform Stripe SaaS billing **removed** in self-host refactor.

---

## 15. Super Admin

**MISSING** as ThinkAIQ Control Center.

What exists: workspace admin RBAC (`requireAdmin` / grants_all), setup wizard, instance updater (`system` routes), branding config.

No: multi-tenant create/suspend, plans, platform billing, platform Pulse, incidents, cross-tenant analytics.

---

## 16. Observability

Reusable: pino logs, infra **alerts** module, automation_logs, webhook delivery status, `/api/internal/health` (secret), version/update info.

Missing for ThinkAIQ ops center: security audit log, tenant health rollups, error fingerprinting, MTTA/MTTR, APM, public health for LB (partial).

---

## 17. Security

See [VENCORE_SECURITY.md](./VENCORE_SECURITY.md).

Baseline competent for self-host; **not** “enterprise SaaS ready” without CSRF, login rate limits, SSRF guards on webhooks, security audit trail, header hardening, MFA.

---

## 18. WhatsApp compatibility

Messaging = **internal team chat** only. No WhatsApp/SMS provider abstraction.

Architecture **can** host a new `whatsapp` module (events, workspace_id, workers, plugins) **without** breaking CRM if kept modular — but it is **net-new**.

---

## 19. Voice AI compatibility

No voice agents/calls/recordings module. Infra “agent” is **server metrics agent**, not Voice AI. Voice would be a new module + storage + metering.

---

## 20. Customization

| Capability | Status |
|------------|--------|
| Pipeline fields + stages | READY |
| PM custom fields | READY |
| Contact/company fields | MISSING |
| Dashboards/widgets | READY |
| Form builder | MISSING |
| Layout builder (record pages) | MISSING |
| Saved views (generic) | PARTIAL |
| Custom objects | PARTIAL/legacy (`record_types`) |
| Validation/business rules DSL | MISSING |
| Config export/blueprints | MISSING |

ThinkAIQ configuration engine is mostly **new**, with pipeline field patterns reusable.

---

## 21. Dependencies / licenses

See [VENCORE_DEPENDENCIES.md](./VENCORE_DEPENDENCIES.md). Repo **MIT**. Run formal license scan before commercial WL redistribution; Timescale image licensing must be checked for distribution model.

---

## 22. Code quality

Strengths: Zod validation widely used; Kysely typed queries; consistent workspace filters on many routes; modular packages.

Weaknesses: dual/legacy CRM models; dead pipeline automation executor path; Clerk/Stripe leftovers; N+1 in some automation loops; in-memory rate limit maps; analytics drift.

---

## 23. Testing

~96 Vitest files, ~560 cases. RBAC/cross-workspace tests exist for roles. **No comprehensive tenant isolation suite across all CRM routes.** Automation has unit tests. E2E sparse.

Critical missing for ThinkAIQ: isolation fuzz tests, finance, automation durability, webhook SSRF tests.

---

## 24. Deployment

Docker Compose + Dockerfiles + migrator on API boot + updater app. Suitable for **self-host single instance**. For ThinkAIQ SaaS: need multi-tenant deploy topology, managed Postgres, horizontal workers with real queue, healthchecks on web/worker, backup runbooks (not fully productized).

---

## 25. Scalability (architectural, not benchmarked)

| Scale | Assessment |
|-------|------------|
| 1 workspace / tens of users | Fits current design |
| 10–100 SaaS tenants | Needs tenancy productization + indexes + rate limits |
| 1,000+ tenants | Needs queue partitioning, Pulse snapshots, careful custom-field indexing, possibly extract automation/messaging |
| 10,000 | Not supported without major platform work |

Bottlenecks: interval workers, in-memory caches/limits, JSONB field filters, single-node assumptions.

---

## 26. Feature matrix

| FEATURE | VENCORE STATUS | REUSABLE? | CHANGE REQUIRED | PRIORITY |
|---------|----------------|-----------|-----------------|----------|
| Multi-tenant SaaS | PARTIAL (schema) / UNSAFE as-is for SaaS | Selective | Host resolution, provision many tenants, isolation tests, RLS optional | P0 |
| White-label per tenant | PARTIAL (instance) | Partial | Per-tenant branding tables + domain map | P0 |
| Super Admin / Ops Center | MISSING | No | New platform app | P0 |
| Auth JWT/RBAC | READY | Yes | MFA, CSRF, rate limit, session mgmt | P0 |
| Contacts/Companies | READY | Yes | Extend + custom fields | P1 |
| Pipeline/Deals | READY/PARTIAL | Yes | Unify model; Customer 360 | P1 |
| Tasks/Activities/Tags | READY | Yes | Auto-task from automation | P1 |
| Products/Quotes | MISSING | — | New | P1 |
| Finance/GST/Invoices | MISSING | — | New | P1 |
| Subscriptions (customer) | MISSING | — | New | P1 |
| Platform billing/plans | MISSING (removed) | — | New | P0 |
| Module entitlements | PARTIAL | Yes | Plan coupling | P0 |
| Advanced automation | PARTIAL/MISSING | Patterns only | New engine | P1 |
| AI automation | MISSING | — | New | P2 |
| API keys + webhooks | READY | Yes | Path is `/v1`; add idempotency, global rate limits, `/api/v1` alias if desired | P1 |
| Usage metering | MISSING (dropped) | — | New | P1 |
| WhatsApp SaaS | MISSING | Infra only | New module | P2/P3 |
| Voice AI/Telephony | MISSING | — | New | P3 |
| Reseller | MISSING | — | New | P3 |
| Customization engine | PARTIAL | Pipeline fields | Major new | P1 |
| Incident/observability UI | PARTIAL (infra alerts) | Partial | New Pulse | P0/P1 |
| Documents/Support tickets | MISSING/UNKNOWN | — | New or light | P2 |
| DPR/Targets/Team HR | MISSING | — | New | P1 |
| Plugin system | READY/PARTIAL | Yes | Harden tenancy/security | P2 |
| Client portal | PARTIAL | Yes | Align with ThinkAIQ portal | P3 |

---

## 27. File reuse map

See [VENCORE_REUSE_MAP.md](./VENCORE_REUSE_MAP.md).

Summary: **KEEP/REFACTOR** monorepo, db package, CRM modules, auth/RBAC middleware, api-v1, plugins, worker shell. **REPLACE/NEW** tenancy SaaS plane, finance, automation engine, Super Admin, WhatsApp, metering, true WL.

---

## 28. Gap analysis

### FOUNDATION ALREADY EXISTS
Monorepo TS stack · Express+Next · Kysely/Postgres · Redis · JWT auth · RBAC · workspace_id patterns · CRM core · module registry · plugin SDK · API keys/webhooks · worker process · dashboards · messaging (internal) · infra alerts (ops signals) · Docker deploy

### NEEDS MODIFICATION
Single-workspace setup → multi-tenant provision · instance WL → tenant WL · module flags → plan entitlements · pipeline_items model cleanup · analytics table drift · worker → durable queue · security hardening · strip dead Clerk/Stripe assumptions

### NEEDS NEW IMPLEMENTATION
ThinkAIQ Super Admin Ops Center · finance/GST · platform+customer billing · advanced automation+AI · WhatsApp · Voice · reseller · customization engine · usage metering · security audit log · DPR/team targets · support tickets · document management depth

### SHOULD NOT BE REUSED (as ThinkAIQ product identity)
Self-host “one company OS” positioning · infra monitoring as core differentiator (optional module OK) · Timescale-required path for CRM · README claims that exceed code (Strict cookies, Next 14, full multi-tenant SaaS)

### ARCHITECTURAL RISK
Assuming `workspace_id` columns == SaaS multi-tenancy · wiring incomplete pipeline automations · SSRF via automation webhooks · legacy dual deal models · building finance on top without clear bounded context · plugin arbitrary code trust

---

## 29. Risks

1. **False multi-tenancy** — shipping ThinkAIQ on Vencore without rewriting provision/isolation tests → cross-customer incidents  
2. **Scope underestimation** — finance + automation + ops center are majority of ThinkAIQ differentiators and are missing  
3. **License/ops** — Timescale + transitive deps need commercial review  
4. **Security debt** — CSRF, login brute force, SSRF before public SaaS  
5. **Model debt** — CRM schema evolution complexity  

---

## 30. Final recommendation

### **OPTION B: Use Vencore selectively**

**Why not A (primary foundation as-is)?**  
Product is self-hosted single-workspace; missing finance, advanced automation, Super Admin SaaS plane, per-tenant WL, metering; automation executor gaps; security not SaaS-grade.

**Why not C (other OSS foundation)?**  
Vencore already matches ThinkAIQ’s intended TS modular monolith, CRM, plugins, API keys, workers — switching loses real inspected value without proven better fit.

**Why not D (build fully independent)?**  
Would discard working CRM/RBAC/module/plugin/API scaffolding and add 3–6+ months of undifferentiated work. Better to **adopt patterns + packages**, fork/adapt under ThinkAIQ governance, and implement missing platform layers cleanly.

**How to proceed (still docs/approval gated):**  
1. Accept Option B.  
2. Define adaptation ADR: “Vencore-selective foundation”.  
3. Map KEEP packages into ThinkAIQ monorepo namespaces.  
4. Implement P0 tenancy/WL/Super Admin/security before CRM feature parity expansion.  
5. Treat finance & automation as greenfield modules with event contracts into existing CRM.

---

*End of primary audit. Satellite docs expand evidence.*
