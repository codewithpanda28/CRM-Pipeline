/** Shared prefix map for unit tests (mirrors numbering.ts defaults). */
export const DEFAULT_PREFIX_KEYS = {
  invoice: 'INV-',
  credit_note: 'CN-',
  debit_note: 'DN-',
  payment: 'PAY-',
  expense: 'EXP-',
  vendor: 'VEN-',
} as const;
