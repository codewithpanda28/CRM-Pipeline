# PHASE-2B-ROUTE-COVERAGE.md

**Milestone:** Phase 2B Task 2  
**Source of mounts:** `apps/api/src/index.ts`  
**Denial convention:** 404 for scoped miss; 403 for Host/JWT/membership/lifecycle/authz  

Classification: **PUBLIC** | **PLATFORM** | **TENANT** | **TENANT-OPTIONAL** | **WEBHOOK** | **INTERNAL**

Coverage status: **LIVE** = exercised by live Postgres suite · **UNIT** = mocked unit · **NONE** = not yet live

---

## Mount summary

| Path prefix | Methods (group) | Class | Auth | TenantContext | Tenant source | Lifecycle | Risk | Coverage | Status |
|-------------|-----------------|-------|------|---------------|---------------|-----------|------|----------|--------|
| `/api/config` | GET | PUBLIC | none | no | n/a | n/a | Med (global branding) | UNIT | DEFER — instance `system_settings`, not tenant SoR |
| `/api/config` | PATCH | TENANT | requireAuth+admin | yes | Host/JWT | yes | Med | NONE | DEFER — still writes global config |
| `/api/auth/*` | POST/GET | PUBLIC / TENANT-OPTIONAL | JWT inside | partial | Host/JWT | allowLifecycle on auth | Low | LIVE (switch) | SAFE |
| `/api/setup` | GET/POST | PUBLIC | none | no | n/a | n/a | Low | UNIT | SAFE (single-tenant install) |
| `/api/me*` | * | TENANT | requireAuth | yes | Host/JWT | yes | Low | NONE | SAFE by context |
| `/api/workspace/modules` | * | TENANT | requireAuth | yes | workspace.id | yes | Med | NONE | SAFE by context |
| `/api/contacts` | CRUD | TENANT | requireAuth+crm:contacts | yes | workspace.id | yes | High | LIVE | SAFE |
| `/api/companies` | CRUD | TENANT | requireAuth+crm:companies | yes | workspace.id | yes | High | LIVE | SAFE |
| `/api/tenant/branding|settings` | GET/PATCH | TENANT | requireAuth | yes | tenantContext.tenantId | yes | High | LIVE | SAFE (**added 2B**) |
| `/api/platform/*` | GET | PLATFORM | requirePlatformAdmin | n/a | platform JWT | n/a | High | LIVE | SAFE (**added 2B**) |
| `/api/agent` | POST | INTERNAL | agent token | via server.workspace_id | agent binding | no | Med | NONE | SAFE by agent bind |
| `/api/pipelines` | CRUD+stages | TENANT | requireAuth+crm:pipeline | yes | workspace.id + pipeline_id | yes | High | LIVE | SAFE |
| `/api/pipelines/:id/items` | GET/POST | TENANT | same | yes | workspace + stage ownership | yes | High | LIVE | **FIXED** stage ownership |
| `/api/items` | GET/PATCH/DELETE/move | TENANT | same | yes | workspace + stage ownership | yes | High | LIVE | **FIXED** |
| `/api/pipelines/:id/fields` | * | TENANT | same | yes | parent pipeline | yes | Med | NONE | SAFE by parent |
| `/api/pipelines/:id/automations` | * | TENANT | same | yes | parent pipeline | yes | Med | NONE | SAFE by parent |
| `/api/tasks` | list/create/patch/delete | TENANT | requireAuth+crm:tasks | yes | workspace.id | yes | High | LIVE | SAFE (no GET-by-id route) |
| `/api/tasks/unified` | GET | TENANT | same | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/activity` | GET/POST | TENANT | requireAuth+activity | yes | workspace.id | yes | Med | LIVE (list) | SAFE |
| `/api/alerts` | * | TENANT | infra alerts | yes | workspace.id | yes | Med | NONE | SAFE by context |
| `/api/dashboards` | * | TENANT | requireAuth | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/projects/**` | * | TENANT | requireAuth | yes | verifyProjectAccess | yes | High | LIVE (CRUD sample) | SAFE |
| `/api/portal` | * | PUBLIC | portal JWT | portal project | token | n/a | Med | NONE | DEFER portal matrix |
| `/api/notifications` | * | TENANT | requireAuth | yes | workspace+user | yes | Med | LIVE | SAFE |
| `/api/analytics` | * | TENANT | requireAuth+analytics | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/webhooks` | * | WEBHOOK (outbound mgmt) | requireAuth | yes | workspace.id | yes | High | LIVE | SAFE (perm gate deferred) |
| `/api/api-keys` | * | TENANT | requireAuth | yes | workspace.id | yes | High | LIVE | SAFE (perm gate deferred) |
| `/api/plugins/**` | * | TENANT | requireAuth | yes | ctx.workspaceId | yes | High | NONE | DEFER deeper plugin matrix |
| `/api/workspace` | PATCH | TENANT | requireAuth+admin | yes | workspace.id | yes | Med | NONE | SAFE by context |
| `/api/cross-module-settings` | * | TENANT | admin | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/invites` | * | TENANT/PUBLIC | mixed | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/users` `/roles` `/rbac` | * | TENANT | manage perms | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/sidebar` | * | TENANT | requireAuth | yes | workspace | yes | Low | NONE | SAFE by context |
| `/api/messaging/**` | * | TENANT | requireAuth+messaging | yes | workspace + channel access | yes | High | LIVE | SAFE |
| `/api/servers` `/databases` `/websites` | * | TENANT | infra features | yes | workspace.id | yes | High | LIVE (servers list) | SAFE |
| `/api/alert-thresholds` | * | TENANT | infra alerts | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/settings/**` `/api/hub/**` | * | TENANT | requireAuth | yes | workspace | yes | Med | NONE | SAFE by context |
| `/api/system` | mixed | PUBLIC/INTERNAL/TENANT | mixed | mixed | mixed | n/a | Low | NONE | SAFE |
| `/api/ssh` `/servers/:id/ssh` | * | TENANT | requireAuth+ssh | yes | workspace | yes | High | NONE | DEFER WS matrix |
| `/api/internal` | * | INTERNAL | CRON_SECRET | n/a | cron | n/a | Med | NONE | SAFE (secret) |
| `/api/sse` | GET | TENANT | requireAuth | yes | workspace | yes | Low | NONE | SAFE by context |
| `/v1/**` | CRUD | TENANT | API key | via key.workspace_id | api_keys | **yes (2B)** | High | LIVE | SAFE + lifecycle |
| WS SSH/SFTP/messaging | upgrade | TENANT | JWT query/cookie | legacy user.workspace_id | user row | no | Med | NONE | DEFER ADR-023 WS |

**Unmounted:** `routes/contact-tags.ts` — code exists, not mounted (N/A).

**Total mount prefixes audited:** 40+  
**Unclassified:** 0  

---

## Tenant-owned surfaces

| Surface | Class | Notes |
|---------|-------|-------|
| contacts, companies, tags | SAFE | LIVE |
| pipelines, stages, items | SAFE | stage FK **FIXED NOW** |
| tasks, activities | SAFE | LIVE |
| projects (+ nested) | SAFE | LIVE sample; nested DEFER deeper |
| messaging channels/messages/attachments | SAFE | LIVE + storage key |
| API keys, webhooks, deliveries | SAFE | LIVE |
| notifications | SAFE | LIVE |
| tenant_settings, tenant_branding | SAFE | LIVE APIs added |
| outbox, security_audit | SAFE | PLATFORM only |
| servers | SAFE | LIVE list |
| plugins / portal / full infra / dashboards / analytics | DEFER WITH JUSTIFICATION | pattern-safe; not full live matrix this milestone |
| deals table | DEFER | dropped/migrated to pipeline_items |
| `/api/config` global branding | DEFER WITH JUSTIFICATION | not tenant SoR; tenant_branding is SoR |

No known **critical** IDOR left unfixed after pipeline stage ownership fix.
