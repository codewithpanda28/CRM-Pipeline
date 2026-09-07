# WHATSAPP.md — ThinkAIQ First-Class WhatsApp Module & Future WhatsApp SaaS

## 1. Purpose

WhatsApp is a **first-class communication module**, not an afterthought bolt-on.

Architecture must be ready **now** so a future **WhatsApp SaaS** product can reuse ThinkAIQ Core without a separate platform rewrite.

Module code: `whatsapp` (also gated via `communications`) · Priority: **P2** core inbox · **P3** full WhatsApp SaaS packaging  
Related: [COMMUNICATIONS.md](./COMMUNICATIONS.md), [CRM_SPECIFICATION.md](./CRM_SPECIFICATION.md), [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md), [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md).

---

## 2. Positioning

| Now | Later |
|-----|-------|
| WhatsApp channel inside Business Platform | Standalone WhatsApp SaaS SKU on same core |
| Deep CRM integration | Team inbox + campaigns as primary product surface |

Voice AI ≠ product identity; WhatsApp ≠ only product — both are modules of the broader OS ([MASTER_PRINCIPLES.md](../product/MASTER_PRINCIPLES.md)).

---

## 3. Future WhatsApp SaaS capability surface

Inbox · Team inbox · Conversations · Contacts · Templates · Campaigns · Broadcasts (where legally/platform-supported) · Automation · Message/delivery/read status · Media · Assignments · Internal notes · Search · Filters · Analytics · API · Webhooks · Usage billing

---

## 4. CRM + WhatsApp deep integration

### Inbound

```
New WhatsApp message
→ Identify contact (phone match)
→ Find existing CRM record
→ Create/update lead or attach to client
→ Assign salesperson
→ Start workflow
```

### Outbound / nurture

```
New lead
→ Start WhatsApp workflow
→ Send approved template
→ Wait for response
→ If response → update lead → create deal → notify salesperson
```

Shared reusable entities where appropriate: contacts, clients, conversations, messages, activities/timeline.

---

## 5. Automation

Triggers: `message.received`, template status, campaign events, assignment changed  

Actions: send template/session message, assign conversation, add internal note, create lead/deal/task, wait for reply (wait-for-event), fallback to email  

Templates library category: New enquiry · Follow-up sequence · Customer response workflow  

Provider fallbacks: Provider A → B → Email → notify admin ([AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)).

---

## 6. Data model (summary)

`whatsapp_accounts` (tenant credentials encrypted) · `whatsapp_conversations` · `whatsapp_messages` · `whatsapp_templates` · `whatsapp_campaigns` · `whatsapp_campaign_recipients` · link tables to `contacts`/`leads`/`clients`

Message status: queued · sent · delivered · read · failed  

All tenant-scoped; workers carry tenant context.

---

## 7. Permissions / API / Events / Metering

Permissions: `whatsapp.inbox.view`, `whatsapp.send`, `whatsapp.templates.manage`, `whatsapp.campaigns.manage`, `whatsapp.settings.configure`

APIs: conversations, messages, templates, campaigns  

Events: `message.received|sent|delivered|failed`, `whatsapp.conversation.assigned`

Meter: WhatsApp messages / conversations toward plan; cost tracking per tenant/workflow/execution.

---

## 8. Compliance & safety

- Only approved templates where provider requires  
- Opt-out / suppression honored  
- No silent bulk broadcasts outside policy  
- Secrets never logged  
- Human approval for high-risk bulk campaigns  

---

## 9. Packaging

Tenant examples: WhatsApp + Automation only; CRM + WhatsApp + Finance + Support; Full Enterprise.

Future SKU: **WhatsApp SaaS** = ThinkAIQ Core + `whatsapp` + `automation` + `crm` (light) + WL branding.

---

## 10. Phasing

| Phase | Scope |
|-------|-------|
| P2 | Account connect, send/receive, CRM timeline, automation send + wait-for-reply, templates |
| P2/P3 | Team inbox, assignments, analytics |
| P3 | Campaigns/broadcasts (policy-safe), WhatsApp SaaS packaging, marketplace templates |
