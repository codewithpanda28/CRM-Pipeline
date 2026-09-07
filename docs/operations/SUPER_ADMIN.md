# SUPER_ADMIN.md — ThinkAIQ

## 1. Purpose

Define the **ThinkAIQ Super Admin** — platform owner control plane for:

1. **Commercial & tenant administration** (create/suspend tenants, plans, modules, billing, white-label)
2. **Visual platform observability & incident control** (tenant/module health, errors, incidents, timelines, root cause, affected records, automation/integration failures, recovery actions)

Super Admin is a **mission-control console**, not a boring tenant CRUD screen.

**Hard rule:** Tenant Admin/Owner never receives Super Admin capabilities or the ops center.

Deep UX/data/API spec: [PLATFORM_OPS_CENTER.md](./PLATFORM_OPS_CENTER.md).

---

## 2. User roles involved

| Role | Scope |
|------|-------|
| Super Admin | Entire platform — admin + ops center |
| Platform Operator (optional sub-role) | Ops view + limited recovery; no billing/plan destroy |
| Tenant Owner/Admin | Single tenant only |

---

## 3. Capabilities

### 3.1 Tenant & commercial administration

1. Create tenants  
2. Suspend / activate tenants  
3. Create and manage plans  
4. Manage global module catalog  
5. Enable/disable features (platform flags) and tenant module entitlements  
6. Define / override tenant limits  
7. Manage platform users (Super Admins / operators)  
8. Monitor usage across tenants  
9. View platform commercial analytics (MRR, ARR, churn, adoption)  
10. Manage platform-level billing (ThinkAIQ ← tenants)  
11. Manage white-label settings during/after provision  
12. Inspect audit logs (platform + break-glass tenant audit views)  
13. Manage domain/platform DNS related operational tools  
14. Impersonation: **not default**; if ever added, must be explicit, time-boxed, audited (ADR required before shipping)

### 3.2 Observability & incident control (required)

15. **Platform Pulse** — live Healthy / Degraded / Critical signal  
16. **Tenant health** — per-tenant error/latency/jobs/automations/integrations/usage/domain health  
17. **Module health** — platform-wide and per-tenant module status / heatmaps  
18. **Error explorer** — fingerprinted groups, samples, correlation IDs  
19. **Incidents** — open/ack/mitigate/resolve with severity and blast radius  
20. **Event timelines** — correlated platform event river  
21. **Root cause workspace** — category, evidence, operator notes  
22. **Affected records** — entity blast radius with masked PII + audited deep links  
23. **Automation failure lane** — cross-tenant failed runs + retry/cancel/disable  
24. **Integration health** — provider status, circuits, retests  
25. **System activity** — requests, jobs, events, auth anomalies  
26. **Recovery actions** — retry jobs, replay webhooks, pause/resume tenant jobs, open/close circuits, drain DLQ (all audited)

---

## 4. User flows

### 4.1 Create tenant (canonical)

1. Enter tenant name + slug  
2. Select plan  
3. Select modules (constrained by plan)  
4. Configure branding  
5. Configure domain/subdomain  
6. Create Tenant Owner (name, email, temp password / invite)  
7. Confirm → provision job runs  
8. Tenant Ready dashboard link  
9. Provision failures appear as **ops incidents** automatically  

### 4.2 Suspend tenant

1. Select tenant → Suspend → reason required  
2. Status → Suspended  
3. Sessions revoked  
4. Workers pause non-essential jobs  
5. Audit + notify tenant owner email  
6. Incident/timeline event recorded in ops center  

### 4.3 Plan change

1. Upgrade/downgrade plan  
2. Recompute entitlements & limits  
3. If downgrade removes modules: block or schedule disable with warning  
4. Emit `tenant.plan_changed`  

### 4.4 Incident response (canonical ops flow)

1. Platform Pulse shows Degraded/Critical or incident river item  
2. Open incident → review timeline, error group, tenants, modules  
3. Inspect affected records + automation/integration failures  
4. Set root cause  
5. Execute recovery action(s)  
6. Confirm signals recover → resolve with note  

---

## 5. Business rules

- Slug unique globally  
- Cannot delete Active tenant with data without cancellation + retention flow  
- Module enable requires module in catalog and plan (or audited override)  
- Limit overrides auditable  
- Destructive billing ops: dual confirmation recommended  
- Ops recovery actions always audited + written to incident timeline  
- PII masked in ops views by default  
- Auto-incidents dedupe by fingerprint while open  
- Partial telemetry outage ⇒ status Unknown, never fake Healthy  

---

## 6. Platform analytics (commercial)

- Total / Active / Trial / Expired tenants  
- MRR, ARR, Churn  
- New tenants & growth  
- Plan distribution  
- Revenue  
- Usage aggregates  
- Module adoption  
- API usage  
- Automation usage  

Commercial analytics complement — **do not replace** — Platform Pulse.  
See [REPORTING_ANALYTICS.md](../modules/REPORTING_ANALYTICS.md), [PLATFORM_OPS_CENTER.md](./PLATFORM_OPS_CENTER.md).

---

## 7. Data model (platform-scoped)

**Admin:** `platform_users`, `tenants`, `plans` / prices / entitlements, `modules`, `tenant_modules`, `tenant_limits`, `platform_subscriptions` / invoices, `audit_logs`

**Ops:** `platform_error_groups`, `platform_error_events`, `platform_incidents`, `platform_incident_*`, `platform_health_snapshots`, `platform_integration_health`, `platform_ops_alerts`, `tenant_job_controls`

See [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md) and [PLATFORM_OPS_CENTER.md](./PLATFORM_OPS_CENTER.md).

---

## 8. Permissions

Namespace: `platform.*`

Admin examples:

- `platform.tenants.manage`
- `platform.plans.manage`
- `platform.modules.manage`
- `platform.billing.manage`
- `platform.analytics.view`
- `platform.audit.view`
- `platform.users.manage`

Ops examples:

- `platform.ops.view`
- `platform.ops.incidents.manage`
- `platform.ops.recover`
- `platform.ops.telemetry.view`

Tenant RBAC permissions are never granted into this namespace.

---

## 9. APIs (platform)

Prefix: `/api/v1/platform/...`

- Tenants, plans, modules, entitlements, usage, billing, audit  
- Ops: `/platform/ops/pulse`, health, errors, incidents, timeline, automation failures, integration health, recovery actions  
- Optional realtime: SSE/WebSocket `platform.ops`

Auth: Super Admin (or Platform Operator) session; **MFA strongly recommended (P1)**.

---

## 10. Notifications

**Commercial / lifecycle:** tenant provisioned, suspended/activated, payment failed, usage anomalies, domain/SSL failures  

**Ops:** Critical/High incident opened, unacknowledged SLA breach, integration down, queue/DLQ critical, provision job failed, recovery action failures  

---

## 11. Audit requirements

All Super Admin mutations and **all recovery actions** audited with actor, target tenant(s), before/after or action payload summary, IP, user agent. Incident timeline mirrors recovery events.

---

## 12. Edge cases / errors

- Provisioning failure mid-seed → compensating retry + auto-incident  
- Plan deletion while tenants subscribed → forbid  
- Module disable globally → cascade policy required  
- Error storms → aggregate; do not flood incident river 1:1  
- Metrics lag → show “as of” timestamp  

---

## 13. UI quality bar

- Entry = Platform Pulse (visual control room), not a spreadsheet of tenants  
- Tenant management is a major section, not the only home  
- Intentional motion for health/incidents only  
- Super Admin chrome is platform-branded (**ThinkAIQ** / **ThinkAIQ CRM**); never tenant white-label theming — [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md)  

---

## 14. Related documents

- [PLATFORM_OPS_CENTER.md](./PLATFORM_OPS_CENTER.md)  
- [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md)  
- [OBSERVABILITY.md](./OBSERVABILITY.md)  
- [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md)  
- [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md)  
- [USAGE_METERING.md](./USAGE_METERING.md)  
- [AUDIT_LOG.md](../security/AUDIT_LOG.md)  
- [RBAC_PERMISSIONS.md](../security/RBAC_PERMISSIONS.md)  
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)  
- [INTEGRATIONS.md](../integrations/INTEGRATIONS.md)  
