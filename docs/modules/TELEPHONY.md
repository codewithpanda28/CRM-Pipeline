# TELEPHONY.md — ThinkAIQ

## 1. Purpose

Track telephony & channel inventory for numbers/channels assigned to clients or voice agents.

Module code: `telephony` · Priority: **P3**

---

## 2. Inventory fields

Phone number · Channel ID · Provider · Channel type · Client · Start date · Expiry date · Status

States: Available · Assigned · Expiring · Expired

Support: Full Channel · Half Channel

---

## 3. Flows

Procure/import number → Available → Assign to client/agent → Expiry reminders → Expire/release

Domain expiring style notifications for channel expiry.

---

## 4. Data model

`telephony_channels`, `telephony_assignments`, `telephony_providers`

---

## 5. Permissions / Events

`telephony.channels.*`  
Events: `telephony.channel.assigned` · `telephony.channel.expiring` · `telephony.channel.expired`

---

## 6. Related documents

- [VOICE_AI.md](./VOICE_AI.md)
- [USAGE_METERING.md](../operations/USAGE_METERING.md)
- [INTEGRATIONS.md](../integrations/INTEGRATIONS.md)
