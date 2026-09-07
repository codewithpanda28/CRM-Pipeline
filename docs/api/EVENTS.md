# EVENTS.md — ThinkAIQ Platform Event Model

## 1. Purpose

Major business actions emit durable domain events. Automation, notifications, analytics, webhooks, search, and metering consume them. This keeps the platform a connected OS rather than isolated CRUD.

**Source of truth for transport & envelope:** [ADR-019](../adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md).

---

## 2. Transport

1. Use-case mutates DB in a transaction  
2. Insert `outbox_events` row (same transaction) — ADR-019 fields  
3. Outbox publisher → `JobQueue.enqueue()` (BullMQ adapter; ADR-015)  
4. Consumers: automation · notifications · webhooks · timeline · metering · search · ops health  

Consumers must be **idempotent**. Do not claim distributed exactly-once.

---

## 3. Naming convention (canonical)

```text
{domain}.{entity}.{action}
```

Examples:

| Canonical event | Typical consumers |
|-----------------|-------------------|
| `crm.lead.created` / `crm.lead.updated` / `crm.lead.qualified` / `crm.lead.assigned` / `crm.lead.converted` | Automation, notify, webhooks, search |
| `crm.contact.created` | Automation, search |
| `crm.deal.created` / `crm.deal.stage_changed` / `crm.deal.won` / `crm.deal.lost` | Automation, CRM 360, webhooks |
| `sales.quote.accepted` / `sales.quote.sent` | Sales, finance convert |
| `finance.invoice.created` / `finance.invoice.finalized` / `finance.invoice.sent` / `finance.invoice.overdue` / `finance.invoice.paid` | Automation, AR, WhatsApp/email, PDF |
| `finance.payment.received` / `finance.payment.failed` / `finance.payment.refunded` | Finance, automation |
| `finance.credit_note.issued` / `finance.debit_note.issued` | Finance |
| `platform.subscription.created` / `platform.subscription.expiring` / `platform.subscription.expired` / `platform.subscription.renewed` | Platform billing (ADR-021) — **not** tenant customer subscriptions |
| `tenant.subscription.*` | Tenant’s subscriptions to *their* customers (finance/billing module) |
| `support.ticket.created` / `support.ticket.resolved` / `support.ticket.sla_breached` | Support, automation |
| `tasks.task.created` / `tasks.task.completed` / `tasks.task.overdue` | Team, notify |
| `whatsapp.message.received` / `whatsapp.message.sent` / `whatsapp.message.failed` | WhatsApp/CRM, automation |
| `voice.call.completed` | CRM, automation |
| `automation.run.started` / `automation.run.failed` / `automation.step.failed` / `automation.workflow.published` | Ops, analytics |
| `tenant.created` / `tenant.status_changed` / `tenant.plan_changed` | Platform ops, metering |
| `document.render.completed` | Notify, portal |
| `ops.incident.opened` / `ops.recovery.executed` | Super Admin |

---

## 4. Compatibility aliases (short names)

Older docs and early seeds used short names (`lead.created`, `invoice.paid`, `deal.won`, …).

**Canonical = namespaced.** Automation trigger registry and event catalog maintain an **alias map**:

| Alias (legacy) | Canonical |
|----------------|-----------|
| `lead.created` | `crm.lead.created` |
| `deal.won` | `crm.deal.won` |
| `invoice.paid` | `finance.invoice.paid` |
| `payment.received` | `finance.payment.received` |
| `message.received` | `whatsapp.message.received` *(or `communications.message.received` if channel-agnostic — prefer channel-specific when known)* |
| `workflow_run.failed` | `automation.run.failed` |
| `tenant.status_changed` | `tenant.status_changed` *(already ok)* |

Rules:

- **Emitters** write canonical names only.  
- **Triggers / filters** may accept aliases and normalize at registration time.  
- Alias map is versioned in code/config — not ad-hoc string replace in payloads.

---

## 5. EventEnvelope v1

Stored in `outbox_events.payload` (and passed to jobs):

```text
EventEnvelope v1
  id              // prefer = outbox_events.id
  type            // namespaced event_type
  spec_version    // "1"
  occurred_at
  tenant_id       // null only for pure platform events
  actor: { type: user|api_key|system|automation|platform_user, id }
  aggregate: { type, id }
  data            // event-specific object
  metadata: {
    correlation_id
    causation_id?
    idempotency_key?
    schema_hash?
  }
```

Breaking payload changes → bump `spec_version` or introduce a new event type. Do not silently reshape `data` for existing consumers.

---

## 6. Rules

- Tenant context required on tenant events  
- Consumers must be idempotent (`dedupe_key` / domain unique constraints)  
- Replay is explicit, authorized, and duplicate-safe  
- Modules register events in the plugin/module manifest  
- Platform billing events never mutate tenant finance AR tables (ADR-021)

---

## 7. Related

[ADR-019](../adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md) · [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md) · [WEBHOOKS.md](./WEBHOOKS.md) · [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md) · [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md)
