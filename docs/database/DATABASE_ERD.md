# DATABASE_ERD.md — ThinkAIQ

## 1. Purpose

Entity-relationship overview. Detailed columns live in [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

---

## 2. Platform domain

```
platform_users
plans 1──* plan_prices
plans 1──* plan_modules *──1 modules
plans 1──* plan_limits
plans 1──* tenants
tenants 1──* tenant_modules *──1 modules
tenants 1──1 tenant_branding
tenants 1──* tenant_domains
tenants 1──* platform_subscriptions 1──* platform_invoices 1──* platform_payments
```

---

## 3. Identity / RBAC

```
tenants 1──* users
tenants 1──* roles 1──* role_permissions *──1 permissions
users *──* roles (user_roles)
tenants 1──* departments 1──* teams 1──* team_members *──1 users
tenants 1──* api_keys
```

---

## 4. CRM

```
tenants 1──* leads
tenants 1──* companies 1──* company_contacts *──1 contacts
tenants 1──* clients
leads 1──0..1 lead_conversion_links ──> contacts, companies, deals, clients
entity ◄── notes, taggings, custom_field_values, activities, files/attachments
```

---

## 5. Sales

```
tenants 1──* pipelines 1──* pipeline_stages
pipelines 1──* deals *──1 clients/companies/users
tenants 1──* products
deals 1──* deal_products *──1 products
tenants 1──* quotes 1──* quote_versions 1──* quote_line_items
quotes ──> deals / clients / invoices (on convert)
```

---

## 6. Finance & subscriptions

```
clients 1──* estimates / orders / invoices 1──* invoice_line_items
invoices 1──* payments (idempotency_key)
invoices 1──* credit_notes / debit_notes
tenants 1──1 tenant_finance_profiles
recurring_invoice_schedules → invoices
tenants 1──* vendors 1──* vendor_bills 1──* vendor_payments
tenants 1──* expenses
tenants 1──* tax_rates / tax_rules
clients 1──* customer_subscriptions 1──* subscription_items
customer_subscriptions 1──* subscription_usage
```

**Note:** Platform SaaS invoices (`platform_invoices`) are a separate bounded context from tenant customer invoices.

---

## 7. Work management

```
users 1──* tasks
tasks *──* entities (task_relations)
tasks 1──* task_reminders
users 1──* meetings *──* meeting_participants
users 1──* dpr_entries
users/teams 1──* targets
```

---

## 8. Support & documents

```
clients 1──* tickets 1──* ticket_messages
documents 1──* document_versions
documents *──* entities (document_links)
documents 1──* document_acls
files ◄── branding, attachments, document_versions, voice assets, invoice PDFs
```

---

## 9. Automation & integration spine

```
outbox_events → webhook_deliveries → webhook_delivery_attempts
outbox_events → workflow_runs → workflow_run_steps
outbox_events → notifications → notification_deliveries
tenants 1──* webhook_endpoints
tenants 1──* workflows 1──* workflow_versions 1──* workflow_steps
tenants 1──* tenant_integrations 1──* integration_secrets
```

---

## 10. Voice / telephony

```
voice_agents 1──* voice_campaigns 1──* voice_campaign_leads *──1 leads
voice_campaigns 1──* voice_calls
telephony_channels 1──* telephony_assignments → clients / agents
```

---

## 11. Audit, metering & platform ops

```
audit_logs (append-only; tenant_id nullable for platform)
usage_counters per tenant + dimension + period

platform_error_groups 1──* platform_error_events
platform_incidents 1──* platform_incident_tenants *──1 tenants
platform_incidents 1──* platform_incident_events
platform_incidents 1──* platform_incident_affected_records
platform_incidents 1──* platform_incident_actions
platform_health_snapshots (platform | tenant | module)
platform_integration_health *──1 tenants
tenant_job_controls 1──1 tenants
```

---

## 12. Cardinality notes

- One company → many contacts
- One client → many invoices/subscriptions/tickets
- One deal → one pipeline stage at a time
- One invoice → many payments
- One workflow version → many runs
- Soft-deleted rows retained until retention purge

---

## 13. Diagram artifacts

Mermaid sources can be exported to `docs/diagrams/` during implementation. This ERD is the authoritative relationship map for documentation phase.
