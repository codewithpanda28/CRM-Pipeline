# Sales Completion Block — Plan Only

| Field | Value |
|-------|-------|
| Status | **DESIGN ONLY — Phase 0 · no code yet** |
| Date | 2026-09-07 |
| Canonical PRD | [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md) |
| Audit | [THINKAIQ-MASTER-REQUIREMENTS-GAP-AUDIT.md](./THINKAIQ-MASTER-REQUIREMENTS-GAP-AUDIT.md) |
| Sales detail | [SALES_SPECIFICATION.md](../modules/SALES_SPECIFICATION.md) |
| Positioning | High-value **sales-team usability** before production DB/client rollout |

**Rule:** Design only. No code, migrations, or production DB changes in this phase. Do not start Voice, WhatsApp, AI, Automation R2B, commission engine, subscriptions, platform billing, or any block beyond this Sales Completion Block.

---

## 0. Frozen / do-not-rebuild surfaces

| Surface | Status | Implication |
|---------|--------|-------------|
| CRM Block 1 (search + lead import/export/bulk) | COMPLETE / FROZEN | Reuse; do not reimplement. *(Master audit still marks search MISSING — treat as **stale** for REQ-CRM-008 / bulk.)* |
| Pipeline Second View (Cards / Compact / Table / List) | COMPLETE / FROZEN | All four views remain; Compact next-action display is a building block only |
| Business Ops R1 + R2 | FROZEN | Reuse target metrics / performance APIs read-only for “target vs achievement” |
| Finance core + GL | FROZEN | Quote→invoice via existing Finance contract; no ledger redesign |
| Automation R1 + R2A | FROZEN | Emit existing domain events only; no new automation runtime |
| CustomerParty | COMPLETE | Canonical commercial identity |
| Deals | COMPLETE | Canonical sales opportunity SoR |
| CRM `tasks` | COMPLETE (Ops path) | Next-action SoR |

---

## 1. Discovery summary (reuse map)

### 1.1 Already usable (must NOT rebuild)

| Capability | Evidence | Reuse |
|------------|----------|-------|
| Pipelines + stages + Kanban DnD | `/crm/pipeline`, `PATCH /api/items/:id/move` | Preserve all view modes |
| Deal model | `deals`: amount, currency, **probability**, expected_close_at, owner, stage, status, party | Forecast inputs |
| Item display enrichment | `item-display.ts`: probability + batched `next_action` from tasks | Compact already consumes; extend UX |
| Lead import/dedup/bulk | CRM Block 1 | Preserve |
| Lead `source`, `rating` (`hot/warm/cold`), conversion links | `leads`, `lead_conversion_links` | Analytics inputs; scoring builds on top |
| Quotes versioning + send/accept/reject/revise | `/api/quotes`, `lib/quotes` | Commercial core |
| Quote → invoice API | `POST /api/invoices/from-quote/:quoteId` (accepted only) | Cash path exists |
| Ops metric calculators | `lib/business-ops/metrics.ts` keys: leads.*, deals.won, revenue.won, proposals.sent, … | Target vs achievement |
| Analytics module shell | `/api/analytics/{revenue,pipeline,team}`, widgets | **Migrate SoR to `deals`** for sales pack (do not invent parallel BI) |
| Dashboard widget registry | `register-all-widgets.ts` | Add sales KPI widgets |

### 1.2 Critical gap: dual analytics SoR

| Today | Problem |
|-------|---------|
| `/api/analytics/*` queries **`pipeline_records`** | Diverges from canonical **`deals`**; no probability |
| Ops KPIs query **`deals` / `leads` / `quotes` / `payments`** | Correct modern path |

**Design lock:** All new forecasting / sales KPI / lead analytics in this block **read from `deals` / `leads` / `quotes` / `tasks` / `payments`**. Legacy `pipeline_records` analytics may remain for backward compatibility but **must not** power the new Sales Forecast or Sales Dashboard pack. Prefer additive `GET /api/analytics/sales/*` (or `/api/sales/forecast`) on the deals SoR rather than silently changing legacy payload shapes.

### 1.3 Gaps by theme

| Theme | Gap |
|-------|-----|
| **A Forecast** | No weighted pipeline, period/stage/owner forecast, expected-close buckets |
| **B Lead analytics** | No numeric score product; no source performance reports |
| **C Pipeline UX** | Board filters = search only; next action display-only (not create/edit from board) |
| **D Quote→cash** | No manager approval gate; no quote UI “Create invoice”; deal linkage / won sync optional polish |
| **E Manager dashboard** | Widgets exist but unweighted / legacy SoR; no target-vs-achievement sales home |

### 1.4 Explicit non-reuse / non-goals

- Commission payout engine / second ledger  
- Customer subscriptions (REQ-BIL-001/002) — **no proven dependency** for forecast or quote→invoice  
- Full ADR-027 approval on every quote send (threshold-only optional later)  
- Merging PM tasks into CRM tasks  
- Replacing Compact/Cards/Table/List  
- Voice / WhatsApp / AI / Automation R2B  

---

## 2. Requirements closed by this block (target)

| REQ / theme | Target status after Sales Completion | Notes |
|-------------|--------------------------------------|-------|
| **REQ-SAL-003** Forecasting | COMPLETE (MVP) | Weighted + period + stage + owner; deals SoR |
| **REQ-SAL-002** Next action | COMPLETE (productized) | Beyond Compact display: filters + create/link task |
| **REQ-SAL-001** Probability UX | PARTIAL→stronger | Stage default probability optional; deal probability in forecast |
| **REQ-SAL-004** Quotes→invoice | PARTIAL→stronger | UX convert + deal linkage; **light** approval |
| **REQ-CRM-001** Lead score | PARTIAL→MVP | Rules-based score + retain `rating` |
| Lead source analytics | PARTIAL→MVP | Source performance + conversion by source |
| Sales dashboard / manager view | PARTIAL→MVP | KPI pack on deals SoR + Ops targets read |
| Pipeline filters | PARTIAL→MVP | Owner/stage/status/probability/close window — **not** full saved-views product |

### Intentionally deferred (outside this block)

| Item | Why |
|------|-----|
| REQ-BIL-001/002 customer subscriptions | Not required for sales forecast or quote→invoice |
| REQ-COM-001 commission engine | Explicitly frozen / prior non-goal |
| Full sales-cycle-length BI / aging heatmaps | Nice-to-have; Round B optional lite only |
| Multi-currency FX conversion for forecast | Phase-1 single (or native) currency totals; document |
| REQ-CUS-004 no-code report builder | Out of scope |
| Full quote `quote_approvals` SoR + every-send HITL | Light approval or threshold; not full workflow product |
| Saved pipeline views / layouts product (REQ-CUS-001 depth) | Session filters + optional localStorage only |
| Automation R2B overdue→task catalog | Frozen; existing events only |
| Voice / WhatsApp / AI / platform billing | Explicit OUT |

---

## 3. Architecture locks

1. **CustomerParty** = canonical commercial party.  
2. **`deals`** = canonical opportunity; no second deal model.  
3. **CRM `tasks`** = next-action / follow-up SoR.  
4. **Finance** = invoice/payment/GL SoR; quote convert calls existing Finance APIs.  
5. **Ops R1/R2** frozen — **read** performance/targets only.  
6. **Automation** frozen — no new engine features.  
7. **PostgreSQL** SoR; Redis/cache optional later, not SoR.  
8. **Tenant isolation** on every new query (`workspace_id`).  
9. **RBAC:** prefer existing `analytics:view`, `deals:view`, `leads:view`, `quotes:*`, `pipelines:view`; add **at most** `analytics:sales` or reuse `analytics:view` (no sprawl). Spec’s `sales.forecast.view` may map to `analytics:view` in v1.  
10. Pipeline views: **Cards (default) · Compact Board · Table · List** — all preserved.

---

## 4. Capability → data / API / UI map

### A. Sales forecasting / analytics

| Need | Source | New surface (design) |
|------|--------|----------------------|
| Pipeline value (open) | `SUM(deals.amount)` status=open, not deleted | `GET /api/analytics/sales/summary` |
| Weighted pipeline | `SUM(amount * probability/100)` open deals | Same + `weighted_pipeline` |
| Expected revenue / period forecast | Open deals with `expected_close_at` in window × weight | `GET /api/analytics/sales/forecast?from=&to=&grain=month\|week` |
| Stage-wise forecast | Group by `stage_id` | `…/forecast?group_by=stage` |
| Owner / team breakdown | Group by `owner_id`; team via Ops employee→manager scope **read** optional | `…/forecast?group_by=owner` (+ optional `scope=team`) |
| Conversion / win-loss | Won vs lost in period (`won_at`/`lost_at`) | summary + `…/win-loss` |
| Avg deal size | Won deals avg amount | summary |
| Expected close analysis | Histogram of open deals by expected_close buckets | forecast series |
| Salesperson pipeline | Owner filter on open deals | forecast + dashboard |

**Indexes (additive, verify first):**  
`(workspace_id, status, deleted_at)`, `(workspace_id, expected_close_at)`, `(workspace_id, owner_id, status)`, `(workspace_id, stage_id, status)` on `deals` — create only if missing.

### B. Lead scoring / source analytics

| Need | Source | New surface |
|------|--------|-------------|
| Score | New **rules evaluation** writing `leads.score` (int 0–100) **or** derived-on-read MVP | Prefer column `score INT NULL` + optional `scored_at`; keep `rating` |
| Rules | New table `lead_score_rules` (tenant-scoped) **or** fixed system defaults v1 | Round A: **system defaults** (email present, phone, source weights, status) — avoid full rule builder UI |
| Source performance | Aggregate by `leads.source` | `GET /api/analytics/sales/leads-by-source` |
| Conversion by source | Join conversion links / status=converted | Same endpoint counts |
| Owner performance | Group by `owner_id` | `…/leads-by-owner` |

**Preserve:** import, dedup (`findLeadDuplicates`), bulk assign/status/delete.

### C. Pipeline UX completion

| Need | Approach |
|------|----------|
| Filters | Client + API: extend `GET /api/pipelines/:id/items` and/or use `GET /api/deals` filters: owner, stage, status, probability min/max, expected_close from/to, has_next_action |
| UI | Filter bar on pipeline page **shared across Cards/Compact/Table/List** — does not fork views |
| Next action | Show on Compact (done); add to Cards (optional compact row) + Table column; **“Add next action”** creates CRM task with `related_deal_id` |
| Metrics strip | Reuse header open value; add optional weighted value chip from summary endpoint (cached client-side) |

### D. Quote → cash

| Need | Approach |
|------|----------|
| Versioning polish | UX: version history list on quote detail (data already via revise chain) |
| Approval | **Light:** permission `quotes:accept` remains recorder of customer accept; optional **manager confirm before send** for amount ≥ tenant threshold using existing role check — **not** full `quote_approvals` SoR in Round A. Round B: optional draft→`pending_approval` status **only if** product insists; else document deferred. |
| Accepted/rejected | Already implemented — polish UX + audit clarity |
| Deal linkage | Ensure quote.deal_id set/editable; on accept optionally prompt “mark deal won” (user-confirmed, not silent) |
| Quote → invoice | Button on accepted quote → `POST /api/invoices/from-quote/:id` → navigate Finance invoice |
| Commercial confidence | Block invoice unless accepted (already); show party/tax/total snapshot before convert |

### E. Sales dashboard / manager view

| KPI | Calculation | Source |
|-----|-------------|--------|
| Leads / qualified | Ops keys or sales leads aggregate | Prefer shared sales summary |
| Active deals / pipeline value / weighted | deals open | New sales summary |
| Won / lost / conversion / avg size | deals period | New |
| Expected revenue | weighted in close window | Forecast |
| Salesperson performance | group by owner | Forecast + leaderboard on **deals** |
| Target vs achievement | Ops `GET /api/ops/performance/summary` + target periods | **Read-only** embed |

**UI:** `/crm/sales` or `/analytics/sales` manager page + dashboard widgets `sales:kpi-*` / `sales:forecast-*`. Prefer `/crm/sales` under CRM nav to avoid overloading Finance.

---

## 5. Schema changes (provisional — Round gates decide)

| Change | Round | Required? |
|--------|-------|-----------|
| `leads.score INT NULL` + `scored_at` | A | **Yes** for durable scoring |
| `lead_score_rules` table | B or never | Optional; A uses code defaults |
| `deals` indexes listed above | A | If missing |
| Quote `pending_approval` status | B | **Only if** light approval insufficient |
| `quote_approvals` table | Deferred | Not Round A/B unless forced |
| Analytics materializations | Deferred | Query live with limits |

No second customer/deal/task/finance tables.

---

## 6. Two implementation rounds (exact split)

### Round A — Sales Intelligence Foundation

**Goal:** Managers and reps can **see and trust** pipeline numbers, forecasts, and lead source quality without leaving CRM.

| Area | Scope |
|------|--------|
| **A Forecast** | `GET /api/analytics/sales/summary` + `…/forecast` + `…/win-loss` on **deals**; UI `/crm/sales` Forecast + Win/Loss sections |
| **B Leads** | Persist `leads.score`; recompute on create/update/import commit; `GET …/leads-by-source` + by-owner; Leads board show score; source filter |
| **C Pipeline UX** | Shared filter bar (owner, stage, status, probability, close window); pass filters into items/deals queries; next-action column on Table; “Add follow-up” → task |
| **E Dashboard (pack 1)** | Widgets: open pipeline, weighted pipeline, win rate (deals), leads created/qualified — registered for `/dashboard` |
| **Views** | Preserve Cards/Compact/Table/List; filters apply to all |

**Out of Round A:** Quote invoice button polish, quote approval states, target-vs-achievement embed, salesperson team-scope deep hierarchy.

### Round B — Quote→Cash Confidence + Manager Depth

**Goal:** Commercial path feels closed-loop; managers see people vs targets.

| Area | Scope |
|------|--------|
| **D Quote→cash** | Quote detail: version timeline, **Create invoice** (accepted), deal link editor, optional confirm-mark-won on accept; light send gate by amount/role if needed |
| **E Manager** | Sales home: salesperson leaderboard (deals SoR), period selector, **target vs achievement** panels calling existing Ops performance APIs (employee/team) |
| **A Forecast polish** | Stage-wise + owner-wise charts; expected-close aging buckets; CSV export of forecast rows (cap like lead export) |
| **B Leads polish** | Conversion-by-source funnel chart; optional admin “score weights” settings (still not full rules engine) |
| **C Pipeline** | Filter persistence in localStorage per user; has_next_action filter |

**Out of Round B:** Commission engine, subscriptions, Automation R2B, full ADR-027 quote approval matrix, BI builder.

---

## 7. APIs (design contracts)

### Round A

```
GET /api/analytics/sales/summary?from=&to=&owner_id=
  → { leads_created, leads_qualified, active_deals, pipeline_value, weighted_pipeline,
      won_count, lost_count, win_rate, avg_won_deal_size, expected_revenue }

GET /api/analytics/sales/forecast?from=&to=&grain=month|week&group_by=none|stage|owner&owner_id=
  → { series: [{ bucket, pipeline_value, weighted_value, deal_count }], rows?: […] }

GET /api/analytics/sales/win-loss?from=&to=&owner_id=
  → { won, lost, abandoned?, reasons: [{ lost_reason, count }] }

GET /api/analytics/sales/leads-by-source?from=&to=
GET /api/analytics/sales/leads-by-owner?from=&to=

PATCH /api/leads/:id   # score may be server-managed (ignore client score writes)
POST /api/leads/import/commit  # already exists — recompute score after insert
```

Pipeline items list: additive query params `owner_id`, `status`, `probability_min`, `probability_max`, `expected_close_from`, `expected_close_to`, `has_next_action`.

### Round B

```
POST /api/quotes/:id/create-invoice   # thin alias OR document UI→existing Finance route
# Prefer: UI calls existing POST /api/invoices/from-quote/:quoteId (no duplicate)

GET /api/quotes/:id/versions          # if not already listable via root_quote_id
```

Audit: `analytics.sales.view`, `crm.leads.score_recompute` (batch), quote convert already finance-audited.

---

## 8. UI routes / components

| Route / component | Round | Role |
|-------------------|-------|------|
| `/crm/sales` | A | Sales home: KPIs + forecast + win/loss |
| `/crm/sales/leads-analytics` or tab | A | Source / owner lead analytics |
| Pipeline page filter bar | A | Shared across four views |
| Cards / Compact / Table / List | — | **Unchanged modes**; consume filters |
| Deal task “Add follow-up” | A | Modal → `POST /api/tasks` or Ops task create with `related_deal_id` |
| Quote detail actions | B | Create invoice, versions panel, deal link |
| Dashboard widgets | A+B | Register sales KPI + forecast widgets |
| Nav | A | CRM submenu “Sales” (permission `analytics:view` or `deals:view`) |

---

## 9. RBAC

| Action | Permission (v1) |
|--------|-----------------|
| View sales analytics / forecast | `analytics:view` (existing) |
| View own-only vs all | Admin / `grants_all` = all; members = **own deals/leads** unless `deals:view` + future team scope (Round B Ops scope read) |
| Lead score recompute admin | `leads:edit` or admin |
| Quote invoice create | `invoices:create` + quote accepted |
| Quote send | `quotes:send` |
| Pipeline filters | `pipelines:view` |

No new keys in Round A unless team-scope forces `analytics:sales_team` — prefer Ops scope resolver read in Round B.

---

## 10. Tenant isolation & audit

- Every aggregate: `workspace_id = auth.workspace.id`, soft-delete excluded.  
- Owner scope: non-privileged users filtered to `owner_id = auth.user.id` for deals/leads aggregates.  
- Cross-tenant deny covered by live isolation tests.  
- Audit: security_audit for score bulk recompute and forecast export; quote→invoice uses existing finance audit.

---

## 11. Performance

- Aggregates: SQL `GROUP BY` + indexes; **no N+1**.  
- Forecast default window ≤ 12 months; series cap.  
- Export cap (e.g. 5k rows) mirroring lead export.  
- Reuse single summary query for dashboard widgets (React Query shared keys).  
- Do not claim p95 without measurement.  
- Lead score on import: batch update in same commit chunk.

---

## 12. Testing strategy

| Layer | Round A | Round B |
|-------|---------|---------|
| Unit | Weighted math; score rules; win_rate definition | Version list ordering; convert preconditions |
| API | Forecast tenant isolation; member own-scope; empty probability → weight 0 or default documented | from-quote only when accepted; deal link |
| Live | Two-tenant forecast/lead analytics isolation | Quote→invoice isolation (extend finance/CRM live) |
| UI | Filters apply to all four views; Cards default intact | Invoice CTA; widgets render |
| Regression | Compact Board + CRM Block 1 search/import; Ops performance untouched | Finance invoice suite; quotes lifecycle |

---

## 13. Migration / implementation order

### Round A order
1. Migration: `leads.score` (+ indexes on deals if needed)  
2. Score library + wire create/update/import  
3. Sales analytics APIs on deals/leads  
4. `/crm/sales` UI + widgets pack 1  
5. Pipeline filter bar + items query params  
6. Next-action create UX  
7. Tests + **Round A implementation report**

### Round B order
1. Quote UI: versions + create invoice + deal link (+ optional mark-won confirm)  
2. Forecast polish charts + export  
3. Manager target-vs-achievement (Ops read)  
4. Lead conversion-by-source + optional score weights settings  
5. Filter localStorage persistence  
6. Tests + **Round B / Sales Completion implementation report**

---

## 14. Acceptance gates

### Round A gate (must all pass)

- [ ] Forecast returns pipeline value **and** weighted pipeline from **`deals`**  
- [ ] Period + stage + owner groupings work; tenant isolation proven  
- [ ] Lead `score` persisted; source analytics endpoint works; import still intact  
- [ ] Pipeline filters work on **Cards, Compact, Table, List** without removing any view  
- [ ] Cards remains default; Compact Board regression green  
- [ ] Next action: display + create follow-up task linked to deal  
- [ ] Sales KPI widgets register and load without Finance/Ops code rewrites  
- [ ] Web typecheck + CRM/analytics tests green  
- [ ] Round A report filed; Block 2 subscriptions / Automation R2B **not** started  

### Round B gate (closes Sales Completion Block)

- [ ] Accepted quote → Create invoice from quote UI via existing Finance API  
- [ ] Deal linkage visible/editable; optional mark-won is explicit user confirm  
- [ ] Manager sales home shows salesperson performance + target vs achievement (Ops read)  
- [ ] Forecast export capped; win/loss + expected-close analysis usable  
- [ ] Live isolation for new routes green; Finance quote→invoice regression green  
- [ ] Ops R1/R2 / Automation / CRM Block 1 / Pipeline Second View remain frozen/untouched beyond agreed read/UI glue  
- [ ] Final Sales Completion implementation report; deferred list explicit  

---

## 15. Dependencies

| Depends on | Why |
|------------|-----|
| Canonical `deals` + probability | Forecast math |
| CRM `tasks.related_deal_id` | Next action |
| Lead import/dedup (Block 1) | Scoring after import |
| Quotes + `invoices/from-quote` | Round B cash path |
| Ops performance/targets APIs | Round B target vs achievement |
| Analytics module entitlement | Permission gate |
| Dashboard widget registry | KPI pack |

| Must not depend on | Why |
|--------------------|-----|
| Customer subscriptions | Not required |
| Commission engine | Frozen |
| Automation R2B | Frozen |
| Voice / WhatsApp / AI | Out |

---

## 16. End summary (requested)

### Complete sales requirements being closed (MVP)

- **REQ-SAL-003** Sales forecasting (weighted, period, stage, owner, expected close, win/loss, avg size, expected revenue)  
- **REQ-SAL-002** Next action productization (+ filters / metrics strip)  
- **REQ-SAL-004** Quote→invoice **commercial confidence** (UX + linkage; light approval)  
- **REQ-CRM-001** Lead **score** MVP + source/owner analytics (with import preserved)  
- Sales **manager dashboard** KPI pack including target vs achievement (Ops read)

### Intentionally deferred

Subscriptions · commission engine · Automation R2B · Voice/WhatsApp/AI · full quote approval SoR · no-code BI · multi-currency FX · full saved views product · sales-cycle-length deep BI

### Round A scope

Deals-based sales summary/forecast/win-loss APIs + `/crm/sales` · lead score + source analytics · pipeline shared filters · next-action create · sales widgets pack 1 · **preserve all pipeline views**

### Round B scope

Quote→invoice UX + deal link/won confirm · forecast polish/export · manager leaderboard + Ops target vs achievement · lead conversion-by-source polish · filter preference persistence

### Dependencies

`deals` · CRM tasks · Block 1 leads · quotes + Finance from-quote · Ops performance read · analytics permission · dashboard registry

### Acceptance gates

See §14 Round A and Round B checklists — both required before calling Sales Completion Block done for production readiness of **sales usage** (not full platform production).

---

*End of Phase 0 design. No code, migrations, or schema changes were made producing this document.*
