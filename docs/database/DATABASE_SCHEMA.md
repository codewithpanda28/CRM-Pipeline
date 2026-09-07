# DATABASE_SCHEMA.md — ThinkAIQ

## 1. Purpose

Logical database schema for ThinkAIQ prior to implementation. PostgreSQL assumed (ADR-002). All tenant business tables include `tenant_id` unless marked platform-scoped.

### Conventions

| Convention | Rule |
|------------|------|
| PK | `id UUID` default `gen_random_uuid()` |
| Tenancy | Tenant-owned tables: `tenant_id UUID NOT NULL` + index. **Users are global** — see §5 (ADR-017). |
| Timestamps | `created_at`, `updated_at` timestamptz |
| Soft delete | `deleted_at timestamptz NULL` where noted |
| Actors | `created_by`, `updated_by` UUID NULL |
| Money | `NUMERIC(18,2)` + `currency CHAR(3)` |
| Enums | DB enums or check constraints; listed below |
| Naming | snake_case |
| Source of truth | ADR-017 (tenancy), ADR-018 (branding), ADR-019 (outbox), ADR-021 (platform billing vs finance) |

**Vencore migration note:** Vencore `workspaces` → `tenants`; `users.workspace_id` / any `users.tenant_id` **removed** in favor of `tenant_memberships`. Dual-read compatibility columns are a migration tactic only — not the final model.


---

## 2. Enumerations (selected)

- `tenant_status`: provisioning, active, suspended, archived, deleting  
  *(Legacy labels trial/expired/cancelled map via flags/reasons — ADR-017; do not invent parallel status enums without ADR.)*
- `membership_status`: invited, active, disabled
- `user_status`: active, invited, disabled
- `outbox_status`: pending, publishing, published, failed, dead
- `invoice_status`: draft, sent, viewed, partially_paid, paid, overdue, cancelled
- `subscription_status`: trial, active, paused, past_due, expiring, cancelled, expired
- `task_status`: pending, in_progress, completed, overdue
- `ticket_status`: open, in_progress, waiting, resolved, closed
- `channel_status`: available, assigned, expiring, expired
- `workflow_run_status`: pending, running, waiting, succeeded, failed, cancelled
- `domain_verification_status` / `ssl_status`: per ADR-005 state machine

---

## 3. Soft-delete strategy

- Soft-delete user-facing business records (leads, invoices drafts, etc.)
- Hard-delete or crypto-shred on retention expiry
- Audit logs are **not** soft-deleted (append-only)
- Unique indexes account for `deleted_at IS NULL` where needed

---

## 4. Platform tables

### 4.1 `platform_users`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | CITEXT UNIQUE | |
| password_hash | TEXT | |
| name | TEXT | |
| status | user_status | |
| mfa_enabled | BOOLEAN | |
| created_at/updated_at | timestamptz | |

### 4.2 `modules`

| Column | Type | Notes |
|--------|------|-------|
| code | TEXT PK | e.g. crm |
| name | TEXT | |
| description | TEXT | |
| is_active | BOOLEAN | global |
| dependencies | JSONB | array of codes |
| created_at/updated_at | timestamptz | |

### 4.3 `plans`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| code | TEXT UNIQUE | |
| name | TEXT | |
| description | TEXT | |
| is_active | BOOLEAN | |
| sort_order | INT | |
| created_at/updated_at | timestamptz | |

### 4.4 `plan_prices`

id, plan_id FK, currency, amount, billing_cycle, trial_days, stripe_price_ref NULL

### 4.5 `plan_modules`

plan_id, module_code, included BOOLEAN — PK (plan_id, module_code)

### 4.6 `plan_limits`

plan_id, dimension TEXT, limit_value BIGINT NULL (null=unlimited) — PK (plan_id, dimension)

### 4.7 `tenants`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Canonical `tenant_id` everywhere |
| name / display_name | TEXT | |
| legal_name | TEXT NULL | |
| slug | CITEXT UNIQUE | Subdomain key |
| status | tenant_status | ADR-017 lifecycle |
| status_reason | TEXT NULL | e.g. `subscription_expired`, `abuse` |
| plan_id | UUID FK | |
| trial_ends_at | timestamptz | |
| renews_at | timestamptz | |
| suspended_at / archived_at / provisioned_at | timestamptz NULL | |
| parent_tenant_id | UUID NULL | reseller future — reserved |
| reseller_id | UUID NULL | future — reserved |
| created_at/updated_at/deleted_at | | soft |

Indexes: status, plan_id, slug

### 4.8 Entitlements layer (`tenant_entitlements` conceptual)

Canonical storage decided as existing joins (ADR-017) — **not** a free-form second model:

| Table | Role |
|-------|------|
| `tenant_modules` | Module enablement per tenant |
| `tenant_limits` | Limit ceilings (plan + override) |

`tenant_modules`: tenant_id, module_code, enabled BOOLEAN, overrides JSONB, UNIQUE(tenant_id, module_code)

`tenant_limits`: tenant_id, dimension, limit_value, source (`plan`\|`override`), UNIQUE(tenant_id, dimension)

### 4.9 `tenant_settings`

tenant_id UNIQUE/PK, locale, timezone, structured settings JSONB (non-brand), timestamps  
Brand chrome lives in `tenant_branding` (ADR-018), not only here.

### 4.10 `tenant_branding`

tenant_id UNIQUE, brand_name, legal_name NULL, logo_file_id, favicon_file_id, primary_color, secondary_color, typography JSONB, theme JSONB (tokens), login JSONB, support JSONB, email_from_name, email_from_address, document/footer JSONB as needed, version INT (cache bust), timestamps  
Source of truth: ADR-018.

### 4.11 `tenant_domains`

id, tenant_id, host UNIQUE, type (`tenant_subdomain`\|`custom`), is_primary, verification_status, verification_token, ssl_status, created_at/updated_at  
ADR-005 / ADR-017 / ADR-018.

### 4.12 `tenant_usage` / metering

Logical entity **tenant_usage** (ADR-017) is implemented as:

`usage_counters` (tenant_id, dimension, period_start, period_end, value) UNIQUE(...)  
`usage_alerts` as needed  

Do not invent parallel counter tables without a new ADR.

### 4.13 `platform_subscriptions` / `platform_invoices` / `platform_payments`

Platform commercial billing (ThinkAIQ → Tenant). See ADR-021.  
`tenant_id` references the **customer tenant**; these are **not** tenant finance AR invoices.

### 4.14 `tenant_job_controls`

tenant_id PK, jobs_paused BOOLEAN, pause_reason, paused_by, paused_at, updated_at

---

## 5. Identity & RBAC

**Canonical (ADR-017 / ADR-020):** global users + per-tenant memberships.  
**Rejected final model:** `users.tenant_id` or Vencore `users.workspace_id` as sole tenancy binding.

### 5.1 `users` (global identity)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | CITEXT UNIQUE | Global login identity (ADR-017 policy) |
| password_hash | TEXT | |
| name | TEXT | |
| status | user_status | |
| last_login_at | timestamptz | |
| mfa_enabled | BOOLEAN | readiness; ADR-023 |
| timestamps / deleted_at | | |

**No `tenant_id` / `workspace_id` column on `users` in the final schema.**

### 5.2 `tenant_memberships`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID FK | |
| user_id | UUID FK | |
| status | membership_status | invited / active / disabled |
| is_owner | BOOLEAN | convenience; Owner role remains authz source |
| invited_by | UUID NULL | |
| joined_at | timestamptz | |
| timestamps | | |
| UNIQUE(tenant_id, user_id) | | |

### 5.3 `roles`

id, tenant_id, code, name, is_system BOOLEAN, timestamps

### 5.4 `permissions`

id, code UNIQUE, module_code, entity, verb, description

### 5.5 `role_permissions`

role_id, permission_id, scope (`all`\|`team`\|`department`\|`own`\|`shared`)

### 5.6 `membership_roles` (or `user_roles` scoped by membership)

Prefer binding roles through membership:

membership_id, role_id — UNIQUE(membership_id, role_id)

*(If a transitional `user_roles(user_id, role_id, tenant_id)` appears during migration, it must still be tenant-scoped and not imply single-tenant users.)*

### 5.7 `teams` / `departments` / `team_members` / `employee_profiles`

Standard org structure with `tenant_id`.

### 5.8 `api_keys`

id, tenant_id, name, key_prefix, key_hash, permission_set JSONB, last_used_at, revoked_at, created_by

---

## 6. CRM tables

### 6.1 `leads`

id, tenant_id, title/name, email, phone, company_name, source, status, score, owner_user_id, team_id, qualified_at, converted_at, custom JSONB snapshot optional, timestamps, deleted_at  
Indexes: (tenant_id, status), (tenant_id, owner_user_id), (tenant_id, email), (tenant_id, phone)

### 6.2 `contacts`

id, tenant_id, first_name, last_name, email, phone, designation, department, company_id, owner_user_id, address JSONB, timestamps, deleted_at

### 6.3 `companies`

id, tenant_id, name, industry, website, address JSONB, gstin, owner_user_id, source, status, timestamps, deleted_at

### 6.4 `company_contacts`

company_id, contact_id, is_primary — UNIQUE(company_id, contact_id)

### 6.5 `clients`

id, tenant_id, display_name, company_id, primary_contact_id, status, owner_user_id, billing_address, shipping_address, gstin, timestamps, deleted_at

### 6.6 `lead_conversion_links`

id, tenant_id, lead_id, contact_id, company_id, deal_id, client_id, converted_by, converted_at

### 6.7 `notes`

id, tenant_id, body, entity_type, entity_id, created_by, timestamps, deleted_at

### 6.8 `tags` / `taggings`

tags: id, tenant_id, name UNIQUE(tenant_id, name)  
taggings: tag_id, entity_type, entity_id

### 6.9 `custom_field_definitions`

id, tenant_id, module_code, entity_type, field_key (stable), label, field_type, options JSONB, is_required, default_value, help_text, placeholder, is_searchable, is_filterable, is_sortable, is_exportable, api_accessible, automation_accessible, role_visibility JSONB, validation JSONB, display_order, status (`active`\|`archived`), timestamps  
UNIQUE(tenant_id, entity_type, field_key)

### 6.10 `custom_field_values`

id, tenant_id, definition_id, entity_type, entity_id, value JSONB  
UNIQUE(definition_id, entity_id)

### 6.10b Customization engine (additional)

`custom_forms`, `custom_form_fields`, `form_logic_rules`  
`layout_definitions`, `layout_sections`  
`status_definitions`  
`validation_rules`, `business_rules`  
`custom_objects`, `custom_object_fields`, `custom_records`, `custom_relationships`  
`dashboard_layouts`, `dashboard_widgets`, `report_definitions`  
`document_templates`, `email_templates`  
`numbering_series` (tenant_id, entity, prefix, next_value, padding — transactional allocate)  
`tenant_calendars`, `tenant_holidays`  
`config_change_log`, `config_dependencies`, `config_packs`, `blueprint_installs`  
`custom_module_requests`  

See [CUSTOMIZATION.md](../architecture/CUSTOMIZATION.md), [ADR-013](../decisions/ADR-013-customization-metadata-model.md).

### 6.11 `saved_views`

id, tenant_id, user_id, entity_type, name, filters JSONB, is_shared

### 6.12 `activities` / timeline

id, tenant_id, entity_type, entity_id, activity_type, summary, metadata JSONB, actor_user_id, created_at  
Append-oriented; index (tenant_id, entity_type, entity_id, created_at DESC)

---

## 7. Sales tables

`pipelines` · `pipeline_stages` (pipeline_id, name, position, probability, is_won, is_lost)  
`deals` (value, currency, probability, expected_close_on, owner, source, pipeline_id, stage_id, client_id, company_id, status)  
`deal_products`  
`products` (sku, name, description, category_id, price, cost, tax_class, billing_model, status)  
`product_categories`  
`quotes` · `quote_versions` · `quote_line_items` · `quote_approvals`

---

## 8. Finance tables

`tenant_finance_profiles` (legal/brand invoice identity)  
`estimates` · `orders`  
`invoices` (number, client_id, status, issue_date, due_date, currency, subtotal, tax_total, total, amount_paid, balance, pdf_file_id)  
UNIQUE(tenant_id, number) WHERE deleted_at IS NULL  
`invoice_line_items` (description, qty, unit_price, hsn_sac, tax_rate_id, amounts)  
`recurring_invoice_schedules`  
`payments` (invoice_id, amount, paid_on, method_id, txn_ref, account_id, idempotency_key)  
`payment_methods`  
`credit_notes` · `debit_notes`  
`vendors` · `vendor_bills` · `vendor_payments`  
`expenses` · `expense_categories`  
`tax_rates` · `tax_rules`  
Posted financial documents: soft-cancel / credit-note preferred over hard delete.

---

## 9. Billing (tenant customer)

`subscription_products` · `customer_subscriptions` · `subscription_items` · `subscription_usage` · `subscription_changes`

---

## 10. Tasks / meetings

`tasks` · `task_relations` · `task_reminders` · `recurrence_rules` · `meetings` · `meeting_participants`

---

## 11. Team / DPR / commissions

`dpr_entries` · `targets` · `commission_rules` · `commission_runs` · `commission_lines`

---

## 12. Documents

`files` (storage metadata: bucket, object_key, mime, size, checksum, tenant_id)  
`documents` · `document_versions` · `document_links` · `document_acls` · `document_categories`

---

## 13. Support

`tickets` · `ticket_messages` · `ticket_sla_policies` · `ticket_events`

---

## 14. Communications / notifications

`conversations` · `messages`  
`notifications` · `notification_preferences` · `notification_deliveries`

---

## 14b. WhatsApp

`whatsapp_accounts` · `whatsapp_conversations` · `whatsapp_messages` · `whatsapp_templates` · `whatsapp_campaigns` · `whatsapp_campaign_recipients`  
Links to contacts/leads/clients; status delivered/read/failed; tenant-scoped secrets encrypted.  
See [WHATSAPP.md](../modules/WHATSAPP.md).

---

## 15. Automation / webhooks

`workflows` (tenant_id, name, status lifecycle, health_status, owner_user_id, …)  
`workflow_versions` (workflow_id, version_number, graph JSONB, published_at, created_by, change_summary)  
`workflow_triggers` (version_id, type, event_type, filters JSONB)  
`workflow_steps` optional normalized; graph may live in version JSONB with node types: trigger, condition, action, delay, branch, loop, parallel, approval, human_task, wait_event, api, webhook, ai, end  
`workflow_runs` (workflow_id, version_id, tenant_id, status, trigger_event_id, correlation_id, started_at, completed_at, current_step_key, error_summary, idempotency_key)  
`workflow_run_steps` (run_id, step_key, status, attempt, input JSONB, output JSONB, error JSONB, started_at, completed_at)  
`workflow_run_variables` (run_id, key, value JSONB)  
`workflow_approvals` (run_id, step_key, requester_id, approver_id, status, reason, deadline, comments, decided_at)  
`workflow_templates` (code, category, blueprint_flag, graph JSONB, is_platform)  
`workflow_template_installs` (tenant_id, template_id, workflow_id)  
`workflow_ai_sessions` (tenant_id, user_id, prompt, draft_graph JSONB, status)  
`workflow_health_rollups` (workflow_id, period, success_count, fail_count, avg_ms, …)  
`automation_usage_costs` (tenant_id, workflow_id, run_id NULL, dimension, amount, currency, created_at)  
`automation_suggestion_events` (tenant_id, pattern JSONB, status opt_in)  
`webhook_endpoints` · `webhook_deliveries` · `webhook_delivery_attempts`

### `outbox_events` (ADR-019 — source of truth)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID NULL | NULL only for pure platform events |
| event_type | TEXT | Namespaced `{domain}.{entity}.{action}` |
| aggregate_type | TEXT | |
| aggregate_id | TEXT/UUID | |
| payload | JSONB | EventEnvelope v1 |
| occurred_at | timestamptz | |
| available_at | timestamptz | Publish eligibility / backoff |
| status | outbox_status | pending→publishing→published\|failed\|dead |
| attempts | INT | |
| published_at | timestamptz NULL | |
| dedupe_key | TEXT NULL | UNIQUE where not null |
| correlation_id | TEXT/UUID | |
| causation_id | TEXT/UUID NULL | |
| last_error | TEXT NULL | |
| job_name | TEXT NULL | Target JobQueue name hint |
| job_handle | TEXT NULL | After enqueue |
| locked_until / locked_by | | Publisher lease |

Indexes: partial on `(status, available_at)` for pending; `(tenant_id, available_at)`; unique `dedupe_key`.

**Supersedes** earlier sketch of `outbox_events (…, processed_at)` only.

---

## 16. Voice / telephony

`voice_agents` · `voice_campaigns` · `voice_campaign_leads` · `voice_calls` · `voice_call_assets`  
`telephony_channels` · `telephony_assignments`

---

## 17. Metering / audit / jobs

`usage_counters` — implements conceptual **tenant_usage** (see §4.12)  
`usage_alerts`  
`audit_logs` (id, tenant_id NULL, actor_type, actor_id, action, entity_type, entity_id, before JSONB, after JSONB, ip, user_agent, created_at) — **no update/delete**  
Background dispatch: BullMQ (ADR-015) — not a substitute for `outbox_events`  
`scheduler_jobs` definitions as needed

---

## 17b. Platform ops / incidents (Super Admin control center)

Platform-scoped (no tenant ownership of the row itself; tenant refs in child tables).

### `platform_error_groups`

id, fingerprint UNIQUE, module_code, error_code, message_template, first_seen_at, last_seen_at, count, severity, sample_stack TEXT, status (`open`\|`muted`\|`resolved`)

### `platform_error_events`

id, group_id FK, tenant_id NULL, correlation_id, request_id, payload JSONB (redacted), created_at  
Index: (group_id, created_at DESC)

### `platform_incidents`

id, number (human), title, summary, severity, status (`open`\|`acknowledged`\|`mitigating`\|`resolved`\|`closed`), root_cause TEXT, root_cause_category, error_group_id NULL, source (`auto_rule`\|`manual`), assignee_platform_user_id NULL, started_at, acknowledged_at, resolved_at, created_at/updated_at

### `platform_incident_tenants`

incident_id, tenant_id — PK composite

### `platform_incident_events`

id, incident_id, event_type, message, metadata JSONB, actor_type, actor_id, created_at

### `platform_incident_affected_records`

id, incident_id, tenant_id, entity_type, entity_id, label, last_error_summary, created_at

### `platform_incident_actions`

id, incident_id, action_type, status (`requested`\|`succeeded`\|`failed`), request JSONB, result JSONB, actor_platform_user_id, created_at

### `platform_health_snapshots`

id, captured_at, scope_type (`platform`\|`tenant`\|`module`), scope_id TEXT, status, signals JSONB  
Index: (scope_type, scope_id, captured_at DESC)

### `platform_integration_health`

id, tenant_id, integration_code, status, failure_rate, last_success_at, last_failure_at, circuit_state (`closed`\|`open`\|`half_open`), updated_at  
UNIQUE(tenant_id, integration_code)

### `platform_ops_alerts`

id, rule_code, name, is_active, threshold JSONB, severity, last_fired_at

### `tenant_job_controls`

See §4.14 (defined once under tenants).

---

## 18. Integrations

`integrations` · `tenant_integrations` · `integration_secrets` (ciphertext, key_id)

---

## 19. Critical indexes (beyond FKs)

- All FK columns indexed
- Timeline composite indexes
- Invoice due_date + status for overdue jobs
- Subscription ends_at for reminders
- Domain host unique
- Outbox pending: `(status, available_at)` where status in (`pending`,`publishing`)
- `tenant_memberships (user_id)`, `(tenant_id, status)`

---

## 20. Tenant boundary rules

- Forbid queries without tenant predicate on tenant tables
- Platform tables accessible only by platform principals
- Cross-entity joins must include tenant_id equality

---

## 21. Related documents

- [DATABASE_ERD.md](./DATABASE_ERD.md)
- [MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md)
- [ADR-017](../adr/ADR-017-MULTI-TENANT-PROVISIONING-AND-HOST-RESOLUTION.md)
- [ADR-019](../adr/ADR-019-TRANSACTIONAL-OUTBOX-AND-BULLMQ-PUBLISHER.md)
- [ADR-021](../adr/ADR-021-PLATFORM-VS-TENANT-BILLING.md)
- [AUDIT_LOG.md](../security/AUDIT_LOG.md)
- [DATA_RETENTION.md](../security/DATA_RETENTION.md)
