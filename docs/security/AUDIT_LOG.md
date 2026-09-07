# AUDIT_LOG.md — ThinkAIQ

## 1. Purpose

Immutable/read-only style audit trail for administrative and security-sensitive actions.

---

## 2. Audited actions (minimum)

User created/disabled · Permission/role changed · Tenant/plan/module/billing changed · API key created/revoked · Domain changed · Security setting changed · Super Admin mutations · Impersonation if ever enabled · **Ops recovery actions** (job retry, webhook replay, circuit open/close, tenant job pause/resume, DLQ discard) · Incident acknowledge/resolve · Break-glass record views

Also recommended: invoice void, payment delete (if allowed), export downloads.

---

## 3. Properties

- Append-only table
- No update/delete APIs for tenants
- Retention separate from soft-deleted business data
- Searchable by actor, action, entity, time, tenant

---

## 4. Schema

See `audit_logs` in [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md).

---

## 5. Related documents

- [SECURITY.md](./SECURITY.md)
- [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md)
- [RBAC_PERMISSIONS.md](./RBAC_PERMISSIONS.md)
