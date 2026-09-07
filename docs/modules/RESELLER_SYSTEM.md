# RESELLER_SYSTEM.md — ThinkAIQ

## 1. Purpose

Future-ready reseller/agency architecture. Resellers get hierarchy and branding without ThinkAIQ Super Admin access.

Priority: **P3** — design now, implement later.

---

## 2. Reseller capabilities (target)

- Own branding
- Own clients (sub-tenants)
- Own plans / pricing
- Own domain
- Own user hierarchy
- Optional commission structure

**Must not** automatically receive ThinkAIQ Super Admin access.

---

## 3. Tenancy model options (open)

| Option | Description |
|--------|-------------|
| A | Reseller as parent tenant; clients as child tenants |
| B | Reseller org entity managing multiple tenants |
| C | Hybrid marketplace |

Decision deferred to future ADR before build. Until then, schema reserves `parent_tenant_id` / `reseller_id` nullable fields where safe.

---

## 4. Isolation & permissions

- Reseller admin ≠ platform Super Admin
- Reseller sees only their subtree
- Platform Super Admin sees all
- Data isolation remains absolute across leaf tenants

---

## 5. Commercial

Reseller wholesale plans vs retail plans; optional commissions on [TEAM_DPR.md](./TEAM_DPR.md) patterns.

---

## 6. Related documents

- [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md)
- [WHITE_LABEL_ARCHITECTURE.md](../architecture/WHITE_LABEL_ARCHITECTURE.md)
- [BILLING_SUBSCRIPTION.md](./BILLING_SUBSCRIPTION.md)
- [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md)
