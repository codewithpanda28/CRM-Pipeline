# MASTER_PRINCIPLES.md — ThinkAIQ Autonomous Business SaaS

## 0. Most important product principle

ThinkAIQ must **not** behave like a traditional CRM where users manually operate every task.

**AUTOMATE AS MUCH AS SAFELY POSSIBLE.**

Users configure a business process once; ThinkAIQ handles repetitive work automatically — while preserving safety, security, accounting correctness, and user control.

```
USER SETS BUSINESS RULE
→ SYSTEM HANDLES THE WORK
```

### What the system does by design

Detect events · understand business context · trigger workflows · execute actions · communicate · create/update records · create tasks · send reminders · generate documents/invoices · track payments · monitor subscriptions · escalate · retry recoverable failures · detect/explain failures · suggest fixes · learn repetitive patterns (opt-in) · keep full history · enforce tenant isolation & permissions · require human approval for risky actions.

### Target user feeling

> "I configure my business process once, and ThinkAIQ handles the repetitive work."

### Safety principle

Maximize convenience; **never** blindly execute risky actions. Require confirmation/approval for financial transactions, refunds, large discounts, credit/debit notes, user deletion, tenant suspension, sensitive exports, destructive external APIs, bulk destructive ops.

---

## 1. Product positioning

**White-Label, Multi-Tenant, Modular Business CRM & Management SaaS Platform**

**Default product name:** **ThinkAIQ CRM** · **Company / platform:** **ThinkAIQ**  
Canonical identity & branding surfaces: [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md). Tenant white-label remains separate ([ADR-018](../adr/ADR-018-TENANT-WHITE-LABEL-AND-THEME-RUNTIME.md)). No customer-facing Vencore branding in the shipped product.

Not designed around one niche. Voice AI and WhatsApp are **modules** inside a broader reusable business platform — not the product identity.

Core capability surface: CRM · Sales · Client Management · Accounting · Billing · Subscriptions · Team · Tasks · Operations · Support · Documents · Communication · Advanced Automation · Analytics · API · Webhooks · White-label · Reseller · Optional Voice AI/Telephony · Future WhatsApp SaaS.

---

## 2. Platform-first architecture

```
CORE PLATFORM
→ Modules
→ Automation
→ Integrations
→ APIs
→ White-label
→ SaaS Billing
→ Tenant Configuration Engine
```

**ONE CORE PLATFORM → MANY PRODUCTS → MANY TENANTS → MANY CONFIGURATIONS**

Future products reuse the same core. No per-client codebases. Tenants adapt via [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md) (`Configure → Customize → Extend → Automate`).

---

## 3. Connected business operating system (not CRUD)

Do **not** build disconnected CRUD screens.

Whenever an action occurs, ask:

1. What data changed?  
2. What event should be generated?  
3. What automation can run?  
4. What notification should be sent?  
5. What audit entry should be created?  
6. What report/analytics data should change?  
7. What API/webhook event should be available?  
8. What billing/usage impact exists?  
9. What permissions apply?  
10. What should happen automatically next?  

```
USER ACTION
→ SYSTEM UNDERSTANDS
→ SYSTEM AUTOMATES
→ SYSTEM MONITORS
→ SYSTEM RECOVERS
→ SYSTEM EXPLAINS
```

This checklist is **mandatory** for every major feature (design + implementation review). It extends the earlier 10-point architecture gate with the autonomous loop.

---

## 4. Automation-first business flows

Platform must support end-to-end process automation, e.g.:

```
Lead → Qualification → Assignment → Follow-up → Demo → Proposal
→ Deal Won → Client → Subscription → Invoice → Payment
→ Onboarding → Tasks → Communication → Renewal
```

Reference playbooks: Sales · Finance · Customer Success · WhatsApp · Voice AI — see [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md), [WHATSAPP.md](../modules/WHATSAPP.md), [VOICE_AI.md](../modules/VOICE_AI.md).

Tasks should be **automatically generated** wherever safe (overdue invoice → payment follow-up; deal won → onboarding; subscription expiring → renewal).

---

## 5. Two billing worlds (never mix)

| World | Meaning |
|-------|---------|
| A | ThinkAIQ charges a tenant for SaaS |
| B | Tenant charges its own customer |

Separate bounded contexts — [ADR-003](../decisions/ADR-003-platform-vs-tenant-billing.md), [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md), [FINANCE_SPECIFICATION.md](../modules/FINANCE_SPECIFICATION.md).

Per-tenant invoices use that tenant’s business name, logo, address, GSTIN, bank details, numbering, branding — never cross-tenant mix. Prefer soft-delete / credit notes over unsafe financial history erasure.

---

## 6. Super Admin = visual command center

Not a boring CRUD dashboard. Answers immediately:

Is the platform healthy? Which tenants/modules fail? What/when/why? Blast radius? Root cause? Fix/retry/replay/disable? External vs internal? Resolved?

See [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md), [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md).

---

## 7. WhatsApp & Voice as modules

- WhatsApp: first-class communication + **future WhatsApp SaaS** on same core ([WHATSAPP.md](../modules/WHATSAPP.md))  
- Voice AI / Telephony: optional modules ([VOICE_AI.md](../modules/VOICE_AI.md), [TELEPHONY.md](../modules/TELEPHONY.md))  

Deep CRM ↔ WhatsApp integration is required in architecture now, even if full WhatsApp SaaS ships later.

---

## 8. AI Business Assistant (future-ready)

Prepare for an authorized assistant that answers operational questions and can draft workflows — always through tools that respect tenant, role, module, and financial permissions. **AI must not become a backdoor.**

See [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md), future `AI_ASSISTANT.md` when scoped.

---

## 9. Security & enterprise posture

Security is foundational. Never claim certifications unless achieved. Prepare architecture for future audits/compliance. Isolation at every layer including workers. Secrets masked. Audit immutable-style. Session/MFA/SSO-ready.

---

## 10. Documentation-first

No production implementation until architecture and requirements are sufficiently documented (this docs set). Every major feature documents: Purpose → flow → rules → data → permissions → APIs → events → automation → notifications → errors → edge cases → audit → reporting → extensions.

---

## 11. Final product goal

One connected platform:

**CRM + Sales + Finance + Billing + Subscriptions + Team + Tasks + Support + Documents + Communication + Advanced Automation + AI Assistance + Analytics + API + Webhooks + White-label + Multi-tenancy + Super Admin + Security + Future WhatsApp + Optional Voice/Telephony**

Final principle:

> ThinkAIQ should not merely help users manage business work.  
> **ThinkAIQ should perform as much business work automatically as safely possible.**
