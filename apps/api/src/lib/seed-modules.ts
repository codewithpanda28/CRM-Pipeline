// apps/api/src/lib/seed-modules.ts
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '@vencore/db';
import { MODULE_REGISTRY } from '../modules/registry';
import { CRM_SUBMODULE_IDS, INFRA_SUBMODULE_IDS, FINANCE_SUBMODULE_IDS } from '@vencore/modules';

// Maps installer feature flags → module IDs they control
const FEATURE_MODULE_MAP: Record<string, string[]> = {
  crm:       ['crm', 'activity', ...CRM_SUBMODULE_IDS],
  finance:   ['finance', ...FINANCE_SUBMODULE_IDS],
  infra:     ['infra:servers', 'infra:databases', 'infra:websites'],
  analytics: ['analytics'],
  alerts:    ['infra:alerts'],
};

const ALL_SUBMODULE_IDS = [...CRM_SUBMODULE_IDS, ...INFRA_SUBMODULE_IDS, ...FINANCE_SUBMODULE_IDS];

/**
 * Insert any MODULE_REGISTRY module with defaultEnabled=true that is missing
 * for this workspace. Never flips an existing enabled=false row.
 * Idempotent — safe for GET /workspace/modules self-heal + migrations.
 */
export async function ensureMissingDefaultEnabledModules(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
): Promise<{ inserted: string[] }> {
  const defaults = MODULE_REGISTRY.filter((m) => m.defaultEnabled).map((m) => m.id);
  if (defaults.length === 0) return { inserted: [] };

  const existing = await db
    .selectFrom('workspace_modules')
    .select('module_id')
    .where('workspace_id', '=', workspaceId)
    .where('module_id', 'in', defaults)
    .execute();
  const have = new Set(existing.map((r) => r.module_id));
  const missing = defaults.filter((id) => !have.has(id));
  if (missing.length === 0) return { inserted: [] };

  await db
    .insertInto('workspace_modules')
    .values(
      missing.map((module_id) => ({
        workspace_id: workspaceId,
        module_id,
        enabled: true,
      })),
    )
    .onConflict((oc) => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();

  return { inserted: missing };
}

export async function seedWorkspaceModules(
  db: Kysely<Database> | Transaction<Database>,
  workspaceId: string,
  featureOverrides?: Record<string, boolean>,
): Promise<void> {
  // Build disabled set from installer feature selections
  const disabledModules = new Set<string>();
  if (featureOverrides) {
    for (const [feature, enabled] of Object.entries(featureOverrides)) {
      if (!enabled) {
        (FEATURE_MODULE_MAP[feature] ?? []).forEach(id => disabledModules.add(id));
      }
    }
  }

  const rows = [
    ...MODULE_REGISTRY.map(m => ({
      workspace_id: workspaceId,
      module_id: m.id,
      // The infra parent stays enabled unless every one of its children is
      // disabled by installer features (infra + alerts both deselected).
      enabled:
        m.id === 'infra'
          ? INFRA_SUBMODULE_IDS.some(id => !disabledModules.has(id))
          : disabledModules.has(m.id) ? false : m.defaultEnabled,
    })),
    // Parent-module children (crm:*/infra:*/finance:*) — enabled by default, gated at
    // runtime by their parent.
    ...ALL_SUBMODULE_IDS.map(id => ({
      workspace_id: workspaceId,
      module_id: id,
      enabled: !disabledModules.has(id),
    })),
  ];

  // Insert one row per registry module + CRM/infra/finance child, skip conflicts (idempotent)
  await db
    .insertInto('workspace_modules')
    .values(rows)
    .onConflict(oc => oc.columns(['workspace_id', 'module_id']).doNothing())
    .execute();
}
