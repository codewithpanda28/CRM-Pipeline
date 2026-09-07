import { describe, expect, it } from 'vitest';
import { slugFromDomainOrName } from './provision-workspace-tenant';

describe('slugFromDomainOrName', () => {
  it('normalizes domain-like input', () => {
    expect(slugFromDomainOrName('ThinkAIQ CRM', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(
      'thinkaiq-crm',
    );
  });

  it('falls back to id when empty after sanitize', () => {
    const id = '370ce195-e37b-48e3-9ad2-1cc29a7a8bb6';
    expect(slugFromDomainOrName('!!!', id)).toBe(id.replace(/-/g, '').slice(0, 32));
  });
});
