# PRODUCT_PACKAGING.md — ThinkAIQ

## 1. Purpose

Derive multiple commercial products from one core platform via plans + module entitlements + branding — not separate codebases.

---

## 2. Future / packaged products

| Pack | Typical modules |
|------|-----------------|
| CRM | core, crm, tasks, reporting |
| Sales CRM | + sales, automation |
| Finance | + finance, billing |
| Agency Management | crm, sales, team, automation, documents |
| Support | crm, support, communications |
| HR | hr (future), team |
| Education / Real Estate / Marketing | vertical configs + custom fields packs |
| Voice AI | voice_ai (+ crm) |
| Telephony | telephony |
| Automation | Advanced workflows as premium upgrade driver (see packaging tiers in AUTOMATION_ENGINE) |
| WhatsApp SaaS | whatsapp + automation + light CRM + WL |
| Custom business SaaS | curated module sets + WL branding |

---

## 3. Mechanism

```
ONE CODEBASE
→ MANY TENANTS
→ MANY CONFIGURATIONS
→ MANY PLANS
→ MANY MODULE COMBINATIONS
```

Packaging = plan templates + default pipelines/fields + marketing SKU names.

### Automation as premium upgrade lever

| Plan band | Automation posture |
|-----------|-------------------|
| Basic | Simple workflows, limited executions, basic triggers/actions |
| Business | Multi-step, conditions, delays, webhooks, advanced communication |
| Professional | Branching, API actions, approvals, high limits, analytics, AI workflow generation |
| Enterprise | Advanced AI automation, custom integrations, priority execution, emergency controls, custom services |

Details: [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md), [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md).

### Customization depth as upgrade lever

| Plan band | Customization posture |
|-----------|----------------------|
| Starter / Basic | Basic custom fields, limited views |
| Business | Fields + layouts + forms + workflows + dashboards |
| Professional | + report builder, blueprints, higher quotas |
| Enterprise | Custom objects, sandbox, advanced rules, module requests |

Details: [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md).

---

## 4. Related documents

- [MODULE_SYSTEM.md](../architecture/MODULE_SYSTEM.md)
- [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md)
- [WHITE_LABEL_ARCHITECTURE.md](../architecture/WHITE_LABEL_ARCHITECTURE.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md)
- [FUTURE_ROADMAP.md](../roadmap/FUTURE_ROADMAP.md)
