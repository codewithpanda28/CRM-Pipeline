# BILLING_SUBSCRIPTION.md — ThinkAIQ

## 1. Purpose

Billing covers two related but distinct domains:

1. **Platform billing** — ThinkAIQ charges tenants (plans, modules, limits, overages).
2. **Tenant customer subscriptions** — Tenants bill their clients (MRR products/services).

These share patterns but must not share tables carelessly. See [ADR-003](../decisions/ADR-003-platform-vs-tenant-billing.md).

---

## 2. Platform commercial plans

Plans: Free/Trial · Basic · Pro · Enterprise · Custom

Plans control:

- Modules
- Users
- Storage
- API usage
- **Automation usage** (workflow count, monthly executions, API/webhook actions, AI generations, log retention)
- Voice minutes
- Number/channel limits
- Other metered metrics

Automation is packaged as a **premium upgrade lever** (Basic → Business → Professional → Enterprise capabilities). See [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md) §25 and [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md).

Lifecycle:

```
Trial → Active → Upgrade → Downgrade → Pause → Renewal → Cancelled → Expired
```

---

## 3. Tenant customer subscriptions (module `billing`)

Cycles: Monthly · Quarterly · Yearly · Custom  
Models: Trial · Fixed · Usage · Hybrid

States: Trial · Active · Paused · Past Due · Expiring · Cancelled · Expired

Actions: Upgrade · Downgrade · Pause · Resume · Cancel · Renew

Automatic renewal + expiry reminders required.

Integrates with Finance for invoice generation and Voice usage billing when enabled.

---

## 4. User flows

### Platform: subscribe tenant to plan

Super Admin or self-serve checkout (future) → plan entitlements applied → metering baselines set → invoice/charge via platform payment provider.

### Tenant: create client subscription

1. Select client + product/plan
2. Set cycle, price, trial
3. Activate → generate first invoice (optional)
4. Schedule renewals
5. Reminders at T-7 / T-3 / T-0 (configurable)

---

## 5. Business rules

- Downgrade that removes modules: warn; either block until module disabled manually or schedule disable at period end (recommend period-end)
- Past due: dunning sequence via automation
- Usage overages: if plan supports, invoice overage lines; else hard limit
- Pause stops renewals but retains data

---

## 6. Data model

**Platform:** `plans`, `plan_prices`, `platform_subscriptions`, `platform_invoices`, `platform_payments`

**Tenant:** `subscription_products`, `customer_subscriptions`, `subscription_items`, `subscription_usage`, `subscription_changes`

---

## 7. Permissions

Platform: `platform.billing.manage`  
Tenant: `billing.subscriptions.*`, `billing.plans.*`

---

## 8. APIs

- Platform plan & subscription APIs under `/platform`
- Tenant `/subscriptions` CRUD + lifecycle actions
- Usage fetch endpoints

---

## 9. Events

`subscription.created` · `subscription.activated` · `subscription.paused` · `subscription.resumed` · `subscription.cancelled` · `subscription.expiring` · `subscription.renewed` · `subscription.past_due` · `plan.changed`

---

## 10. Notifications

Subscription expiring · past due · renewed · cancelled · usage limit warning

---

## 11. Voice usage billing hook

When `voice_ai` enabled, minutes/cost allocate to client and optionally roll into subscription invoice lines. See [VOICE_AI.md](./VOICE_AI.md), [USAGE_METERING.md](../operations/USAGE_METERING.md).

---

## 12. Related documents

- [USAGE_METERING.md](../operations/USAGE_METERING.md)
- [FINANCE_SPECIFICATION.md](./FINANCE_SPECIFICATION.md)
- [MODULE_SYSTEM.md](../architecture/MODULE_SYSTEM.md)
- [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md)
