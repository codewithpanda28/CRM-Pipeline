# VENCORE_DATABASE.md

## Sources of truth

- `packages/db/src/schema.ts` — Kysely `Database` interface  
- `packages/db/migrations/*.ts` — ~72 migrations  
- Timescale optional on `metrics_snapshots` only  

## Important tables (summary)

| Table | Purpose | Tenant | Soft delete | Reuse for ThinkAIQ |
|-------|---------|--------|-------------|--------------------|
| workspaces | Tenant root | — | No | REFACTOR → tenants |
| users | Auth users | workspace_id | is_active | KEEP/REFACTOR |
| roles / user_roles / role_permissions | RBAC | workspace | No | KEEP |
| companies | CRM accounts | yes | deleted_at | KEEP |
| contacts | CRM people | yes | deleted_at | KEEP |
| contact_tags / contact_tag_links | Tags | yes | No | KEEP |
| pipelines / pipeline_stages / pipeline_fields | Sales config | yes | No | KEEP |
| pipeline_items | Live deals/cards (JSONB field_values) | yes | deleted_at | KEEP/REFACTOR |
| pipeline_automations / pipeline_activity | Rules + item log | via pipeline | No | REVIEW |
| deals / pipeline_records / record_types | Legacy layers | yes | varies | REPLACE gradually |
| tasks | Tasks | yes | No | KEEP |
| activities | Activity feed | yes | No | KEEP |
| projects + PM tables | Project management | yes | status | OPTIONAL module |
| custom_fields (PM) | Project/task fields | via project | No | Pattern only |
| dashboards / dashboard_layouts | Widgets | yes | No | KEEP |
| channels / messages | Team messaging | yes | messages deleted_at | OPTIONAL / not WhatsApp |
| servers / websites / infra_databases / metrics_* / alerts | Infra monitoring | yes | No | OPTIONAL module |
| webhook_subscriptions / webhook_deliveries | Outbound webhooks | yes | No | KEEP |
| api_keys | Public API auth | yes | No | KEEP |
| system_settings / instance_meta | Instance config/updater | instance | No | REPLACE for SaaS |
| plugins / plugin_* | Plugin system | varies | No | KEEP/REFACTOR |
| automation_rules / automation_logs | PM automation | via project | No | REPLACE for ThinkAIQ engine |

## Removed historically

`usage_meters`, workspace Stripe/plan columns — self-host refactor migration `20240103_001_self_hosted_refactor.ts`.

## ER (CRM core)

```
workspaces 1──* users
workspaces 1──* companies 1──* contacts
workspaces 1──* pipelines 1──* stages/fields/items/automations
contacts *──* tags
workspaces 1──* tasks, activities
```

## Redesign required for ThinkAIQ

Finance suite · platform plans/subscriptions · tenant_branding/domains · ops incidents · workflow graph tables · WhatsApp · usage counters · custom_field_definitions for CRM entities · audit_logs
