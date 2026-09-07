import type { Kysely } from 'kysely';
import type { Database } from '@vencore/db';

export interface EngineV2Flags {
  enabled: boolean;
  /** Canonical event names allowed to create runs; empty = none when enabled requires explicit list */
  dispatchAllowlist: string[];
  selfApproval: boolean;
}

const DEFAULTS: EngineV2Flags = {
  enabled: false,
  dispatchAllowlist: [],
  selfApproval: false,
};

export async function loadEngineV2Flags(
  db: Kysely<Database>,
  tenantId: string,
): Promise<EngineV2Flags> {
  const row = await db
    .selectFrom('tenant_settings')
    .select(['settings'])
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  const auto = (settings['automation'] ?? {}) as Record<string, unknown>;

  const allow = auto['engine_v2_dispatch'] ?? auto['engine.v2.dispatch'];
  let dispatchAllowlist: string[] = [];
  if (Array.isArray(allow)) {
    dispatchAllowlist = allow.map(String);
  } else if (typeof allow === 'string' && allow.trim()) {
    dispatchAllowlist = allow.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return {
    enabled: Boolean(auto['engine_v2_enabled'] ?? auto['engine.v2.enabled'] ?? DEFAULTS.enabled),
    dispatchAllowlist,
    selfApproval: Boolean(
      auto['engine_v2_self_approval'] ?? auto['engine.v2.self_approval'] ?? DEFAULTS.selfApproval,
    ),
  };
}

export async function setEngineV2Flags(
  db: Kysely<Database>,
  tenantId: string,
  patch: Partial<EngineV2Flags>,
): Promise<EngineV2Flags> {
  const current = await loadEngineV2Flags(db, tenantId);
  const next: EngineV2Flags = {
    enabled: patch.enabled ?? current.enabled,
    dispatchAllowlist: patch.dispatchAllowlist ?? current.dispatchAllowlist,
    selfApproval: patch.selfApproval ?? current.selfApproval,
  };

  const existing = await db
    .selectFrom('tenant_settings')
    .select(['settings'])
    .where('tenant_id', '=', tenantId)
    .executeTakeFirst();

  const settings = { ...((existing?.settings ?? {}) as Record<string, unknown>) };
  settings['automation'] = {
    engine_v2_enabled: next.enabled,
    engine_v2_dispatch: next.dispatchAllowlist,
    engine_v2_self_approval: next.selfApproval,
  };

  if (existing) {
    await db
      .updateTable('tenant_settings')
      .set({ settings, updated_at: new Date() })
      .where('tenant_id', '=', tenantId)
      .execute();
  } else {
    await db
      .insertInto('tenant_settings')
      .values({ tenant_id: tenantId, settings })
      .execute();
  }
  return next;
}
