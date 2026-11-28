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

/** Opening assets in the register: cost per asset account, and depreciation to date per accumulated-depreciation account. */
export type OpeningAssets = { cost: Record<string, number>; depreciated: Record<string, number> };

/** Supplier, customer, deposit and asset openings are the detail behind these lines; they must agree. */
export function tbChecks(accounts: TbAccount[], lines: Record<string, TbLine>, detail: { owed: number; credits: number; customers: number; deposits: number; assets?: OpeningAssets }): TbCheck[] {
  const c = controlAccounts(accounts), out: TbCheck[] = [];
  const add = (label: string, d: number, ledger: number) => { if (d || ledger) out.push({ label, detail: r2(d), ledger: r2(ledger), ok: Math.abs(r2(d) - r2(ledger)) < 0.01 }); };
  const name = (id: string) => { const a = accounts.find(x => x.id === id); return a ? `${a.code} ${a.name}` : 'an account'; };
  for (const [id, cost] of Object.entries(detail.assets?.cost ?? {})) add(`Assets vs ${name(id)}`, cost, net(lines[id]));
  for (const [id, dep] of Object.entries(detail.assets?.depreciated ?? {})) add(`Depreciation to date vs ${name(id)}`, dep, -net(lines[id]));
  if (c.payables) add(`Suppliers vs ${c.payables.code} ${c.payables.name}`, detail.owed - detail.credits, -net(lines[c.payables.id]));
  if (c.receivables) add(`Customers vs ${c.receivables.code} ${c.receivables.name}`, detail.customers, net(lines[c.receivables.id]));
  if (c.deposits) add(`Deposits vs ${c.deposits.code} ${c.deposits.name}`, detail.deposits, net(lines[c.deposits.id]));
  return out;
}

export const BALANCE_SHEET_TYPES = ['asset', 'liability', 'equity'] as const;
export const TYPE_LABEL: Record<string, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };

// Common accountant wordings for the same account (UK/HK trial balances).
const SAME: [RegExp, string][] = [[/\bstocks?\b/g, 'inventory'], [/\btrade creditors?\b|\bcreditors?\b/g, 'accounts payable'], [/\btrade debtors?\b|\bdebtors?\b/g, 'accounts receivable'], [/\bcash in hand\b/g, 'cash on hand']];
const norm = (s: string) => { let n = s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); for (const [re, to] of SAME) n = n.replace(re, to); return n; };
/** Which of the client's accounts a printed trial balance line is: same code and name, same name, or the same code. Never a guess. */
export function matchTbAccount(line: { code: string; name: string }, accounts: TbAccount[]): string | null {
  const n = norm(line.name), code = line.code.trim();
  const byName = accounts.filter(a => norm(a.name) === n);
  const both = byName.find(a => code && a.code === code);
  if (both) return both.id;
  if (byName.length === 1) return byName[0].id;
  const byCode = code ? accounts.filter(a => a.code === code) : [];
  if (byCode.length === 1 && !byName.length) {
    // A code alone counts only when the names share a word, so an old chart's numbering is not trusted blindly.
    const words = new Set(n.split(' ').filter(w => w.length > 3));
    if (norm(byCode[0].name).split(' ').some(w => words.has(w))) return byCode[0].id;
  }
  return null;
}

export const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'other_income', 'cogs', 'opex', 'other_expense'];
export const ANY_TYPE_LABEL: Record<string, string> = { ...TYPE_LABEL, revenue: 'Revenue', other_income: 'Other income', cogs: 'Cost of sales', opex: 'Operating expenses', other_expense: 'Other expenses' };
