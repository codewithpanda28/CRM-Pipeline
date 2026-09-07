# PLATFORM_OPS_CENTER.md — ThinkAIQ Super Admin Observability & Incident Control

## 1. Purpose

Super Admin is **not** only a tenant CRUD console.

It is the **visual platform observability and incident-control center** for ThinkAIQ — a live operations surface where platform owners see tenant health, module health, errors, incidents, event timelines, root causes, affected records, automation failures, integration status, system activity, and recovery actions.

**Positioning:** Mission-control for the multi-tenant platform.  
**Audience:** Super Admin / Platform Operator only. Tenant admins never get this plane.  
**Priority:** **P0** foundation shell + **P1** deep incident tooling (phased).

Related: [SUPER_ADMIN.md](./SUPER_ADMIN.md), [OBSERVABILITY.md](./OBSERVABILITY.md), [ERROR_HANDLING.md](../api/ERROR_HANDLING.md).

---

## 2. Product principle

| Boring admin anti-pattern | ThinkAIQ ops center |
|---------------------------|---------------------|
| Static tables of tenants | Live health map + signals |
| Log dump pages | Correlated incident narratives |
| Separate tools for errors/jobs/webhooks | One control room with drill-down |
| “Something failed” toast | Root cause · blast radius · recovery actions |

Commercial analytics (MRR/ARR) remain available, but **operational health is a first-class Super Admin job**, not a side panel.

---

## 3. User roles

| Role | Access |
|------|--------|
| Super Admin | Full ops center + recovery actions |
| Platform Operator (optional) | View health/incidents; limited recovery (retry jobs, acknowledge alerts) |
| Tenant Admin | **No access** (may see tenant-scoped product errors only inside their app) |

Permissions namespace additions:

- `platform.ops.view`
- `platform.ops.incidents.manage`
- `platform.ops.recover` (retry, replay, circuit break, resume)
- `platform.ops.telemetry.view`
- `platform.analytics.view` (commercial; existing)

---

## 4. Primary UX composition (visual, not boring)

### 4.1 Home: Platform Pulse

First viewport = **one composition: Platform Pulse** (this *is* a dashboard — intentional).

Visual blocks (not a card farm of stats strips):

1. **Global signal strip** — overall status: Healthy / Degraded / Critical (color + motion pulse)
2. **Tenant health constellation** — interactive map/grid of tenants sized by activity, colored by health
3. **Incident river** — live vertical timeline of open incidents (severity)
4. **System heartbeat** — API latency, queue depth, worker lag, error rate sparkline (one chart cluster)
5. **Security health lane** — failed logins, suspicious API, session anomalies, credential events (never claim unearned certifications)
6. **Primary CTA group** — Active incidents · Failing automations · Degraded integrations

Motion (2–3 intentional):

- Soft status pulse on Critical/Degraded
- Incident river items slide in on new events
- Constellation nodes gently breathe on elevated error rate

Avoid: purple glow clichés, emoji storms, endless KPI pills, detached floating badges on charts.

### 4.2 Drill-down hierarchy

```
Platform Pulse
  → Tenant Health detail
  → Module Health detail
  → Incident detail (root cause + blast radius + recovery)
  → Event timeline / trace
  → Affected records
```

Everything clickable toward **cause → impact → fix**.

---

## 5. Capability surfaces

### 5.1 Tenant health

Per tenant show:

| Signal | Examples |
|--------|----------|
| Status | Healthy · Warning · Degraded · Critical · Suspended |
| Error rate | 5m / 1h / 24h |
| API latency p95 | Tenant-scoped |
| Job failure rate | Imports, PDFs, webhooks |
| Automation failure count | Open failed runs |
| Integration health | Email/WhatsApp/payment/storage |
| Usage pressure | Near limit / over limit |
| Domain/SSL | Active · expiring · failed |
| Last incident | Link |
| Activity level | Requests, events/min |

Actions from tenant health drawer:

- Open incidents for tenant
- Pause non-essential jobs (tenant)
- Suspend/activate tenant (existing flow)
- View audit slice
- Replay/retry failed jobs (scoped)

### 5.2 Module health

Global and per-tenant module status for: `crm`, `sales`, `finance`, `automation`, `communications`, `voice_ai`, etc.

Signals:

- Error rate by module
- Dependency failures (e.g., finance PDF worker down)
- Entitlement anomalies (enabled but provider missing)
- Circuit breaker state (open/half-open/closed) when used

Visual: module matrix heatmap (tenants × modules) or module radar for platform-wide.

### 5.3 Errors

Unified error explorer (not raw log paste):

- Fingerprinted error groups (message hash + stack top + module)
- Count, first/last seen, affected tenants, affected users
- Sample traces with `request_id` / `correlation_id`
- Link to incident (auto-open when threshold breached)

### 5.4 Incidents

An **incident** is a first-class platform object.

#### Fields

| Field | Description |
|-------|-------------|
| `incident_id` | Human + UUID |
| `severity` | critical / high / medium / low |
| `status` | open / acknowledged / mitigating / resolved / closed |
| `title` | Short summary |
| `summary` | Operator-facing narrative |
| `started_at` / `resolved_at` | |
| `tenant_ids[]` | Blast radius |
| `module_codes[]` | |
| `error_group_id` | Fingerprint link |
| `root_cause` | Structured + free text |
| `root_cause_category` | code_bug, provider_outage, config, limit, dependency, unknown |
| `affected_record_refs[]` | Polymorphic entity refs |
| `timeline[]` | Event stream |
| `recovery_actions[]` | Taken / available |
| `assignee` | Platform user |
| `source` | auto_rule / manual |

#### Auto-incident rules (examples)

- Error group count > N in M minutes across ≥1 tenants
- Automation failure spike
- Webhook DLQ growth
- Integration provider consecutive failures
- Queue lag SLO breach
- Domain/SSL failure for active custom domains
- Tenant provision job failed

### 5.5 Event timelines

Unified platform event timeline combining:

- Auth anomalies
- API errors
- Job failures / completions
- Automation run failures
- Webhook delivery failures
- Integration health flips
- Tenant status changes
- Deploy markers (when CI posts)
- Manual operator notes

Filters: tenant, module, severity, type, time range.  
Each item deep-links to detail + correlation id.

### 5.6 Root cause workspace

Incident detail includes a **Root Cause** panel:

1. Suspected category (rule/heuristic + operator override)
2. Top stack / provider response codes
3. Recent deploys / config changes (if available)
4. Correlated failing dependency
5. “Why this tenant?” hints (limit hit, bad credentials, bad domain)

Operators can set root cause; changes audited.

### 5.7 Affected records

Blast radius list with safe previews:

- Entity type + id + tenant
- Last error message (redacted secrets)
- Deep link into break-glass tenant record view (**audited**, read-only by default)
- Count of users impacted (approx)

Never dump secrets, raw credentials, or full PII unnecessarily — mask emails/phones in ops views by default; reveal is explicit + audited.

### 5.8 Automation failures

Dedicated lane (feeds Automation Incident Center — see [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)):

- Failed / stuck workflow runs across tenants
- Step that failed, retry count, next retry
- One-click **Retry from failed step** / **Cancel run** / **Disable workflow** / **Replay event** (tenant-scoped, audited)
- Trend: most failing workflows platform-wide
- Suggested actions from root cause (e.g., provider timeout → retry storm stop + circuit)
- Emergency: pause tenant or global automations (`platform.ops.recover`)

### 5.9 Integrations

Platform integration radar:

- Per provider / per tenant install health: OK · Degraded · Down · Misconfigured
- Latency & failure %
- Last success
- Actions: retest connection, rotate alert, open incident, disable outbound temporarily (circuit)

### 5.10 System activity

Live activity feed + volume charts:

- Requests/min
- Jobs processed
- Events emitted
- Sign-ins / failed logins
- Provisioning jobs
- Metering spikes

### 5.11 Recovery actions / “Fix it”

First-class **recovery playbook actions** in UI (permission `platform.ops.recover`):

| Action | Effect | Guardrails |
|--------|--------|------------|
| Acknowledge incident | Status → acknowledged | Audit |
| Retry background job | Re-queue | Idempotency key |
| Retry automation run | Resume step | Version pin |
| Replay webhook / event | New attempt | Idempotent; SSRF rules |
| Retry failed jobs (bulk) | Scoped batch | Confirm + rate limit |
| Pause tenant jobs / automations | Stop non-essential | Reason required |
| Resume tenant jobs | Clear pause | Audit |
| Disable workflow | Tenant workflow off | Confirm |
| Open/close integration circuit | Block/resume outbound | Health check on close |
| Reconnect integration | Launch re-auth | Tenant-scoped |
| Suspend tenant | Existing flow | Reason |
| Drain DLQ item | Retry or discard | Discard needs confirm |
| View tenant / record / logs | Drill-down | PII masked; break-glass audited |
| Create ops task / escalate | Human follow-up | — |
| Mark resolved | Require root cause note | Facts vs inference |

Every recovery action writes audit + incident timeline entry. Sensitive actions require confirmation.

### 5.12 “Why did this happen?”

Every incident includes a human-readable explanation, e.g.:

> "The workflow failed because the WhatsApp provider did not respond within the configured timeout. Two retries were attempted. 23 lead follow-ups were affected."

Must distinguish **Confirmed facts** · **Likely cause** · **Unknown** — never invent certainty. Root Cause Explorer visually shows Trigger → Condition → Action → Integration → Response → Retry → Failure.

---

## 6. User flows

### 6.1 Detect → diagnose → recover

1. Platform Pulse turns Degraded; incident appears in river  
2. Operator opens incident → timeline + error group + tenants  
3. Views affected records + failing automation/integration  
4. Sets root cause category  
5. Executes recovery (retry / circuit / pause)  
6. Watches signals return to Healthy  
7. Resolves incident with note  

### 6.2 Tenant-centric investigation

1. Click tenant node in constellation  
2. Health drawer shows modules + recent errors  
3. Jump to automation failures for that tenant  
4. Retry or escalate to suspend if abusive/failing hard  

### 6.3 Module outage

1. Module heatmap shows `communications` red  
2. Integration panel shows WhatsApp provider down  
3. Auto-incident groups tenants on that provider  
4. Open circuit → notify affected tenant owners (optional template)  
5. Provider recovers → close circuit → resolve  

---

## 7. Business rules

- Ops data is platform-scoped; tenant PII minimized/masked
- Auto-incidents dedupe into existing open incident when fingerprint matches
- Critical incidents page Super Admins (email/WhatsApp/in-app platform alerts)
- Recovery actions fail closed on missing permission
- Read-only break-glass record view is optional Phase 1; if enabled, always audited
- Commercial analytics widgets may appear secondary — never replace Pulse

---

## 8. Data model (additions)

| Table | Purpose |
|-------|---------|
| `platform_error_groups` | Fingerprinted errors |
| `platform_error_events` | Samples / counts rollup |
| `platform_incidents` | Incident header |
| `platform_incident_tenants` | Blast radius |
| `platform_incident_events` | Timeline entries |
| `platform_incident_affected_records` | Entity refs |
| `platform_incident_actions` | Recovery actions log |
| `platform_health_snapshots` | Periodic tenant/module health |
| `platform_integration_health` | Provider health per tenant |
| `platform_ops_alerts` | Alert rules & firings |
| `tenant_job_controls` | pause flags etc. |

Health may also be computed from metrics backend (Prometheus etc.) with DB snapshots for history.

Extend [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md) accordingly.

---

## 9. APIs (platform)

Prefix: `/api/v1/platform/ops/...`

| Endpoint | Purpose |
|----------|---------|
| `GET /pulse` | Aggregated Platform Pulse payload |
| `GET /tenants/health` | Tenant health list/map data |
| `GET /tenants/{id}/health` | Detail |
| `GET /modules/health` | Module matrix |
| `GET /errors` | Error groups |
| `GET /errors/{id}` | Group detail + samples |
| `GET /incidents` | List/filter |
| `POST /incidents` | Manual create |
| `GET /incidents/{id}` | Detail + timeline + affected |
| `POST /incidents/{id}/acknowledge` | |
| `POST /incidents/{id}/resolve` | |
| `POST /incidents/{id}/actions` | Execute recovery action |
| `GET /timeline` | Global event timeline |
| `GET /automations/failures` | Cross-tenant failures |
| `POST /automations/runs/{id}/retry` | |
| `GET /integrations/health` | |
| `POST /integrations/{tenantId}/{code}/circuit` | open/close |
| `GET /activity` | System activity series |

Realtime: WebSocket or SSE channel `platform.ops` for pulse + incident river (P1).

---

## 10. Events & automation (platform-internal)

| Event | Use |
|-------|-----|
| `ops.error_threshold_breached` | Open/update incident |
| `ops.incident.opened` | Alert Super Admins |
| `ops.incident.resolved` | Notify subscribers |
| `ops.integration.down` | Circuit suggestions |
| `ops.automation.failure_spike` | Incident rule |
| `ops.recovery.executed` | Audit + timeline |

---

## 11. Notifications

Platform operator alerts:

- New Critical/High incident
- Incident unacknowledged > SLA minutes
- Integration down
- Queue/DLQ critical
- Domain/SSL failures
- Tenant provision failures

Channels: in-app Super Admin + email; optional WhatsApp for Critical.

---

## 12. Validation & edge cases

- Metrics delay → show “data as of” timestamp; never fake live
- Multi-tenant blast radius pagination
- Noisy error storms → aggregation + rate-limited river
- Partial telemetry outage → Pulse shows Unknown, not Healthy
- Recovery action partial failure → incident event with error; do not mark resolved automatically

---

## 13. Reporting impact

- MTTA / MTTR dashboards
- Incidents by module / provider
- Top failing automations
- Tenant reliability score history
- Complements commercial analytics in [REPORTING_ANALYTICS.md](../modules/REPORTING_ANALYTICS.md)

---

## 14. Non-functional

| NFR | Requirement |
|-----|-------------|
| Performance | Pulse payload cheap (pre-agg snapshots); drill-down on demand |
| Security | Platform auth + MFA; mask PII; audit recovery |
| Retention | Error samples shorter; incident records longer |
| Extensibility | Modules register health probes + error namespaces |

---

## 15. Phased delivery

| Phase | Scope |
|-------|-------|
| P0 | Pulse shell, tenant health list, error groups, basic timeline, job retry |
| P1 | Incidents object, automation failure lane, integration health, recovery actions, SSE |
| P2 | Heatmaps, constellation viz polish, MTTA/MTTR, smarter root-cause hints |
| P3 | Predictive alerts, auto-runbooks, customer status page export |

---

## 16. Design quality checklist (ops UI)

- One clear Platform Pulse composition on entry
- Visual hierarchy toward incidents, not vanity KPIs
- Motion only for status/incident awareness
- Dark ops theme acceptable here (control-room), distinct from tenant white-label marketing UI
- Tenant product branding never leaks into Super Admin chrome

---

## 17. Related documents

- [SUPER_ADMIN.md](./SUPER_ADMIN.md)
- [OBSERVABILITY.md](./OBSERVABILITY.md)
- [AUTOMATION_ENGINE.md](../automation/AUTOMATION_ENGINE.md)
- [WEBHOOKS.md](../api/WEBHOOKS.md)
- [INTEGRATIONS.md](../integrations/INTEGRATIONS.md)
- [BACKGROUND_JOBS.md](./BACKGROUND_JOBS.md)
- [AUDIT_LOG.md](../security/AUDIT_LOG.md)
- [SECURITY.md](../security/SECURITY.md)
- [REQUIREMENTS_TRACEABILITY.md](../product/REQUIREMENTS_TRACEABILITY.md)
