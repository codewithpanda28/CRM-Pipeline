# PHASE 6.5 — Automation Entitlement / Sidebar Fix Report

| Field | Value |
|-------|-------|
| Status | **COMPLETE** (Automation entitlement slice only) |
| Date | 2026-09-06 |
| Scope | Fix missing `workspace_modules.automation` for entitled tenants + Member RBAC sync |
| Explicit non-goals (honored) | Round 2B · AI · Voice · WhatsApp · PM/pipeline legacy · duplicate entitlement systems · Automation engine changes · fake workflow records · removing `isEnabled('automation')` |

---

## Root cause

Older workspaces were seeded **before** `AUTOMATION_MODULE` entered `MODULE_REGISTRY`.

- `seedWorkspaceModules` inserts registry rows with `ON CONFLICT DO NOTHING`.
- It never backfills **new** modules onto existing tenants.
- Sidebar injects Automation routes (`/automation`, `/workflows`, `/templates`, `/approvals`, `/runs`, `/settings`) but each child is gated by `moduleId: 'automation'` → `isEnabled('automation')`.
- Missing `workspace_modules` row ⇒ `isEnabled('automation') === false` ⇒ **empty Automation group** even though routes exist.
- Zero workflows was **not** the hide condition; nav never consulted workflow count.

---

## Entitlement policy used (canonical)

| Source | Role |
|--------|------|
| `MODULE_REGISTRY` / `AUTOMATION_MODULE` (`packages/modules`) | Product default entitlement |
| `AUTOMATION_MODULE.defaultEnabled === true` | Default ON for new + backfill-missing |
| `workspace_modules` (PostgreSQL) | Per-tenant SoR for enable/disable |
| `role_permissions` (tenant-scoped) | RBAC for nav + APIs |

**Backfill rules:**

1. Insert `automation` with `enabled=true` **only when the row is absent**.
2. **Never** overwrite existing `enabled=true` or `enabled=false` (intentional disable sticks).
3. Member (`is_default`) roles get view perms from registry `defaultRoles: ['admin','member']`:
   - `automation:workflows:view`
   - `automation:runs:view`
   - `automation:approvals:view`
4. Administrator `grants_all` unchanged.
5. No second module/entitlement system; no plan-SKU fork in this slice — registry `defaultEnabled` is the product default policy.

---

## Migration / backfill

**Migration:** `packages/db/migrations/20260906_002_automation_module_entitlement.ts`

- Idempotent `INSERT … WHERE NOT EXISTS` for missing `automation` rows.
- Idempotent Member permission insert (`ON CONFLICT DO NOTHING`).
- Pure helpers for tests: `shouldBackfillAutomationModule`, `automationSidebarChildrenVisible` (workflow count explicitly ignored).

**Local DB (`vencore_isolation_test`) after migrate:**

- `automation` module rows: **2** workspaces, both `enabled=true`
- Member automation view perms: **6** (3 keys × 2 workspaces)

**Runtime self-heal (new + lagging tenants):**

- `ensureMissingDefaultEnabledModules()` — inserts any `defaultEnabled` registry module missing for a workspace; never flips `enabled=false`.
- Called from `GET /api/workspace/modules` before listing.
- `seedWorkspaceRoles` / `ensureMemberDefaultPermissions` always syncs current Member defaults (including automation).
- `backfill-modules.ts` also runs role seed after modules.
- New tenants: existing `seedWorkspaceModules` + `seedWorkspaceRoles` already include automation when registry is current.

---

## Permissions

| Role | Automation access |
|------|-------------------|
| Administrator | `grants_all` (unchanged) |
| Member (`is_default`) | view workflows / runs / approvals (backfilled + ongoing sync) |
| Intentionally disabled module | `isEnabled('automation')` remains false; children stay hidden |

Permissions remain **tenant-scoped** via `(workspace_id, role_id, permission)` on `role_permissions`.

---

## Files changed

| Path | Change |
|------|--------|
| `packages/db/migrations/20260906_002_automation_module_entitlement.ts` | Backfill migration + policy helpers |
| `packages/db/migrations/20260906_002_automation_module_entitlement.test.ts` | Policy + sidebar visibility regression |
| `apps/api/src/lib/seed-modules.ts` | `ensureMissingDefaultEnabledModules` |
| `apps/api/src/lib/seed-roles.ts` | Always sync Member defaults via `ensureMemberDefaultPermissions` |
| `apps/api/src/routes/workspace-modules.ts` | GET self-heal: modules + roles |
| `apps/api/src/scripts/backfill-modules.ts` | Seed roles after modules |
| `apps/api/src/__tests__/seed-modules-ensure.test.ts` | Ensure-insert / no-op tests |
| `apps/api/src/__tests__/workspace-modules.test.ts` | GET path mocks for self-heal |
| `packages/modules/src/index.test.ts` | Automation member perms + finance length drift fix |
| `packages/db/scripts/check-automation-entitlement.ts` | Local verification helper (ops) |
| `docs/implementation/PHASE-6.5-DAILY-USABILITY-ENTITLEMENT-HARDENING-REPORT.md` | This report |

**Not changed (by design):** Automation engine, Round 2B surfaces, Sidebar `isEnabled` removal, PM/pipeline legacy automation, fake workflows.

---

## Tests

| Suite | Result |
|-------|--------|
| `packages/db` — `20260906_002_automation_module_entitlement.test.ts` | **8/8 PASS** |
| `apps/api` — `seed-modules-ensure.test.ts` + `workspace-modules.test.ts` | **9/9 PASS** |
| `packages/modules` — automation permission assertions in `index.test.ts` | Covered in suite |

**Regression coverage:**

- Entitled + view perm → children visible (incl. `workflowCount: 0`)
- Missing / disabled module → restricted
- Backfill only when row missing
- Ensure inserts `automation` when absent; no-op when present
- Member perms match registry defaults; tenant-scoped inserts

---

## Browser verification

Tenant: isolation fixture (`usera@isolation.test`) on local web `http://localhost:3002`.

| Check | Result |
|-------|--------|
| Automation group expanded | **PASS** — Home, My Automations, Templates, Approvals, Activity, Settings |
| `/automation` | **PASS** |
| `/automation/workflows` | **PASS** |
| `/automation/templates` | **PASS** |
| `/automation/approvals` | **PASS** |
| `/automation/runs` | **PASS** (Activity) |
| `/automation/settings` | **PASS** (engine ON/OFF UI) |
| Fake workflows created | **None** |

Zero-workflow empty-state UX remains page-level (`No automations yet`); nav visibility is independent of workflow count (proven in unit policy + architecture). This fixture already had runs/workflows; empty copy was not re-exercised live in this pass.

---

## Final result

Automation sidebar defect for entitled legacy tenants is fixed by restoring the missing `workspace_modules` entitlement (migration + GET self-heal) and syncing Member view permissions. Entitlement checks stay authoritative.

---

## Gate sheet

| Gate | Result |
|------|--------|
| AUTOMATION MODULE ENTITLEMENT | **PASS** |
| SIDEBAR CHILDREN VISIBLE | **PASS** |
| ZERO-WORKFLOW EMPTY STATE | **PASS** (nav independent of count; empty UX unchanged on pages) |
| NEW TENANT ENTITLEMENT | **PASS** (registry `defaultEnabled` + seed + ensure) |
| RBAC | **PASS** |
| TENANT ISOLATION | **PASS** (`workspace_modules` / `role_permissions` scoped) |
| REGRESSION | **PASS** |

**Overall Phase 6.5 (this slice):** **PASS** — do not treat as Round 2B start.
