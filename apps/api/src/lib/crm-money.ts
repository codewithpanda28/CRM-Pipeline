/**
 * Shared CRM money helpers (Phase 3A.4).
 * Persist NUMERIC(18,2) as decimal strings — never float for money math beyond parse/round.
 *
 * Rounding policy (documented + tested):
 * - Half-up to 2 decimal places for all money fields.
 * - Line taxable = round(qty * unit_price) - discount_amount (floor at 0).
 * - Line tax = round(taxable * tax_rate / 100) when tax_rate set; else sum of breakup amounts.
 * - Line total = taxable + tax_amount.
 * - Document subtotal = sum(line taxable); tax_amount = sum(line tax); total = sum(line totals) - doc discount.
 */
export {
  DEFAULT_DEAL_CURRENCY as DEFAULT_CURRENCY,
  normalizeCurrency,
  parseMoneyAmount,
  moneyEquals,
} from './deals/money';

/** Half-up round to 2dp → decimal string. */
export function roundMoneyHalfUp(raw: number): string {
  if (!Number.isFinite(raw)) return '0.00';
  const sign = raw < 0 ? -1 : 1;
  const abs = Math.abs(raw);
  const cents = Math.round(abs * 100 + Number.EPSILON);
  return ((sign * cents) / 100).toFixed(2);
}

/** Parse quantity to number with up to 4dp (NUMERIC 18,4 wire as string). */
export function parseQuantity(raw: unknown, fallback = '1.0000'): string {
  if (raw == null || raw === '') return fallback;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n.toFixed(4);
}

export function moneyToNumber(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function addMoney(a: string, b: string): string {
  return roundMoneyHalfUp(moneyToNumber(a) + moneyToNumber(b));
}

export function subMoney(a: string, b: string): string {
  return roundMoneyHalfUp(moneyToNumber(a) - moneyToNumber(b));
}
