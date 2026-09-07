# MODULE_SYSTEM.md — ThinkAIQ

## 1. Purpose

Modules are independently enableable units of product capability. CRM is not a closed hard-coded monolith of inseparable features; the platform is modular with a centralized entitlement engine.

---

## 2. Example tenant combinations

| Tenant | Modules |
|--------|---------|
| A | CRM + Sales |
| B | CRM + Sales + Finance |
| C | WhatsApp + Automation |
| D | CRM + WhatsApp + Finance + Support |
| E | Full Enterprise Platform |
| F | CRM + Voice AI + Telephony |

---

## 3. Module catalog (initial)

| Module code | Name | Priority |
|-------------|------|----------|
| `core` | Platform core (always on) | P0 |
| `crm` | CRM | P1 |
| `sales` | Sales pipeline & quotes | P1 |
| `finance` | Finance & accounting features | P1 |
| `billing` | Subscriptions for tenant customers | P1 |
| `tasks` | Tasks / follow-ups / calendar | P1 |
| `team` | Team / DPR / targets | P1 |
| `automation` | Automation engine | P1 |
| `documents` | Document management | P2 |
| `support` | Helpdesk | P2 |
| `communications` | Omnichannel comms | P2 |
| `whatsapp` | WhatsApp inbox/campaigns (may bundle with communications) | P2/P3 |
| `reporting` | Advanced reporting | P2 |
| `api` | Public API access | P1 |
| `voice_ai` | Optional Voice AI | P3 |
| `telephony` | Optional telephony inventory | P3 |
| `portal` | Client portal | P3 |
| `hr` | HR (future pack) | P3 |

`core` includes identity, tenancy, RBAC, notifications baseline, audit, settings.

---

## 4. Entitlement engine

Every feature/module is controlled by **plan + tenant entitlement**.

Example:

- CRM = enabled
- Accounting/Finance = disabled
- Voice = enabled
- Automation = enabled
- API = disabled

### Resolution order

1. Platform module exists & globally active
2. Plan allows module
3. Tenant entitlement enabled
4. Feature flags / limits inside module
5. User permission

Fail closed.

---

## 5. What a module declares

Aligned with plugin architecture:

- Routes / navigation items
- UI screens & widgets
- Database entities (migrations owned by module package)
- Permissions
- Settings schema
- APIs
- Webhooks / events
- Automation triggers & actions
- Dashboard widgets
- Metered usage dimensions

---

## 6. Enable / disable behavior

### Enable

- Validate plan allows
- Set `tenant_modules.status = enabled`
- Optionally run module seed
- Unlock nav/API
- Audit `module.enabled`

### Disable

- Block new mutations in module APIs
- Hide navigation
- Keep data retained (default) unless uninstall/purge flow
- Pause module-specific automations
- Audit `module.disabled`
- Warn if dependent modules require it (dependency graph)

### Dependencies (examples)

- `sales` depends on `crm`
- `voice_ai` may depend on `crm` + optionally `telephony`
- `billing` may integrate with `finance` for invoices

Document dependency graph in code registry + this doc as it evolves.

---

## 7. Plan coupling

Plans define:

- Allowed modules
- Default modules on provision
- Limits per module dimension

Super Admin may grant out-of-plan overrides (audited).

---

## 8. User flows

**Tenant Admin:** Settings → Modules → request enable (if self-serve) or view only  
**Super Admin:** Tenant → Modules → enable/disable + overrides

---

## 9. Data model

- `modules` (code, name, status, dependencies)
- `plan_modules`
- `tenant_modules` (tenant_id, module_code, enabled, overrides JSON)
- `feature_flags` (optional finer grain)

---

## 10. APIs

- `GET /tenant/modules`
- `POST /platform/tenants/{id}/modules/{code}/enable`
- `POST /platform/tenants/{id}/modules/{code}/disable`

---

## 11. Automation / reporting impact

- Disabled module events should not execute new automations
- Dashboards hide widgets for disabled modules
- Metering stops incrementing disabled optional channels after grace

---

## 12. Extension points

Future modules register via [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md) without core rewrites.

---

## 13. Related documents

- [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md)
- [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md)
- [PLUGIN_SYSTEM.md](./PLUGIN_SYSTEM.md)
- [USAGE_METERING.md](../operations/USAGE_METERING.md)
