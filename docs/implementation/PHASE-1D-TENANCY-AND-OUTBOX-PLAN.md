# PHASE-1D — Tenancy, White-Label & Outbox Plan

**Phase:** 1D — Multi-tenancy, white-label & outbox architecture  
**Date:** 2026-09-04  
**Constraint:** Planning only — **NO** application code, packages, migrations, or feature implementation  

Sources: Vencore audit · ADR-001…016 · ADR-014 · ADR-015 · ADR-016 · [OPEN-SOURCE-COMPONENT-RADAR.md](./OPEN-SOURCE-COMPONENT-RADAR.md) · ThinkAIQ product/architecture docs  

New ADRs:

| ADR | Decision |
|-----|----------|
| [ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md) | Global users + memberships; host-first resolution; defense in depth |
| [ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md) | Per-tenant ThemeSnapshot + tokens + namespaced assets |
| [ADR-019](../adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md) | PG outbox → `JobQueue` (BullMQ); reconciler |

---

## P0 — Security / tenancy blockers

Must be solved **before** normal CRM/finance feature implementation:

1. **Canonical TenantContext** on every request/job (ADR-017)  
2. **No body-inferred tenant**  
3. **Host resolution + anti-spoof**  
4. **Repository `tenant_id` scoping** + isolation CI tests (minimum pack in ADR-017 §9)  
5. **Storage key namespace** `tenants/{id}/…` (ADR-008)  
6. **Separate platform Super Admin** from tenant users  
7. **Job payloads require tenantId** where tenant-scoped (ADR-015)  
8. **Outbox for critical side effects** — no naked BullMQ in DB TX (ADR-019)  
9. **Suspend blocks mutations + pauses business jobs**  

Until P0 is accepted and (later) implemented, treat Vencore as **unsafe to expose as multi-tenant SaaS**.

---

## P1 — Core tenancy

| Workstream | Deliverable (when coding gate opens) |
|------------|--------------------------------------|
| Entities | `tenants`, `tenant_memberships`, `tenant_domains`, `tenant_settings`, `tenant_entitlements`, `tenant_usage`, status machine |
| Provision API | Super Admin create tenant + owner invite; idempotent by slug |
| Auth | Global user; membership check; active tenant bound to Host |
| RBAC | Seed roles per tenant; permissions from membership |
| Data | Rename/map `workspace_id` → `tenant_id` on business tables |
| Jobs | Status-aware enqueue/worker gates |

Depends on: P0 design (this phase) · ADR-001 · ADR-006 ratification.

---

## P2 — White-label

| Workstream | Deliverable |
|------------|-------------|
| `tenant_branding` | Tokens, logos, email/PDF identity |
| Theme runtime | Host → ThemeSnapshot → CSS variables |
| Assets | Upload + tenant-prefixed object keys |
| Domains | Subdomain Phase 1; custom domain state machine (cert tool still open per ADR-005) |
| Security | CORS/CSP/cookie/CDN rules (ADR-018 §7) |

Depends on: P1 resolution · ADR-008 · ADR-016 for PDF context.

---

## P3 — Outbox + BullMQ

| Workstream | Deliverable |
|------------|-------------|
| `outbox_events` | Full ADR-019 fields |
| `EventRecorder` | Same-TX emit |
| Publisher | SKIP LOCKED + lease + fairness |
| `JobQueue` adapter | BullMQ behind port (ADR-015) |
| Reconciler | Lag/dead/Redis-gap sweeps |
| Ops | Pulse metrics + incidents |
| Taxonomy | Namespaced events + alias map |

Depends on: Redis HA plan · ADR-015 · P1 tenantId on events.

---

## P4 — Migration (Vencore → ThinkAIQ)

| Vencore today | ThinkAIQ target |
|---------------|-----------------|
| `workspaces` | `tenants` |
| `users.workspace_id` | **Remove**; `tenant_memberships` |
| Workspace settings | `tenant_settings` + entitlements |
| Module flags per workspace | `tenant_entitlements` / `tenant_modules` |
| Instance branding (`system_settings` / config file) | Platform defaults + `tenant_branding` |
| JWT workspace from user row | Host + membership |
| Setup “already configured” single workspace | Multi-tenant provision |

**Migration principles**

1. Dual-read period: accept `workspace_id` column aliases where needed  
2. Backfill: one workspace → one tenant; each user → one membership  
3. Do not destroy CRM rows — remap FKs  
4. Instance brand → first tenant brand **or** platform default + copy into tenant 0/primary  
5. Compatibility period documented; then drop `workspace_id`

Detailed cutover = P6.

---

## P5 — Testing strategy

| Area | Tests |
|------|-------|
| Isolation | ADR-017 §9 matrix (A≠B for CRUD, files, jobs, automation, keys, audit, search when live) |
| Provisioning | Idempotent slug; partial failure → provisioning status; seed roles |
| Domain resolution | Custom > subdomain > platform; spoof negatives; suspended interstitial |
| Suspension | Mutations blocked; jobs paused; allowlisted billing jobs |
| White-label | Theme cache per tenant; asset path isolation; no brand fallback leak |
| Jobs | Missing tenantId rejected; pause controls |
| Outbox | TX rollback leaves no job; publish retry; poison → dead |
| Replay | Idempotent consumer; Ops replay audited |
| Cache | Key prefix isolation; invalidation on branding update |
| Storage | Cross-tenant signed URL denial |

CI gate: isolation pack **must** pass before multi-tenant prod traffic.

---

## P6 — Rollout (data-safe)

```text
1. Backup (DB + object storage inventory)
2. Dry-run migration on clone
3. Pre-checks: orphan workspace_ids, duplicate emails, null tenants
4. Dual-write / dual-read compatibility window
5. Cutover memberships + domains
6. Validation: isolation suite + smoke provision + host resolve + outbox lag
7. Rollback: restore backup + feature flag disable multi-tenant routes
```

| Control | Notes |
|---------|-------|
| Backup | Point-in-time + explicit pre-migrate snapshot |
| Dry run | Full script on staging copy |
| Migration checks | Row counts, FK integrity, every user has ≥1 membership or platform-only |
| Rollback | Prefer forward-fix; hard rollback only from snapshot |
| Compatibility | Keep read of `workspace_id` until all apps use `tenant_id` |
| Validation | Super Admin checklist + automated suite |

**Do not** run this against production until coding gate + ADR ratification + backup drills exist.

---

# FINAL DECISION SECTION

### Canonical ThinkAIQ tenancy model

Platform → (optional Reseller) → **Tenant** → **Memberships** → Roles → business data.  
**Global users**; many tenants per user. Shared PostgreSQL + `tenant_id` (ADR-001). Status: `provisioning → active → suspended → archived → deleting`.

### Canonical tenant resolution model

**Custom domain → subdomain → authenticated membership (host-matched) → platform routes → API key binding → webhook binding → job tenantId.**  
Never trust arbitrary body tenant fields. Anti–host-spoof controls mandatory.

### Canonical white-label model

**Per-tenant ThemeSnapshot** from `tenant_branding` + CSS variables; assets under `tenants/{tenantId}/…`; subdomain-first; custom domains via ADR-005 state machine. No instance-config as SaaS brand source of truth.

### Canonical event/outbox model

**Same-TX `outbox_events`** → leased publisher → **`JobQueue.enqueue`**. At-least-once + idempotent consumers. Namespaced types (`crm.*`, `finance.*`, …) with alias map for older short names.

### Canonical BullMQ boundary

BullMQ implements **`JobQueue` only**. Domain/automation state in Postgres. Outbox is the durable enqueue intent. Queue ≠ workflow graph (ADR-015).

### Mandatory P0 security controls

TenantContext · host trust · repo scoping · storage/cache/job isolation · platform vs tenant principals · outbox for critical side effects · isolation CI · suspend job/mutation gates.

### What remains deferred

| Item | Notes |
|------|-------|
| PostgreSQL RLS | After app-layer isolation proven |
| Reseller product | Schema-ready only |
| Custom domain cert automation tool | ADR-005 open |
| Meilisearch / heavy search | After FTS need |
| Temporal | ADR-015 path; not now |
| MFA/SSO vendor | Security hardening phase |
| Document template DSL ADR | Next after 1D |
| React Flow builder ADR | UI phase |

---

## Conflicts with ADR-001 … ADR-016 (explicit)

| Doc / ADR | Conflict | Resolution |
|-----------|----------|------------|
| **MULTI_TENANCY.md §9** | “Users belong to one tenant” | **Superseded by ADR-017** — multi-membership. Update MULTI_TENANCY in doc-sync. |
| **DATABASE_SCHEMA.md `users.tenant_id`** | Single-tenant user row | **Refactor to memberships** (ADR-017). |
| **EVENTS.md** short event names | vs namespaced taxonomy | **Namespaced canonical**; alias map (ADR-019). |
| **DATABASE_SCHEMA `outbox_events`** thin columns | vs ADR-019 fields | **ADR-019 wins** for design. |
| **ADR-001** | None | Affirmed |
| **ADR-002** | Nest vs Express still open | Unchanged |
| **ADR-003** | Platform vs tenant billing | Unchanged; confirm separately |
| **ADR-004** | Async automation | Affirmed; outbox is the enqueue path |
| **ADR-005** | Domains/SSL | Affirmed; ADR-017/018 consume it |
| **ADR-006** | Auth | Must evolve for multi-membership sessions — **flag for confirm**, not silently rewritten |
| **ADR-007 / 015** | Queue | Affirmed; 019 feeds JobQueue |
| **ADR-008** | Storage keys | Affirmed |
| **ADR-011** | Thin WL | **Refined by ADR-018** (not replaced) |
| **ADR-014** | Selective Vencore | Affirmed; workspace→tenant is the tenancy rewrite |
| **ADR-016** | PDF theme | Consumes ADR-018 ThemeSnapshot |

No silent rewrites of Accepted ADR-015/016.

---

## Phase 1E recommended order (next)

1. Stakeholder ratify Phase 1E gate + ADR-020…023.  
2. Explicit **open coding gate**.  
3. First milestone: TenantContext + memberships + host resolution + isolation suite (see Phase 1E).

---

## Document index

| Doc | Path |
|-----|------|
| ADR-017 | [../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md) |
| ADR-018 | [../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md) |
| ADR-019 | [../adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md](../adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md) |
| Phase 1C | [PHASE-1C-DECISIONS.md](./PHASE-1C-DECISIONS.md) |
| Prior ADRs | [../decisions/](../decisions/) |

**Still no application code.**
