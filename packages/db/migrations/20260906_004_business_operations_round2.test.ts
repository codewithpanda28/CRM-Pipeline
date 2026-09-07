import { describe, expect, it } from 'vitest';
import {
  OPS_R2_MEMBER_PERMISSIONS,
  OPS_R2_MANAGER_PERMISSIONS,
} from './20260906_004_business_operations_round2';

describe('ops round 2 permission catalogs', () => {
  it('member R2 defaults cover own DPR + performance', () => {
    expect([...OPS_R2_MEMBER_PERMISSIONS]).toEqual([
      'ops.dpr.view_own',
      'ops.dpr.create',
      'ops.performance.view_own',
    ]);
  });

  it('manager template includes review + team performance + assign', () => {
    expect(OPS_R2_MANAGER_PERMISSIONS).toContain('ops.dpr.review');
    expect(OPS_R2_MANAGER_PERMISSIONS).toContain('ops.dpr.view_team');
    expect(OPS_R2_MANAGER_PERMISSIONS).toContain('ops.performance.view_team');
    expect(OPS_R2_MANAGER_PERMISSIONS).toContain('ops.tasks.assign');
    expect(OPS_R2_MANAGER_PERMISSIONS).not.toContain('ops.targets.manage');
  });
});
