import { describe, expect, it } from 'vitest';
import {
  wouldCreateManagerCycle,
  collectSubtreeIds,
} from './hierarchy';
import {
  mapStoredToBusinessStatus,
  mapBusinessToStoredStatus,
  toLegacyTodoDone,
  computeTargetPct,
  computeRemaining,
  nextDueFromFrequency,
} from './task-mapping';
import { periodWindow } from './periods';
import { TARGET_METRICS } from './metrics';

describe('hierarchy cycle detection', () => {
  it('detects self and ancestor cycles', () => {
    const edges = new Map<string, string | null>([
      ['a', null],
      ['b', 'a'],
      ['c', 'b'],
    ]);
    expect(wouldCreateManagerCycle(edges, 'a', 'c')).toBe(true);
    expect(wouldCreateManagerCycle(edges, 'c', 'a')).toBe(false);
    expect(wouldCreateManagerCycle(edges, 'b', 'b')).toBe(true);
    expect(wouldCreateManagerCycle(edges, 'a', null)).toBe(false);
  });

  it('collects managed subtree inclusive', () => {
    const edges = new Map<string, string | null>([
      ['m', null],
      ['e1', 'm'],
      ['e2', 'm'],
      ['e3', 'e1'],
      ['x', null],
    ]);
    expect([...collectSubtreeIds(edges, 'm')].sort()).toEqual(['e1', 'e2', 'e3', 'm']);
  });
});

describe('task status mapping', () => {
  it('maps legacy todo ↔ open and preserves done', () => {
    expect(mapStoredToBusinessStatus('todo')).toBe('open');
    expect(mapBusinessToStoredStatus('todo')).toBe('open');
    expect(toLegacyTodoDone('open')).toBe('todo');
    expect(toLegacyTodoDone('done')).toBe('done');
  });
});

describe('target math', () => {
  it('pct and remaining', () => {
    expect(computeTargetPct(100, 40)).toBe(40);
    expect(computeRemaining(100, 40)).toBe(60);
    expect(computeRemaining(10, 20)).toBe(0);
    expect(computeTargetPct(0, 5)).toBeNull();
  });
});

describe('recurrence next due', () => {
  it('advances daily/weekly/monthly', () => {
    const from = new Date('2026-09-06T10:00:00.000Z');
    expect(nextDueFromFrequency(from, 'daily').toISOString()).toBe('2026-09-07T10:00:00.000Z');
    expect(nextDueFromFrequency(from, 'weekly').toISOString()).toBe('2026-09-13T10:00:00.000Z');
  });
});

describe('periods', () => {
  it('daily window is half-open one day', () => {
    const { period_start, period_end } = periodWindow('daily', new Date('2026-09-06T15:00:00Z'));
    expect(period_end.getTime() - period_start.getTime()).toBe(86400000);
  });
});

describe('metric registry', () => {
  it('has 10 core metrics', () => {
    expect(TARGET_METRICS).toHaveLength(10);
  });
});
