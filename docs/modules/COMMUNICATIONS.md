# COMMUNICATIONS.md — ThinkAIQ

## 1. Purpose

Communication Center for Email, WhatsApp, SMS, Calls, and in-app messaging — connected to CRM records and client timelines. Part of the autonomous OS: messages trigger events and workflows.

Module code: `communications` · Priority: **P2**  
WhatsApp first-class detail: [WHATSAPP.md](./WHATSAPP.md) (future WhatsApp SaaS on same core).

---

## 2. Channels

| Channel | Notes |
|---------|-------|
| Email | Transactional + conversational threads |
| WhatsApp | First-class module; CRM deep integration; provider Meta/BSP |
| SMS | Provider-integrated |
| Calls | Manual log + telephony/voice modules |
| In-app | Notifications & portal messages |

---

## 3. Unifying model

`messages` / `conversations` with channel type, direction (inbound/outbound), status, provider ids, related entity links, raw payload references (storage), delivery receipts.

All important sends create timeline activities.

---

## 4. Business rules

- Tenant integration credentials isolated & encrypted
- Template approvals where WhatsApp requires
- Opt-out / suppression lists honored
- Rate limits per channel + plan metering

---

## 5. Permissions / APIs / Events

`communications.send_email|whatsapp|sms`, `communications.view`  
Events: `message.sent` · `message.delivered` · `message.failed` · `message.received`

---

## 6. Related documents

- [INTEGRATIONS.md](../integrations/INTEGRATIONS.md)
- [NOTIFICATIONS.md](./NOTIFICATIONS.md)
- [VOICE_AI.md](./VOICE_AI.md)
- [USAGE_METERING.md](../operations/USAGE_METERING.md)
