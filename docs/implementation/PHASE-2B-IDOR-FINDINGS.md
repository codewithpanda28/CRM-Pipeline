# PHASE-2B-IDOR-FINDINGS.md

**Milestones:** Phase 2B Task 1 + Task 2  
**Updated:** 2026-09-04  

Denial convention: **404** scoped miss · **403** Host/JWT/membership/lifecycle/authz · **400** body tenant / invalid stage

---

## Fixed now (Task 2)

| Area | Issue | Fix |
|------|-------|-----|
| `pipeline-items` create/update/move | `stage_id` accepted without proving stage ∈ pipeline ∈ workspace | `assertStageOwnedByPipeline` + pipeline ownership on list/create |
| `maybeAutoCreateProject` / won-hook stage lookup | stage by id alone | join `pipelines.workspace_id` |
| API key auth | no lifecycle gate | `assertTenantAllowsRequest` in `requireApiKey` |
| Tenant branding/settings | incomplete tenant SoR APIs | `/api/tenant/branding` + `/settings` |
| Platform inspection | no mounts; risk of future leak | `/api/platform/*` behind `requirePlatformAdmin` |

---

## Safe by existing context (proven live)

Contacts, companies, pipelines CRUD, stages under pipeline_id, tasks list/patch/delete, activity list, projects GET/list, messaging channels, notifications, API key management, webhook subscriptions/deliveries, servers list, Host/JWT, body tenant reject, multi-membership.

---

## Deferred with justification

| Item | Why deferred |
|------|----------------|
| Full plugin / portal / nested PM / dashboards / analytics / SSH WS matrix | Same `workspace_id` pattern; not critical IDOR; separate suites |
| `/api/config` global appearance | Instance-level `system_settings`; tenant SoR is `tenant_branding` |
| Webhook/API-key permission gating (any member) | Privilege issue, not cross-tenant IDOR |
| WS `?token=` + legacy `user.workspace_id` | ADR-023 P1 — separate hardening |
| BullMQ/outbox publisher | Next milestone |
| MFA / SSO / RLS / custom TLS | Explicitly deferred in ADR-023 |

---

## Live proof

See `PHASE-2B-FULL-ISOLATION-REPORT.md` — **40/40** live tests passed.
