import { describe, expect, it } from 'vitest';
import { RECURRING_JOBS } from './catalog';

describe('recurring job catalog', () => {
  it('has unique job names', () => {
    const names = RECURRING_JOBS.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has unique scheduler ids', () => {
    const ids = RECURRING_JOBS.map((j) => j.schedulerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every job is platform-scoped sweep or documents/automation', () => {
    for (const j of RECURRING_JOBS) {
      expect(j.scope).toBe('platform');
      expect(['worker', 'api']).toContain(j.consumer);
      expect(j.everyMs != null || j.cron != null).toBe(true);
      expect(j.scheduleRationale.length).toBeGreaterThan(5);
    }
  });

  it('registers expected migrated workloads', () => {
    const names = new Set(RECURRING_JOBS.map((j) => j.name));
    for (const required of [
      'website.check',
      'infra.alert.eval',
      'infra.db.health',
      'infra.server.staleness',
      'pm.due.soon',
      'pm.overdue.scan',
      'pm.health.recalc',
      'pm.sprint.rollover',
      'pipeline.reminder',
      'system.update.check',
      'metrics.rollup',
      'hub.retention.purge',
      'plugin.cron.fire',
      'license.check',
      'tasks.due.notify',
      'pm.due.alert',
      'pm.recurring.generate',
    ]) {
      expect(names.has(required)).toBe(true);
    }
  });
});
