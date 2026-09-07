# VENCORE_TENANCY.md

## Model

- Root entity: `workspaces` (`packages/db`)
- Users belong to **one** `workspace_id`
- Most business tables include `workspace_id`
- JWT payload includes `workspaceId`, but `requireAuth` loads workspace from **`user.workspace_id`** (`apps/api/src/middleware/auth.ts`) — good (cannot easily swap tenant via forged claim alone without also matching user row)

## What currently protects isolation

1. Auth attaches a single workspace from the user record  
2. Routes typically `.where('workspace_id', '=', req.workspace.id)`  
3. API keys bound to `apiKey.workspace_id` (`middleware/api-key-auth.ts`)  
4. Module enablement cached per `{workspaceId}:{moduleId}`  
5. Some RBAC tests assert cross-workspace denial  

## What could break isolation

1. Any route forgetting `workspace_id` filter (no DB RLS)  
2. Raw/plugin SQL without tenant predicate  
3. Background jobs missing workspace context or iterating all rows unsafely  
4. Shared instance config (`system_settings`) leaking branding/secrets across future tenants  
5. File keys not namespaced (messaging upload uses workspace-aware keys — verify all paths)  
6. Search/analytics queries joining without workspace equality  
7. Assuming multi-workspace SaaS while setup forbids second workspace — false confidence  

## Product constraint

`apps/api/src/routes/setup.ts`: if any workspace exists → `ALREADY_CONFIGURED`.  
**One install ≈ one customer workspace** today.

## What must change for ThinkAIQ

| Change | Why |
|--------|-----|
| Multi-tenant provision API (Super Admin) | Create many tenants |
| Host/domain → tenant resolution | White-label SaaS |
| Isolation test suite on all mutating routes | Prevent IDOR |
| Job payloads must carry `tenant_id`/`workspace_id` | Automation/WhatsApp scale |
| Separate platform principals from tenant users | Super Admin |
| Optional Postgres RLS later | Defense in depth |
| Never trust frontend-only filtering | Already stated in ThinkAIQ principles |

## Classification

**PARTIAL** foundation · **UNSAFE to treat as SaaS multi-tenancy without redesign of provision + guarantees**.
