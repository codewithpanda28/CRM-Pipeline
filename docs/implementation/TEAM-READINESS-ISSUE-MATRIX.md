# TEAM READINESS — ISSUE MATRIX

| Field | Value |
|-------|-------|
| Date | 2026-09-07 |
| Mode | Diagnosis before Round A/B/C implementation |
| SoR | Railway Postgres (`DATABASE_URL`) — no local test DB |

Classifications: **BROKEN** · **SLOW** · **POOR UX** · **WORKING**

---

## Critical BROKEN

| Page | Action | Issue | Files |
|------|--------|-------|-------|
| Invoice / Quote detail | Generate PDF | Client calls `POST /api/documents/generate` — API only has `/render` | `InvoiceEditor.tsx`, `QuoteEditor.tsx`, `finance/lib/api.ts`, `crm/quotes/lib/api.ts` |
| Invoice / Quote detail | Download PDF | Client calls `GET /api/documents/:id/download` expecting JSON URL — real route is `/artifacts/:id/download` (binary) | same |
| `/ops/employees` | Add employee | API exists; UI missing | `ops/employees/page.tsx` |
| `/ops/teams` | Add members | API exists; UI missing | `ops/teams/page.tsx` |
| `/settings/ops` | Export list / Replay failed jobs | Wrong paths vs backend | `OpsPage.tsx` |

## SLOW (measured + code)

| Area | Issue | Files |
|------|-------|-------|
| All mutations | Auth ~6–11 sequential DB RTs × ~310ms Railway RTT | `middleware/auth.ts`, `permission.ts` |
| Ops / Leads / Items | Broad `invalidateQueries(['ops'|'leads'|'items'])` | `ops/lib/hooks.ts`, `LeadsBoard.tsx`, `UnifiedRecordShell.tsx` |
| Lead create | Full `companies` table load for dup check | `lib/leads/duplicates.ts` |
| Pipeline move | N sibling position UPDATEs | `item-move` / pipeline-items move |
| Deal create | Awaits optional next-task before success | `DealCreateModal.tsx` |

## POOR UX (team-blocking)

| Area | Issue |
|------|-------|
| Leads list | No next_task / deal stage enrichment |
| My Tasks | Flat list — no Overdue/Today/High/Upcoming/No deadline groups |
| Unified record | Tasks tab empty; commercial/custom thin |
| Quote/Invoice | No post-create preview wizard; Send = status only (no email) |
| Sidebar | "Projects" group = Messaging + Projects |
| DPR / Performance | Functional but sparse / UUID-heavy |
| Finance logo | 600KB error OK but no inline size/format helper |

## WORKING (do not break)

| Area | Notes |
|------|-------|
| Pipeline Cards/Compact move | Optimistic + API dual-write |
| Lead status PATCH | Does NOT create deal |
| Convert + create_deal | Creates deal + pipeline_items |
| DPR submit / review | Wired |
| Departments / Teams create / Targets | Wired |
| Invoice Issue / payment | Ledger semantics intact |
| Outbox | Not on HTTP critical path for Redis |

---

Round order: **A** correctness+perf → **B** employee UX → **C** Railway smoke + verdict.
