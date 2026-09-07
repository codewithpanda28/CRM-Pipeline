# PLUGIN_SYSTEM.md — ThinkAIQ

## 1. Purpose

Extension architecture so future modules add routes, UI, entities, permissions, settings, APIs, webhooks, automations, nav, widgets with minimal core changes.

Priority: **P2** (registry patterns start in P0 modular monolith)

---

## 2. Module manifest (conceptual)

```json
{
  "code": "support",
  "name": "Support",
  "dependencies": ["crm", "core"],
  "permissions": ["support.tickets.view", "..."],
  "nav": [{ "label": "Tickets", "route": "/tickets", "permission": "support.tickets.view" }],
  "events": ["ticket.created"],
  "automationActions": ["ticket.create"],
  "widgets": ["open_tickets"],
  "migrations": ["support/*"]
}
```

---

## 3. Registration

At boot, module packages register into:

- Router
- Permission catalog
- Event map
- Automation action/trigger map
- Entitlement catalog
- Dashboard widget registry

---

## 4. Rules

- No silent core edits for feature toggles when registry can handle it
- DB migrations owned by module folder
- Contracts for cross-module calls
- Feature still passes 10-point architecture checklist

---

## 5. Related documents

- [MODULE_SYSTEM.md](./MODULE_SYSTEM.md)
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md)
