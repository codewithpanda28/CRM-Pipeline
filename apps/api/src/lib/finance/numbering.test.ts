import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFIX_KEYS } from './numbering.constants';

// numbering.ts needs DB — document expected prefixes without live DB.
describe('finance numbering prefixes', () => {
  it('uses canonical series prefixes', () => {
    expect(DEFAULT_PREFIX_KEYS).toEqual({
      invoice: 'INV-',
      credit_note: 'CN-',
      debit_note: 'DN-',
      payment: 'PAY-',
      expense: 'EXP-',
      vendor: 'VEN-',
    });
  });
});
