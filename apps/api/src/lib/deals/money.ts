/**
 * Canonical Deal money helpers — no floating-point persistence math.
 * Amounts are decimal strings compatible with Postgres NUMERIC(18,2).
 */
const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

export const DEFAULT_DEAL_CURRENCY = 'INR';
/** Temporary product default until tenant currency settings exist (Phase 3A.2+ / finance). */

export function normalizeCurrency(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_DEAL_CURRENCY;
  const c = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return DEFAULT_DEAL_CURRENCY;
  return c;
}

/** Parse user/JSON input into a NUMERIC-safe decimal string for Postgres NUMERIC(18,2).
 * Input numbers are rounded to 2dp for parsing only — persisted value is always a string.
 * Never use JS float arithmetic for money math beyond this parse step.
 */
export function parseMoneyAmount(raw: unknown, fallback = '0.00'): string {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return fallback;
    return (Math.round(raw * 100) / 100).toFixed(2);
  }
  const cleaned = String(raw).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return fallback;
  if (!MONEY_RE.test(cleaned) && !/^-?\d+\.\d+$/.test(cleaned)) {
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return fallback;
    return (Math.round(n * 100) / 100).toFixed(2);
  }
  const [whole, frac = ''] = cleaned.split('.');
  return `${whole}.${(frac + '00').slice(0, 2)}`;
}

export function moneyEquals(a: string, b: string): boolean {
  return parseMoneyAmount(a) === parseMoneyAmount(b);
}
