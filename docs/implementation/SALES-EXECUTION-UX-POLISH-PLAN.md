# SALES-EXECUTION-UX-POLISH-PLAN.md

| Field | Value |
|-------|-------|
| Status | **PLAN ONLY — NOT APPROVED FOR IMPLEMENTATION** |
| Date | 2026-09-07 |
| Product | ThinkAIQ CRM |
| Intent | Lead / My Tasks / Pipeline clarity + DPR–performance UX polish |
| Depends on (frozen) | Sales Workflow Core Round A + B · Pipeline DealCreate UX · CRM Block 1 · Ops R1/R2 · Railway real-data |
| Related | ADR-025 · ADR-027 · Field ownership · TEAM_DPR.md · Ops R1/R2 plans |

**Hard rule:** No code, migrations, or schema changes until this plan is explicitly approved.

**Employee loop (must remain):**  
My Tasks → Lead/Customer record → Task / Meeting / Communication → Pipeline → Deal → Finance → Operations.

---

## 0. Executive summary

Sales Workflow Core A/B shipped the **architecture** (unified record, tasks, nav, timeline). The client now reports **execution UX** gaps:

1. Leads look unfinished and confuse **lead status** with **pipeline stage**.
2. My Tasks is the primary Work item but still feels like a thin CRUD list — not “what do I do next?”
3. DPR / Performance exist as Ops R2 scaffolds but do not answer WHO / progress / target vs achievement / daily activity for managers.

This plan audits **actual** lead→deal behavior, then designs polish in **exactly two rounds** (A = Lead + My Tasks + clarity; B = DPR + manager performance). Do not start Round B until Round A acceptance passes.

---

## 1. Current behavior audit — Lead vs Deal

### 1.1 Product rule (confirmed by code)

| Rule | Status |
|------|--------|
| Changing lead status alone does **NOT** create a pipeline deal | **True today** |
| Pipeline cards = canonical `deals` (+ `pipeline_items` projection, `id === deals.id`) | **True** |
| Only conversion/create-deal (or direct `POST /api/deals`) creates a deal/card | **True** |
| No duplicate Lead/Deal identity systems | Preserve |

**Canonical language (enforce in UX copy):**

- **Lead status** = prospect lifecycle (`new` → `contacted` → `qualified` → … / `converted` only via convert API).
- **Deal** = sales opportunity.
- **Pipeline stage** = deal stage on the board.
- **Lead status ≠ pipeline stage.**

### 1.2 Exact paths (evidence)

| Scenario | What happens today | Deal / pipeline_item? |
|----------|--------------------|------------------------|
| **A. PATCH lead status** (incl. `qualified`) | Status machine + outbox `crm.lead.status_changed` only. `converted` **not** allowed on PATCH. | **No** |
| **B. Convert without `create_deal`** | Contact (+ company/party); lead → `converted`; `deal_id` null. LeadsBoard default. | **No** |
| **C. Convert with `create_deal=true` + `deal`** | Contact → company → optional party → **deal insert** → **`upsertPipelineItemFromDeal`** (same UUID) → conversion links → lead `converted` + `deal_id`. | **Yes** (same TX; failure rolls back) |
| **D. Already converted** | Idempotent early return. Does **not** create a later deal even if `create_deal=true` on retry. | No new deal |
| **E. Qualified / converted via status alone** | No auto-deal path exists. | **No** |

Key modules: `apps/api/src/lib/leads/convert.ts`, `apps/api/src/lib/leads/status.ts`, `apps/api/src/routes/leads.ts`, `apps/api/src/lib/deals/projection.ts`.

### 1.3 Confirmed bugs / gaps vs expected product

| ID | Severity | Finding | Expected after polish |
|----|----------|---------|------------------------|
| **L1** | UX / product | Users confuse status dropdown with “moving into pipeline.” | Explicit copy + visual split: Status vs Deal. |
| **L2** | Product gap | Convert without deal → later “Also create deal” convert is **idempotent** and will **not** attach a deal. Must use DealCreate / `POST /deals`. | UI: if converted & no deal → CTA **Create deal** (not re-convert). |
| **L3** | Data lineage | `POST /api/deals` with `lead_id` in custom_fields does **not** set `leads.deal_id` / status. | Prefer conversion path or thin link update on create-from-lead (Round A decision — see §8). |
| **L4** | Round B claim gap | LeadsBoard has next-task chip UI; **list API never enriches** tasks → chip never shows. | Enrich list (or lightweight join) for next open task. |
| **L5** | UX | Converted lead may show “Deal linked” only via `deal_id`; no stage name on list. | Show deal name + stage when linked. |
| **L6** | Not a create_deal bug | Happy-path `create_deal=true` dual-write is solid (live isolation test). Missing card after true convert → investigate stage filter, archived stage, wrong pipeline, or client cache — not missing upsert. | Document troubleshooting; no new SoR. |

**Verdict:** Treat “converted with create_deal but no card” as **environment/data/UI filter bug**, not missing projection — unless logs show convert without `deal` payload (400 `DEAL_REQUIRED` on session route).

---

## 2. Leads UX improvements

### 2.1 Goal

Professional **B2B prospect list** — not a second Kanban. Dense, scannable, identity-first.

### 2.2 Row / card content (must show)

| Element | Source |
|---------|--------|
| Person / company identity | `leads.name`, `company_name` |
| Contact | email, phone |
| **Lead status** (lifecycle chip) | `leads.status` — labeled “Lead status” |
| Score / rating | `rating` / score if present |
| Owner | owner display name |
| Next action | enriched next open CRM task |
| Linked deal | `deal_id` → name or “No deal yet” |
| Pipeline stage | join deal → stage name/color **only if deal exists** |
| Source / context | `source` |

### 2.3 Visual distinction

| Concept | Treatment |
|---------|-----------|
| Lead status | Neutral/lifecycle chip (New / Contacted / Qualified / Converted / …) |
| Deal + stage | Separate “Deal” column or secondary line: stage color swatch + name, or muted **No deal yet** |
| Pipeline | Never imply status change = board move |

### 2.4 Primary actions

- **Open Record** → `/crm/records/lead:{id}` (already)
- **Add Task** (prefill `related_lead_id`)
- **Convert** (unconverted) / **Create deal** (converted, no deal) where permitted
- Status change remains available but secondary (not confused with Create deal)

### 2.5 Empty / converted states

- Unconverted, no deal: CTA **Convert** and optional **Convert + create deal**
- Converted, no deal: CTA **Create deal** → DealCreateModal / convert-safe deal create (not idempotent dead-end)
- Converted + deal: show stage; click opens `/crm/records/deal:{id}` or party record with deal context

### 2.6 Do not

- Make Leads look like Pipeline columns
- Auto-create deals on Qualified
- Duplicate CustomerParty / Deal models

---

## 3. My Tasks UX improvements

### 3.1 Goal

Primary employee **work queue**: “What should I do next?” obvious in ≤3 seconds.

Canonical route remains **`/ops/tasks`** (CRM `tasks` SoR). Do **not** use `project_tasks`.

### 3.2 Visual groups (UI composition)

Reuse Today-style buckets on My Tasks (server sort already exists — `sortMyTasks`):

| Group | Definition |
|-------|------------|
| **Overdue** | Open + due/start/end in the past |
| **Time-bound today** | `scheduling_mode=time_bound` starting today (or within working day) |
| **High priority** | URGENT/HIGH unbounded (not already in overdue/today) |
| **Upcoming** | Future due / start |
| **No-deadline work** | Open, no due/start |

Preserve stable urgency ordering **within** and across groups (existing sort algorithm). Never silently hide lower-priority open work (use filters for done/cancelled history).

### 3.3 Row content

- Title  
- Related client / lead / deal (context chips → unified record)  
- Assignee (when team scope)  
- Priority indicator  
- Due / start (date + time; timezone when time-bound)  
- Meeting mode (online/offline + location hint)  
- Quick complete  
- Open record  

### 3.4 Quick create

Keep Round B create; polish layout: unbounded vs meeting/time-bound as clear modes; related record optional.

### 3.5 Scope

Add optional Mine / Team (reuse Ops scope already on Today) without removing personal default.

### 3.6 Relationship to Today / My Work

| Surface | Role after polish |
|---------|-------------------|
| **My Tasks** | Primary Work nav execution queue (grouped) |
| **Today** | Optional Ops “day ritual” — may remain Advanced or alias messaging |
| **My Work** | Manager/self filtered Ops view — Advanced |

Avoid three competing primary UIs; My Tasks wins the Work slot.

---

## 4. Task visual language

Stay inside **existing ThinkAIQ CRM tokens** (`--surface`, `--text`, `--border`, `--accent`, OpsShell / PageHeader). No new design system. No purple-gradient AI look.

| Concern | Direction |
|---------|-----------|
| Hierarchy | Group headers with counts; tasks as rows (card-like only if needed for interaction) |
| Priority | Color/weight: URGENT/HIGH vs MEDIUM/LOW — not raw enum dump |
| Time | Overdue = warning treatment; meetings = clock / mode chip |
| Status | Open vs done via filter; complete = clear primary action |
| Spacing | Comfortable mobile stack; desktop denser list |
| Empty states | One sentence + Create task CTA per empty group |
| Mobile | No drag-only; large tap targets for Complete / Open |

---

## 5. DPR / Performance hub redesign

### 5.1 Current state (audit)

| Surface | Today | Gap |
|---------|-------|-----|
| `/ops/dpr` | System metric lines + notes; Draft→Submit | No target / % / WHO narrative / activity timeline |
| `/ops/dpr/inbox` | Thin list (often today-only) | Weak manager UX |
| `/ops/dpr/[id]` | Approve/Return | Events not shown; “Approve” → status `reviewed` |
| `/ops/performance` | Goal / actual / remaining / % / prior | Weak subject pickers; raw metric keys |
| Calculators | 10 `TARGET_METRICS` + DPR `activities.call` / `activities.meeting` | Reuse — **do not invent fake metrics** |

### 5.2 DPR must answer

WHO did what? · HOW MUCH? · HOW FAR AGAINST TARGET? · WHAT IS PENDING? · WHAT HAPPENED TODAY? · WHAT NEEDS MANAGER ATTENTION?

### 5.3 Information architecture

| View | Audience | Content |
|------|----------|---------|
| **A. My DPR** | Employee | Day card: metrics vs target (where goal exists), achievement %, pending tasks, daily activity, notes/adjustments |
| **B. Team DPR / Manager Review** | Manager | Inbox + filters; submitted / pending / returned / reviewed counts; open employee day |
| **C. Performance summary** | Manager / self | Period (day/week/month): subject scope, target table, trends |

### 5.4 Metrics to show (only if calculator exists)

From existing catalog (labels humanized in UI):

| Key | Label |
|-----|-------|
| `leads.created` | Leads added |
| `leads.contacted` | Leads contacted |
| `leads.qualified` | Leads qualified |
| `demos.completed` | Demos |
| `proposals.sent` | Proposals |
| `activities.call` | Calls *(DPR snapshot only today)* |
| `followups.completed` | Follow-ups completed |
| `tasks.completed` | Tasks completed |
| `activities.meeting` | Meetings *(DPR snapshot)* |
| `deals.won` | Deals won |
| `revenue.won` | Revenue |
| `collections.received` | Collections — **label as company/tenant-wide** until calculator gains owner scope |

System-derived numbers remain canonical. Manual overlay (notes + numeric adjustments) must be **visually marked** (API already supports adjustments; UI missing).

### 5.5 Target join (no fake goals)

Where an open-period `targets` row exists for employee + metric + overlapping window: show **Target · Actual · Remaining · %**.  
Where no target: show actual only + “No target set” — do not fabricate.

---

## 6. Manager performance

### 6.1 Selectors (permissions already exist)

Employee · Team · Department · Company · Date range / day / week / month.

### 6.2 Display

- Target · Actual · Remaining · %  
- Trend vs previous period (Performance API already has prior %)  
- Activity / metric breakdown  
- Clickable employee → detail  

**Example table:**

| Employee | Target | Actual | % | Status |
|----------|--------|--------|---|--------|

Status derived from % bands (e.g. on-track / at-risk / behind) — presentation only, not a new SoR.

### 6.3 Do not invent metrics

Only `TARGET_METRICS` (+ clearly labeled DPR activity keys). Fix or caveat `collections.received` ownership before presenting as personal score.

---

## 7. DPR timeline / daily activity

Per employee / day, chronological where data exists:

| Event family | Likely SoR |
|--------------|------------|
| Task created / completed | `tasks` + `activities` |
| Call / communication / meeting | `activities` |
| Lead created / contacted / qualified | `leads` + status events |
| Proposal | quotes |
| Deal movement / won | `pipeline_activity` / deals |
| Revenue / collection | finance reads |

**Clearly distinguish:**

- **System activity** (immutable feed items)  
- **Manual DPR note / numeric overlay** (marked)

Prefer composing existing `activities` + task completions + DPR snapshot — avoid a third history table.

---

## 8. DPR review workflow

**Preserve state model:**

`draft` → `submitted` → `reviewed` (Approve) | `returned` → editable → resubmit  

Improve UX only:

- Manager inbox with counts: submitted / pending / reviewed / returned  
- Employee, date, progress summary, manager status  
- Show `dpr_review_events` timeline on detail  
- Align copy: button “Approve” → status still `reviewed` (document; rename only if product insists — prefer copy, not schema rename)

Do not change state machine unless a hard blocker appears.

---

## 9. Client record integration

Already Round B: keep and harden.

| From | To |
|------|----|
| Lead list / convert | `/crm/records/lead:…` · Add Task · Meeting · Communication |
| Pipeline card | `/crm/records/deal:…` · next task · stage |
| My Tasks chip | Same unified record |
| Search | Same |

No duplicate data entry. Field ownership doc remains binding.

---

## 10. Pipeline clarity changes

### 10.1 UX language (everywhere)

```
Lead status  ≠  Pipeline stage
Lead         =  prospect lifecycle
Deal         =  sales opportunity
Pipeline     =  deal stages
```

### 10.2 Empty deal states

| Situation | UI |
|-----------|-----|
| No deal | **No deal yet** + CTA **Create deal** |
| Deal exists | Deal name + stage chip |

### 10.3 Enforcement

- Status `<Select>` helper text: “Updates prospect lifecycle — does not move Pipeline.”
- Convert panel: clear “Create contact only” vs “Create contact + deal.”
- After convert without deal: do not offer dead “re-convert with deal”; offer **Create deal**.

### 10.4 Optional thin API fix (Round A only if approved)

When creating a deal from a lead (DealCreate / convert follow-up): set `leads.deal_id` (and optionally ensure party) so list “Deal linked” stays truthful — **without** inventing a second conversion path. Spec in Round A tickets; skip if product accepts custom_fields-only linkage short-term.

---

## 11. Navigation

Unchanged from Sales Workflow Core Round B:

| Primary | Route |
|---------|-------|
| My Tasks | `/ops/tasks` |
| Pipeline | `/crm/pipeline` |
| Leads | `/crm/leads` |

Everything else Advanced / existing groups. **Do not remove routes or permissions.**

---

## 12. Data / architecture locks

**Preserve:** CustomerParty · deals · pipeline_items · CRM `tasks` · activities · Ops DPR/performance/targets · Finance ledger · Automation · tenant isolation · RBAC · ADR-027.

**No duplicate:** customer · deal · task · DPR identity.

**System metrics stay calculator-backed.** Manual overlays labeled.

---

## 13. API / data / schema changes

### 13.1 Likely needed (prefer additive)

| Change | Round | Why |
|--------|-------|-----|
| Lead list enrichment: next task + deal name + stage | A | Dead chip + clarity |
| Optional `leads.deal_id` link on deal-from-lead | A | Lineage honesty (if approved) |
| My Tasks API: return bucket id or let client bucket from sort fields | A | Grouped UI |
| DPR me/detail: join targets for overlapping period → target/% | B | TARGET/ACHIEVEMENT |
| DPR adjustments UI → existing PATCH adjustments | B | Manual overlay |
| Performance subject pickers (wire existing APIs) | B | Manager UX |
| Activity feed compose for DPR day (query filters) | B | Timeline |

### 13.2 Schema

**Default: no new tables.**  

Only if Round B spike proves activities cannot list day narrative: additive indexes or `meta` conventions — document in Round B tickets. Prefer **no** `crm_communications` sibling.

### 13.3 Explicit non-goals

Full calendar sync · commission · AI · WhatsApp · Voice · forecast engine · new customer/deal/task SoR · inventing metrics without calculators.

---

## 14. Testing strategy

### Lead / pipeline clarity

- Status change → **not** on board  
- Convert without deal → no `pipeline_items`  
- Convert with `create_deal` → deal + item same id + stage  
- Converted + Create deal CTA path → one deal, no duplicate party  
- Idempotent re-convert does not duplicate  

### Tasks

- Related lead / party / deal open unified record  
- Time-bound vs unbounded  
- Group membership + sort stability  
- Complete + filter history  

### DPR / performance

- Employee day metrics = calculator  
- Target join when goal exists; honest empty when not  
- Manager scope isolation (team/dept/company)  
- Submit freezes snapshot; review/return events  
- Adjustments marked manual  
- Cross-tenant forged IDs rejected  

### UI / regression

- Leads · My Tasks · DPR · mobile  
- Pipeline Cards / Compact / Table / List · DealCreate  
- CRM Block 1 · Finance · Ops · Automation · PM  

Web/API `tsc` green each round.

---

## 15. Implementation split (exactly 2 rounds)

### ROUND A — Lead + My Tasks + pipeline clarity

**Scope:**

1. Leads list/card visual redesign + Status vs Deal language  
2. Lead list enrichment (next task, deal, stage)  
3. Convert / Create deal CTAs fixed for converted-without-deal  
4. Optional thin `leads.deal_id` link on deal-from-lead (ticketed decision)  
5. My Tasks grouped UX (Overdue / Today time-bound / High / Upcoming / No deadline)  
6. Task visual language polish + quick create polish  
7. Copy/helpers on status + convert panels  

**Exit gates:**

| Gate | Pass criteria |
|------|----------------|
| A1 | Status change never creates pipeline card |
| A2 | Convert+deal shows card in correct stage |
| A3 | Converted without deal shows Create deal CTA that works |
| A4 | Lead row shows status ≠ stage; opens unified record |
| A5 | My Tasks groups make next action obvious; sort preserved |

**Do not start Round B until A1–A5 pass.**

### ROUND B — DPR + manager performance + polish

**Scope:**

1. My DPR day card: WHO/WHAT/TARGET/ACHIEVEMENT/pending/daily activity  
2. Manual overlay UI (notes + adjustments) clearly marked  
3. Manager inbox + review visual workflow + event timeline  
4. Performance hub subject selectors + human labels + target table  
5. DPR timeline composition from existing SoRs  
6. Mobile polish for DPR/performance  
7. Caveat/fix collections ownership presentation  

**Exit gates:**

| Gate | Pass criteria |
|------|----------------|
| B1 | Employee sees actual vs target % where goals exist |
| B2 | Manager can filter scope and open employee day |
| B3 | Timeline distinguishes system vs manual |
| B4 | Review inbox usable (counts + approve/return) |
| Reg | Pipeline · Block 1 · Finance · Automation · PM green |

---

## 16. Deliverables checklist (this document)

| Item | Section |
|------|---------|
| Current behavior audit | §1 |
| Bugs vs expected | §1.3 |
| Leads UX | §2 |
| My Tasks UX | §3–4 |
| DPR / performance redesign | §5–8 |
| Pipeline clarity | §10 |
| Record integration | §9 |
| Nav | §11 |
| Architecture locks | §12 |
| API/schema (only if needed) | §13 |
| Testing | §14 |
| Round A / B split | §15 |

---

## 17. Risks

| Risk | Mitigation |
|------|------------|
| Users still equate Qualified with Pipeline | Persistent Status vs Deal chrome + education copy |
| Three task pages confuse | My Tasks primary; Today/My Work demoted messaging |
| DPR without targets looks “empty %” | Show actual + “No target set”; don’t invent |
| `collections.received` misread as personal | Label tenant-wide or fix calculator in Round B |
| Scope creep into forecast/BI | Hard non-goals |

---

## 18. Approval

| Role | Decision |
|------|----------|
| Product | Approve Lead≠Deal language + Round A/B split |
| Architecture | Approve enrichment/join-only; no new identity SoR |
| Engineering | Implement Round A only after approval |

**Next step after approval:** Round A implementation (ticketized). No Round B until Round A gates pass.
