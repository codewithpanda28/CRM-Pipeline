import { describe, it, expect } from 'vitest';
import { computeDropPosition } from '../pipeline/item-move';
import { parseRecordRef } from '../../routes/crm-records';

describe('computeDropPosition', () => {
  it('inserts mid-column excluding dragged id', () => {
    expect(computeDropPosition(['a', 'b', 'c'], 'b', 0)).toBe(0);
    expect(computeDropPosition(['a', 'b', 'c'], 'b', 2)).toBe(2);
    expect(computeDropPosition(['a', 'b', 'c'], 'x', 1)).toBe(1);
  });
});

describe('parseRecordRef', () => {
  it('parses lead/party/deal refs', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(parseRecordRef(`lead:${id}`)).toEqual({ kind: 'lead', id });
    expect(parseRecordRef(`party:${id}`)).toEqual({ kind: 'party', id });
    expect(parseRecordRef(`deal:${id}`)).toEqual({ kind: 'deal', id });
    expect(parseRecordRef('lead:not-a-uuid')).toBeNull();
  });
});
