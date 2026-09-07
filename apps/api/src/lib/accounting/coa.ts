/**
 * Phase 5 — default chart of accounts + control account keys.
 */
export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type ControlKey =
  | 'accounts_receivable'
  | 'cash'
  | 'bank'
  | 'accounts_payable'
  | 'tax_payable'
  | 'revenue'
  | 'expense'
  | 'owner_equity';

export const DEFAULT_COA: ReadonlyArray<{
  code: string;
  name: string;
  account_type: AccountType;
  control_key: ControlKey | null;
  is_control: boolean;
}> = [
  { code: '1000', name: 'Cash', account_type: 'asset', control_key: 'cash', is_control: true },
  { code: '1010', name: 'Bank', account_type: 'asset', control_key: 'bank', is_control: true },
  { code: '1100', name: 'Accounts Receivable', account_type: 'asset', control_key: 'accounts_receivable', is_control: true },
  { code: '2000', name: 'Accounts Payable', account_type: 'liability', control_key: 'accounts_payable', is_control: true },
  { code: '2100', name: 'Tax Payable', account_type: 'liability', control_key: 'tax_payable', is_control: true },
  { code: '3000', name: 'Owner Equity', account_type: 'equity', control_key: 'owner_equity', is_control: true },
  { code: '4000', name: 'Sales Revenue', account_type: 'revenue', control_key: 'revenue', is_control: true },
  { code: '5000', name: 'Operating Expense', account_type: 'expense', control_key: 'expense', is_control: true },
];
