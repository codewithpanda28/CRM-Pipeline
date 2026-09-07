# VENCORE_REUSE_MAP.md

Classification for ThinkAIQ adoption (**no files changed in this audit**).

| Path | Decision | Rationale |
|------|----------|-----------|
| Monorepo layout (apps/packages/turbo/pnpm) | KEEP | Matches ThinkAIQ modular monolith |
| `apps/api` core (Express, middleware, Zod) | KEEP/REFACTOR | Solid API shell; harden security; multi-tenant provision |
| `apps/api` CRM routes | KEEP/REFACTOR | Contacts/companies/pipelines/tasks |
| `apps/api` finance | NEW | Does not exist |
| `apps/api` automation-engine / pipeline-automations | REPLACE | Too limited; incomplete wiring |
| `apps/api` `/api/v1` + api-key-auth + webhooks | KEEP/REFACTOR | Good base; add idempotency/rate limits |
| `apps/web` CRM modules | KEEP/REFACTOR | Kanban/contacts UI valuable |
| `apps/web` infra/messaging | KEEP as optional modules | Not ThinkAIQ core identity |
| `apps/worker` | KEEP/REFACTOR | Process model OK; add durable queue |
| `apps/updater` | REVIEW | Useful for self-host SKU; not SaaS control plane |
| `packages/db` | KEEP/REFACTOR | Migrations+schema gold; extend heavily |
| `packages/modules` | KEEP/REFACTOR | Module registry pattern |
| `packages/config` | REPLACE for SaaS | Instance config → tenant+platform settings |
| `packages/plugin-runtime` / `plugin-types` | KEEP/REVIEW | Extensibility foundation; harden |
| `packages/api-client` / `types` | KEEP/REFACTOR | Clean stale Stripe/plan types |
| `docker` / compose | KEEP/REFACTOR | Adapt for SaaS topology |
| Setup single-workspace guard | REPLACE | Blocks ThinkAIQ provisioning |
| system_settings branding | REPLACE | Need tenant_branding |
| Projects/PM module | OPTIONAL | Not required for ThinkAIQ CRM core |
| Infra monitoring | OPTIONAL | Can remain plugin/module |
| Team messaging | OPTIONAL | Not WhatsApp; don’t confuse |

## Suggested adoption strategy

1. Vendor/adapt Vencore under ThinkAIQ repo governance (license retain MIT attribution).  
2. Introduce `platform/*` packages for Super Admin, tenancy, billing, ops.  
3. Keep `crm` module; add `finance`, `automation`, `whatsapp` as new modules.  
4. Delete or quarantine dead paths (unwired pipeline executor, Clerk) during refactor phases — **after** approval, not during audit.
