import { describe, it, expect, vi } from 'vitest';
import { ensureMissingDefaultEnabledModules } from '../lib/seed-modules';
import { MODULE_REGISTRY } from '../modules/registry';

describe('ensureMissingDefaultEnabledModules', () => {
  it('inserts only missing defaultEnabled modules (e.g. automation)', async () => {
    const defaults = MODULE_REGISTRY.filter((m) => m.defaultEnabled).map((m) => m.id);
    expect(defaults).toContain('automation');

    const insertValues = vi.fn().mockReturnThis();
    const onConflict = vi.fn().mockReturnThis();
    const executeInsert = vi.fn().mockResolvedValue(undefined);

    const selectExecute = vi.fn().mockResolvedValue(
      defaults.filter((id) => id !== 'automation').map((module_id) => ({ module_id })),
    );

    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: selectExecute,
      }),
      insertInto: vi.fn().mockReturnValue({
        values: insertValues,
        onConflict,
        execute: executeInsert,
      }),
    };

    const result = await ensureMissingDefaultEnabledModules(db, 'ws-1');
    expect(result.inserted).toEqual(['automation']);
    expect(insertValues).toHaveBeenCalledWith([
      { workspace_id: 'ws-1', module_id: 'automation', enabled: true },
    ]);
  });

  it('does nothing when all defaultEnabled modules already exist', async () => {
    const defaults = MODULE_REGISTRY.filter((m) => m.defaultEnabled).map((m) => m.id);
    const db: any = {
      selectFrom: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(defaults.map((module_id) => ({ module_id }))),
      }),
      insertInto: vi.fn(),
    };
    const result = await ensureMissingDefaultEnabledModules(db, 'ws-1');
    expect(result.inserted).toEqual([]);
    expect(db.insertInto).not.toHaveBeenCalled();
  });
});
