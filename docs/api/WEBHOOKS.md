# WEBHOOKS.md — ThinkAIQ

## 1. Purpose

Tenant-specific outbound webhooks deliver domain events to external systems with retries and logs.

Priority: **P1**

---

## 2. Events (minimum)

Lead created/updated · Deal created · Deal won · Client created · Invoice created · Payment received · Subscription changed · Ticket created · Task completed  
(Plus extensible catalog matching automation triggers.)

---

## 3. Endpoint configuration

Per tenant:

- Target URL (HTTPS required in production)
- Secret for HMAC signature
- Subscribed event types
- Active flag
- Custom headers (optional, secrets encrypted)

---

## 4. Delivery

1. Event committed via outbox
2. Dispatcher creates delivery row
3. POST JSON payload with signature headers
4. Success = 2xx
5. Failures retry with exponential backoff
6. Exhausted → dead letter + notify

---

## 5. Payload shape (illustrative)

```json
{
  "id": "evt_...",
  "type": "payment.received",
  "created_at": "2026-09-04T10:00:00Z",
  "tenant_id": "...",
  "data": { }
}
```

Headers: `X-ThinkAIQ-Signature`, `X-ThinkAIQ-Delivery-Id`, `X-ThinkAIQ-Event`

---

## 6. Data model

`webhook_endpoints`, `webhook_deliveries`, `webhook_delivery_attempts`

---

## 7. Permissions / APIs

`webhooks.manage` · CRUD endpoints · replay delivery

---

## 8. Security

- SSRF protections (block private IPs unless allowlisted enterprise)
- Signature verification docs for consumers
- Secret rotation

---

## 9. Related documents

- [API_SPECIFICATION.md](./API_SPECIFICATION.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [BACKGROUND_JOBS.md](../operations/BACKGROUND_JOBS.md)
- [SECURITY.md](../security/SECURITY.md)
