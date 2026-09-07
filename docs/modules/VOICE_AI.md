# VOICE_AI.md — ThinkAIQ

## 1. Purpose

Optional Voice AI module for agents, campaigns, and call intelligence. **Voice AI is not the product identity.**

Module code: `voice_ai` · Priority: **P3**

Voice outcomes must feed the autonomous OS: update CRM · create tasks · notify · move pipeline · start WhatsApp/email follow-up via automation.

Triggers (examples): call completed · qualified · interested · callback requested · demo booked · converted · failed call.

---

## 2. Voice agents

Name · Voice · Language · Script · Purpose · Number · Status

---

## 3. Campaigns

Campaign · Agent · Leads · Start/end · Status · Outcomes

---

## 4. Call data

Call · Duration · Outcome · Recording · Transcript · Summary · Cost · Minutes

Recordings/transcripts in object storage; metadata in DB. Appears on Customer 360 when entitled.

---

## 5. Business rules

- Requires module entitlement + possibly `telephony`
- Meter minutes/cost into usage billing
- Consent/recording compliance flags per tenant
- Campaigns respect DND/opt-out lists

---

## 6. Data model

`voice_agents`, `voice_campaigns`, `voice_campaign_leads`, `voice_calls`, `voice_call_assets`

---

## 7. Permissions / APIs / Events

`voice.agents.*`, `voice.campaigns.*`, `voice.calls.view`  
Events: `voice.call.completed` · `voice.campaign.started` · `voice.campaign.completed`

---

## 8. Billing hook

See [USAGE_METERING.md](../operations/USAGE_METERING.md) and [BILLING_SUBSCRIPTION.md](./BILLING_SUBSCRIPTION.md).

---

## 9. Related documents

- [TELEPHONY.md](./TELEPHONY.md)
- [CRM_SPECIFICATION.md](./CRM_SPECIFICATION.md)
- [MODULE_SYSTEM.md](../architecture/MODULE_SYSTEM.md)
