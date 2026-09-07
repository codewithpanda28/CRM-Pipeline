# ERROR_HANDLING.md — ThinkAIQ

## 1. Purpose

Consistent error model across API, jobs, automation, and webhooks.

---

## 2. API error envelope

```json
{
  "error": {
    "code": "entitlement_denied",
    "message": "Finance module is not enabled for this tenant",
    "details": {},
    "request_id": "..."
  }
}
```

### Representative codes

`unauthorized` · `forbidden` · `not_found` · `validation_failed` · `conflict` · `entitlement_denied` · `limit_exceeded` · `rate_limited` · `tenant_inactive` · `internal_error`

HTTP mapping: 401/403/404/422/409/402-or-403/429/403/500.

---

## 3. Jobs / automation

- Typed failure reasons
- Retryable vs permanent classification
- Manual retry entry points
- Alerts on repeated permanent failures

---

## 4. Related documents

- [OBSERVABILITY.md](../operations/OBSERVABILITY.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [WEBHOOKS.md](./WEBHOOKS.md)
