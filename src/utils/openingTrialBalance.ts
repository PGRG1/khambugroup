// Opening trial balance rules (Settings › Books setup). One balance per balance-sheet account at the
// day before the books start; any difference goes to Opening Balance Equity when posted.
export type TbAccount = { id: string; code: string; name: string; account_type: string };
export type TbLine = { debit: number; credit: number };
export type TbCheck = { label: string; detail: number; ledger: number; ok: boolean };

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function tbTotals(lines: Record<string, TbLine>) {
  let debit = 0, credit = 0;
  for (const l of Object.values(lines)) { debit += Number(l.debit) || 0; credit += Number(l.credit) || 0; }
  debit = r2(debit); credit = r2(credit);
  // Positive = more debits, so Opening Balance Equity takes a credit for it.
  return { debit, credit, difference: r2(debit - credit) };
}

const byName = (accounts: TbAccount[], names: string[], code: string) =>
  accounts.find(a => names.includes(a.name.trim().toLowerCase())) ?? accounts.find(a => a.code === code);

/** The account a set of detail rows must add up to (credit balance for Payables, debit for the rest). */
export function controlAccounts(accounts: TbAccount[]) {
  return {
    payables: byName(accounts, ['accounts payable', 'trade payables'], '2000'),
    receivables: byName(accounts, ['accounts receivable', 'trade receivables'], '1100'),
    deposits: byName(accounts, ['supplier deposits'], '1300'),
  };
}

const net = (l?: TbLine) => r2((Number(l?.debit) || 0) - (Number(l?.credit) || 0));

/** Supplier, customer and deposit openings are the detail behind these lines; they must agree. */
export function tbChecks(accounts: TbAccount[], lines: Record<string, TbLine>, detail: { owed: number; credits: number; customers: number; deposits: number }): TbCheck[] {
  const c = controlAccounts(accounts), out: TbCheck[] = [];
  const add = (label: string, d: number, ledger: number) => { if (d || ledger) out.push({ label, detail: r2(d), ledger: r2(ledger), ok: Math.abs(r2(d) - r2(ledger)) < 0.01 }); };
  if (c.payables) add(`Suppliers vs ${c.payables.code} ${c.payables.name}`, detail.owed - detail.credits, -net(lines[c.payables.id]));
  if (c.receivables) add(`Customers vs ${c.receivables.code} ${c.receivables.name}`, detail.customers, net(lines[c.receivables.id]));
  if (c.deposits) add(`Deposits vs ${c.deposits.code} ${c.deposits.name}`, detail.deposits, net(lines[c.deposits.id]));
  return out;
}

export const BALANCE_SHEET_TYPES = ['asset', 'liability', 'equity'] as const;
export const TYPE_LABEL: Record<string, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };
