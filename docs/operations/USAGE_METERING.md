# USAGE_METERING.md — ThinkAIQ

## 1. Purpose

Track and enforce usage across tenants for commercial limits and overages.

Priority: **P1**

---

## 2. Metered dimensions

Users · Storage · API calls · Automation executions · Automation API/webhook actions · AI workflow generations · **Custom fields / custom objects / forms / dashboards** (plan quotas) · Voice minutes · Telephony channels · Emails · WhatsApp messages · (extensible)

Automation may also track **cost dimensions** (AI/SMS/WhatsApp/email/API) per tenant → workflow → execution for billing awareness.

---

## 3. Thresholds

- Warning (e.g., 80%)
- Limit reached
- Overages where plan supports

Notifications: usage limit warning to Tenant Admin + Super Admin aggregates.

---

## 4. Architecture

- Increment counters via metering service (sync for hard limits where needed; async for analytics)
- Period buckets (calendar month / billing cycle)
- Plan limits + tenant overrides
- Enforcement middleware on API/automation/voice

Voice usage billing plans: Fixed · Unlimited · Usage-based · Hybrid — integrate with invoice generation.

---

## 5. Data model

`usage_dimensions`, `usage_counters`, `usage_events` (optional raw), `tenant_limits`, `usage_alerts`

---

## 6. APIs

`GET /tenant/usage` · platform usage analytics · admin override limits

---

## 7. Related documents

- [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md)
- [MODULE_SYSTEM.md](../architecture/MODULE_SYSTEM.md)
- [SUPER_ADMIN.md](./SUPER_ADMIN.md)
- [VOICE_AI.md](../modules/VOICE_AI.md)
