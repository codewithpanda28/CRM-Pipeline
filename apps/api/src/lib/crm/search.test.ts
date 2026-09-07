import { describe, it, expect } from 'vitest';
import {
  CRM_SEARCH_TYPE_ORDER,
  escapeLikePattern,
  likeContains,
  parseCrmSearchTypes,
} from './search';

describe('crm search helpers', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
    expect(likeContains('foo%')).toBe('%foo\\%%');
  });

  it('parses types with fixed default order', () => {
    expect(parseCrmSearchTypes(undefined)).toEqual([...CRM_SEARCH_TYPE_ORDER]);
    expect(parseCrmSearchTypes('deal,lead')).toEqual(['deal', 'lead']);
    expect(parseCrmSearchTypes('nope')).toEqual([...CRM_SEARCH_TYPE_ORDER]);
  });
});
