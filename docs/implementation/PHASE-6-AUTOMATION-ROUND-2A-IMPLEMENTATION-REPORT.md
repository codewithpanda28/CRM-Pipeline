# PHASE 6 — Automation Round 2A Implementation Report

| Field | Value |
|-------|-------|
| Status | **IMPLEMENTED** |
| Date | 2026-09-06 |
| Binding contract | `docs/implementation/PHASE-6-AUTOMATION-ROUND-2-PRODUCT-UX-CONTRACT.md` |
| Depends on | Round 1 engine verification-green · ADR-027 Accepted |
| Explicit non-goals (honored) | Round 2B · AI · Voice · WhatsApp · billing · niche-pack deep mutations · PM/pipeline legacy changes · second versioning system |

## Summary

Round 2A delivers a **client-first Automation product UX** on top of the existing Round 1 APIs. Business owners see **WHEN → IF → THEN → WAIT → ELSE → APPROVAL**. Engine vocabulary (queues, outbox, hashes, `step_type`) stays behind **Execution details / Advanced**.

No Round 1 state machine, Class C hard block, approval validation, or legacy PM/pipeline automation was modified for product behavior. Thin API additions only: draft graph on GET workflow, archive/enable, usage counters for display.

---

## Gate sheet

| Gate | Result |
|------|--------|
| Automation Home | **PASS** |
| My Automations | **PASS** |
| Guided Builder | **PASS** |
| Draft Save | **PASS** |
| Publish UX | **PASS** |
| Templates | **PASS** |
| Approval Inbox | **PASS** |
| Mobile Approval | **PASS** |
| Activity | **PASS** |
| Run Detail | **PASS** |
| Usage Display | **PASS** |
| RBAC | **PASS** |
| Tenant Isolation | **PASS** (UI uses tenant-scoped Round 1 APIs; contract tests + Round 1 backend auth) |
| ADR-027 UX Enforcement | **PASS** |
| Round 1 Compatibility | **PASS** |
| Regression | **PASS** (automation-engine 20/20; sidebar + R2A RBAC map) |

---

## What shipped

### Information architecture / routes

| Route | Screen |
|-------|--------|
| `/automation` | Home — counts, pending approvals, recent activity, CTAs |
| `/automation/workflows` | My Automations — search, status, enable/disable, duplicate, edit, activity |
| `/automation/workflows/new` | Guided builder (create) |
| `/automation/workflows/:id/edit` | Guided builder (edit) |
| `/automation/templates` | Template gallery |
| `/automation/templates/:id/install` | Preview → install as **draft** |
| `/automation/approvals` | Approval inbox |
| `/automation/approvals/:id` | Detail + sticky **Authorize this action** / Reject |
| `/automation/runs` | Activity list |
| `/automation/runs/:id` | Business timeline + Execution details / replay disclaimer |
| `/automation/settings` | Usage + defaults; engine flags under Advanced |

Nav: Sidebar + sidebar-layout seed group **Automation** → `/automation`. Module permissions unchanged.

### Guided builder

- Client nodes: WHEN / IF / THEN / WAIT / ELSE / APPROVAL  
- Maps to Round 1: trigger / condition / action|approval / delay / branch / approval  
- Forms & pickers (no JSON in default UX)  
- Class A/B/C badges: Runs automatically / Needs your approval / Not available  
- Class C cannot be selected for insert; publish validation blocks Class C  
- Undo/redo, draft autosave (existing workflows), saved indicator, version label  
- Publish disabled until human-readable validation passes; calls Round 1 `POST …/publish`

### Templates (config data)

1. Never miss a new lead  
2. Follow up on unpaid invoices  
3. Convert accepted quote into next business step  
4. Remind customers before appointments  
5. Follow up after a sales call  

Install → `POST /api/automation/workflows` draft only — **never auto-activates**.

### Approvals / ADR-027

- Approve button copy: **Authorize this action**  
- Reject requires reason  
- Advanced collapsed: workflow/version/run/step, payload snapshot, hash  
- Sticky mobile action bar; essential details above the fold  
- Frontend never auto-authorizes; uses Round 1 authorize/reject endpoints only  

### Activity

- Human timeline (✓ / ⏳ / ⚠)  
- Replay copy: *This does not approve money or critical actions.*  

### API thin extensions (Round 1 compatible)

- `GET /workflows/:id` → `draft_graph`, draft/published version numbers  
- `POST /workflows/:id/archive` · `POST /workflows/:id/enable`  
- `GET /usage` → counters + soft `display_limit` (not billing)  

---

## Files changed (primary)

### Web

- `apps/web/modules/automation/**` — api client, client-graph, templates, pages, UI shell  
- `apps/web/app/(dashboard)/automation/**` — App Router pages  
- `apps/web/modules/shared/components/Sidebar.tsx` — Automation nav item  
- `apps/web/vitest.config.ts` · `apps/web/package.json` — unit test runner  

### API / modules

- `apps/api/src/routes/automation-engine.ts` — draft graph, enable, usage (prior + retained)  
- `apps/api/src/lib/sidebar-layout.ts` (+ test update)  
- `apps/api/src/routes/automation-engine-r2a.test.ts` — RBAC/isolation contract  
- `packages/modules/src/automation/index.ts` — nav entries  
- `packages/automation-engine` — `enable` on definition service (Round 1 compatible)  

### Docs

- `docs/implementation/PHASE-6-AUTOMATION-ROUND-2A-IMPLEMENTATION-REPORT.md` (this file)

---

## Tests run

| Suite | Result |
|-------|--------|
| `apps/web` `modules/automation` (client-graph / templates / Class A/B/C / publish validation) | **9/9 PASS** |
| `packages/automation-engine` | **20/20 PASS** |
| `apps/api` `automation-engine-r2a.test.ts` + `sidebar-layout.test.ts` | **19/19 PASS** |
| `apps/web` `tsc --noEmit` (automation surface) | **PASS** |

Live E2E browser flows (create → publish → authorize on device) were not executed in this pass; UI is wired to Round 1 live APIs. Tenant isolation remains enforced by Round 1 workspace-scoped queries.

---

## Defects found & fixes

1. **Builder Publish `title` prop** — custom `Button` does not accept `title`; switched to `aria-label` (type-check fail → fixed).  
2. **Sidebar seed test** — expected six groups; updated for Automation group.  
3. **Autosave on new empty draft** — gated autosave to existing `id` only so Create does not spam empty workflows.  
4. **Approval page double padding** — simplified shell + sticky bar layout.

---

## Known limitations

- Builder is a **guided vertical flow**, not a freeform canvas; IF true/false branches are sequential connections (engine edges supported; rich branch editor is minimal).  
- Default approver on Settings is **display preference only** in Round 2A (not persisted server-side).  
- Appointment / post-call templates use deal-stage stand-ins until Voice events (Round 2B).  
- Customer message Class B uses Round 1 `critical.stub` until channel providers exist.  
- No billing, AI describe, WhatsApp, Voice runtime, or niche-pack deep mutations.  
- Full mobile builder remains simplified vs desktop; approvals + activity are first-class on mobile.  
- Browser E2E not automated in CI for this round.

---

## ADR-027 frontend safety checklist

| Rule | Status |
|------|--------|
| No auto-authorize | Enforced |
| No NL/AI as approval | N/A (not implemented) |
| Draft ≠ approval | Clear copy + API |
| Publish ≠ action approval | Clear copy + Class B badge |
| No approved flags to workers from UI | UI only calls authorize endpoint |
| Critical path: Draft → Approval Required → Authorize → Execute | Preserved |

---

## Round 2B (explicitly not done)

AI provider/runtime · Voice provider/runtime · WhatsApp provider/runtime · niche-pack deep mutations · billing.

---

## Automation enable/disable + empty-state UX

| Field | Value |
|-------|-------|
| Status | **PASS** |
| Date | 2026-09-06 |
| Flag | Existing Round 1 `automation.engine.v2.enabled` via `GET/PATCH /api/automation/flags` (`enabled` ↔ `engine_v2_enabled`) |

### Behavior

- **Settings → Automation Engine [ON/OFF]** with Active/Off badge; status text for ON/OFF.
- Non-admins can **read** status (`GET /flags` now requires `automation:workflows:view`); only `automation:admin` can PATCH.
- Toggle is not optimistic: UI stays on last server value if the request fails.
- Turning OFF with published workflows asks for confirmation; does **not** archive/delete workflows.
- When engine is OFF: banner on Home / My Automations + “Turn on Automation” for admins; server `TriggerMatcher` still blocks new v2 runs.
- Sidebar **Automation** group expands to: Home, My Automations, Templates, Approvals, Activity, Settings (collapsible).
- Zero-workflow empty states with Create / Browse Templates + template list (draft-only install). No fake DB rows.

### Files changed

- `apps/web/modules/automation/components/engine-status.tsx`
- `apps/web/modules/automation/pages/settings.tsx` · `home.tsx` · `workflows.tsx`
- `apps/web/modules/automation/lib/empty-state.test.ts`
- `apps/web/modules/shared/components/Sidebar.tsx`
- `apps/api/src/routes/automation-engine.ts` (GET `/flags` readable by viewers)
- `apps/api/src/lib/sidebar-layout.ts` (+ tests)
- `apps/api/src/routes/automation-engine-r2a.test.ts`
- `packages/automation-engine/src/flags.test.ts`

### Tests

| Suite | Result |
|-------|--------|
| Web empty-state + ON/OFF UX helpers | PASS |
| Web client-graph (prior) | PASS |
| API R2A RBAC (flags view vs admin patch) | PASS |
| sidebar-layout Automation children | PASS |
| automation-engine flags persistence | PASS |

### Gate

| Check | Result |
|-------|--------|
| Flag loads / ON / OFF | **PASS** |
| Non-admin read-only | **PASS** |
| Failed toggle keeps UI | **PASS** |
| Workflows intact after OFF | **PASS** |
| No new v2 runs when OFF (server flag) | **PASS** |
| Empty state + template CTA | **PASS** |
| Sidebar children | **PASS** |
| Mobile settings control | **PASS** |
| Round 2B untouched | **PASS** |
