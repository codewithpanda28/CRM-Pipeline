# PRODUCTION-USABILITY-UX-PASS-REPORT.md

**Wave:** Production usability + essential business UX (not a new business phase)  
**Date:** 2026-09-05  
**Scope:** Pipeline UX · Sidebar hierarchy · Tenant invoice branding / document UI  
**Frozen domains unchanged:** Deal · Lead · CustomerParty · Products/Quotes · Finance lifecycle  

---

## 1. Verdict

```
PIPELINE UX = PASS
SIDEBAR HIERARCHY = PASS
TENANT INVOICE BRANDING = PASS
INVOICE UI = PASS
RESPONSIVE = PASS
REGRESSION = PASS
```

---

## 2. Pipeline changes

### Problem
Board cards showed the first 3 arbitrary fields or a UUID prefix when no fields were configured — unusable for salespeople.

### Changes
| Area | Change |
|------|--------|
| API | `GET /api/pipelines/:id/items` (+ single item) enriched with `display` from canonical Deal + company/customer/owner names |
| Cards | Deal name, customer/company, amount+currency, owner name, close date, status — **no UUID as primary label** |
| Columns | Stage name, deal count, stage amount total (when amounts available) |
| Toolbar | “Sales pipeline” context, search deals, Board/Table/**List**, **+ Add deal** |
| Empty state | Explains what a Deal is + CTA |
| List view | Implemented (was stub `null`) |
| Search | Matches display name / party / owner / field values |

**Not changed:** Deal schema, stage rules, pipeline_items storage model.

---

## 3. Sidebar changes

| Change | Detail |
|--------|--------|
| Section headers | Stronger weight, divider between groups, chevron on the **right** only |
| Child links | Indented, left accent when selected — not styled as dropdowns |
| Active section | Stays expanded even if prefs had it collapsed |
| Group order | Unchanged seed: Sales → Finance → Infra → Projects → Insights → General |
| Module gating | Unchanged |

ThinkAIQ **platform** brand mark remains in the app shell sidebar header.

---

## 4. Invoice branding

### Source (World 2 only)
1. `tenant_finance_profiles` — legal/trade name, GSTIN, address, bank  
2. `tenant_branding` — brand_name, legal_name, `logo_file_id`, colors, optional `theme.logo_url`  

**Never** `/platform/branding/*` (ThinkAIQ platform assets).

### Historical freeze
- Migration `20260905_009_invoice_seller_branding_snapshot.ts` adds `invoices.seller_branding_snapshot` JSONB  
- On **issue** only: `buildSellerBrandingSnapshot` + buyer party/GSTIN/billing enrichment written in the same UPDATE  
- Later branding edits do **not** rewrite posted invoices  
- Draft UI may preview live profile/branding; issued UI prefers the snapshot  

### UI
`InvoiceDocumentHeader` — tenant logo/monogram, legal block, INVOICE title, number/dates, Bill to, payment terms. Wired into invoice builder/detail.

PDF renderer **not** implemented (data ready for future DocumentRenderer).

---

## 5. Responsive

| Breakpoint | Pipeline | Sidebar | Invoice |
|------------|----------|---------|---------|
| 390 | Horizontally scrollable stages; wrap toolbar; cards `minWidth: 0` | Existing collapse / shell | Stacked document header + sections |
| 768 | Same | Usable | two-col grids wrap |
| 1280 | Full board | Full groups | ~960px centered builder in full-width shell |

Code-level responsive patterns; no Playwright pixel suite in this pass.

---

## 6. Tests

| Suite | Result |
|-------|--------|
| finance tax + seller branding guard | PASS |
| pipeline item-display mapping | PASS |
| sidebar-layout unit | PASS |
| sidebar + pipeline-items routes | PASS |
| Live finance-isolation (incl. branding snapshot assert) | PASS |
| Live crm-isolation | PASS (16 total with finance) |
| API `tsc` | PASS (after `@vencore/db` rebuild) |
| Web `tsc` | PASS |

---

## 7. Remaining non-blocking UX debt

1. Tenant logo **upload** API still thin — `logo_file_id` / `theme.logo_url` only  
2. Finance profile settings UI for legal address still API-first  
3. Pipeline table view still field-driven (board/list now deal-shaped)  
4. Owner picker still needs `users` prop plumbing in ItemForm (cards no longer show raw UUID as title)  
5. Browser visual QA matrix optional  
6. PDF renderer deferred  

---

## 8. Explicit non-scope

WhatsApp · Voice · Support · Advanced Automation · Phase 4B accounting · Platform billing · PDF/Playwright  

---

```
PIPELINE UX = PASS
SIDEBAR HIERARCHY = PASS
TENANT INVOICE BRANDING = PASS
INVOICE UI = PASS
RESPONSIVE = PASS
REGRESSION = PASS
```
