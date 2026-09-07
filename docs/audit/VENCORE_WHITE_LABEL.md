# VENCORE_WHITE_LABEL.md

## What exists

| Asset | Mechanism | Scope |
|-------|-----------|-------|
| App name, logo, favicon, domain, colors, tagline | `vencore.config.json` + Zod schema in `packages/config` | **Instance** |
| DB override of config | `system_settings` key `config` via setup / `PATCH /api/config` | **Instance** |
| SMTP from | config `smtp` | Instance |
| Workspace name/domain | `workspaces` row + `PATCH /api/workspace` | Workspace identity only — not full skin |

UI: root layout branding injection, login, sidebar.

## Classification

**INSTANCE-LEVEL white-label** for self-hosted single company branding.

## ThinkAIQ requirement gap

ThinkAIQ needs **TENANT-LEVEL**: per-tenant logo/colors/login/email/domain/modules/plan with host-based resolution and no config-file fork per customer.

**Platform default identity** (when tenant WL does not apply): **ThinkAIQ CRM** — not Vencore. See [PLATFORM_IDENTITY_AND_BRANDING.md](../architecture/PLATFORM_IDENTITY_AND_BRANDING.md). Keep Vencore theme-injection patterns as engineering reference only; customer-facing UI must not expose Vencore branding.

## Change required

- `tenant_branding` + `tenant_domains` tables  
- Resolve tenant from Host  
- Cache theme per tenant  
- Stop using single `system_settings` blob as the only brand source  
- Platform branding records separate from tenant namespaces (`platform/branding/...`)  
- Keep Vencore’s theme injection UX patterns as reference (not as product name)
