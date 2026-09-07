# BUSINESS-UX-PIPELINE-FINANCE-ROUND-REPORT.md

**Wave:** Business UX + Pipeline detail + Finance form + Invoice branding  
**Date:** 2026-09-05  
**Type:** Focused product UX round (not a new business phase)  

**Unchanged:** Deal / Lead / CustomerParty / Products-Quotes schemas · Finance lifecycle · tenant isolation · RBAC architecture  

---

## 1. Verdict

```
PIPELINE UX = PASS
DEAL DETAIL = PASS
FINANCE FORM WIDTH = PASS
INVOICE SETTINGS = PASS
INVOICE BRANDING = PASS
INVOICE INFORMATION = PASS
RESPONSIVE = PASS
SECURITY = PASS
REGRESSION = PASS
```

---

## 2. Pipeline redesign

| Area | Change |
|------|--------|
| Header | Pipeline name switcher, deal count, open pipeline value, search, Board/Table/List, **+ Add Deal** |
| Stage columns | Name, deal count, stage amount total |
| Cards | Deal name, customer/company, amount+currency, owner, close date — no UUID title |
| Click | Navigates to `/crm/deals/:id` (Board, List, Table) |

Backend Deal schema untouched. Display enrichment via existing Deal projection + `display` on items.

---

## 3. Deal detail

**Route:** `/crm/deals/[id]`

Shows:
- Header: name, customer, amount, stage, status, actions  
- Quick actions: move stage, Open Customer, Create quote, Add activity/task links, Mark won/lost  
- Customer block (party / company / contact / email / phone)  
- Deal information (pipeline, stage, probability, source, dates, owner)  
- Timeline from `GET /api/items/:id/activity`  
- Commercial: quotes (`deal_id`), related invoices, projects  
- UUID only under Advanced/diagnostics  

`GET /api/deals/:id` now returns additive `display` names (owner, company, party, contact, pipeline, stage).

---

## 4. Finance form width

Removed narrow `maxWidth: 640` / `960` traps on Payments / Expenses / Vendors / Invoice builder.

Added shared helpers:
- `formGrid()` / `formSpanFull()` in `modules/crm/shared/ui.tsx`

Payment form layout: Invoice | Amount | Method | Date + Reference | Notes (full span).

Pages keep Contacts-style `padding: 24` full-width shell.

---

## 5. Finance settings (`/finance/settings`)

Sections:
- Business / seller profile (legal, trade, address, email, phone, website, GSTIN, tax scheme, currency, PoS)  
- Logo upload / URL / remove (tenant branding `theme.logo_url` — never platform logo)  
- Payment details (bank, account, IFSC, UPI, …) via `bank_details` JSONB  
- Payment QR upload + label via `metadata.payment_qr`  
- Invoice defaults (prefix, payment terms)  
- Footer / terms / support contacts  

**API:** existing `PATCH /api/finance/profile` (`finance:settings`) + extended `PATCH /api/tenant/branding` (`legal_name`, `support`, `theme`, `logo_file_id`).

**Nav:** Finance → Settings (visible only with `finance:settings`).

---

## 6. Invoice document + branding snapshot

`InvoiceDocumentHeader` now includes:
- Tenant logo / monogram, legal block, GSTIN  
- INVOICE title, number, dates, status  
- Bill to + buyer GSTIN/address  
- Place of supply / terms  
- Line table with CGST/SGST/IGST columns when present  
- Totals + amount paid/due  
- Bank / UPI / QR from snapshot  
- Terms / footer / support  

**Issue freeze** (`buildSellerBrandingSnapshot`) now also snapshots:
email, phone, website, support_*, payment_qr_*, default_terms, footer_note, bank_details, logo.

Draft preview uses live profile/branding; issued prefers frozen snapshot.

---

## 7. Security / RBAC

| Control | Enforcement |
|---------|-------------|
| Finance settings mutations | Server `requirePermission('finance:settings')` |
| Settings nav | Client `hasPermission('finance:settings')` + module gate |
| Branding tenant scope | Existing tenant-scoped branding routes |
| Snapshot isolation | Written with workspace/tenant branding only |

---

## 8. Responsive

Code patterns for 390 / 768 / 1280:
- Pipeline toolbar wraps; stages horizontal scroll  
- Deal detail stacked sections via `auto-fit` grids  
- Finance forms `formGrid` stacks under ~200px min  
- Invoice document table scrolls inside panel  

Touch targets ≥40px on primary actions.

---

## 9. Tests

| Suite | Result |
|-------|--------|
| API `tsc` | PASS |
| Web `tsc` | PASS |
| sidebar-layout + sidebar routes | PASS |
| seller-branding + item-display | PASS |
| modules registry | PASS |
| Live finance-isolation | PASS |

---

## 10. Remaining UX debt (non-blocking)

1. Dedicated R2 branding file upload (data-URL / URL works for MVP)  
2. Pipeline table still field-column oriented (board/list deal-shaped)  
3. Tasks API still lacks first-class `deal_id` filter  
4. Browser pixel QA optional  
5. PDF renderer still deferred  

---

## 11. Explicit non-scope

WhatsApp · Voice · Support · Advanced Automation · Phase 4B · Platform billing · PDF/Playwright  

---

```
PIPELINE UX = PASS
DEAL DETAIL = PASS
FINANCE FORM WIDTH = PASS
INVOICE SETTINGS = PASS
INVOICE BRANDING = PASS
INVOICE INFORMATION = PASS
RESPONSIVE = PASS
SECURITY = PASS
REGRESSION = PASS
```
