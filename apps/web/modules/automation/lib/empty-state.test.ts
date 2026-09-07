/**
 * Pure helpers for Automation ON/OFF + empty-state UX (no React / no DB).
 */
import { describe, expect, it } from 'vitest';
import { AUTOMATION_TEMPLATES } from './templates';

export function emptyAutomationsCopy() {
  return {
    title: 'No automations yet',
    description: 'Automate repetitive work in a few simple steps.',
    primaryCta: 'Create Automation',
    secondaryCta: 'Browse Templates',
    hint: 'Start with a ready-made automation or build your own.',
  };
}

export function engineStatusCopy(enabled: boolean) {
  return {
    badge: enabled ? 'Active' : 'Off',
    body: enabled
      ? 'Automation is active and published automations can run.'
      : 'Automation is off. Published automations will not start new Automation v2 runs.',
  };
}

/** UI must not flip until server succeeds — model local pending separately. */
export function nextEnabledAfterToggle(opts: {
  current: boolean;
  requestSucceeded: boolean;
  requested: boolean;
}): boolean {
  if (!opts.requestSucceeded) return opts.current;
  return opts.requested;
}

export function shouldConfirmEngineOff(publishedCount: number, turningOff: boolean): boolean {
  return turningOff && publishedCount > 0;
}

describe('empty automations UX copy', () => {
  it('uses intentional empty-state messaging', () => {
    const c = emptyAutomationsCopy();
    expect(c.title).toBe('No automations yet');
    expect(c.primaryCta).toBe('Create Automation');
    expect(c.secondaryCta).toBe('Browse Templates');
    expect(c.description.toLowerCase()).toContain('automate');
  });

  it('surfaces all five Round 2A templates for entry', () => {
    expect(AUTOMATION_TEMPLATES).toHaveLength(5);
    expect(AUTOMATION_TEMPLATES.map((t) => t.name)).toEqual([
      'Never miss a new lead',
      'Follow up on unpaid invoices',
      'Convert accepted quote into next business step',
      'Remind customers before appointments',
      'Follow up after a sales call',
    ]);
  });
});

describe('engine ON/OFF UX', () => {
  it('shows Active / Off badge copy', () => {
    expect(engineStatusCopy(true).badge).toBe('Active');
    expect(engineStatusCopy(false).badge).toBe('Off');
    expect(engineStatusCopy(false).body).toContain('will not start');
  });

  it('does not change UI state when toggle request fails', () => {
    expect(
      nextEnabledAfterToggle({ current: true, requestSucceeded: false, requested: false }),
    ).toBe(true);
    expect(
      nextEnabledAfterToggle({ current: false, requestSucceeded: false, requested: true }),
    ).toBe(false);
  });

  it('updates only after successful request', () => {
    expect(
      nextEnabledAfterToggle({ current: true, requestSucceeded: true, requested: false }),
    ).toBe(false);
  });

  it('confirms OFF when published automations exist', () => {
    expect(shouldConfirmEngineOff(2, true)).toBe(true);
    expect(shouldConfirmEngineOff(0, true)).toBe(false);
    expect(shouldConfirmEngineOff(3, false)).toBe(false);
  });
});
