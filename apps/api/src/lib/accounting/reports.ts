/**
 * GL reports — read journal truth only.
 * Management accounting output — not statutory/GAAP/IFRS certification.
 */
import { sql } from 'kysely';
import type { DbOrTx } from '@vencore/events';
import { addMoney, moneyToNumber, roundMoneyHalfUp, subMoney } from '../crm-money';
import { ensureDefaultChartOfAccounts } from './accounts';

export const REPORT_DISCLAIMER =
  'Management accounting output from posted journals. Not audited GAAP/IFRS or statutory certification.';

export async function reportTrialBalance(
  db: DbOrTx,
  opts: { workspaceId: string; asOf?: string },
) {
  await ensureDefaultChartOfAccounts(db, opts.workspaceId);
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const rows = await sql<{
    account_id: string;
    code: string;
    name: string;
    account_type: string;
    debit: string;
    credit: string;
  }>`
    SELECT a.id AS account_id, a.code, a.name, a.account_type,
           COALESCE(SUM(jl.debit), 0)::text AS debit,
           COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.workspace_id = a.workspace_id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.workspace_id = a.workspace_id
      AND je.status IN ('posted', 'reversed')
      AND je.entry_date <= ${asOf}::date
    WHERE a.workspace_id = ${opts.workspaceId}::uuid
      AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type
    ORDER BY a.code
  `.execute(db);

  const accounts = rows.rows.map((r) => {
    const d = moneyToNumber(r.debit);
    const c = moneyToNumber(r.credit);
    const net = d - c;
    return {
      account_id: r.account_id,
      code: r.code,
      name: r.name,
      account_type: r.account_type,
      debit: net >= 0 ? roundMoneyHalfUp(net) : '0.00',
      credit: net < 0 ? roundMoneyHalfUp(-net) : '0.00',
      gross_debit: roundMoneyHalfUp(d),
      gross_credit: roundMoneyHalfUp(c),
    };
  });

  let totalDebit = '0.00';
  let totalCredit = '0.00';
  for (const a of accounts) {
    totalDebit = addMoney(totalDebit, a.debit);
    totalCredit = addMoney(totalCredit, a.credit);
  }

  return {
    as_of: asOf,
    disclaimer: REPORT_DISCLAIMER,
    accounts,
    total_debit: totalDebit,
    total_credit: totalCredit,
    balanced: totalDebit === totalCredit,
  };
}

export async function reportProfitAndLoss(
  db: DbOrTx,
  opts: { workspaceId: string; from?: string; to?: string },
) {
  await ensureDefaultChartOfAccounts(db, opts.workspaceId);
  const from = opts.from ?? `${new Date().getUTCFullYear()}-01-01`;
  const to = opts.to ?? new Date().toISOString().slice(0, 10);

  const rows = await sql<{
    account_id: string;
    code: string;
    name: string;
    account_type: string;
    debit: string;
    credit: string;
  }>`
    SELECT a.id AS account_id, a.code, a.name, a.account_type,
           COALESCE(SUM(jl.debit), 0)::text AS debit,
           COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.workspace_id = a.workspace_id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.workspace_id = a.workspace_id
      AND je.status IN ('posted', 'reversed')
      AND je.entry_date >= ${from}::date
      AND je.entry_date <= ${to}::date
    WHERE a.workspace_id = ${opts.workspaceId}::uuid
      AND a.account_type IN ('revenue', 'expense')
      AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type
    ORDER BY a.code
  `.execute(db);

  const revenue: Array<{ code: string; name: string; amount: string }> = [];
  const expenses: Array<{ code: string; name: string; amount: string }> = [];
  let revenueTotal = '0.00';
  let expenseTotal = '0.00';

  for (const r of rows.rows) {
    if (r.account_type === 'revenue') {
      const amt = roundMoneyHalfUp(moneyToNumber(r.credit) - moneyToNumber(r.debit));
      if (moneyToNumber(amt) === 0) continue;
      revenue.push({ code: r.code, name: r.name, amount: amt });
      revenueTotal = addMoney(revenueTotal, amt);
    } else {
      const amt = roundMoneyHalfUp(moneyToNumber(r.debit) - moneyToNumber(r.credit));
      if (moneyToNumber(amt) === 0) continue;
      expenses.push({ code: r.code, name: r.name, amount: amt });
      expenseTotal = addMoney(expenseTotal, amt);
    }
  }

  return {
    from,
    to,
    disclaimer: REPORT_DISCLAIMER,
    revenue,
    expenses,
    revenue_total: revenueTotal,
    expense_total: expenseTotal,
    net_income: subMoney(revenueTotal, expenseTotal),
  };
}

export async function reportBalanceSheet(
  db: DbOrTx,
  opts: { workspaceId: string; asOf?: string },
) {
  await ensureDefaultChartOfAccounts(db, opts.workspaceId);
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);

  const rows = await sql<{
    code: string;
    name: string;
    account_type: string;
    debit: string;
    credit: string;
  }>`
    SELECT a.code, a.name, a.account_type,
           COALESCE(SUM(jl.debit), 0)::text AS debit,
           COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM accounts a
    LEFT JOIN journal_lines jl ON jl.account_id = a.id AND jl.workspace_id = a.workspace_id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.workspace_id = a.workspace_id
      AND je.status IN ('posted', 'reversed')
      AND je.entry_date <= ${asOf}::date
    WHERE a.workspace_id = ${opts.workspaceId}::uuid
      AND a.account_type IN ('asset', 'liability', 'equity')
      AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type
    ORDER BY a.code
  `.execute(db);

  // Include YTD net income into equity for management BS
  const pnl = await reportProfitAndLoss(db, {
    workspaceId: opts.workspaceId,
    from: `${asOf.slice(0, 4)}-01-01`,
    to: asOf,
  });

  const assets: Array<{ code: string; name: string; amount: string }> = [];
  const liabilities: Array<{ code: string; name: string; amount: string }> = [];
  const equity: Array<{ code: string; name: string; amount: string }> = [];
  let assetsTotal = '0.00';
  let liabilitiesTotal = '0.00';
  let equityTotal = '0.00';

  for (const r of rows.rows) {
    if (r.account_type === 'asset') {
      const amt = roundMoneyHalfUp(moneyToNumber(r.debit) - moneyToNumber(r.credit));
      if (moneyToNumber(amt) === 0) continue;
      assets.push({ code: r.code, name: r.name, amount: amt });
      assetsTotal = addMoney(assetsTotal, amt);
    } else if (r.account_type === 'liability') {
      const amt = roundMoneyHalfUp(moneyToNumber(r.credit) - moneyToNumber(r.debit));
      if (moneyToNumber(amt) === 0) continue;
      liabilities.push({ code: r.code, name: r.name, amount: amt });
      liabilitiesTotal = addMoney(liabilitiesTotal, amt);
    } else {
      const amt = roundMoneyHalfUp(moneyToNumber(r.credit) - moneyToNumber(r.debit));
      if (moneyToNumber(amt) === 0) continue;
      equity.push({ code: r.code, name: r.name, amount: amt });
      equityTotal = addMoney(equityTotal, amt);
    }
  }

  if (moneyToNumber(pnl.net_income) !== 0) {
    equity.push({ code: 'NI', name: 'Net Income (YTD)', amount: pnl.net_income });
    equityTotal = addMoney(equityTotal, pnl.net_income);
  }

  return {
    as_of: asOf,
    disclaimer: REPORT_DISCLAIMER,
    assets,
    liabilities,
    equity,
    assets_total: assetsTotal,
    liabilities_total: liabilitiesTotal,
    equity_total: equityTotal,
    liabilities_and_equity_total: addMoney(liabilitiesTotal, equityTotal),
  };
}

/** Indirect cash flow (MVP): operating ≈ net income + AR/AP/tax movements approximation from cash/bank accounts. */
export async function reportCashFlow(
  db: DbOrTx,
  opts: { workspaceId: string; from?: string; to?: string },
) {
  await ensureDefaultChartOfAccounts(db, opts.workspaceId);
  const from = opts.from ?? `${new Date().getUTCFullYear()}-01-01`;
  const to = opts.to ?? new Date().toISOString().slice(0, 10);

  const pnl = await reportProfitAndLoss(db, { workspaceId: opts.workspaceId, from, to });

  const cashRows = await sql<{ debit: string; credit: string }>`
    SELECT COALESCE(SUM(jl.debit), 0)::text AS debit,
           COALESCE(SUM(jl.credit), 0)::text AS credit
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    JOIN accounts a ON a.id = jl.account_id
    WHERE jl.workspace_id = ${opts.workspaceId}::uuid
      AND je.status IN ('posted', 'reversed')
      AND je.entry_date >= ${from}::date
      AND je.entry_date <= ${to}::date
      AND a.control_key IN ('cash', 'bank')
  `.execute(db);

  const cashIn = roundMoneyHalfUp(moneyToNumber(cashRows.rows[0]?.debit ?? '0'));
  const cashOut = roundMoneyHalfUp(moneyToNumber(cashRows.rows[0]?.credit ?? '0'));
  const netCash = subMoney(cashIn, cashOut);

  return {
    from,
    to,
    disclaimer: REPORT_DISCLAIMER,
    method: 'indirect_mvp',
    operating: {
      net_income: pnl.net_income,
      cash_receipts: cashIn,
      cash_payments: cashOut,
      net_cash_from_operations: netCash,
    },
    investing: { net: '0.00' },
    financing: { net: '0.00' },
    net_change_in_cash: netCash,
  };
}

export async function reportAccountLedger(
  db: DbOrTx,
  opts: { workspaceId: string; accountId: string; from?: string; to?: string },
) {
  const from = opts.from ?? `${new Date().getUTCFullYear()}-01-01`;
  const to = opts.to ?? new Date().toISOString().slice(0, 10);

  const account = await db
    .selectFrom('accounts')
    .selectAll()
    .where('id', '=', opts.accountId)
    .where('workspace_id', '=', opts.workspaceId)
    .executeTakeFirst();
  if (!account) return null;

  const lines = await sql<{
    entry_id: string;
    entry_number: string;
    entry_date: string;
    memo: string | null;
    line_no: number;
    description: string | null;
    debit: string;
    credit: string;
  }>`
    SELECT je.id AS entry_id, je.entry_number, je.entry_date::text, je.memo,
           jl.line_no, jl.description, jl.debit::text, jl.credit::text
    FROM journal_lines jl
    JOIN journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.workspace_id = ${opts.workspaceId}::uuid
      AND jl.account_id = ${opts.accountId}::uuid
      AND je.status IN ('posted', 'reversed')
      AND je.entry_date >= ${from}::date
      AND je.entry_date <= ${to}::date
    ORDER BY je.entry_date, je.entry_number, jl.line_no
  `.execute(db);

  let running = '0.00';
  const entries = lines.rows.map((r) => {
    running = addMoney(running, subMoney(r.debit, r.credit));
    return { ...r, running_balance: running };
  });

  return {
    account,
    from,
    to,
    disclaimer: REPORT_DISCLAIMER,
    entries,
  };
}
