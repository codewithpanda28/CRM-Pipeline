import { describe, expect, it } from 'vitest';
import { canonicalizeEventType } from './aliases';
import { outboxMetrics } from './metrics';

describe('event aliases', () => {
  it('maps legacy short names', () => {
    expect(canonicalizeEventType('contact.created')).toBe('crm.contact.created');
    expect(canonicalizeEventType('crm.deal.won')).toBe('crm.deal.won');
  });
});

describe('outbox metrics', () => {
  it('snapshots counters', () => {
    outboxMetrics.published += 1;
    const s = outboxMetrics.snapshot();
    expect(s.published).toBeGreaterThanOrEqual(1);
  });
});
