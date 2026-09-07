import { describe, expect, it } from 'vitest';
import { canUseScopeMode, resolveRequestedScopeMode } from './scope';

describe('ops scope resolver', () => {
  it('allows own for members with tasks.view', () => {
    const perms = new Set(['ops.tasks.view']);
    expect(canUseScopeMode('own', { isAdmin: false, permissions: perms })).toBe(true);
    expect(canUseScopeMode('team', { isAdmin: false, permissions: perms })).toBe(false);
    expect(canUseScopeMode('company', { isAdmin: false, permissions: perms })).toBe(false);
  });

  it('allows team when assign or view_team present', () => {
    const perms = new Set(['ops.tasks.view', 'ops.tasks.assign']);
    expect(canUseScopeMode('team', { isAdmin: false, permissions: perms })).toBe(true);
  });

  it('downgrades requested company to highest allowed', () => {
    const member = new Set(['ops.tasks.view', 'ops.performance.view_own']);
    expect(
      resolveRequestedScopeMode('company', { isAdmin: false, permissions: member }),
    ).toBe('own');

    const mgr = new Set(['ops.tasks.view', 'ops.performance.view_team', 'ops.dpr.view_team']);
    expect(
      resolveRequestedScopeMode('company', { isAdmin: false, permissions: mgr }),
    ).toBe('team');

    expect(
      resolveRequestedScopeMode('company', { isAdmin: true, permissions: new Set() }),
    ).toBe('company');
  });
});
