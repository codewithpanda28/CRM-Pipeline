# SALES_SPECIFICATION.md — ThinkAIQ

## 1. Purpose

Sales module provides visual pipelines, deals, forecasting, quotes/proposals, and product/service catalog — integrated with CRM and Finance.

Module code: `sales` · Depends on: `crm` · Priority: **P1**

---

## 2. Pipelines

Default stages:

`Lead → Contacted → Qualified → Demo → Proposal → Negotiation → Won/Lost`

Custom pipelines supported. Each pipeline has: name, stages, stage order, stage probability, ownership, team, product/service association.

---

## 3. Deals

Fields: deal name, value, currency, probability, expected close date, salesperson, source, product/service, pipeline, stage, notes, next action.

Kanban board + list/table views. Drag-drop stage changes emit events.

---

## 4. Forecasting & reports

- Pipeline value
- Weighted pipeline
- Forecast revenue
- Expected close
- Conversion rate
- Win rate / loss rate
- Average deal size
- Sales cycle length
- Salesperson performance
- Pipeline aging

Permissions: report scopes own/team/all.

---

## 5. Quotes & proposals

Features: create, versioning, discounts, tax, terms, expiry, approval, send, view tracking, accept/reject, convert to invoice.

Flow:

```
Quote → Accepted → Order/Deal → Invoice
```

Statuses (minimum): Draft, Sent, Viewed, Accepted, Rejected, Expired, Cancelled, Converted.

---

## 6. Products & services

Create products, services, packages, plans.

Fields: name, SKU, description, category, price, cost, tax, billing model, status.

Used by deals, quotes, subscriptions.

---

## 7. User flows

### Move deal stage

1. User drags card or updates stage
2. Permission + entitlement check
3. Probability may auto-update from stage
4. Timeline + `deal.stage_changed`
5. Automations (tasks, emails)

### Quote → Invoice

1. Quote accepted
2. Optionally update deal to Won
3. Create invoice draft via Finance API contract
4. Preserve line items, taxes, party details

---

## 8. Business rules

- Won/Lost are terminal without reopen permission
- Currency default from tenant settings
- Quote numbering configurable per tenant
- Versioning: editing sent quote creates new version
- View tracking requires tracked links (comms module)

---

## 9. Data model (summary)

`pipelines`, `pipeline_stages`, `deals`, `deal_products`, `products`, `product_categories`, `quotes`, `quote_versions`, `quote_line_items`, `quote_approvals`

---

## 10. Permissions

`sales.pipelines.configure`, `sales.deals.*`, `sales.quotes.*`, `sales.quotes.approve`, `sales.products.*`, `sales.forecast.view`

---

## 11. APIs

- Pipelines/stages CRUD
- Deals CRUD + stage move
- Quotes CRUD + send/accept/reject/convert
- Products CRUD
- Forecast report endpoints

---

## 12. Events

`deal.created` · `deal.updated` · `deal.stage_changed` · `deal.won` · `deal.lost` · `quote.created` · `quote.sent` · `quote.accepted` · `quote.rejected` · `quote.converted`

---

## 13. Automation examples

- Deal → Proposal stage → create quote task
- Deal won → notify finance + create onboarding task
- Quote viewed + no accept in 3 days → reminder

---

## 14. Edge cases

- Stage deleted while deals present → migrate mapping required
- Multi-currency forecast display vs base currency conversion (document rates source; Phase 1 may single-currency)
- Concurrent kanban moves → last-write with version column

---

## 15. Related documents

- [CRM_SPECIFICATION.md](./CRM_SPECIFICATION.md)
- [FINANCE_SPECIFICATION.md](./FINANCE_SPECIFICATION.md)
- [REPORTING_ANALYTICS.md](./REPORTING_ANALYTICS.md)
