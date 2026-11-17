export const financeTabs = [
  { label: "Cash", path: "/finance/cash" },
  { label: "Receivables", path: "/finance/receivables" },
  { label: "Payables", path: "/finance/payables" },
  { label: "Close", path: "/finance/close" },
  { label: "Accounting", path: "/finance/books" },
  { label: "Reports", path: "/finance/reports" },
];
/** Close tabs (Rillet layout): the checklist, and everything waiting for approval. */
export const closeTabs = [
  { key: "checklist", label: "Checklist" },
  { key: "approvals", label: "Approvals" },
];
export interface MonthCheck {
  month: string;
  sales_days: number;
  invoices: number;
  payroll: boolean;
  rent: string;
  bank_lines: number;
  bank_unmatched: number;
  missing: string[];
  complete: boolean;
}
export interface BookEntry {
  id: string;
  entry_date: string;
  status: string;
  source_type: string;
  source_id: string | null;
  memo: string;
}
export interface BookLine {
  id: string;
  entry_id: string;
  account_id: string | null;
  debit: number;
  credit: number;
  venue: string | null;
  mapping_status: string | null;
}
export interface BookAccount {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_cash: boolean;
  normal_side: string;
}
export interface TypedLine {
  id: string;
  year: number;
  month: number | null;
  line_item_name: string;
  amount: number;
  notes: string;
}
export function probablyMisreadDate(
  date: string,
  firstSales: string | undefined,
  today: string,
) {
  const future = new Date(`${today}T00:00:00Z`);
  future.setUTCDate(future.getUTCDate() + 60);
  return (
    (!!firstSales && date < firstSales) ||
    date > future.toISOString().slice(0, 10)
  );
}
export function canCloseMonth(check: MonthCheck, today: string) {
  return check.complete && check.month < today.slice(0, 7);
}
export function plGroup(type: string) {
  return ["revenue", "other_income"].includes(type)
    ? "Sales"
    : type === "cogs"
      ? "Cost of sales"
      : ["opex", "other_expense"].includes(type)
        ? "Running costs"
        : null;
}
export function bookAmount(line: BookLine, account: BookAccount) {
  return ["revenue", "other_income"].includes(account.account_type)
    ? Number(line.credit) - Number(line.debit)
    : Number(line.debit) - Number(line.credit);
}
export function typedPosting(amount: number) {
  return { debit: Math.max(-amount, 0), credit: Math.max(amount, 0) };
}
export function reportMonths(dates: string[], from?: string, to?: string) {
  const available = [...new Set(dates.map((d) => d.slice(0, 7)))].filter((m) =>
    /^\d{4}-\d{2}$/.test(m),
  );
  if (!from || !to) return available.sort();
  const months: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  while (d.toISOString().slice(0, 7) <= to.slice(0, 7) && months.length < 240) {
    months.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return months;
}
