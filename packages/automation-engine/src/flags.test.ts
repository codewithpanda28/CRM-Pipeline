import { describe, expect, it, vi } from 'vitest';
import { loadEngineV2Flags, setEngineV2Flags } from './flags';

function mockDb(settings: Record<string, unknown> | null) {
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    executeTakeFirst: vi.fn().mockResolvedValue(settings ? { settings } : undefined),
  };
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  };
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  };
  return {
    selectFrom: vi.fn(() => selectChain),
    updateTable: vi.fn(() => updateChain),
    insertInto: vi.fn(() => insertChain),
    _updateChain: updateChain,
    _insertChain: insertChain,
    _selectChain: selectChain,
  };
}

describe('engine_v2_enabled flag (automation.engine.v2.enabled)', () => {
  it('loads enabled=false by default', async () => {
    const db = mockDb(null);
    const flags = await loadEngineV2Flags(db as never, 't1');
    expect(flags.enabled).toBe(false);
  });

  it('loads engine_v2_enabled and engine.v2.enabled aliases', async () => {
    const db = mockDb({ automation: { 'engine.v2.enabled': true } });
    expect((await loadEngineV2Flags(db as never, 't1')).enabled).toBe(true);

    const db2 = mockDb({ automation: { engine_v2_enabled: false } });
    expect((await loadEngineV2Flags(db2 as never, 't1')).enabled).toBe(false);
  });

  it('setEngineV2Flags writes engine_v2_enabled without inventing a second flag', async () => {
    const db = mockDb({ automation: { engine_v2_enabled: true } });
    await setEngineV2Flags(db as never, 't1', { enabled: false });
    expect(db._updateChain.set).toHaveBeenCalled();
    const arg = db._updateChain.set.mock.calls[0]![0] as { settings: Record<string, unknown> };
    const auto = arg.settings['automation'] as Record<string, unknown>;
    expect(auto['engine_v2_enabled']).toBe(false);
    expect(Object.keys(auto).every((k) => k.startsWith('engine_v2_'))).toBe(true);
  });

  it('turning OFF does not require workflow mutation (flag-only write)', async () => {
    const db = mockDb({ automation: { engine_v2_enabled: true } });
    const next = await setEngineV2Flags(db as never, 't1', { enabled: false });
    expect(next.enabled).toBe(false);
    expect(db.updateTable).toHaveBeenCalledWith('tenant_settings');
    expect(db.selectFrom).not.toHaveBeenCalledWith('workflows');
  });
});
