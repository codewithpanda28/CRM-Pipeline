# AUTOMATION_ENGINE.md — ThinkAIQ Advanced AI-Powered Automation

## 1. Vision

ThinkAIQ Automation is **not** a normal CRM “workflow checkbox.”

It is one of the **most powerful and easiest-to-use** platform components: a no-code + AI-assisted engine that lets non-technical business users automate complex, cross-module operational processes.

**From:** “CRM mein kuch actions automatic karwao”  
**To:** “Business ka repetitive kaam system ko de do.”

**Differentiator:** Automation is a primary reason customers choose ThinkAIQ and upgrade plans.

Governed by [MASTER_PRINCIPLES.md](../product/MASTER_PRINCIPLES.md): automate as much as safely possible; HITL for risky actions; never silent AI publish.

Module code: `automation` · Priority: **P1** core · AI/discovery features **P2/P3** · Marketplace **P3**

Related: [ADR-004](../decisions/ADR-004-automation-execution-model.md), [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md), [BACKGROUND_JOBS.md](../operations/BACKGROUND_JOBS.md), [USAGE_METERING.md](../operations/USAGE_METERING.md).

---

## 2. Capability pillars

| Pillar | Includes |
|--------|----------|
| Simple automation | Single trigger → few actions |
| Advanced workflows | Multi-step, conditions, branches, delays, loops, parallel |
| Human control | Approvals, human-in-the-loop, manual override |
| Integrations | API requests, webhooks, fallback providers |
| Reliability | Retry, idempotency, failure paths, compensation, queues |
| Observability | Health, execution history, visual debugger, incidents |
| AI assistance | NL builder, copilot, explain, optimize, debug, discovery |
| Reuse | Templates, blueprints, cloning, marketplace (future) |
| Governance | Permissions, draft/test/publish, versioning, quotas, emergency stops |

---

## 3. Desired end-to-end experience

```
USER HAS A BUSINESS PROBLEM
        ↓
DESCRIBES WHAT THEY WANT (NL and/or visual builder)
        ↓
AI / VISUAL BUILDER UNDERSTANDS
        ↓
WORKFLOW DRAFT CREATED
        ↓
USER REVIEWS (never auto-activate AI drafts by default)
        ↓
TEST / SIMULATE
        ↓
PUBLISH
        ↓
SYSTEM RUNS (async, durable)
        ↓
MONITORS (health + analytics)
        ↓
DETECTS ERRORS
        ↓
EXPLAINS ERRORS (facts vs inference)
        ↓
SUGGESTS FIX
        ↓
RETRY / RECOVER
```

---

## 4. UX principles

### 4.1 Business-friendly language (default mode)

| Friendly | Advanced synonym |
|----------|------------------|
| When this happens | Trigger |
| Check this | Condition |
| Do this | Action |
| Wait | Delay / Wait for event |
| Ask a person | Approval / Human task |

Advanced mode may show technical terms for power users.

### 4.2 Visual clarity (not a boring developer editor)

Workflows must be readable as a story, e.g.:

```
WHEN — A new lead is created
CHECK — Lead source = Website
THEN — Assign to Sales Team
THEN — Create follow-up task
THEN — Send welcome email
WAIT — 2 days
CHECK — Lead replied?
  YES → Move to Qualified
  NO  → Send WhatsApp reminder
WAIT — 3 days
CHECK — Still no response?
  YES → Create manager task → Mark lead Unresponsive
```

Canvas: nodes/cards with WHEN / CHECK / THEN / WAIT language ([§70](#70-recommended-builder-ui)).

### 4.3 Always answer visually

1. What started this?  
2. What happened?  
3. What is happening now?  
4. What failed?  
5. Why did it fail?  
6. What data was used?  
7. What will happen next?  
8. What can I do about it?  

Users must not need raw logs for normal understanding.

---

## 5. No-code builder elements

| Element | Purpose |
|---------|---------|
| Trigger | When workflow starts |
| Condition | Check this |
| Action | Do this |
| Delay | Wait duration / until datetime |
| Branch | Multi-way splits |
| Loop | Iterate collections safely |
| Parallel path | Fan-out concurrent actions |
| Approval | Human approve/reject |
| Human task | Review / decide before continue |
| Wait for event | Pause until event or timeout |
| API request | External HTTP call |
| Webhook | Outbound webhook action |
| AI action | Controlled AI step (summarize, classify, draft — gated) |
| End | Terminal success/stop |

Drag-and-drop editing where practical; keyboard/list editing also supported.

Builder must provide: searchable triggers/actions, categories, recommended next steps, variable picker, inline validation, error hints, AI suggestions, step descriptions, dependency warnings, Test, Publish, version info.

---

## 6. Natural language automation builder

User describes intent in plain language; system generates a **draft** workflow for review.

Example input:

> "Whenever a new lead comes from the website, assign it to a salesperson, send a welcome email, create a follow-up for tomorrow, and if nobody contacts them within two days send a WhatsApp reminder."

System shows **UNDERSTOOD WORKFLOW** (trigger + numbered steps). User edits before activation.

**Hard rule:** AI-generated workflows are **never auto-activated** unless tenant explicitly enables a trusted auto-publish policy (Enterprise; audited; default off).

---

## 7. Automation Copilot

In-builder assistant that can:

- Create / modify / explain workflows  
- Add conditions & actions  
- Find missing steps & conflicting rules  
- Suggest optimizations  
- Explain failed executions  
- Convert manual processes → automation  
- Produce reusable templates  

Example: “Make sure sales people don't forget payment follow-ups.” → overdue invoice → task → notify → client reminder → wait → escalate/close paths.

Copilot may **suggest/draft only**; publish remains human-gated (see AI safety).

---

## 8. Smart workflow generation (entity-aware AI)

AI must understand ThinkAIQ entities and relationships:

Lead · Contact · Company · Client · Deal · Quote · Order · Product · Subscription · Invoice · Payment · Expense · Vendor · Task · Meeting · Ticket · User · Team · Document · Campaign · Voice Agent · Call · Usage

Relationship example:

```
Lead → Deal → Client → Subscription → Invoice → Payment
```

Generation uses entity graph + available triggers/actions + tenant enabled modules + permissions.

---

## 9. Trigger engine

### 9.1 Record triggers

Created · Updated · Deleted (where appropriate) · Restored · Field changed · Field value changed · Status/stage/owner/assignment changed

### 9.2 Business triggers

Lead qualified · Deal won/lost · Quote accepted · Invoice created/due/overdue · Payment received/failed · Subscription created/renewed/expiring/expired · Ticket created/resolved · Task overdue

### 9.3 Time triggers

Specific date/time · Recurring · Before/after event · Relative · Business days · Working hours

### 9.4 Communication triggers

Email received/opened/clicked · WhatsApp/SMS response · Call completed · Call outcome changed

### 9.5 External triggers

Inbound webhook · API event · Integration event

### 9.6 Manual triggers

Run manually · Selected records · Record page · Bulk action · Dashboard

---

## 10. Event-based architecture

Platform domain events feed the engine via transactional outbox (scalable, modular).

Examples: `lead.created|updated|qualified`, `deal.created|stage_changed|won|lost`, `invoice.created|sent|overdue`, `payment.created|failed|completed`, `subscription.created|expiring|expired`, `ticket.created|resolved`, …

Automation subscriptions bind workflow versions to event types + filters.

---

## 11. Condition engine

Operators: equals, not equals, contains, does not contain, starts/ends with, gt/lt/gte/lte, is empty / not empty, changed, changed from/to, exists / does not exist.

**Critical:** Custom fields, custom statuses, custom objects, and tenant events are first-class in conditions, actions, and variable mapping. See [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md).

Types: text, number, currency, date, boolean, status, user, team, tags, related records, custom fields.

### Advanced logic

`AND` · `OR` · `NOT` · nested groups, e.g.:

```
(Lead Source = Website AND Lead Score > 70)
OR
(Lead Source = Referral AND Deal Value > ₹50,000)
```

---

## 12. Branching & parallel paths

Binary and multi-way branches (e.g., deal value bands → different approval paths).

**Parallel:** independent actions fan-out after a step; join policy configurable (`wait_all` / `wait_any` / `continue_on_first_success` — document per action safety).

---

## 13. Delays, wait-for-event, calendar & timezone

### Delays

Seconds · minutes · hours · days · weeks · specific datetime · **business days**

Must be durable: survive restarts (scheduler + run state).

### Wait for event

Wait until payment received / client replies / task completed / field changes — with **timeout** and YES/NO paths.

### Business calendar awareness

Optional: working days/hours, weekends, holidays, tenant timezone.

### Timezone

Schedules execute in tenant timezone; locale/currency/date format from tenant settings.

---

## 14. Loops / iterators

Process collections with hard safety limits (max iterations, max runtime, circuit on runaway).

Examples: for each contact in company → notify; for each overdue invoice → collection task.

---

## 15. Record & cross-module actions

### Record actions

Create/update/delete(where permitted)/archive/restore · assign/reassign · add/remove tag · change status/stage · add note · attach document · create/complete task

### Cross-module examples

**Deal won:** Create Client → Subscription → Invoice → Send → Onboarding tasks → Notify Ops  

**Invoice overdue:** Finance task → Notify AM → Client reminder → Wait 3 days → Check payment → Escalate if unpaid

---

## 16. Communication & document actions

### Communication

Email · WhatsApp · SMS · In-app · Internal · Team/user/client · Templated messages with variables:

```
Hello {{client.name}},
Your invoice {{invoice.number}} of {{invoice.total}} is due on {{invoice.due_date}}.
```

### Documents

Generate invoice/quote/proposal/document · send · attach · store · notify

---

## 17. Approvals & human-in-the-loop

### Approvals

e.g. Discount > 20% → Manager Approval → Approved continue / Rejected stop  

Request fields: requester, record, amount, reason, deadline, approver, status, comments, history

### Human-in-the-loop (mandatory review gates)

Large refund/discount · vendor payment · account suspension · high-value deal · large credit note · sensitive export  

```
Automation → Human Review → Approve/Reject → Continue/Stop
```

---

## 18. API & webhook actions

### API request

GET/POST/PUT/PATCH/DELETE · URL · headers · auth · body · query · timeout · retry  

Response mappable into later steps.

### Webhook action

Configurable payload to external SaaS; delivery history required (align with [WEBHOOKS.md](../api/WEBHOOKS.md)).

---

## 19. Data mapping & expression system

Visual mapping between steps (prefer pickers over typing):

```
Deal Name = Lead Company Name
Deal Value = Lead Estimated Value
Owner = Lead Owner
```

Variables: `{{lead.name}}`, `{{deal.value}}`, `{{invoice.balance}}`, `{{current_date}}`, …

Safe transforms: format date/currency, text transforms, math, condition eval.

**No unrestricted arbitrary code execution by default.**

---

## 20. Templates, blueprints & marketplace

### Template library (P1/P2)

Categories: Sales · Finance · Customer Success · Support · HR · Marketing  

Examples: new lead follow-up, invoice reminder, overdue escalation, welcome/onboarding, ticket SLA, etc. — all customizable.

### Blueprints (opinionated multi-step packs)

Lead Management · Sales · Finance · Customer Success (full process skeletons).

### Marketplace (P3)

Browse · install · preview · duplicate · customize · enable/disable · future paid templates.  
Super Admin controls cross-tenant template availability.

---

## 21. AI optimization, explanation, debugging & discovery

### Optimize

AI analyzes workflow and suggests improvements **with WHY**. Never silently modifies production workflows.

### Explain

Plain-language explanation (including Hindi/English mix UX if tenant prefers): “Ye automation kya kar raha hai?”

### AI debug

On failure: failed step, input, error, **likely** cause, affected record, retry status, next action.  
Must label **Known fact** vs **Likely inference** — no fake certainty.

### Smart suggestions (opt-in)

Detect repetitive manual ops → “Automate this?” → draft workflow.

### Process mining / automation discovery (P3)

Mine activity patterns → propose automations (transparent, opt-in).

### AI safety

AI may suggest/draft/explain/optimize/generate.  
Critical actions (money movement, refunds, credit notes, user deletion, tenant suspension, destructive external APIs, bulk delete) require **explicit authorization** / human gates.

---

## 22. Health, history, visual debugger

### Workflow health

States: Healthy · Warning · Failed · Disabled · Paused · Degraded  

Metrics: success/failure rate, avg duration, runs, last run/failure, retries, error count.

### Execution history (trace)

Every run: trigger → step timestamps → ✅/❌/⏸ → retries → final status. Inspect each step.

### Visual debugger

Highlight failed node; click for input, variables, request/response, error, retry history, timestamp, integration, related record.

---

## 23. Automation Incident Center (Super Admin)

Failures integrate with [PLATFORM_OPS_CENTER.md](../operations/PLATFORM_OPS_CENTER.md):

```
INCIDENT #A-19482
Tenant: Acme · Workflow: Invoice Reminder · Severity: Critical
Failures: 187 · Affected: 187 invoices
Root Cause: External email provider timeout
Suggested action: Retry failed executions
```

Tenant dashboard + Super Admin platform automation dashboard required (§57–59).

---

## 24. Reliability: retry, idempotency, failure paths, fallback, transactions

### Retry

Configurable: none / N times / exponential backoff / custom delay.  
Retry **only** safe-to-retry errors. Never blindly retry irreversible actions.

### Idempotency / duplicate protection

Duplicate payment/webhook/events must not create duplicate invoices/records/notifications. Recognize → ignore → log.

### Failure handling paths

`On Success` · `On Failure` · `On Timeout` · `On Retry Exhaustion` (e.g., notify admin + create task).

### Fallback actions

WhatsApp Provider A → B → Email if still failed (configurable).

### Transaction safety

Prefer atomic units where possible. If full rollback impossible → compensating actions + clearly visible inconsistent/partial state in debugger.

---

## 25. Scheduling, bulk runs, quotas, packaging

### Scheduled automation

One-time · daily/weekly/monthly · custom recurring · cron-like for advanced users  
Examples: every Monday 9 AM; 7 days before subscription expiry.

### Bulk automation

Select many records → run approved workflow → background jobs + progress UI.

### Quotas (metered)

Workflow count · monthly executions · API actions · webhooks · AI generations · log retention  

Warnings at 80%/90%; block or overage at 100% per plan.

### Plan packaging (premium differentiator)

| Tier | Automation posture |
|------|--------------------|
| Basic | Simple workflows, limited executions, basic triggers/actions |
| Business | Multi-step, conditions, delays, webhooks, advanced comms |
| Professional | Branching, API actions, approvals, high limits, analytics, AI generation |
| Enterprise | Custom/unlimited policies, advanced AI, custom integrations, priority execution, emergency controls, services |

See [PRODUCT_PACKAGING.md](../product/PRODUCT_PACKAGING.md), [BILLING_SUBSCRIPTION.md](../modules/BILLING_SUBSCRIPTION.md).

### Cost awareness

Track AI/voice/SMS/WhatsApp/email/API costs per tenant → workflow → execution; integrate with usage billing where applicable.

---

## 26. Permissions & lifecycle

### Permissions

`view` · `create` · `edit` · `publish` · `disable` · `execute` · `debug` · `view_logs` · `manage_integrations` · `manage_ai` · `approve_production`

Not every user may create powerful automations.

### Lifecycle

```
Draft → Test → Review → Published → Paused → Archived
```

Created ≠ production-active.

### Test mode & simulator

Test run shows trigger data, variables, condition results, actions, API responses, final result.  
Simulator against real/test record; **no real external messages** unless explicitly authorized.

### Versioning & change history

v1…vn: view, compare, restore, publish, who/when/what changed; audit trail.

### Clone & share

Duplicate workflows; share within tenant/team; template export. Cross-tenant templates gated by Super Admin.

---

## 27. Search, analytics, dashboards

### Search

By name, trigger, module, action, owner, status, failure rate — e.g. “invoice workflows that failed this week.”

### Analytics

Executions success/fail rates, duration, most-used/failed workflows & actions, API/webhook failures, AI usage.

### Tenant dashboard

Active workflows · executions · success rate · failures · pending/scheduled jobs · API/webhook calls · usage.

### Super Admin dashboard

Platform totals, critical failures, top failing tenants/integrations, AI automation usage, visual health by tenant (Healthy/Warning/Critical) with drill-down.

---

## 28. Event replay, manual override, emergency controls

### Replay

Authorized replay of supported events after fix; must not duplicate irreversible ops.

### Manual override (audited)

Pause · skip step · retry step · restart from step · cancel · continue · mark step successful (constrained).

### Emergency (Super Admin, strongly protected + audited)

Pause all workflows · pause category · pause tenant automations · disable integration · disable webhook processing · stop retry storms.

---

## 29. Rate limiting, concurrency, queue, observability

- Limits: per workflow / tenant / integration / user / global  
- Concurrency control against duplicate financial/record creates  
- Queue states: Queued · Running · Waiting · Retrying · Completed · Failed · Cancelled — visible in Super Admin  
- Observability fields: execution id, workflow id, tenant id, trigger, timestamps, duration, status, current step, errors, retries, external calls  

---

## 30. Security model

Automation runs with proper **tenant + permission context**. Background execution **must not bypass** RBAC, record access, integration permissions, rate limits, or plan limits.

See [SECURITY.md](../security/SECURITY.md), [RBAC_PERMISSIONS.md](../security/RBAC_PERMISSIONS.md).

---

## 31. Automation API & external events

API (scoped): create/enable/disable/run workflow · get workflow/execution · retry · logs.

External apps subscribe via webhooks to ThinkAIQ events (`deal.won` → client SaaS) — platform-as-infrastructure.

---

## 32. Quality checker (pre-publish)

Validate: missing fields · impossible conditions · circular graphs · infinite loop risk · missing permission/integration/credentials/variables · duplicate action risk · unsafe destructive actions · rate-limit risk.  
Clear warnings; block publish on critical issues.

---

## 33. Execution model (technical)

**Async durable runs** (ADR-004): outbox → run row → checkpointed steps → delays via scheduler → version pinning for in-flight runs.

Idempotency keys on side-effecting actions. Compensating transactions where rollback impossible.

---

## 34. Data model (summary)

Extend core tables:

`workflows` · `workflow_versions` · `workflow_triggers` · `workflow_steps` (graph JSON + typed nodes) · `workflow_runs` · `workflow_run_steps` · `workflow_run_variables` · `workflow_approvals` · `workflow_templates` · `workflow_template_installs` · `workflow_ai_sessions` · `workflow_health_rollups` · `automation_usage_costs` · `automation_suggestion_events`

Full columns: [DATABASE_SCHEMA.md](../database/DATABASE_SCHEMA.md).

---

## 35. APIs (illustrative)

Tenant:

- `GET/POST /workflows`, publish, pause, clone, versions, test-run, simulate  
- `POST /workflows/ai/generate`, `POST /workflows/ai/explain`, `POST /workflows/{id}/ai/optimize`  
- `GET /workflow-runs`, `POST /workflow-runs/{id}/retry|cancel|override`  
- `GET /automation/analytics`, `GET /automation/templates`  

Platform:

- Super Admin automation dashboards & emergency controls under `/platform/ops/automations/*`

---

## 36. Events emitted by automation module

`workflow.published` · `workflow.paused` · `workflow_run.started|succeeded|failed` · `workflow_run.step_failed` · `automation.quota_warning` · `automation.suggestion_created` · `automation.emergency_paused`

---

## 37. Notifications

Workflow failed · approval requested · human review pending · quota warnings · AI draft ready · Super Admin critical automation incidents

---

## 38. Edge cases

- Tenant suspended mid-wait → pause run  
- Module disabled mid-run → fail gracefully with clear reason  
- Parallel race on same record → optimistic locking / serializable section  
- Provider partial success → fallback path + debugger clarity  
- NL ambiguity → ask clarifying questions; never invent destructive steps  

---

## 39. Testing requirements

- Graph validation & loop guards  
- Idempotent payment/webhook double-delivery  
- Durable delay across worker restart  
- Permission denial in background context  
- Test mode does not send real WhatsApp/email unless forced  
- AI draft never auto-publishes (default)  
- Emergency pause stops new starts and optionally in-flight per policy  

---

## 40. Phased delivery

| Phase | Scope |
|-------|-------|
| P1a | Event triggers, conditions, actions, delay, branch, history, retry, versioning, test mode, quotas basics |
| P1b | Visual canvas UX, templates/blueprints v1, approvals, wait-for-event, parallel, bulk run |
| P2 | NL builder, Copilot, explain/optimize/debug AI, visual debugger polish, simulator, health scores, cost tracking |
| P3 | Process mining, marketplace, advanced discovery, priority execution tiers |

---

## 41. Final objective checklist

Automation must enable complete operational processes across CRM, sales, finance, billing, support, team, and communication — visually understandable, AI-assisted, reliable, governable, and commercially packaged as a premium ThinkAIQ differentiator.
