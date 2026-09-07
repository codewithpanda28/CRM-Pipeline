# RBAC_PERMISSIONS.md — ThinkAIQ

## 1. Purpose

Define granular role-based access control (RBAC) with ownership, team, department, and tenant boundaries.

---

## 2. Permission verbs

Universal verbs:

`view` · `create` · `edit` · `delete` · `export` · `import` · `approve` · `assign` · `share` · `manage` · `configure`

Applied at **module + entity** level.

Examples:

- `crm.leads.view`
- `crm.leads.create`
- `sales.deals.edit`
- `finance.invoices.approve`
- `automation.workflows.configure`
- `tenant.roles.manage`

---

## 3. Built-in user types / roles

| Role | Intent |
|------|--------|
| Super Admin | Platform only (separate principal) |
| Tenant Owner | Full tenant administrative control |
| Tenant Admin | Business administration |
| Manager | Team, sales performance, reporting |
| Employee/User | Assigned modules/permissions |
| Sales User | Leads, deals, follow-ups, pipeline |
| Finance User | Invoices, payments, expenses, vendors, finance reports |
| Support User | Tickets & customer support |
| Custom Roles | Tenant-defined |

---

## 4. Scope model

Permissions evaluate with a **data scope**:

| Scope | Meaning |
|-------|---------|
| `all` | All records in tenant |
| `team` | Records owned by users in manager’s teams |
| `department` | Records in department |
| `own` | Records owned/assigned to self |
| `shared` | Explicitly shared with user |

Example:

- Salesperson: Leads view/create/edit (own/team), Finance view (own clients only or none), Reports own only
- Finance Manager: Invoices/Payments/Expenses full; Sales view; Financial reports full

---

## 5. Evaluation algorithm

For each request:

1. Resolve tenant + principal
2. Deny if tenant not allowable status for mutation
3. Check module entitlement enabled
4. Resolve role permissions (union of roles)
5. Check verb on entity
6. Apply scope filter to query/command
7. Deny with 403 if fails; prefer 404 for cross-tenant or hidden records (anti-enumeration)

---

## 6. Ownership fields

Most entities include:

- `owner_user_id`
- optional `team_id`, `department_id`
- `created_by`, `updated_by`

Assignment actions require `assign` permission.

---

## 7. Role management (tenant)

Tenant Owner/Admin with `tenant.roles.manage` can:

- Create custom roles
- Attach permission sets
- Assign roles to users
- Cannot escalate to platform Super Admin
- Cannot grant permissions for disabled modules (UI hide + API reject)

---

## 8. Example matrices

### Salesperson (typical)

| Entity | Verbs | Scope |
|--------|-------|-------|
| Leads | view, create, edit | own/team |
| Deals | view, create, edit | own/team |
| Finance | view (optional) | limited |
| Reports | view | own |

### Finance Manager (typical)

| Entity | Verbs | Scope |
|--------|-------|-------|
| Invoices | full | all |
| Payments | full | all |
| Expenses | full | all |
| Sales | view | all |
| Financial reports | full | all |

---

## 9. API keys & RBAC

API keys are tenant-scoped and bound to a permission set (or user-equivalent service account). Rate-limited and auditable.

---

## 10. Events & audit

Always audit:

- Role created/updated/deleted
- Permission set changed
- User role assignment changed
- User disabled
- API key created/revoked

---

## 11. Edge cases

- User loses role mid-session → refresh permissions on each request or short-lived claims
- Last Owner protection → prevent removal of final Owner
- Conflicting roles → union (allow) unless explicit deny-overrides designed (default: allow-union; no deny rules in v1 unless ADR)

---

## 12. Testing requirements

- Matrix tests per role × entity × verb
- Scope filter tests
- Cross-tenant denial
- Module-disabled denial

---

## 13. Related documents

- [SUPER_ADMIN.md](../operations/SUPER_ADMIN.md)
- [MODULE_SYSTEM.md](../architecture/MODULE_SYSTEM.md)
- [SECURITY.md](./SECURITY.md)
- [AUDIT_LOG.md](./AUDIT_LOG.md)
