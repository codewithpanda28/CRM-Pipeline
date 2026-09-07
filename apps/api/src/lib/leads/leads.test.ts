import { describe, it, expect } from 'vitest';
import { canTransitionLeadStatus } from './status';
import {
  normalizeEmail,
  normalizePhoneDigits,
  normalizeWebsiteHost,
  displayLeadName,
} from './normalize';

describe('lead status transitions', () => {
  it('allows new → contacted → qualified', () => {
    expect(canTransitionLeadStatus('new', 'contacted')).toBe(true);
    expect(canTransitionLeadStatus('contacted', 'qualified')).toBe(true);
  });

  it('blocks PATCH into converted', () => {
    expect(canTransitionLeadStatus('qualified', 'converted')).toBe(false);
    expect(canTransitionLeadStatus('converted', 'new')).toBe(false);
  });

  it('allows reopen from lost', () => {
    expect(canTransitionLeadStatus('lost', 'new')).toBe(true);
  });
});

describe('lead normalize', () => {
  it('normalizes email', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    expect(normalizeEmail('')).toBeNull();
  });

  it('normalizes phone digits', () => {
    expect(normalizePhoneDigits('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhoneDigits('123')).toBeNull();
  });

  it('normalizes website host', () => {
    expect(normalizeWebsiteHost('https://www.Acme.com/path')).toBe('acme.com');
    expect(normalizeWebsiteHost('acme.com')).toBe('acme.com');
  });

  it('display name falls back', () => {
    expect(displayLeadName({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace');
    expect(displayLeadName({})).toBe('Untitled lead');
  });
});
