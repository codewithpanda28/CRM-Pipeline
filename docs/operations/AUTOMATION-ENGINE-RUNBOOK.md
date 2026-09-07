# Automation Engine Runbook (v2 — Round 1)

**Status:** Operational  
**Date:** 2026-09-06  
**Scope:** Durable workflows + ADR-027 approvals (`@vencore/automation-engine`)  
**Does not cover:** PM project automations · pipeline automations · Voice/WhatsApp runtime · AI drafts

---

## 1. Architecture reminder

```text
Postgres (SoR) → outbox → BullMQ (dispatch only) → automation.event.dispatch / automation.run.advance
```

**Queue messages are never approval.** Class B executes only after `automation_approvals.status = authorized` and `validateForExecution` passes (payload snapshot + hash).

---

## 2. Feature flags (per tenant)

Stored in `tenant_settings.settings.automation`:

| Key | Default | Meaning |
|-----|---------|---------|
| `engine_v2_enabled` | `false` | Master switch — when false, **zero** v2 runs |
| `engine_v2_dispatch` | `[]` | Allowlist of canonical event names |
| `engine_v2_self_approval` | `false` | Allow requester to authorize own approval |

API: `GET/PATCH /api/automation/flags` (`automation:admin`).

With v2 disabled: PM + pipeline automation behavior unchanged.

---

## 3. Pause / resume

| Action | API | Permission |
|--------|-----|------------|
| Pause run | `POST /api/automation/runs/:id/pause` | `automation:admin` |
| Resume run | `POST /api/automation/runs/:id/resume` | `automation:admin` |

Also: tenant `tenant_job_controls.jobs_paused` blocks **all** tenant-scoped jobs (including v2) via worker gate.

---

## 4. Replay

`POST /api/automation/runs/:id/replay` (`automation:runs:replay`)

- Re-queues `automation.run.advance`
- **Does not** authorize approvals
- Class B still requires valid authorized approval or re-enters `awaiting_approval`

---

## 5. Dead letters (DLQ)

Table: `automation_dead_letters`

- Written when step attempts exhausted
- Run status → `dead_lettered`
- Inspect via SQL or future UI; resolve by fixing cause + `replay` (and new approval if needed)
- Audit: `automation.dead_letter`

---

## 6. Approval troubleshooting

| Symptom | Check |
|---------|--------|
| Stuck `awaiting_approval` | Row in `automation_approvals` pending? Inbox `GET /api/automation/approvals` |
| Authorize 403 SELF_APPROVAL | Flag `engine_v2_self_approval` or use different approver |
| Execute blocked after approve | `validateForExecution` — status/expiry/revoked/hash/tenant/version/step |
| Payload tamper | `payload_hash` must equal SHA-256 of `requested_payload_snapshot` |
| Expired | `automation.approval.timeout` job; status `expired` |

Authorize: `POST /api/automation/approvals/:id/authorize`  
Reject: `POST /api/automation/approvals/:id/reject`  
Revoke (pre-execute): `POST /api/automation/approvals/:id/revoke`

---

## 7. Failed runs

1. `GET /api/automation/runs/:id` — inspect steps + errors
2. Check outbox failed via `ops:jobs` if dispatch never ran
3. Replay only after understanding failure
4. Never set `job.data.approved=true` as a workaround — executor ignores it

---

## 8. Tenant isolation

- All tables require `tenant_id`
- APIs scope by `workspace.id`
- Matcher rejects mismatched envelope tenant
- Actions verify assignee/user `workspace_id === tenantId`
- Cross-tenant IDs → 404/403

---

## 9. Jobs

| Job | Role |
|-----|------|
| `automation.event.dispatch` | Match triggers → create runs |
| `automation.run.advance` | Checkpointed step execution |
| `automation.approval.timeout` | Expire pending approvals (recurring 60s) |
| `automation.pm.evaluate` / `automation.pipeline.evaluate` | **Legacy — unchanged** |

---

## 10. Related

- ADR-027 · Phase 6 Architecture Contract · Round 1 Plan / Implementation Report
