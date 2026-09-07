# ADR-021 — Platform vs Tenant Billing

| Field | Value |
|-------|-------|
| Status | **Accepted** (Phase 1E) |
| Date | 2026-09-04 |
| Relates to | ADR-003 (proposed two contexts — **refined & accepted here**), ADR-016/022 (documents), ADR-017 (suspend), USAGE_METERING, FINANCE_SPECIFICATION, BILLING_SUBSCRIPTION |
| Scope | Two billing worlds, tables, providers, SoR, suspension effects |

---

## 1. Context

ThinkAIQ has **two completely separate commercial worlds**. Confusing them creates security, accounting, and UX disasters (ThinkAIQ MRR ≠ a tenant’s customer AR).

[ADR-003](../decisions/ADR-003-platform-vs-tenant-billing.md) proposed two bounded contexts. **This ADR accepts and details that decision** without silently rewriting ADR-003’s intent.

---

## 2. World 1 — ThinkAIQ → Tenant (platform billing)

ThinkAIQ charges the SaaS customer (tenant) for:

- Subscription & plan  
- Modules / add-ons  
- Seats  
- Usage & overages (automation, WhatsApp, Voice, storage, API, PDF, …)  

### Native ThinkAIQ (system of record for entitlements & local ledger)

| Concern | SoR |
|---------|-----|
| Plans, prices, limits, modules | ThinkAIQ DB (`plans`, `plan_*`, catalog) |
| Entitlements applied to tenant | ThinkAIQ (`tenant_modules`, `tenant_limits`) |
| Metering counters | ThinkAIQ (`usage_counters`) |
| Platform subscription state | ThinkAIQ `platform_subscriptions` |
| Platform invoices/payments **ledger** | ThinkAIQ `platform_invoices`, `platform_payments` (mirror of commercial truth for ops) |
| Suspend / reactivate | ThinkAIQ tenant status machine |

### External providers (Stripe / Razorpay)

| Concern | Role |
|---------|------|
| Card/UPI collection | Provider |
| Provider Customer / Subscription ids | Mapped in `platform_billing_customers` / subscription rows |
| Provider webhooks | **Source of payment lifecycle signals** — verified signatures |
| Tax filing for ThinkAIQ’s own SaaS revenue | Outside app (accounting) — not tenant GST module |

**Idempotency:** webhook event ids stored; applying the same event twice must not double-credit or double-suspend.

### Platform billing state machine (conceptual)

```text
trial → active → past_due → suspended (tenant.status)
                 ↓
              cancelled → archived
```

Unpaid platform billing → **tenant.suspended** (reason `platform_payment_failed` / `past_due`) per ADR-017:

| Effect | Behavior |
|--------|----------|
| Mutations | Blocked (or strict read-only policy) |
| Business jobs | Paused via `tenant_job_controls` |
| Allowlisted jobs | Platform billing reminders, dunning, lifecycle only |
| Data | Retained; export may remain available per policy |
| Tenant finance module | **Does not** charge the tenant’s customers for ThinkAIQ’s fee |

---

## 3. World 2 — Tenant → Tenant’s Customer (tenant finance / billing)

The tenant uses ThinkAIQ Finance (and related modules) to issue:

- Invoices, quotations, credit notes, debit notes, receipts  
- Payment records, GST records  
- AR/AP, customer subscriptions (tenant’s products)  

### Native ThinkAIQ

| Concern | SoR |
|---------|-----|
| Customers/clients, invoice lines, tax breakup | Tenant finance tables (`invoices`, …) with `tenant_id` |
| Numbering series, GSTIN, branding on PDF | Tenant settings + ADR-016/018/022 |
| Tenant-recorded payments | `payments` etc. |
| Optional payment links | May call Stripe/Razorpay **as that tenant’s connected account / keys** — separate from platform provider account |

### Must never mix

| Forbidden | Why |
|-----------|-----|
| Platform invoice rows in tenant AR UI | Wrong legal party |
| Tenant customer PII in platform billing analytics as “ThinkAIQ customers” | Privacy / semantics |
| Using platform Stripe customer id to charge tenant’s end customer | PCI/account chaos |
| Entitlement changes driven by tenant invoice paid events | Wrong world |

Share **libraries** only: money math, tax helpers, PDF renderer port — **not** identical tables.

---

## 4. Conceptual table split

### Platform (World 1)

- `plans`, `plan_prices`, `plan_modules`, `plan_limits`  
- `platform_billing_customers` (tenant_id, provider, provider_customer_id)  
- `platform_subscriptions`  
- `platform_invoices` / `platform_invoice_lines`  
- `platform_payments` / `platform_refunds`  
- `platform_usage_charges` / overage snapshots  
- `platform_webhook_receipts` (provider event id, processed_at)  

### Tenant finance (World 2)

- `clients` / finance parties  
- `quotations`, `invoices`, `credit_notes`, `debit_notes`, `receipts`  
- `payments`, `refunds` (tenant)  
- `tax_*` / GST ledgers as specified in finance docs  
- Tenant `subscriptions` (customer subscriptions) — **named distinctly from** `platform_subscriptions`  

Event prefixes: `platform.*` vs `finance.*` / `tenant.subscription.*` ([EVENTS.md](../api/EVENTS.md)).

---

## 5. Provider webhook processing

```text
Provider webhook
  → verify signature
  → idempotent insert receipt
  → map provider object → platform_* or tenant payment intent
  → TX: update SoR + outbox
  → jobs (notify, suspend, entitlement sync)
```

Wrong-account webhooks must not update the other world.

---

## 6. Relationship to ADR-003

ADR-003’s decision (two bounded contexts; share primitives not tables) is **Accepted** and detailed here. ADR-003 remains historical proposed text; **operational detail lives in ADR-021**.

---

# DECISION: Two billing worlds — platform SaaS billing (ThinkAIQ→tenant) vs tenant finance (tenant→customer); separate tables, events, and provider mappings; unpaid platform billing suspends tenant

**Status:** Accepted for Phase 1E planning.
