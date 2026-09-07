# PHASE-2B-PLAN.md — Live Isolation + Outbox/BullMQ Foundation

**Phase:** 2B — Planning only  
**Date:** 2026-09-04  
**Constraint:** **NO** application code · **NO** package installs · **NO** migrations · **NO** feature implementation  

**Inputs:** Phase 2A code plan / migration notes / implementation report · ADR-015 · ADR-017 · ADR-018 · ADR-019 · ADR-020 · ADR-023 · ThinkAIQ architecture docs · current `apps/api` + `apps/worker` inventory  

**Goal:** Close remaining foundation risks before normal CRM/finance development via two tracks:

| Track | Focus |
|-------|--------|
| **A** | Live PostgreSQL multi-tenant isolation proof |
| **B** | Durable outbox + BullMQ behind `JobQueue` (ADR-015/019) |

**Out of scope:** CRM/Finance/WhatsApp/Voice feature work · Super Admin UI polish · Temporal · Meilisearch · destructive `workspace_id` drops  

---

## Phase 2A inherited risks (carry-forward)

1. Isolation confidence is mostly **unit/logic** — not live Postgres IDOR proof.  
2. Routes still scope via `req.workspace.id` (equals tenant id) — omission = IDOR.  
3. Interval workers + dual webhook runners remain; outbox publisher not wired.  
4. Rate limit **memory fallback** unsafe for multi-replica prod.  
5. CSRF off outside production unless `CSRF_ENFORCE=true`.  
6. WS `?token=` leakage gap (ADR-023 P1).  
7. Platform admin stub; no seeded Super Admin UX.  
8. Legacy plaintext `password_reset_token` dual-read still possible.  
9. ThemeSnapshot / tenant branding runtime incomplete vs ADR-018.  
10. Custom domain cert automation not implemented (ADR-005).  

---

# PART A — Live database isolation inventory

**Discriminator today:** almost all tenant-owned rows use `workspace_id` (dual-read: `workspace_id === tenant_id` after 2A backfill). Authz source of truth is **TenantContext**, not `users.workspace_id`.

**Query mechanism today:** inline Kysely in routes (no repository layer). Pattern: `.where('workspace_id', '=', workspace.id)` where `workspace` comes from `requireAuth`.

**Authorization today:** `requireAuth` → membership + Host/JWT → `requirePermission` / module gates.

**Systemic vulnerability:** any handler that loads by primary key **without** workspace/tenant predicate, or joins without tenant equality, or accepts client IDs from another tenant.

### A.1 Core CRM / pipeline

| Entity / table | Discriminator | Query mechanism | AuthZ | Scope guaranteed? | Omission risk | Phase 2B change |
|----------------|---------------|-----------------|-------|-------------------|---------------|-----------------|
| `contacts` | `workspace_id` | routes/contacts, v1/contacts | requireAuth + perm | **If** filter present | High | Live IDOR suite; lint/helper assert; optional `tenantRepo` |
| `companies` | `workspace_id` | companies + v1 | same | Conditional | High | same |
| `contact_tags` / links | `workspace_id` | contact-tags / contacts | same | Conditional | Med | same |
| `pipelines` | `workspace_id` | pipelines | same | Conditional | High | same |
| `pipeline_stages` | via pipeline FK | pipeline routes | same | Med (join must enforce) | High | assert parent pipeline tenant |
| `pipeline_fields` | via pipeline | pipeline-fields | same | Med | High | same |
| `pipeline_items` / `items` | `workspace_id` | pipeline-items | same | Conditional | High | same |
| `pipeline_records` / field values | `workspace_id` | pipeline overhaul paths | same | Conditional | High | same |
| `deals` (legacy) | `workspace_id` | may coexist with records | same | Conditional | Med | cover both paths in tests |
| `tasks` | `workspace_id` | tasks, tasks-unified, v1 | same | Conditional | High | same |
| `activities` | `workspace_id` | activity + logActivity | same | Conditional | High | same |
| Tags (CRM) | `workspace_id` | as above | same | Conditional | Med | same |

### A.2 Files / storage / messaging

| Entity | Discriminator | Mechanism | Guaranteed? | Risk | 2B change |
|--------|---------------|-----------|-------------|------|-----------|
| Messaging R2 keys | key prefix | upload + messages validate | Partial (new `tenants/{id}/…`, legacy `messaging/{id}/…`) | Med | Integration tests both prefixes; signed GET authz |
| `message_attachments` | `workspace_id` + r2_key | messages | Conditional | Med | same |
| `plugin_files` / `plugin_storage` | `workspace_id` | plugins bridge | Conditional | High | isolate + tests |
| Project task attachments | via project | portal/PM | Conditional | Med | cover in matrix |

### A.3 API keys / webhooks / modules / settings / branding

| Entity | Discriminator | Guaranteed? | Risk | 2B change |
|--------|---------------|-------------|------|-----------|
| `api_keys` | `workspace_id` | Conditional | High | IDOR list/get/revoke |
| `webhook_subscriptions` / deliveries | sub.`workspace_id` | Conditional | High | IDOR + no cross-tenant replay |
| `workspace_modules` | `workspace_id` | Conditional | Med | treat as tenant entitlements |
| `workspace` row / PATCH | id = tenant | via admin | Med | map to tenant settings |
| `tenant_settings` / `tenant_branding` | `tenant_id` | New tables; APIs may still use workspace/config | **Incomplete** | Wire read/write APIs + isolation tests |
| `system_settings` | **none** (platform) | N/A | Brand leak if reused | Keep platform-only; never serve as tenant brand SoR |
| `notifications` / preferences | `workspace_id` / user | Conditional | Med | matrix |
| `cross_module_settings` | `workspace_id` | Conditional | Med | matrix |

### A.4 Other tenant-owned surfaces (discovered)

| Area | Tables / routes | Notes for 2B |
|------|-----------------|--------------|
| Infra | servers, websites, infra_databases, alerts, thresholds, ssh | Same workspace filter pattern — include in isolation suite |
| PM | projects, tasks, milestones, sprints, time_logs, docs, templates | High surface area |
| Messaging | channels, messages, members, reactions | High |
| Plugins / hub | workspace_plugins, hub records, hooks | High — bridge methods must use ctx.workspaceId only |
| Dashboards / analytics | dashboards, analytics | Include |
| RBAC | roles, user_roles, invites | Tenant-scoped; multi-membership edge cases |
| Automation (Vencore) | automation_rules/logs | Migrate execution to BullMQ later in 2B; isolate data now |
| Tenancy meta | tenants, memberships, domains, job_controls, outbox, security_audit | Platform or self-tenant only; A must not read B |

### A.5 Summary verdict

| Status | Meaning |
|--------|---------|
| **Not proven live** | Scope depends on every route remembering `workspace.id` |
| **2B mandatory** | Live harness + attack matrix + route audit + fix omitters |

---

# PART B — Live Postgres test harness

### B.1 Environment

| Item | Design |
|------|--------|
| Engine | Real PostgreSQL 15+ (Docker Compose service `postgres-test` or ephemeral CI service) |
| App DB URL | `DATABASE_URL_TEST` — **never** point at prod |
| Migrations | Run full Kysely migrator including `20260904_001_thinkaiq_tenancy_foundation` |
| ORM access | Same `@vencore/db` client as app — **no** mocked repositories for isolation suite |
| Lifecycle | `beforeAll`: create DB / migrate; `beforeEach` or transaction rollback **or** truncate tenant-owned tables in FK-safe order; `afterAll`: drop DB optional |
| Parallelism | Prefer **serial** file for isolation suite OR schema-per-worker (`test_w${JEST_WORKER_ID}`) to avoid cross-talk |
| Cleanup | Truncate + reseed fixtures; never leave A/B pollution |

### B.2 Preferred fixtures

```text
tenantA (slug=a)     tenantB (slug=b)
userA  → membership active → tenantA only
userB  → membership active → tenantB only
multiUser → active memberships → tenantA + tenantB

Sample per tenant: contact, company, pipeline+item/deal, task, activity,
tag, api_key, webhook_subscription, notification, branding row,
file object key under tenants/{id}/..., outbox_events row, module flag
```

Hosts for HTTP tests:

- `a.thinkaiq.com` → tenantA  
- `b.thinkaiq.com` → tenantB  
- `localhost` / `app.thinkaiq.com` → platform (no host tenant; membership/JWT selects)

### B.3 Helper API (conceptual)

```text
createIsolationFixtures(db)
authAs(user, { host, activeTenantId })
request(app).get(...).set(Host).set(Cookie/Bearer)
expectDenied(res) // 403 or 404 — pick product convention and stick to it
```

---

# PART C — Cross-tenant attack matrix

Convention: **deny = 403 or 404** (document chosen code; prefer 404 for IDOR obscurity on GET-by-id, 403 for explicit authz failures like Host/JWT mismatch).

### C.1 READ (A → B must deny)

| Target | Test |
|--------|------|
| Contact / company / deal or pipeline item / task / activity | GET by B id as A |
| File / attachment metadata | GET B file |
| API key | GET/list must not include B keys; GET B id deny |
| Webhook subscription / delivery | same |
| Branding / tenant_settings | GET B deny |
| Workspace modules / notifications | no B data |
| Outbox / security_audit / jobs | no B rows |
| Plugin storage key for B | deny |

### C.2 WRITE

| Attack | Expect |
|--------|--------|
| PATCH/DELETE B entity as A | deny |
| Create contact with `company_id` belonging to B | deny |
| Assign owner / tag / pipeline stage from B | deny |
| PATCH B settings/branding/modules | deny |
| Create webhook pointing to reuse B secret/id | deny |

### C.3 AUTH / CONTEXT

| Case | Expect |
|------|--------|
| Host A + JWT A | pass |
| Host B + JWT A (`active_tenant_id=A`) | **deny** `HOST_JWT_MISMATCH` |
| Host A + JWT B | deny |
| body `tenantId=B` while context A | **deny** `BODY_TENANT_REJECTED` |
| userA switch → B | deny `MEMBERSHIP_REQUIRED` + audit |
| multiUser switch A→B | pass + `auth.tenant_switched` |
| multiUser switch → unknown UUID | deny |
| Missing TenantContext on tenant route | deny |

### C.4 STORAGE

| Case | Expect |
|------|--------|
| Resolve B object key in A context | deny |
| Signed URL issued for B used by A | deny (capability bound to tenant+key) |
| Malformed / path-traversal key | deny |
| Legacy `messaging/{A}/…` for A | allow (compat) |
| Legacy `messaging/{B}/…` for A | deny |

### C.5 CACHE

| Case | Expect |
|------|--------|
| Warm A permission cache; auth as B | B perms only (`t:{B}:…`) |
| Warm A branding; request B host | B theme only |
| Module cache A enabled ≠ leaked to B | pass |

### C.6 JOBS / OUTBOX

| Case | Expect |
|------|--------|
| A list/replay B jobs | deny (platform-only ops) |
| A read B outbox_events | deny |
| Enqueue JobDefinition without tenantId (tenant job) | reject |
| Suspended A business job | not executed |

### C.7 LIFECYCLE

| Status | Mutation | Business job | Login/API |
|--------|----------|--------------|-----------|
| provisioning | deny business | deny | blocked / limited |
| active | allow | allow | allow |
| suspended | deny mutation | deny business | read policy as designed |
| archived | deny | deny | deny |
| deleting | deny | purge-only | deny |

---

# PART D — Route coverage audit

Every mount must be classified. Preliminary classification from `apps/api/src/index.ts` (2B coding must verify each handler file):

### D.1 Classification legend

| Class | Meaning |
|-------|---------|
| `PUBLIC` | No tenant auth required |
| `PLATFORM` | Platform principal only |
| `TENANT` | Requires TenantContext |
| `TENANT-OPTIONAL` | May run with or without tenant (rare; justify) |
| `WEBHOOK` | Provider signature → bound tenant |
| `INTERNAL` | Shared secret / cron / agent |

### D.2 Preliminary inventory

| Mount / area | Class | Notes / 2B flags |
|--------------|-------|------------------|
| `GET/PATCH /api/config` | PUBLIC / TENANT-admin mix | Branding leak risk — split platform vs tenant |
| `/api/auth/*` | PUBLIC (+ switch-tenant authenticated) | No body tenant authz |
| `/api/setup` | PUBLIC / PLATFORM bootstrap | Must not create second “only workspace” assumption forever |
| `/api/me`, push-token, active-roles, me/tasks | TENANT | |
| `/api/workspace`, workspace/modules | TENANT | `req.workspace` compat flag |
| `/api/contacts`, companies, pipelines*, items, tasks* | TENANT | **Highest IDOR priority** |
| `/api/activity`, alerts, analytics, dashboards | TENANT | |
| `/api/projects/**`, pm/*, templates | TENANT | Large surface |
| `/api/portal` | TENANT-OPTIONAL / portal session | Separate principal — audit carefully |
| `/api/notifications`, settings/* | TENANT | |
| `/api/webhooks`, `/api/api-keys` | TENANT | Critical |
| `/api/plugins/**` | TENANT | Bridge ctx must be trusted |
| `/api/messaging/**` | TENANT | Storage keys |
| `/api/users`, roles, rbac, invites, sidebar | TENANT | |
| `/api/servers`, databases, websites, ssh, sse | TENANT | |
| `/api/agent` | INTERNAL (agent auth) | Must bind server.workspace_id |
| `/api/internal` | INTERNAL (`CRON_SECRET`) | |
| `/api/system` | PLATFORM / TENANT-admin mix | Classify per method |
| `/v1/*` | TENANT via API key | key.workspace_id → tenant; never body |

**Flag:** Any TENANT route that uses `req.workspace.id` without also asserting `req.tenantContext.tenantId === req.workspace.id` can hide bugs if auth middleware regresses. 2B should add a single assert helper used at router entry.

**Rule:** No route remains unclassified after the 2B coding audit checklist is checked off in CI (generated or documented table).

---

# PART E — Outbox implementation plan (ADR-019)

### E.1 Package boundaries (adapt to monorepo)

| Package / app | Responsibility |
|---------------|----------------|
| `packages/events` (new) | `EventEnvelope`, `EventRecorder` port, event name constants, alias map |
| `packages/job-runtime` (new) | `JobQueue` port + BullMQ adapter + retry/priority types (ADR-015) |
| `packages/db` | `outbox_events` already added in 2A — enrich indexes/leases if needed (additive) |
| `apps/api` | Domain routes call `EventRecorder` inside TX only |
| `apps/outbox-publisher` **or** worker role `publisher` | Poll/claim/publish loop |
| `apps/worker` | BullMQ consumers; retire interval jobs per Part H |

**Forbidden:** `import('bullmq')` from CRM/finance/automation domain modules.

### E.2 EventRecorder

```text
uow.withTransaction(async (trx) => {
  // mutate aggregates
  await eventRecorder.append(trx, {
    tenantId, type, aggregate, payload, dedupeKey, jobName?, correlationId
  })
})
// NO JobQueue.enqueue here
```

### E.3 Outbox repository operations

| Op | Behavior |
|----|----------|
| `append` | Insert `pending` in same TX |
| `claimBatch` | `FOR UPDATE SKIP LOCKED` → `publishing` + lease |
| `markPublished` | status=`published`, `job_handle`, `published_at` |
| `retry` | attempts++, `available_at` backoff, status=`pending` |
| `dead` | status=`dead`, last_error; emit ops signal |
| `reclaimExpiredLeases` | `publishing` past lease → `pending` |
| `reconcile` | published without consumer progress / missing Redis job → re-enqueue idempotently |

### E.4 Publisher flow

```text
Postgres outbox (pending)
  → claim
  → JobQueue.enqueue(JobDefinition{ tenantId, name, payload, idempotencyKey=outbox.id|dedupe })
  → markPublished | retry | dead
```

Tenant fairness: cap per-tenant rows per tick (round-robin).

---

# PART F — Outbox failure semantics

| # | Scenario | Expected |
|---|----------|----------|
| 1 | DB rollback | No outbox row → no job |
| 2 | DB commit + Redis down | Outbox remains `pending`/`publishing`→retry; survives |
| 3 | Publisher crash mid-claim | Lease expiry → reclaim |
| 4 | Duplicate publish | Same idempotencyKey → consumer no-op |
| 5 | Worker crash | BullMQ retry per policy |
| 6 | Poison event | → `dead` after max; no infinite loop |
| 7 | Replay | Explicit, audited (`security_audit` / ops action) |
| 8 | Redis recovery | Reconciler re-enqueues from outbox / waiting domain state |
| 9 | Duplicate delivery | One business outcome via unique constraints |
| 10 | Shutdown during publishing | Finish current claim or reclaim via lease — no silent drop of intent |

**Semantics:** at-least-once + idempotent consumers. **Not** distributed exactly-once.

---

# PART G — BullMQ design (ADR-015)

### G.1 Queue classes (not per-tenant)

| Queue | Workloads |
|-------|-----------|
| `automation` | evaluate / step / wait.resume |
| `webhooks` | outbound delivery |
| `notifications` | email/push/in-app fanout |
| `documents` | PDF render (ADR-016) |
| `integrations` | third-party sync |
| `ai` | future AI jobs (strict rate limits) |

Optional later: shard suffix `webhooks-0..N` by hash(tenantId).

### G.2 JobDefinition requirements

- `tenantId` required for tenant work (reject if missing)  
- `idempotencyKey`, `priority`, `retryPolicy`, `timeoutMs`, `trace`  
- Priorities: `critical` > `high` > `normal` > `bulk`  
- Backoff: exponential with jitter  
- Failed set / DLQ → Ops replay  

### G.3 Noisy neighbor

- Per-tenant concurrency caps + BullMQ rate limiters  
- `tenant_job_controls.jobs_paused` honored in worker middleware  
- Global caps on `ai` / WhatsApp-class queues  

### G.4 Workers

- Horizontal `apps/worker` processes subscribe by queue class  
- Graceful shutdown: stop taking jobs; wait lock TTL; domain checkpoints for long steps  

---

# PART H — Existing worker migration

### H.1 Inventory & classification

| Worker | Location | Class | Notes |
|--------|----------|-------|-------|
| webhook-delivery | api + apps/worker **duplicate** | **MIGRATE TO BULLMQ** | First critical migrate; kill dual-runner |
| website-checker / website-ping | api + worker | MIGRATE TO BULLMQ | schedule repeatable |
| task-due-notifier | api | MIGRATE TO BULLMQ | |
| pm-due-alert / pm/* jobs | api + worker | MIGRATE TO BULLMQ | |
| recurring-task-generator | api | MIGRATE TO BULLMQ | |
| metrics-rollup | api | MIGRATE TO BULLMQ | |
| plugin-cron | api | MIGRATE TO BULLMQ | |
| hub-retention | api | MIGRATE TO BULLMQ | low freq |
| license-check | api | MIGRATE TO BULLMQ / KEEP TEMPORARILY | |
| alert-eval, server-staleness, db-health | worker | MIGRATE TO BULLMQ | |
| pipeline-reminders / automations | worker | MIGRATE TO BULLMQ | feed via outbox where domain events exist |
| update-check | worker | KEEP TEMPORARILY / INTERNAL | instance-level |
| HTTP request path side effects that must be sync | — | KEEP SYNCHRONOUS | e.g. password hash verify |
| Dead setInterval after migrate | — | REMOVE | |

### H.2 Migration order

1. Introduce `JobQueue` + BullMQ adapter + worker bootstrap  
2. Outbox publisher  
3. **Webhook delivery** only (single runner)  
4. Notifications / due-date style jobs  
5. Pipeline + PM schedulers  
6. Infra checkers  
7. Plugin cron  
8. Remove api `setInterval` starters behind flag → delete  

**Dual-run:** only during short staging burn-in with feature flag `JOBS_RUNTIME=bullmq|legacy`; **no** prolonged dual-run in production.

---

# PART I — Idempotency strategy

### I.1 Key format

```text
{tenantId}:{domain}:{action}:{naturalKey}
```

Examples:

- `webhook.deliver` → `{tenantId}:webhook:{subscriptionId}:{deliveryId}`  
- `notification` → `{tenantId}:notify:{channel}:{userId}:{eventId}`  
- `document.render` → `{tenantId}:doc:{entityType}:{entityId}:{templateVersion}`  
- `payment` → `{tenantId}:pay:{provider}:{providerEventId}`  
- `automation.step` → `{tenantId}:auto:{runId}:{stepKey}:{attemptBucket?}`  
- `import` → `{tenantId}:import:{jobId}:{rowHash}`  
- WhatsApp later → `{tenantId}:wa:{providerMessageId}`  

### I.2 Storage

| Mechanism | Use |
|-----------|-----|
| DB unique (`dedupe_key`, delivery id, provider event id) | Source of truth |
| Job `idempotencyKey` | Queue-level dedupe where supported |
| `idempotency_keys` table (optional 2B) | generic TTL store: key, tenant_id, status, response_ref, expires_at |

### I.3 Behavior

- Concurrent double-insert → one wins (unique violation → treat as already processed)  
- Replay → same key → return prior success / no-op  
- Retention → expire keys per policy (e.g. 7–30 days) without deleting business audit  

---

# PART J — Observability / Pulse

### J.1 Isolation metrics

- `tenant.isolation.denied` (reason: host_jwt / membership / body_tenant / idor)  
- `auth.host_jwt_mismatch`  
- `auth.membership_failed`  

### J.2 Outbox metrics

- pending count, oldest age, publishing count, dead count, retry rate, per-tenant pending  

### J.3 BullMQ metrics

- depth / active / failed / completed  
- latency p50/p95  
- retries  
- per-tenant lag (derived)  

### J.4 Pulse (Super Admin — later UI)

Surfaces: outbox lag, dead letters, queue failed, isolation denial spikes, Redis down, tenant job pauses.  
2B delivers **metrics + log events**; full Pulse UI may remain thin/stub.

---

# PART K — Security review (post-2A)

| Control | Status | Prod stance |
|---------|--------|-------------|
| TenantContext + membership | COMPLETE (logic) | Need live proof (Track A) |
| Host/JWT mismatch | COMPLETE (unit) | Need live HTTP proof |
| Body tenant reject | COMPLETE | Keep |
| Storage key namespace | INCOMPLETE (no signed GET suite) | Block SaaS file features until tested |
| Cache key prefix | COMPLETE (unit) | Live test still required |
| Login/API rate limit | INCOMPLETE | **UNSAFE FOR PRODUCTION** multi-replica without Redis backend |
| CSRF | INCOMPLETE outside prod | **UNSAFE** if cookie auth exposed without enforce |
| Password reset hash | COMPLETE for new; legacy plaintext dual-read | INCOMPLETE until plaintext purged |
| Platform admin | INCOMPLETE stub | UNSAFE as real ops surface until seeded + MFA plan |
| WS query token | INCOMPLETE | UNSAFE at scale (ADR-023 P1) |
| SSRF | PARTIAL (webhooks + http.fetch) | Audit all outbound URL paths |
| Custom domain TLS | INCOMPLETE | Architecture only |
| workspace_id query paths | INCOMPLETE proof | Highest residual IDOR risk |
| Outbox/BullMQ | NOT STARTED | Critical side effects unsafe for paid SaaS automation |

---

# PART L — workspace_id → tenant_id migration strategy

**Do not destroy in 2B.** Expand → dual → validate → (later) contract.

| Stage | Action |
|-------|--------|
| Dual-read | Continue `tenantId === workspaceId` for backfilled tenants |
| Dual-write | New writes set both if a physical `tenant_id` column is added; else keep single column with alias in code (`tenantScopeId`) |
| Backfill | Validate every workspace has tenant; every user has membership |
| Route migration | All TENANT routes use `tenantContext` assert helper |
| Repository migration | Introduce `tenantWhere(ctx)` everywhere; ban raw client tenant ids |
| Compatibility window | Keep `workspaces` table as alias/view if needed |
| Contract (post-2B / 2C) | Nullable drop `users.workspace_id`; rename columns with expand/contract |
| Rollback | App revert; keep additive columns; do not drop tenants |

---

# PART M — Implementation order (strict)

1. **Live Postgres isolation harness** (Docker/CI + migrator + fixtures)  
2. **Route coverage audit** (complete classification table checked into docs or generated)  
3. **Fix highest-risk tenant access paths** (contacts/companies/pipelines/tasks/api-keys/webhooks/files)  
4. **Integration isolation suite green** (Part C matrix)  
5. **Outbox repository hardening** (leases/indexes if needed) + `packages/events` EventRecorder  
6. **`packages/job-runtime` JobQueue port**  
7. **BullMQ adapter**  
8. **Outbox publisher** process/role  
9. **Reconciler** + dead-letter handling  
10. **Migrate webhook delivery** (remove dual interval runners)  
11. **Idempotency framework** (+ apply to webhooks/notifications)  
12. **Observability metrics** (isolation + outbox + queues)  
13. **Migrate next worker wave** (notifications/due jobs)  
14. **Final regression** (typecheck/lint/build + historical vitest + isolation)  
15. **STOP** — write Phase 2B implementation report; do not start CRM/finance features  

---

# PART N — Definition of Done

Phase 2B is complete only when:

- [ ] Real PostgreSQL isolation tests pass (Part C)  
- [ ] All routes classified (Part D); no silent unknowns  
- [ ] No known tenant IDOR on audited critical paths  
- [ ] Host/JWT mismatch tests pass live  
- [ ] Storage + cache isolation pass live  
- [ ] Lifecycle gates pass live  
- [ ] Outbox survives DB/Redis failure scenarios (Part F)  
- [ ] BullMQ only behind `JobQueue`  
- [ ] Duplicate jobs safe; poison quarantined; replay audited  
- [ ] Critical interval workers migrated (webhooks minimum; dual-runner gone)  
- [ ] typecheck / lint / build pass  
- [ ] Historical regression suite pass (or explicitly waived with ticket)  
- [ ] Production blockers explicitly listed in 2B report  

---

# FINAL SUMMARY

### Phase 2A inherited risks

Logic-level tenancy without live IDOR proof; `workspace_id` filter omission risk; no outbox publisher; interval/dual workers; rate-limit memory fallback; CSRF/WS/platform-admin gaps.

### Phase 2B blockers (must clear before CRM/finance)

1. Live isolation suite green on Postgres  
2. Critical route IDOR fixes  
3. Outbox + JobQueue + BullMQ + webhook migration  
4. Redis-backed rate limiting for any multi-replica deploy  
5. CSRF enforced for cookie-auth deployments  

### Phase 2B implementation order

Harness → route audit → IDOR fixes → isolation green → events/outbox → JobQueue/BullMQ → publisher/reconciler → webhook migrate → idempotency → metrics → more workers → regression → STOP.

### Production readiness changes (from 2B)

- Evidence-based multi-tenant isolation  
- Durable async side effects  
- Single job runtime substrate  
- Explicit production blocker list for anything still incomplete  

### Still deferred

Finance/CRM features · WhatsApp/Voice · Temporal · Meilisearch · full Pulse UI · MFA/SSO GA · custom domain cert automation · destructive `workspace_id` drop · full ThemeSnapshot product UI · reseller  

### Exact first coding task for Phase 2B

**Stand up the live PostgreSQL isolation harness:** Docker/CI Postgres, migrate, seed `tenantA`/`tenantB`/`userA`/`userB`/`multiUser`, and land the first failing-then-passing integration test (`userA` GET `tenantB` contact → deny).

---

**STOP.** Do not start Phase 2B implementation automatically.
