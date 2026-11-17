import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { useBankModule, BankTxn, StatementImport } from "@/hooks/useBankModule";
import type { useCashLedger } from "@/hooks/useCashLedger";
import { useBaniAccounting } from "@/hooks/useBaniAccounting";
import { Toolbar } from "@/components/kit/Toolbar";
import { QuickFilter } from "@/components/kit/QuickFilter";
import { BankMatchDialog } from "@/components/finance/BankMatchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { bankPosition } from "@/utils/cashPosition";
import { bankSettled } from "@/utils/financeWorkingCapital";
import { getBaseCurrency, formatMoney } from "@/utils/money";
import { formatDate, formatMonthLabel, formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { downloadCSV } from "@/utils/csvDownload";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sinceText } from "./CashAccountsView";

const MATCHED: Record<string, string> = { settlement_batch: "Card payout", payment: "Payment", expense_bill: "Bill", cash_deposit: "Cash deposit", payroll: "Payroll", transfer: "Transfer" };
const matchedLabel = (t: BankTxn) => t.is_transfer ? "Transfer" : t.matched_record_type ? (MATCHED[t.matched_record_type] ?? t.matched_record_type.replace(/_/g, " ")) : t.status === "bank_fee" ? "Bank fee" : t.journal_entry_id ? "Journal entry" : "Matched";
const PAGE = 25;

/** "October 2026" for a whole calendar month, otherwise "1 Oct – 15 Oct". */
function periodLabel(i: StatementImport) {
  const s = i.period_start, e = i.period_end, last = new Date(Date.UTC(Number(e.slice(0, 4)), Number(e.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return s.slice(0, 7) === e.slice(0, 7) && s.endsWith("-01") && e === last ? formatMonthLabel(e.slice(0, 7)) : `${shortDay(s)} – ${shortDay(e)}`;
}

/** One bank account: what the bank and the books say, its lines to match, and its statement months to close. */
export function CashAccountPage({ accountId, bank, ledger, inPeriod, today, initialFilter, disabled, onEdit }: {
  accountId: string; bank: ReturnType<typeof useBankModule>; ledger: ReturnType<typeof useCashLedger>;
  inPeriod: (d?: string | null) => boolean; today: string; initialFilter?: string | null; disabled: boolean; onEdit?: () => void;
}) {
  const bani = useBaniAccounting(), base = getBaseCurrency();
  const [filter, setFilter] = useState(initialFilter ?? "needs"), [search, setSearch] = useState(""), [page, setPage] = useState(1), [txn, setTxn] = useState<BankTxn | null>(null);
  const [closing, setClosing] = useState<StatementImport | null>(null), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { setFilter(initialFilter ?? "needs"); setPage(1); }, [accountId, initialFilter]);
  const account = bank.accounts.find(a => a.id === accountId);
  if (!account) return <section className="card-glass rounded-xl p-6 text-sm text-muted-foreground" aria-busy={bank.loading}>{bank.loading ? "Loading account…" : <>This account isn't available. <Link to="/finance/cash" className="kit-link">Back to accounts</Link></>}</section>;
  const foreign = !!account.currency && account.currency !== base;
  const money = (n: number) => foreign ? formatMoney(n, account.currency) : formatTableCurrency(n);
  const p = bankPosition(account, bank.imports, bank.transactions, ledger.booksOn, today);
  const mine = bank.transactions.filter(t => t.bank_account_id === account.id);
  const rows = mine.filter(t => (filter === "needs" ? !bankSettled(t) : inPeriod(t.txn_date)) && (filter !== "in" || Number(t.money_in) > 0) && (filter !== "out" || Number(t.money_out) > 0)
    && (!search || `${t.description} ${t.reference}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.txn_date.localeCompare(a.txn_date));
  const unmatched = mine.filter(t => !bankSettled(t)).length;
  const hint = (t: BankTxn) => bankSettled(t) ? matchedLabel(t)
    : bani.reviews.find(r => r.source_type === "bank_transaction" && r.source_id === t.id)?.reasons?.join(" · ") || (bank.classify(t)?.suggested_type ? `Bani suggests: ${bank.classify(t)?.suggested_type}` : "Needs a look");
  const statements = bank.imports.filter(i => i.bank_account_id === account.id).sort((a, b) => b.period_end.localeCompare(a.period_end));
  const months = statements.map(i => {
    const lines = mine.filter(t => t.txn_date >= i.period_start && t.txn_date <= i.period_end), left = lines.filter(t => !bankSettled(t)).length;
    const books = ledger.booksOn(account.linked_gl_account_id, i.period_end), diff = books === null || foreign ? null : Math.round((Number(i.closing_balance) - books) * 100) / 100;
    return { i, left, books, diff: diff !== null && Math.abs(diff) < 0.005 ? 0 : diff, closed: ledger.closeFor(account.id, i.period_start, i.period_end) };
  });
  const open = (t: BankTxn) => { if (!bankSettled(t) && !disabled) setTxn(t); };
  async function close() {
    if (!closing || !bank.tenantId) return;
    setBusy(true);
    const { error } = await supabase.rpc("finance_close_bank_period" as never, { p_tenant: bank.tenantId, p_import: closing.id, p_note: note } as never);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Month closed"); setClosing(null); ledger.reload(); await bank.reload(); }
  }
  const download = () => downloadCSV(rows.map(t => ({ date: t.txn_date, line: t.description, in: Number(t.money_in) || "", out: Number(t.money_out) || "", balance: t.running_balance ?? "", matched: hint(t) })),
    [{ key: "date", label: "Date" }, { key: "line", label: "Description" }, { key: "in", label: "Money in" }, { key: "out", label: "Money out" }, { key: "balance", label: "Balance" }, { key: "matched", label: "Matched to" }], `bank-${account.account_name}`);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const stat = (label: string, value: string, sub: string, hot = false) => <div className="min-w-0"><p className="text-[12px] text-muted-foreground whitespace-nowrap">{label}</p><p className={`text-[20px] max-sm:text-[17px] font-semibold td-num whitespace-nowrap ${hot ? "text-[#B45309]" : ""}`}>{value}</p><p className="text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{sub}</p></div>;
  const gl = bank.coa.find(c => c.id === account.linked_gl_account_id);
  return <div className="space-y-5 max-sm:space-y-3 min-w-0">
    <Link to="/finance/cash" className="kit kit-link inline-block px-1 text-[13px]">← Accounts</Link>
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Account" aria-busy={ledger.loading}>
      <h2 className="px-1 text-[18px] font-display font-semibold flex flex-wrap items-baseline gap-x-1.5"><span className="truncate">{account.account_name}</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {[account.currency || base, gl ? `${gl.code} ${gl.name}` : "not linked to the books"].join(" · ")}</span>{onEdit && !disabled && <button type="button" className="kit kit-link text-[13px] font-normal" onClick={onEdit}>Edit</button>}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-1">
        {stat("Bank says", p.bankSays === null ? "—" : money(p.bankSays), p.statement ? `Statement to ${shortDay(p.statement.period_end)}${p.behind ? ` · ${sinceText(p.statement.period_end, today)} behind` : ""}` : "No statement yet", p.behind)}
        {stat("Books say", p.booksSay === null ? "Not linked" : formatTableCurrency(p.booksSay), p.statement ? "Same day" : "Today")}
        {stat("Difference", p.difference ? formatTableCurrency(p.difference) : "—", foreign ? "Different currencies" : p.difference ? (unmatched ? `${formatTableInteger(unmatched)} lines not matched` : "Lines all matched") : p.bankSays === null ? "Upload a statement" : "Agrees", !!p.difference)}
        {stat("Lines to match", formatTableInteger(unmatched), `of ${formatTableInteger(mine.length)} lines`, unmatched > 0)}
      </div>
    </section>
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Lines">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>Lines</span><span className="text-[13px] text-muted-foreground font-normal">· {filter === "needs" ? `${formatTableInteger(rows.length)} to match, any date` : `${formatTableInteger(rows.length)} in this period`}</span></h2>
      <QuickFilter label="Lines" value={filter} onChange={v => { setFilter(v); setPage(1); }} options={[{ key: "needs", label: "Needs a look", count: unmatched }, { key: "all", label: "All" }, { key: "in", label: "Money in" }, { key: "out", label: "Money out" }]} />
      <Toolbar search={search} onSearch={v => { setSearch(v); setPage(1); }} placeholder="Search lines" mobileSearchBelow onDownload={download} downloadLabel="Download lines" />
      <ul className="min-[768px]:hidden kit divide-y divide-border/60" aria-label="Bank lines">{shown.map(t => { const flag = !bankSettled(t), amt = Number(t.money_in) - Number(t.money_out); return <li key={t.id} className={`flex items-center gap-2 px-2 min-h-11 py-2 ${flag ? "bg-[#FDF3F2] cursor-pointer" : ""}`} onClick={() => open(t)}>
        <span className="w-4 shrink-0">{flag && <span className="sales-flag" role="img" aria-label="Not matched">!</span>}</span>
        <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{t.description}</span><span className="td-num shrink-0 text-[14px]">{amt >= 0 ? "+" : "−"}{money(Math.abs(amt))}</span></span><span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{shortDay(t.txn_date)} · {hint(t)}</span></span></li>; })}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Bank lines table"><table className="sales-table" aria-label="Bank lines">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Date</th><th scope="col" className="sales-cell-left">Description</th><th scope="col" className="sales-cell-right">Money in</th><th scope="col" className="sales-cell-right">Money out</th><th scope="col" className="sales-cell-right">Balance</th><th scope="col" className="sales-cell-left">Matched to</th></tr></thead>
        <tbody>{shown.map(t => { const flag = !bankSettled(t); return <tr key={t.id} className={`${flag ? "sales-record-row sales-attention-row" : ""}`} tabIndex={flag ? 0 : undefined} onClick={() => open(t)} onKeyDown={e => { if (flag && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(t); } }}>
          <td className="sales-flag-cell">{flag && <span className="sales-flag" role="img" aria-label="Not matched" title="Not matched">!</span>}</td>
          <td className="sales-cell-left">{shortDay(t.txn_date)}</td>
          <td className="sales-cell-left" title={t.description}>{t.description}</td>
          <td className="kit-num">{Number(t.money_in) > 0 ? money(Number(t.money_in)) : <span className="text-muted-foreground">—</span>}</td>
          <td className="kit-num">{Number(t.money_out) > 0 ? money(Number(t.money_out)) : <span className="text-muted-foreground">—</span>}</td>
          <td className="kit-num">{t.running_balance == null ? <span className="text-muted-foreground">—</span> : money(Number(t.running_balance))}</td>
          <td className={`sales-cell-left ${flag ? "" : "text-muted-foreground"}`}>{hint(t)}{flag && !disabled && <> · <span className="kit-link">Match</span></>}</td>
        </tr>; })}</tbody></table></div>
      {!rows.length && <p className="p-8 text-center text-sm text-muted-foreground">{filter === "needs" ? "Every line is matched." : "No lines in this period."}</p>}
      {rows.length > PAGE && <div className="flex justify-between items-center gap-3 px-1 text-[13px] text-muted-foreground"><span className="td-num">{formatTableInteger((page - 1) * PAGE + 1)}–{formatTableInteger(Math.min(page * PAGE, rows.length))} of {formatTableInteger(rows.length)}</span><span className="flex gap-2"><button type="button" className="kit kit-btn kit-tool-btn" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><button type="button" className="kit kit-btn kit-tool-btn" disabled={page * PAGE >= rows.length} onClick={() => setPage(n => n + 1)}>Next</button></span></div>}
    </section>
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Months">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>Months</span><span className="text-[13px] text-muted-foreground font-normal">· {statements.length ? `${months.filter(m => !m.closed).length} open` : "no statements uploaded"}</span></h2>
      <ul className="min-[768px]:hidden kit divide-y divide-border/60">{months.map(m => <li key={m.i.id} className={`flex items-center gap-2 px-2 min-h-11 py-2 ${!m.closed && m.left ? "bg-[#FDF3F2]" : ""}`}>
        <span className="w-4 shrink-0">{!m.closed && m.left > 0 && <span className="sales-flag" role="img" aria-label="Lines left">!</span>}</span>
        <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{periodLabel(m.i)}</span><span className="td-num shrink-0 text-[14px]">{money(Number(m.i.closing_balance))}</span></span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{m.closed ? `Closed ${m.closed.locked_at ? shortDay(m.closed.locked_at.slice(0, 10)) : ""}` : m.left ? `${formatTableInteger(m.left)} lines left` : m.diff ? `Books ${formatTableCurrency(Math.abs(m.diff))} ${m.diff > 0 ? "lower" : "higher"}` : "Agrees with books"}</span></span>
        {!m.closed && !m.left && <button type="button" className="kit-link text-[13px] shrink-0" disabled={disabled} onClick={() => { setNote(""); setClosing(m.i); }}>Close</button>}
      </li>)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Months table"><table className="sales-table" aria-label="Statement months">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Month</th><th scope="col" className="sales-cell-right">Statement closing</th><th scope="col" className="sales-cell-right">Books on that day</th><th scope="col" className="sales-cell-right">Difference</th><th scope="col" className="sales-cell-right">Lines left</th><th scope="col" className="sales-cell-left">Status</th></tr></thead>
        <tbody>{months.map(m => <tr key={m.i.id} className={!m.closed && m.left ? "sales-attention-row" : ""}>
          <td className="sales-flag-cell">{!m.closed && m.left > 0 && <span className="sales-flag" role="img" aria-label="Lines left" title="Lines left">!</span>}</td>
          <td className="sales-cell-left">{periodLabel(m.i)}</td>
          <td className="kit-num">{money(Number(m.i.closing_balance))}</td>
          <td className="kit-num">{m.books === null ? <span className="text-muted-foreground">Not linked</span> : formatTableCurrency(m.books)}</td>
          <td className="kit-num">{m.diff ? <span className="font-semibold text-[#B45309]">{formatTableCurrency(m.diff)}</span> : <span className="text-muted-foreground">—</span>}</td>
          <td className="kit-num">{m.left ? formatTableInteger(m.left) : <span className="text-muted-foreground">—</span>}</td>
          <td className="sales-cell-left">{m.closed ? <span className="text-muted-foreground">Closed {m.closed.locked_at ? shortDay(m.closed.locked_at.slice(0, 10)) : ""}</span> : m.left ? <button type="button" className="kit-link" onClick={() => { setFilter("needs"); setPage(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Finish {formatTableInteger(m.left)} {m.left === 1 ? "line" : "lines"}</button> : <button type="button" className="kit-link" disabled={disabled} onClick={() => { setNote(""); setClosing(m.i); }}>Close month</button>}</td>
        </tr>)}</tbody></table></div>
      {!statements.length && <p className="p-6 text-center text-sm text-muted-foreground">Upload a statement to start closing months.</p>}
      <p className="px-1 text-[12px] text-muted-foreground">A month closes when every line is matched. If the statement doesn't agree, closing asks for a note.</p>
    </section>
    <BankMatchDialog txn={txn} onClose={() => setTxn(null)} bank={bank} />
    <Dialog open={!!closing} onOpenChange={o => !o && setClosing(null)}><DialogContent><DialogHeader><DialogTitle>Close {closing ? periodLabel(closing) : "month"}</DialogTitle></DialogHeader>
      <p className="text-sm">{closing && `${account.account_name} · ${formatDate(closing.period_start)} – ${formatDate(closing.period_end)} · statement ${money(Number(closing.closing_balance))}`}</p>
      <Label htmlFor="bank-close-note">Note on any difference</Label><Input id="bank-close-note" value={note} onChange={e => setNote(e.target.value)} />
      <DialogFooter><Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button><Button disabled={busy || disabled} onClick={close}>Close month</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
