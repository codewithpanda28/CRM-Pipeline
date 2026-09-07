# PHASE-1E — Final Foundation Gate

**Phase:** 1E — Document sync + final P0 architecture gate  
**Date:** 2026-09-04  
**Constraint:** Architecture/documentation only — **NO** application code, packages, migrations, or features  

---

## Architecture now locked

| ADR | Topic | Status |
|-----|-------|--------|
| ADR-001 | Shared DB + `tenant_id` row isolation | Affirmed |
| ADR-002 | Modular monolith stack | Proposed (Nest vs Express on Vencore path still noted open) |
| ADR-003 | Two billing contexts | Affirmed; **detailed by ADR-021** |
| ADR-004 | Automation async | Affirmed |
| ADR-005 | Custom domain & SSL workflow | Affirmed (cert tool open) |
| ADR-006 | Auth mechanisms | Proposed base; **amended by ADR-020**, hardened by ADR-023 |
| ADR-007 | Queue strategy | Superseded in selection by ADR-015 |
| ADR-008 | S3-compatible storage + tenant keys | Affirmed |
| ADR-009 | API surface `/v1` | Affirmed (direction) |
| ADR-010 | Plugin extension | Affirmed (direction) |
| ADR-011 | White-label runtime | Refined by ADR-018 |
| ADR-012 | WhatsApp provider abstraction | Affirmed (direction) |
| ADR-013 | Customization metadata hybrid | Affirmed (direction) |
| ADR-014 | Selective Vencore foundation | Affirmed |
| ADR-015 | **BullMQ** behind `JobQueue` | Accepted |
| ADR-016 | **Playwright + pdf-lib** hybrid PDF | Accepted |
| ADR-017 | Multi-tenant provision, memberships, host resolution | Accepted |
| ADR-018 | Tenant WL ThemeSnapshot | Accepted |
| ADR-019 | Outbox → JobQueue publisher | Accepted |
| ADR-020 | Auth + multi-membership | Accepted |
| ADR-021 | Platform vs tenant billing worlds | Accepted |
| ADR-022 | HTML + strict Handlebars template DSL | Accepted |
| ADR-023 | Auth/security hardening phases | Accepted |

**Doc sync completed this phase:** MULTI_TENANCY.md · DATABASE_SCHEMA.md (users/memberships/outbox) · EVENTS.md (namespaced + envelope + aliases).

### Conflicts resolved (ADR wins)

| Conflict | Winner |
|----------|--------|
| One user → one tenant | **ADR-017 / MULTI_TENANCY sync** |
| `users.tenant_id` / `workspace_id` | **ADR-017 schema** |
| Short event names | **ADR-019 / EVENTS** + alias map |
| Thin outbox columns | **ADR-019** |
| Instance-only branding | **ADR-018** |
| Template DSL open in ADR-016 | **ADR-022** (does not change Playwright decision) |
| Billing detail thin in ADR-003 | **ADR-021** |

---

## Architecture still open

Only genuinely unresolved:

| Item | Notes |
|------|-------|
| ADR-002 exact API framework | Nest vs adapted Vencore Express — choose at coding spike |
| ADR-005 cert automation tool | ACM / Caddy / Traefik / cert-manager with deploy stack |
| ADR-006 formal “Accepted” stamp | Content amended by 020/023; stakeholders should mark Accepted |
| Global email uniqueness UX edge cases | Policy proposed; rare B2B exceptions TBD |
| Reseller product shape | Schema-ready only (RESELLER_SYSTEM) |
| Meilisearch vs Postgres FTS | Deferred until need proven |
| Temporal adoption | Deferred (ADR-015 path) |
| WhatsApp/Voice concrete provider pick | Module-phase ADRs |
| Payment provider default (Stripe vs Razorpay primary region) | Product/commercial; both architected in ADR-021 |
| Impersonation feature | Explicitly not default; needs own ADR if ever |

---

## P0 implementation blockers

Must be **implemented and tested** before normal CRM/finance feature work:

1. Global `users` + `tenant_memberships` + TenantContext  
2. Host-first tenant resolution + anti-spoof  
3. Repository `tenant_id` scoping on tenant tables  
4. Cross-tenant isolation CI suite  
5. Auth membership + Host/JWT match (ADR-020)  
6. ADR-023 **P0** security controls (rate limit, CSRF strategy, secure cookies, hashed reset tokens, headers/CORS, API key hash, secret encryption, audit, outbound SSRF guards, session revoke, platform admin realm)  
7. `outbox_events` schema + publisher + no enqueue-in-TX anti-pattern  
8. `JobQueue` + BullMQ adapter + tenant job pause on suspend  
9. Tenant branding runtime (ThemeSnapshot) without cross-tenant cache bleed  
10. Storage keys `tenants/{tenantId}/…`  
11. Platform vs tenant billing **boundary** enforced in code modules (even if full Stripe wiring later)  
12. Suspended tenant: mutation deny + business job pause  

---

## Coding gate — first implementation milestone

Documentation foundation is complete for P0. **First coding phase** (only after explicit stakeholder “open coding gate”):

| Step | Work |
|------|------|
| 1 | TenantContext + membership model |
| 2 | Host resolution |
| 3 | Isolation test suite (red/green against intentional gaps) |
| 4 | Auth hardening (ADR-023 P0 subset) |
| 5 | Outbox schema + publisher |
| 6 | JobQueue + BullMQ adapter |
| 7 | Tenant branding runtime |
| 8 | Migration compatibility layer (`workspace_id` dual-read) |

**Do not** start invoice/CRM feature slices until steps 1–4 are green and 5–6 at least spiked with DoD tests below.

---

## Definition of Done for P0

Objective tests that **must pass**:

| # | Test |
|---|------|
| 1 | Tenant A cannot read tenant B entities |
| 2 | A cannot update/delete B |
| 3 | A cannot access B files / signed URLs |
| 4 | A cannot access B jobs |
| 5 | A cannot access B outbox events |
| 6 | A cannot access B audit logs |
| 7 | Host spoof / Host↔JWT mismatch fails |
| 8 | Membership switch only to authorized tenants |
| 9 | Suspended tenant mutation fails |
| 10 | Failed DB transaction creates **no** published job |
| 11 | Outbox retry eventually publishes |
| 12 | Duplicate event / dedupe → one business outcome |
| 13 | Tenant branding cannot cross-contaminate (cache/HTML/PDF context) |
| 14 | Platform admin access is separately authenticated and audited |
| 15 | Body `tenantId` cannot authorize cross-tenant access |

---

## Rollback (pre-migration coding)

Before destructive data migration:

| Mechanism | Use |
|-----------|-----|
| Feature flags | Disable multi-tenant routes; keep single-tenant compat path |
| Branch / deploy rollback | Revert app deploy; no irreversible schema drop yet |
| Dual-read columns | Keep `workspace_id` readable until cutover validated |
| Outbox/BullMQ | Pause workers; drain; no data purge |
| DB migrations | Expand/contract: additive first; drop columns only after compat window |

Hard rollback after cutover = restore from backup (PHASE-1D P6) — avoid needing this by not dropping Vencore columns early.

---

# FINAL ARCHITECTURE STATUS

### Locked

Row tenancy · selective Vencore · BullMQ · Playwright+pdf-lib · HTML/Handlebars templates · multi-membership · host resolution · ThemeSnapshot WL · outbox→JobQueue · two billing worlds · security P0 catalog · namespaced events.

### Open

Exact Node API framework on Vencore path · cert tool · provider regional default · reseller product · search engine · Temporal · SSO/MFA product packaging details (MFA required for Super Admin before scale — timing in ADR-023).

### Deferred

RLS · Meilisearch · Temporal · reseller GA · enterprise compliance programs · React Flow builder ADR until UI phase.

### P0 blockers

Listed above (TenantContext through suspend gates + isolation DoD).

### First implementation milestone

**TenantContext + memberships + host resolution + isolation suite** → then auth P0 → outbox/BullMQ → branding → compat layer.

---

## Document index

| Doc | Path |
|-----|------|
| ADR-020 | [../adr/ADR-020-AUTH-AND-MULTI-MEMBERSHIP.md](../adr/ADR-020-AUTH-AND-MULTI-MEMBERSHIP.md) |
| ADR-021 | [../adr/ADR-021-PLATFORM-VS-TENANT-BILLING.md](../adr/ADR-021-PLATFORM-VS-TENANT-BILLING.md) |
| ADR-022 | [../adr/ADR-022-DOCUMENT-TEMPLATE-DSL.md](../adr/ADR-022-DOCUMENT-TEMPLATE-DSL.md) |
| ADR-023 | [../adr/ADR-023-AUTH-SECURITY-HARDENING.md](../adr/ADR-023-AUTH-SECURITY-HARDENING.md) |
| Phase 1D | [PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md](./PHASE-1D-TENANCY-AND-OUTBOX-PLAN.md) |
| Phase 1C | [PHASE-1C-DECISIONS.md](./PHASE-1C-DECISIONS.md) |

**Still no application code.**
