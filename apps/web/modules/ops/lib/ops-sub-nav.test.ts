import { describe, expect, it } from 'vitest';
import { OPS_SUB_NAV_ITEMS, isOpsSubNavActive } from './ops-sub-nav';

describe('OPS_SUB_NAV_ITEMS', () => {
  it('lists Operations routes including Performance and DPR', () => {
    expect(OPS_SUB_NAV_ITEMS.map((i) => i.href)).toEqual([
      '/ops/today',
      '/ops/my-work',
      '/ops/tasks',
      '/ops/performance',
      '/ops/dpr',
      '/ops/employees',
      '/ops/departments',
      '/ops/teams',
      '/ops/targets',
    ]);
    expect(OPS_SUB_NAV_ITEMS.map((i) => i.label)).toEqual([
      'Today',
      'My Work',
      'Tasks',
      'Performance',
      'DPR',
      'Employees',
      'Departments',
      'Teams',
      'Targets',
    ]);
  });
});

describe('isOpsSubNavActive', () => {
  it('highlights only the matching route', () => {
    expect(isOpsSubNavActive('/ops/today', '/ops/today')).toBe(true);
    expect(isOpsSubNavActive('/ops/my-work', '/ops/today')).toBe(false);
    expect(isOpsSubNavActive('/ops/performance/employee/x', '/ops/performance')).toBe(true);
    expect(isOpsSubNavActive('/ops/dpr/inbox', '/ops/dpr')).toBe(true);
    expect(isOpsSubNavActive('/ops/dpr/inbox', '/ops/today')).toBe(false);
  });

  it('does not treat sibling paths as active', () => {
    for (const item of OPS_SUB_NAV_ITEMS) {
      for (const other of OPS_SUB_NAV_ITEMS) {
        if (item.href === other.href) continue;
        expect(isOpsSubNavActive(item.href, other.href)).toBe(false);
      }
    }
  });

  it('tolerates trailing slashes', () => {
    expect(isOpsSubNavActive('/ops/today/', '/ops/today')).toBe(true);
  });
});
