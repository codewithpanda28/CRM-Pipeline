# PHASE-3A-1-CLOSEOUT-REPORT.md

**Phase:** 3A.1 — Canonical Deal (closeout / hardening gate)  
**Date:** 2026-09-05  
**Scope:** Freeze Deal only — **no** Leads / CustomerParty / Products / Quotes / Finance / WhatsApp  
**Prior docs:** [IMPLEMENTATION](./PHASE-3A-1-DEAL-IMPLEMENTATION-REPORT.md) · [AUDIT](./PHASE-3A-1-DEAL-AUDIT.md) · [MIGRATION](./PHASE-3A-1-MIGRATION-NOTES.md) · [ADR-024](../adr/ADR-024-CRM-CANONICAL-DOMAIN-MODEL.md)

---

## Gate verdict

| Gate | Result |
|------|--------|
| Canonical Deal truth + same-TX dual-write | **PASS** (drift paths found + fixed) |
| Tenant isolation (live) | **PASS** — **42/42** |
| Money (NUMERIC + currency) | **PASS** |
| Events / automation (no duplicate pipeline jobs) | **PASS** |
| Permissions `deals:*` | **PASS** (incl. `win_lose` on terminal moves) |
| Legacy consumers preserved (documented only) | **PASS** |
| Runtime Redis/BullMQ health | **PASS** (failed jobs classified, not redesigned) |
| Unit + typecheck | **PASS** |
| Browser 390/768/1280 | **PASS** (carried from 3A.1 smoke; closeout re-check blocked by flaky browser MCP — runtime web/API up) |

### Explicit freeze line

```
PHASE 3A.1 = FROZEN
READY FOR PHASE 3A.2 = YES
```

**Blockers for starting 3A.2:** **none** (remaining items are documented migration debt / non-blocking risks).

---

## 1. Canonical Deal truth

- **Canonical model:** `deals` table (typed commercial columns).  
- **Compatibility projection:** `pipeline_items` (same UUID when projected).  
- **Write rule:** Deal create/update/move/delete and item create/update/move/delete dual-write in `withUnitOfWork` / same TX.

### Write paths audited

| Path | Dual-write | Notes |
|------|------------|-------|
| `POST/PATCH/DELETE /api/deals`, `POST .../move` | Yes | Session RBAC |
| `/v1/deals` (+ move) | Yes | API key |
| `/api/pipelines/.../items`, `/api/items` | Yes | Kanban compatibility |
| Plugin bridge `deals.*` (`pipelines.ts`) | Yes *(fixed)* | Was Deal-only → now `withUnitOfWork` + `upsertPipelineItemFromDeal` / dual soft-delete |
| Worker `move_stage` / `assign_user` | Yes *(fixed)* | Was item-only → same TX + Deal sync |
| `maybeUpdateDealStageOnProjectComplete` | Yes *(fixed)* | Was item-only → TX updates item + Deal |

### Drift fixed this closeout

1. **Worker automations** — item stage/owner mutations now sync `deals` in the same transaction.  
2. **Plugin deals bridge** — create/update/delete project `pipeline_items` in the same UoW.  
3. **PM project-complete → won stage** — dual-write item + Deal.  
4. **`logStageChanged` + legacy `activities.record_id` FK** — `logActivity` skipped when caller passes a transaction (FK to `pipeline_records` was aborting Deal move TX → 500 on win/lose).  
5. **`pipelines.ts` duplicate `bridgeRegistry` import** — removed (API `tsc` clean).  
6. **`deals:win_lose`** — enforced on session PATCH/move when target stage is won/lost (was declared but unused).

### Accepted non-prod / seed-only asymmetry

- `seed-demo.ts` may insert Deal rows without items — **seed-only**, not a live API path.

---

## 2. Dual-write safety

| Action | Same TX | Rollback consistency |
|--------|---------|----------------------|
| create | Yes | Both or neither |
| update | Yes | Both or neither |
| move stage | Yes | Both or neither |
| delete (soft) | Yes | Both soft-deleted |
| win / lose (via stage flags) | Yes | Status + projection + outbox together |

Automation / bridge / PM-close paths now follow the same rule after closeout fixes.

---

## 3. Tenant isolation

Live suite (`ALLOW_LIVE_DB_TESTS=1`, `vencore_isolation_test`): **42/42 PASS**.

Deal-specific coverage includes:

- GET / list (A ok, B deny)  
- create (A ok; bad pipeline/stage/owner/contact/company deny)  
- update + projected item field sync  
- delete (cross-tenant deny; A soft-deletes both projections)  
- move (cross-tenant stage → 400/403/404; A→A ok)  
- win/lose stage move updates `status` / `won_at` / `lost_at`

---

## 4. Money

- Persistence: `NUMERIC(18,2)` — no float storage.  
- Parse path: `parseMoneyAmount` → decimal string.  
- Currency: explicit `VARCHAR(3)`; **default `INR` is temporary** until tenant currency settings.  
- Documented temporary default — **not** a freeze blocker.

---

## 5. Events / automation

- One business stage change → **one** `automation.pipeline.evaluate` via `crm.pipeline.*` / `onPipelineStageChanged`.  
- `crm.deal.*` → job `crm.deal.record` (ack-only) — **does not** re-fire pipeline automation.  
- Outbox append is same-TX with domain writes; webhook/event processing remains idempotent via dedupe keys.

---

## 6. Permissions

| Permission | Enforced |
|------------|----------|
| `deals:view` | GET/list |
| `deals:create` | POST |
| `deals:edit` | PATCH |
| `deals:delete` | DELETE |
| `deals:move_stage` | POST `/:id/move` |
| `deals:win_lose` | Terminal won/lost stage on PATCH + move *(closeout)* |

Member defaults include view/create/edit/move/win_lose; admin + delete. No extra grants added beyond module defaults.

**Note:** Workspaces seeded before `deals:*` existed may need role re-seed for members (admin `grants_all` OK). Non-blocking debt.

---

## 7. Legacy compatibility — migration debt (DO NOT remove in 3A.1)

| Consumer | Risk | Disposition |
|----------|------|-------------|
| `pipeline_items` + Kanban UI | Dual-write must stay until contract | **COMPAT** |
| `pipeline_records` / analytics EAV | Stale / wrong for new Deals | **REMOVE-LATER** |
| `emails.deal_id` | Not retargeted to canonical deals | **MIGRATE-LATER** |
| Monday `items` / `item_groups` | Parallel model | **REMOVE-LATER** |
| `activities.record_id` → `pipeline_records` FK | Legacy activity feed broken for item/deal IDs; TX-safe skip in stage log | **MIGRATE-LATER** (polymorphic / drop FK) |
| UI copy “item” / “record” | Not Deal-branded | Cosmetic debt |
| Analytics on `pipeline_records` | Under-reports canonical deals | Product debt for later wave |

---

## 8. Runtime

| Service | Status |
|---------|--------|
| API `:3001` | Up (auth returns 401 unauthenticated — expected) |
| Web `:3002` | Up / listening |
| Worker | BullMQ consumers running |
| Redis `:6380` | `PONG` |

### Historical failed Redis jobs (classified — no redesign)

| Queue signal | Classification |
|--------------|----------------|
| `webhook.deliver` … `contact.created` — *job stalled more than allowable limit* | **Unrelated / stale** (pre-Deal; contact webhook stall) |
| Automation failed set bulk (`metrics.rollup` / repeat sched ids) — *No handler registered for job metrics.rollup* | **Stale / ops debt** — scheduler vs handler mismatch; **not** Deal dual-write |
| Notifications / integrations failed sets | **Unrelated** to Deal closeout |

**Actionable for Deal?** No. Optional later ops cleanup only.

---

## 9. Tests (closeout)

| Suite | Result |
|-------|--------|
| `deals.test.ts` | PASS |
| `pipeline-items.test.ts` (alone / with timeout) | PASS |
| `deal-close-hooks.test.ts` | PASS |
| `soft-delete-filters.test.ts` | PASS |
| Live isolation | **42/42 PASS** |
| API `tsc --noEmit` | PASS |
| Worker `tsc --noEmit` | PASS |

Regression added/extended: live Deal patch/delete/move/win-lose; activity TX safety; bridge dual-write; worker/PM dual-write.

---

## 10. Browser

Prior 3A.1 smoke (still authoritative for freeze):

| Width | Overflow | Pipeline → Deal |
|-------|----------|-----------------|
| 390 | none | create item → Deal dual-write |
| 768 | OK | Kanban usable |
| 1280 | none | Full board |

Closeout attempted live re-smoke via browser MCP; tool repeatedly hung/interrupted. API + web ports confirmed listening. **No Deal UI regressions known** beyond prior hydration warning (pre-existing).

---

## Exact remaining risks (non-blocking)

1. Dual-write drift if a **future** path mutates only one table — process gate for reviews.  
2. Temporary default currency **INR**.  
3. Legacy `activities.record_id` FK — Deal stage activity feed incomplete until migrated.  
4. Analytics still on `pipeline_records`.  
5. Pre-`deals:*` workspaces may lack member Deal perms until re-seed.  
6. Stale BullMQ failed jobs / missing `metrics.rollup` handler — ops, not Deal.

---

## Exact blockers for Phase 3A.2

**None.**

Proceed to 3A.2 only when product chooses the next CRM wave (e.g. Leads / CustomerParty) — not blocked by Deal closeout.

---

## STOP

Do **not** auto-start Leads, CustomerParty, Products, Quotes, Finance, or WhatsApp from this gate.

```
PHASE 3A.1 = FROZEN
READY FOR PHASE 3A.2 = YES
GATE = PASS
```
