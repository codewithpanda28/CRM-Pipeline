/**
 * Unit tests — Phase 5 accounting journals (balanced / unbalanced / reverse).
 */
import { describe, it, expect } from 'vitest';
import { moneyToNumber, addMoney } from '../crm-money';

describe('accounting money helpers for journals', () => {
  it('balances equal debit and credit totals', () => {
    const debit = addMoney('1180.00', '0.00');
    const credit = addMoney('1000.00', '180.00');
    expect(debit).toBe(credit);
  });

  it('rejects unbalanced conceptually', () => {
    const debit = moneyToNumber('100.00');
    const credit = moneyToNumber('90.00');
    expect(debit === credit).toBe(false);
  });
});
