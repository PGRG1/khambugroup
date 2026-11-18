import { useNavigate } from "react-router-dom";
import { useBankModule } from "@/hooks/useBankModule";
import { useCashLedger } from "@/hooks/useCashLedger";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Toolbar } from "@/components/kit/Toolbar";
import { bankPosition } from "@/utils/cashPosition";
import { getBaseCurrency, formatMoney } from "@/utils/money";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { downloadCSV } from "@/utils/csvDownload";
import { sinceText } from "./CashAccountsView";
import { Hero } from "@/components/finance/accounting/AccountingKit";

/** Reports › Bank reconciliation: read-only, every bank account as at a day. Fixing happens in Cash. */
export function BankReconciliationReport({ asAt }: { asAt: string }) {
  const bank = useBankModule(), scope = useVenueScope(), navigate = useNavigate(), base = getBaseCurrency();
  const ledger = useCashLedger(bank.tenantId, bank.accounts.map(a => a.linked_gl_account_id ?? "").filter(Boolean));
  const rows = bank.accounts.filter(a => !/^(test|qa)(?:\s|$)/i.test(a.account_name.trim()) && (!a.venue || scope.includesName(a.venue)))
    .map(a => {
      const p = bankPosition(a, bank.imports, bank.transactions, ledger.booksOn, asAt), foreign = !!a.currency && a.currency !== base;
      const open = bank.imports.filter(i => i.bank_account_id === a.id && i.period_end <= asAt && !ledger.closeFor(a.id, i.period_start, i.period_end)).length;
      const status = !p.statement ? "No statement" : p.behind ? `Statements ${sinceText(p.statement.period_end, asAt)} behind` : open ? `${open} ${open === 1 ? "month" : "months"} open` : "All months closed";
      return { p, foreign, open, status, flag: !p.statement ? false : p.behind || p.toMatch > 0 || (!foreign && !!p.difference) };
    });
  const loading = bank.loading || ledger.loading;
  const sum = (f: (r: typeof rows[number]) => number | null) => rows.filter(r => !r.foreign).reduce((n, r) => n + (f(r) ?? 0), 0);
  const download = () => downloadCSV(rows.map(r => ({ account: r.p.account.account_name, statement_to: r.p.statement?.period_end ?? "", bank: r.p.bankSays ?? "", books: r.p.booksSay ?? "", difference: r.foreign ? "" : r.p.difference ?? "", unmatched: r.p.toMatch, status: r.status })),
    [{ key: "account", label: "Account" }, { key: "statement_to", label: "Statement to" }, { key: "bank", label: "Bank says" }, { key: "books", label: "Books say" }, { key: "difference", label: "Difference" }, { key: "unmatched", label: "Unmatched lines" }, { key: "status", label: "Months" }], `bank-reconciliation-${asAt}`);
  const money = (r: typeof rows[number], n: number | null, missing = "—") => n === null ? <span className="text-muted-foreground">{missing}</span> : r.foreign ? formatMoney(n, r.p.account.currency) : formatTableCurrency(n);
  const needs = rows.filter(r => r.flag).length, diff = sum(r => r.p.difference), toMatch = rows.reduce((n, r) => n + r.p.toMatch, 0);
  return <><Hero aria="Bank reconciliation summary" busy={loading} label={`As at ${shortDay(asAt)} · every bank account`} check={needs ? `${formatTableInteger(needs)} need you` : "Every account agrees"} checkTone={needs ? "amber" : "ok"}
    stats={[{ label: "Bank says", value: formatTableCurrency(sum(r => r.p.bankSays)), sub: "last statements" }, { label: "Books say", value: formatTableCurrency(sum(r => r.p.booksSay)), sub: "on those days" }, { label: "Difference", value: formatTableCurrency(Math.abs(diff)), sub: toMatch ? `${formatTableInteger(toMatch)} lines to match` : "nothing to match", tone: Math.abs(diff) > 0.005 ? "amber" : "green" }]} />
  <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Bank reconciliation">
    <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>Bank reconciliation</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· as at {shortDay(asAt)} · {formatTableInteger(rows.length)} bank {rows.length === 1 ? "account" : "accounts"}</span></h2>
    <Toolbar onDownload={download} downloadLabel="Download bank reconciliation" />
    <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Bank reconciliation table"><table className="sales-table" aria-label="Bank reconciliation">
      <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Account</th><th scope="col" className="sales-cell-left">Statement to</th><th scope="col" className="sales-cell-right">Bank says</th><th scope="col" className="sales-cell-right">Books say</th><th scope="col" className="sales-cell-right">Difference</th><th scope="col" className="sales-cell-right">Unmatched</th><th scope="col" className="sales-cell-left">Months</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr> : rows.map(r => <tr key={r.p.account.id} className={`sales-record-row ${r.flag ? "sales-attention-row" : ""}`} tabIndex={0} onClick={() => navigate(`/finance/cash?account=${r.p.account.id}`)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); navigate(`/finance/cash?account=${r.p.account.id}`); } }} aria-label={`Open ${r.p.account.account_name} in Cash`}>
        <td className="sales-flag-cell">{r.flag && <span className="sales-flag" role="img" aria-label={r.status} title={r.status}>!</span>}</td>
        <td className="sales-cell-left" title={r.p.account.account_name}>{r.p.account.account_name}</td>
        <td className="sales-cell-left">{r.p.statement ? shortDay(r.p.statement.period_end) : <span className="text-muted-foreground">No statement</span>}</td>
        <td className="kit-num">{money(r, r.p.bankSays)}</td>
        <td className="kit-num">{r.p.booksSay === null ? <span className="text-muted-foreground">Not linked</span> : formatTableCurrency(r.p.booksSay)}</td>
        <td className="kit-num">{!r.foreign && r.p.difference ? <span className="font-semibold text-[#B45309]">{formatTableCurrency(r.p.difference)}</span> : <span className="text-muted-foreground">—</span>}</td>
        <td className="kit-num">{r.p.toMatch ? formatTableInteger(r.p.toMatch) : <span className="text-muted-foreground">—</span>}</td>
        <td className={`sales-cell-left ${r.flag ? "text-[#B45309]" : "text-muted-foreground"}`}>{r.status}</td>
      </tr>)}
      {!loading && rows.length > 0 && <tr><th colSpan={3} className="sales-cell-left font-semibold">Total</th><td className="kit-num font-semibold">{formatTableCurrency(sum(r => r.p.bankSays))}</td><td className="kit-num font-semibold">{formatTableCurrency(sum(r => r.p.booksSay))}</td><td className="kit-num font-semibold">{formatTableCurrency(sum(r => r.p.difference))}</td><td className="kit-num font-semibold">{formatTableInteger(rows.reduce((n, r) => n + r.p.toMatch, 0))}</td><td /></tr>}
      </tbody></table></div>
    <p className="px-1 text-[12px] text-muted-foreground">Read-only. Bank says is the last statement up to this day; books say is the same account on the statement's last day. Click an account to fix it in Cash.</p>
  </section></>;
}
