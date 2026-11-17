import type { BankAccount, BankTxn, StatementImport } from "@/hooks/useBankModule";
import { bankSettled } from "@/utils/financeWorkingCapital";

/** Days after a statement's last day before Cash says the statements are behind. */
export const STATEMENT_BEHIND_DAYS = 40;

export type BankPosition = {
  account: BankAccount;
  statement: StatementImport | null;
  /** Closing balance on the last statement up to `asAt`; null when none was uploaded. */
  bankSays: number | null;
  /** Books balance of the linked ledger account on the statement's last day (or `asAt` when no statement); null when not linked. */
  booksSay: number | null;
  difference: number | null;
  toMatch: number;
  behind: boolean;
};

/** One row per bank account: what the bank says, what the books say on the same day, and what is left to match. */
export function bankPosition(
  account: BankAccount,
  imports: StatementImport[],
  transactions: BankTxn[],
  booksOn: (glId: string | null | undefined, date?: string | null) => number | null,
  asAt: string,
): BankPosition {
  const statement = imports.filter(i => i.bank_account_id === account.id && i.period_end <= asAt).sort((a, b) => b.period_end.localeCompare(a.period_end))[0] ?? null;
  const bankSays = statement ? Number(statement.closing_balance) : null;
  const booksSay = booksOn(account.linked_gl_account_id, statement?.period_end ?? asAt);
  const difference = bankSays !== null && booksSay !== null ? Math.round((bankSays - booksSay) * 100) / 100 : null;
  const toMatch = transactions.filter(t => t.bank_account_id === account.id && t.txn_date <= asAt && !bankSettled(t)).length;
  const days = statement ? (Date.parse(asAt) - Date.parse(statement.period_end)) / 86_400_000 : 0;
  return { account, statement, bankSays, booksSay, difference: difference !== null && Math.abs(difference) < 0.005 ? 0 : difference, toMatch, behind: days > STATEMENT_BEHIND_DAYS };
}

/** Short reason shown next to a flagged account. */
export function positionReason(p: BankPosition, monthsBehind: (from: string) => string): string | null {
  if (!p.statement) return null;
  if (p.behind) return `${monthsBehind(p.statement.period_end)} behind`;
  if (p.toMatch) return `${p.toMatch} ${p.toMatch === 1 ? "line" : "lines"} to match`;
  if (p.difference) return "differs from books";
  return null;
}
