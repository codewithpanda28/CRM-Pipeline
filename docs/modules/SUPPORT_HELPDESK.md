# SUPPORT_HELPDESK.md — ThinkAIQ

## 1. Purpose

Helpdesk/ticketing for customer support with SLA-ready architecture (SLA engine can mature over time without schema rewrites).

Module code: `support` · Priority: **P2**

---

## 2. Ticket fields

Ticket ID · Client · Subject · Description · Priority · Owner · Department · Status · Resolution

Statuses: Open · In Progress · Waiting · Resolved · Closed

Features: internal notes · attachments · activity history · response tracking · SLA-ready fields (`respond_by`, `resolve_by`, `first_responded_at`, etc.)

---

## 3. User flows

Client/email/portal creates ticket → assign → reply (public/internal) → resolve → close  
Automations on create/update/SLA breach.

---

## 4. Data model

`tickets`, `ticket_messages`, `ticket_sla_policies`, `ticket_events`

---

## 5. Permissions / APIs / Events

`support.tickets.*`, `support.tickets.assign`, `support.settings.configure`  
Events: `ticket.created` · `ticket.updated` · `ticket.resolved` · `ticket.closed` · `ticket.sla_breached`

---

## 6. Client portal link

Future portal shows tickets per [PRODUCT_REQUIREMENTS.md](../product/PRODUCT_REQUIREMENTS.md) REQ-PRT-001.

---

## 7. Related documents

- [COMMUNICATIONS.md](./COMMUNICATIONS.md)
- [NOTIFICATIONS.md](./NOTIFICATIONS.md)
- [CRM_SPECIFICATION.md](./CRM_SPECIFICATION.md)
