# CRUD-PERFORMANCE-AUDIT-PLAN.md

| Field | Value |
|-------|-------|
| Status | **PHASE 0 DIAGNOSIS COMPLETE — PLAN ONLY (NO IMPLEMENTATION)** |
| Date | 2026-09-07 |
| Product | ThinkAIQ CRM |
| Priority | **Highest** — user-visible create/edit/delete/status/stage/task latency |
| Runtime | Local web (`:3000`) + API (`:3001`) + worker → **Railway Postgres/Redis** via public TCP proxy |
| Explicitly deferred | Sales Execution UX Round A · DPR Round B · new product features |

**Hard rule:** Diagnosis first. Do **not** implement Round A/B of this plan until explicitly approved. Do **not** start Sales Execution UX polish until this plan’s Round A is approved or Product re-prioritizes.

**Product principle:**

> User clicks Save → action completes quickly → UI immediately reflects the result → unrelated background work does not make the user wait → errors remain visible and recoverable.

Preserve: tenant isolation · RBAC · audit · outbox · Finance ledger · CustomerParty · deals · CRM tasks · Ops · Automation · PM separation.

---

## 0. Executive verdict

The slowness is **real and systemic**, not “one slow screen.”

**Dominant cause (measured):** every mutation pays **many sequential Postgres round-trips** over **localhost → Railway public proxy** (~**310 ms per simple query**). Auth/RBAC alone can burn **~1.5–2.5 s** before the handler runs. Frontend then compounds with **broad React Query invalidations** and **almost no optimistic updates** (except kanban drag).

**Not the dominant cause:** waiting for BullMQ/Redis on the HTTP response. Outbox is Postgres-in-TX; the worker publisher enqueues asynchronously (~2 s tick).

**Dev overhead exists** (Next.js / API hot reload) but **does not explain** multi-second saves: a bare `SELECT 1` to Railway is already ~310 ms.

---

## 1. Measured timings (Phase 0)

### 1.1 Environment under test

| Layer | Observed |
|-------|----------|
| API | `localhost:3001` — `/api/health` → `api=ok`, `db=ok`, `redis=ok` |
| Postgres | Railway via `altaria.proxy.rlwy.net` (app SoR) |
| Redis | Railway / configured proxy (jobs) |
| Web | Local Next.js (dev) |

### 1.2 Direct DB (node `pg` from `packages/db`)

| Probe | Result |
|-------|--------|
| Connect | **~1273 ms** |
| `SELECT 1` ×5 | **310, 311, 310, 311, 311 ms** → **~310 ms RTT floor** |
| `SELECT count(*) FROM users` | **~312 ms** |

### 1.3 API health (includes DB + Redis checks)

| Hit | Latency |
|-----|---------|
| 1 (cooler) | **3043 ms** |
| 2–5 | **1785–1878 ms** |

Interpretation: even a **read-only health** path is **~1.8–3.0 s** user-visible. Authenticated mutations that do **5–15 sequential queries** will commonly land in **multi-second** territory before UI refetch.

### 1.4 End-to-end mutation budget model (not guessed p95)

Using **measured RTT ≈ 310 ms**:

| Phase | Typical query count (code audit) | Expected floor |
|-------|----------------------------------|----------------|
| A. Click → request start | Frontend only | tens of ms (dev can add more) |
| B–C. Network + auth/tenant/RBAC | ~5–12 sequential DB RTs cold; fewer warm cache | **~1.5–3.5 s** |
| D–E. Handler + TX | Lead create: few; Move: **N sibling updates** + dual-write; Convert: large multi-entity | **0.5–several s** |
| F. Audit | Ops complete: +1 RT when awaited | **~310 ms** |
| G. Outbox write | Same TX inserts (no Redis wait) | included in TX |
| H. Queue enqueue | **After response** (publisher) | **not on click path** |
| I. Serialize | Small | negligible vs RTT |
| J–K. UI settle + invalidate | Broad refetch of lists | **+1–3+ list GETs × RTT** |

**Do not claim a product-wide p95** until instrumented sampling under approved Round A. The model above is grounded in measured RTT × audited query shape.

### 1.5 Representative operations (qualitative + expected class)

| Operation | Expected class | Why |
|-----------|----------------|-----|
| Create/update lead | **Very slow for “simple”** | Dup scan (company full fetch risk) + auth + outbox TX + list refetch |
| Complete task | **Slow** | Auth + update + awaited audit + `invalidate ['ops']` fan-out |
| Create task | **Slow** | Auth + insert + broad ops refetch |
| Move deal stage | **Slow–very slow** | Auth + fat TX (renumber N + projection + webhooks-in-TX) + board refetch; DnD optimistic helps feel |
| Convert + create deal | **Very slow** | Largest TX + serial DealCreateModal convert→PATCH→task |
| Finance create/update | **Slow but expected heavier** | Do not optimize ledger semantics in Round A |

---

## 2. Slowest operations (ranked)

1. **Lead convert with deal** / **DealCreateModal serial chain** (convert → PATCH → optional task)  
2. **Pipeline stage move** on busy columns (sibling renumber × RTT + dual-write)  
3. **Any authenticated mutation** under cold/warm auth (middleware floor)  
4. **Ops task complete/create** after UI invalidate of entire `['ops']` tree  
5. **Lead create/update** with duplicate checks scanning companies  

---

## 3. Root causes (ranked by impact)

| Rank | Class | Impact | Evidence |
|------|-------|--------|----------|
| **1** | **DB RTT × query count** (Railway proxy) | Critical | `SELECT 1` ≈ 310 ms; health ≈ 1.8–3 s |
| **2** | **Auth/RBAC sequential lookups** every request | Critical | `auth.ts` users→tenant→membership→workspace→modules→permissions; permission middleware may re-resolve |
| **3** | **Frontend broad invalidation / no optimistic** | High | `invalidateQueries(['ops'])`, `['leads']`, `['items']`; only kanban DnD optimistic |
| **4** | **Fat mutations** (move renumber N updates; convert multi-entity; company full-table match) | High | `item-move.ts`, `convert.ts`, `duplicates.ts` |
| **5** | **Serial client chains** (DealCreateModal) | High | awaited convert→PATCH→task |
| **6** | **Awaited post-commit work** on move (`maybeAutoCreateProject`) | Medium | still on HTTP path |
| **7** | **Dev-mode overhead** (Next/API compile) | Medium additive | Does not create 310 ms SQL RTT |
| **8** | Redis/BullMQ on click path | **Low** | Outbox publisher async; mutations succeed without enqueue wait |

---

## 4. Frontend bottlenecks

### 4.1 Patterns

| Pattern | Where | Effect |
|---------|-------|--------|
| Bare `invalidateQueries({ queryKey: ['ops'] })` | `modules/ops/lib/hooks.ts` complete/create/reschedule/reassign/targets | Refetches Today + My Work + Tasks + employees + … |
| Bare `['leads']` / `['items']` | LeadsBoard convert, DealCreate, UnifiedRecordShell stage | Refetches unrelated caches |
| No optimistic create/complete/status | Leads, Ops, DealCreate, table edits | UI waits for GET after POST |
| Kanban optimistic then **always** `onSettled` full refetch | `KanbanBoard.moveMut` | Extra board GET after every move |
| DealCreateModal serial awaits | convert → PATCH → task | Long “Creating…” |
| Double ops invalidate | `useCreateOpsTask` + UnifiedRecordShell | Duplicate GET risk |
| Modal usually closes on mutation success | Good | List still looks stale until refetch — user still “waits” visually |

### 4.2 Principle violation

User currently waits for **unrelated lists** to refresh after tiny mutations. Goal: **local cache update first**; narrow invalidate as backup; never block Save on non-critical fetches.

---

## 5. API / middleware bottlenecks

| Issue | Detail | Safe direction |
|-------|--------|----------------|
| Auth always multi-query | No reuse of prior resolution within request beyond permission cache | Pass resolved perms from auth; avoid double `resolveUserPermissions` |
| Module + permission re-check | Cache 60s helps warm path | Keep security; eliminate redundant cold work |
| `assertDealRelations` sequential | 3–6 lookups | Parallelize independent checks |
| Overlapping stage loads on move | assert + flags + projection flags | Single load reused |
| `await recordSecurityAudit` on ops | Extra RT | Keep durable insert; consider same TX / batch — **never drop audit** |
| `await maybeAutoCreateProject` after move | Sync after commit | Fire-and-forget or outbox job **if** product allows eventual project |

**Do not remove:** RBAC, tenant checks, outbox durability, webhook outbox rows.

---

## 6. DB bottlenecks

| Issue | File | Direction |
|-------|------|-----------|
| Sibling position: **N UPDATEs** | `lib/pipeline/item-move.ts` | Single-statement renumber / range update; prove with EXPLAIN |
| Company dup: load **all companies** | `lib/leads/duplicates.ts`, convert match | SQL `ILIKE`/`=` with index + limit |
| Large convert TX | `lib/leads/convert.ts` | Keep atomicity; shrink internal query count |
| Webhook fan-out in TX | `queue-webhook.ts` | Keep outbox; avoid N chatty loops where batchable |
| Missing index speculation | — | **Only after EXPLAIN** on slow statements |

Preserve: `workspace_id` filters, soft-delete, FK validation.

---

## 7. Outbox / queue bottlenecks

| Finding | Implication |
|---------|-------------|
| Mutations insert `outbox_events` in Postgres TX | Correct SoR; response waits for commit, not Redis |
| Publisher ~2 s tick then BullMQ | Automation/webhooks lag **after** UI success — OK for CRUD feel |
| Redis down | CRUD can still succeed; jobs lag | Do not block Save on Redis |

**Do not** bypass required business events. **Do not** change Automation approval semantics (ADR-027).

---

## 8. Railway / network / dev contribution

| Factor | Contribution |
|--------|--------------|
| **Railway public TCP RTT (~310 ms/query)** | **Primary product latency in current topology** |
| Sequential query design | Multiplies RTT into multi-second UX |
| Local Next.js / API dev | Extra noise; secondary |
| Co-locating API with Postgres (future deploy) | Would cut RTT; **not a substitute** for reducing query count |

Separate clearly:

1. **Product architecture latency** (query shape × RTT) — fix in Round A/B  
2. **Topology latency** (local→Railway) — document; improve with co-location later  
3. **Dev tooling latency** — do not “fix” by weakening production architecture  

---

## 9. Proposed acceptable targets (practical, not fake p95)

Until instrumented percentiles exist, use **classes**:

| Class | Examples | User-visible intent (local→Railway today) | After Round A intent |
|-------|----------|-------------------------------------------|----------------------|
| Simple create/update | lead patch, task complete | Feels multi-second now | **Sub-second perceived** via optimistic UI + fewer RTs |
| Small list mutation | status chip, assign | Snap back / flicker now | **Immediate chip update**; background reconcile |
| Board move | stage DnD | Optimistic OK; refetch lag | Keep optimistic; **avoid mandatory full refetch** |
| Complex | convert+deal, finance issue | Several seconds OK if progress clear | Predictable; non-blocking side tasks |

Numeric p95 only after Round A adds timing middleware + sample capture.

---

## 10. Proposed fixes ranked by impact

### Round A — Core mutation responsiveness (highest leverage)

1. **Frontend:** Narrow React Query invalidation (`ops.tasks` / `ops.today` / `items:{pipelineId}` / `leads:{params}`)  
2. **Frontend:** Optimistic update for task complete, lead status, deal create prepend, table cell edits  
3. **Frontend:** DealCreateModal — don’t await follow-up task; optional fire-and-forget; close on primary success  
4. **Frontend:** Kanban — merge move API response into cache; debounce/skip full refetch when body sufficient  
5. **API:** Reuse auth-resolved permissions; parallelize independent integrity lookups  
6. **API:** Replace company full-table dup scan with indexed SQL  
7. **API:** Shrink move renumber to fewer statements (evidence-based)  
8. **API:** Add lightweight request timing logs (auth_ms, handler_ms, tx_ms) — measurement SoR for later p95  
9. **Safe async:** Do not await non-critical post-commit project spawn on HTTP path (outbox/job if required)

### Round B — Module-specific remaining latency

1. Remaining slow screens (finance list mutations UI, DPR submit polish without ledger changes)  
2. Deeper render/memo issues  
3. Lookup catalog staleTime (users/contacts)  
4. Convert path internal query reduction while keeping one TX  
5. Topology note: Railway co-located API when deploying hosted app  

---

## 11. Risks

| Risk | Mitigation |
|------|------------|
| Optimistic UI diverges from server | Rollback on error (kanban pattern) |
| Narrow invalidate misses a view | Explicit secondary keys; tests |
| Moving project create off HTTP path | Product OK with eventual consistency + outbox |
| Index spam | EXPLAIN-first only |
| Weakening audit/outbox | Forbidden — keep durable Postgres writes |
| “Fix” by pointing app at local empty DB | Forbidden — SoR remains Railway for real data |

---

## 12. Exact files likely affected

### Frontend (Round A)

- `apps/web/modules/ops/lib/hooks.ts`  
- `apps/web/modules/crm/pipeline/components/shared/DealCreateModal.tsx`  
- `apps/web/modules/crm/pipeline/components/kanban/KanbanBoard.tsx`  
- `apps/web/modules/crm/leads/components/LeadsBoard.tsx`  
- `apps/web/modules/crm/records/components/UnifiedRecordShell.tsx`  
- `apps/web/modules/crm/pipeline/components/table/PipelineTable.tsx`  
- `apps/web/modules/crm/deals/pages/detail.tsx`  
- `apps/web/modules/shared/components/Providers.tsx` (defaults only if needed)

### API / DB (Round A)

- `apps/api/src/middleware/auth.ts`  
- `apps/api/src/middleware/permission.ts`  
- `apps/api/src/middleware/module.ts`  
- `apps/api/src/lib/pipeline/item-move.ts`  
- `apps/api/src/lib/leads/duplicates.ts`  
- `apps/api/src/lib/leads/convert.ts` (query shape only)  
- `apps/api/src/routes/pipeline-items.ts` (post-commit await)  
- `apps/api/src/lib/deals/integrity.ts`  
- Optional: small timing middleware helper under `apps/api/src/lib/` or middleware  

### Explicitly out of Round A

- Finance ledger semantics  
- Automation engine / ADR-027 gates  
- Sales Execution UX Round A (Leads/My Tasks visual redesign)  
- DPR/performance redesign  

---

## 13. Tests required (when implementing)

| Area | Tests |
|------|-------|
| Optimistic complete/status | UI cache updates; rollback on 4xx/5xx |
| Invalidation breadth | Completing task does not refetch unrelated ops catalogs unnecessarily |
| Move | Position correct; deal dual-write intact; outbox row still written |
| Lead create | Dup check still tenant-scoped; no cross-tenant leak |
| Convert | Atomicity unchanged (deal + item same id or full rollback) |
| Authz | Forged IDs still 403/404 |
| Regression | Pipeline views · Block 1 · Finance smoke · Ops · Automation · PM |
| Timing | Log samples in CI/local against Railway (document, don’t flake CI on RTT) |
| tsc | web + api |

---

## 14. Rollout order

1. **Approve this audit plan**  
2. **Implement CRUD Performance Round A only** (instrument + highest-impact FE/API fixes)  
3. Measure before/after on same topology (local→Railway)  
4. **CRUD Performance Round B** for leftovers  
5. **Then** resume Sales Execution UX Polish Round A (Leads / My Tasks styling) — product may re-order if UX polish is preferred, but performance remains the diagnosed bottleneck for “everything feels slow”

---

## 15. Implementation split (exactly two rounds)

### ROUND A — Core mutation responsiveness

- Shared middleware permission reuse + timing logs  
- React Query mutation/invalidation/optimistic patterns for CRM + Ops tasks + pipeline move  
- Highest-impact DB query fixes (dup scan, move renumber)  
- Safe async boundary for non-critical post-commit work  
- Measurable improvement on create/complete/status/move  

**Exit:** User-visible Save/Complete/Move feels materially faster on local→Railway; security/audit/outbox intact; tests green.

### ROUND B — Remaining module-specific latency

- Remaining slow screens/mutations  
- Deeper UI rendering/refetch polish  
- Convert/finance path fine-tuning without ledger redesign  

**Do not start Round B until Round A exit criteria pass.**

---

## 16. What this plan does *not* do

- Implement any Round A/B code yet  
- Start Sales Execution UX Polish Round A  
- Redesign DPR/performance  
- Remove audit/outbox/RBAC  
- Invent fake p95 numbers  
- Architecture rewrite  

---

## 17. Approval

| Role | Decision |
|------|----------|
| Product | Confirm performance > UX polish for next implementation window |
| Architecture | Approve FE optimistic + query-count reduction; keep outbox SoR |
| Engineering | Schedule CRUD Performance Round A after approval |

**Next step after approval:** Implement **CRUD Performance Round A** only (separate implementation brief). Sales Execution UX Round A remains approved-on-paper but **blocked** by this higher-priority diagnosis unless Product explicitly overrides.
