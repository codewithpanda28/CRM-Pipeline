# API_SPECIFICATION.md — ThinkAIQ

## 1. Purpose

API-first access to major business entities for UI, integrations, and future embedding into external SaaS.

Module entitlement: `api` (plus entity module entitlements) · Priority: **P1**

---

## 2. Style

- REST JSON over HTTPS
- Resource-oriented URLs
- Version prefix `/api/v1`
- Standard error envelope ([ERROR_HANDLING.md](./ERROR_HANDLING.md))
- Pagination, filtering, sorting on list endpoints
- Rate limiting per tenant/API key
- Idempotency-Key support on create/payment endpoints

---

## 3. Authentication

| Method | Use |
|--------|-----|
| Session cookie / bearer (user JWT) | First-party apps |
| API keys | Server integrations |
| OAuth2 | Architecture-ready (implement when partners need) |

API keys: tenant-scoped, hashed at rest, permission-scoped, rotatable, revocable, audited.

---

## 4. Resource catalog (minimum)

Leads · Contacts · Clients · Companies · Deals · Quotes · Products · Plans · Subscriptions · Invoices · Payments · Tasks · Tickets · Documents · Users (limited) · Vendors · Webhooks · Workflows

Platform resources under `/api/v1/platform/*` for Super Admin only.

---

## 5. Conventions

```
GET    /api/v1/{resources}
POST   /api/v1/{resources}
GET    /api/v1/{resources}/{id}
PATCH  /api/v1/{resources}/{id}
DELETE /api/v1/{resources}/{id}   # soft delete where applicable
```

Query: `?page=&per_page=&sort=&filter[field]=&include=`

Response list:

```json
{
  "data": [],
  "meta": { "page": 1, "per_page": 25, "total": 100 }
}
```

---

## 6. Tenancy

Resolved from host and/or authenticated credential binding. Credentials cannot access other tenants.

---

## 7. Permissions

Every endpoint checks RBAC verb + scope + module entitlement + plan API limits.

---

## 8. Example endpoints

### Leads

- `POST /api/v1/leads` — REQ-CRM-001
- `POST /api/v1/leads/{id}/convert`
- `POST /api/v1/leads/{id}/assign`

### Invoices

- `POST /api/v1/invoices`
- `POST /api/v1/invoices/{id}/send`
- `POST /api/v1/invoices/{id}/payments`

### Automation

- `GET /api/v1/workflows`
- `POST /api/v1/workflows/{id}/test-run`

Full OpenAPI artifact to be generated during implementation phase from this contract.

---

## 9. Webhooks relationship

API mutations emit events consumed by webhook dispatcher. See [WEBHOOKS.md](./WEBHOOKS.md).

---

## 10. Versioning

See [API_VERSIONING.md](./API_VERSIONING.md).

---

## 11. Related documents

- [RBAC_PERMISSIONS.md](../security/RBAC_PERMISSIONS.md)
- [SECURITY.md](../security/SECURITY.md)
- [USAGE_METERING.md](../operations/USAGE_METERING.md)
