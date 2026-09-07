import { describe, expect, it } from 'vitest';
import {
  OPS_MEMBER_PERMISSIONS,
  OPS_SYSTEM_TARGET_METRICS,
  computeTargetPctAchieved,
  computeTargetRemaining,
  mapLegacyTaskStatus,
  opsBackfillEnabledValue,
  shouldBackfillOpsModule,
} from './20260906_003_business_operations_round1';

describe('ops module entitlement backfill policy', () => {
  it('backfills only when the workspace_modules row is missing', () => {
    expect(shouldBackfillOpsModule(undefined)).toBe(true);
    expect(shouldBackfillOpsModule(true)).toBe(false);
    expect(shouldBackfillOpsModule(false)).toBe(false);
  });

  it('inserts enabled=true matching OPS_MODULE.defaultEnabled', () => {
    expect(opsBackfillEnabledValue()).toBe(true);
  });

  it('member permissions match registry defaults for viewers', () => {
    expect([...OPS_MEMBER_PERMISSIONS]).toEqual([
      'ops.employees.view',
      'ops.tasks.view',
      'ops.tasks.manage',
      'ops.targets.view_own',
    ]);
  });
});

describe('mapLegacyTaskStatus', () => {
  it('maps todo → open for API consumers; leaves done/open as-is', () => {
    expect(mapLegacyTaskStatus('todo')).toBe('open');
    expect(mapLegacyTaskStatus('done')).toBe('done');
    expect(mapLegacyTaskStatus('open')).toBe('open');
    expect(mapLegacyTaskStatus('in_progress')).toBe('in_progress');
    expect(mapLegacyTaskStatus('cancelled')).toBe('cancelled');
  });
});

describe('target pct / remaining helpers', () => {
  it('computes pct_achieved and nulls when goal is zero', () => {
    expect(computeTargetPctAchieved(100, 50)).toBe(0.5);
    expect(computeTargetPctAchieved(100, 100)).toBe(1);
    expect(computeTargetPctAchieved(0, 10)).toBeNull();
    expect(computeTargetPctAchieved(Number.NaN, 10)).toBeNull();
  });

  it('computes remaining as max(goal - actual, 0)', () => {
    expect(computeTargetRemaining(100, 40)).toBe(60);
    expect(computeTargetRemaining(100, 150)).toBe(0);
  });
});

describe('system target metrics seed catalog', () => {
  it('defines exactly 10 Round 1 metrics', () => {
    expect(OPS_SYSTEM_TARGET_METRICS).toHaveLength(10);
    expect(OPS_SYSTEM_TARGET_METRICS.map(m => m.metric_key)).toEqual([
      'leads.created',
      'leads.contacted',
      'leads.qualified',
      'demos.completed',
      'proposals.sent',
      'deals.won',
      'revenue.won',
      'collections.received',
      'tasks.completed',
      'followups.completed',
    ]);
  });
});
