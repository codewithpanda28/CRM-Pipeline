# TESTING_STRATEGY.md — ThinkAIQ

## 1. Purpose

Ensure correctness of multi-tenant, RBAC, billing, and automation-critical behaviors.

---

## 2. Test pyramid

| Layer | Focus |
|-------|-------|
| Unit | Domain rules, tax calc, permission evaluation |
| Integration | DB repositories with tenant filters, API authz |
| Contract | OpenAPI / webhook payload schemas |
| E2E | Provision tenant → CRM → invoice → automation |
| Non-functional | Isolation fuzz, rate limit, backup restore drill |

---

## 3. Mandatory suites

- Cross-tenant isolation (must fail open access)
- RBAC matrix samples
- Soft-delete behavior
- Idempotent payments/webhooks
- Automation delay/branch/retry
- Entitlement gating

---

## 4. Data

Factory fixtures create tenant A/B isolation pairs for every critical path.

---

## 5. Related documents

- [SECURITY.md](../security/SECURITY.md)
- [REQUIREMENTS_TRACEABILITY.md](../product/REQUIREMENTS_TRACEABILITY.md)
- [IMPLEMENTATION_PLAN.md](../product/IMPLEMENTATION_PLAN.md)
