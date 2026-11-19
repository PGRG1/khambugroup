import { shortMoney } from '@/utils/revenueOverview';
import { Hero } from '@/components/finance/accounting/AccountingKit';
import { Fragment, useEffect, useState } from "react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
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
const PAGE = 50;
type Kind = "matched" | "ask" | "waiting" | "checking";

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
  const [filter, setFilter] = useState(initialFilter ?? "all"), [search, setSearch] = useState(""), [page, setPage] = useState(1), [txn, setTxn] = useState<BankTxn | null>(null);
  const [closing, setClosing] = useState<StatementImport | null>(null), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { setFilter(initialFilter ?? "all"); setPage(1); }, [accountId, initialFilter]);
  // While Bani still has lines of this account to check, look again every 20 seconds.
  const reviewOf = (id: string) => bani.reviews.find(r => r.source_type === "bank_transaction" && r.source_id === id);
  const checkingIds = bank.transactions.filter(t => t.bank_account_id === accountId && !bankSettled(t) && (!reviewOf(t.id) || ["queued", "checking"].includes(reviewOf(t.id).status))).map(t => t.id);
  useEffect(() => {
    if (!checkingIds.length) return;
    const timer = window.setInterval(() => { void bani.refresh(); void bank.reload(); }, 20_000);
    return () => window.clearInterval(timer);
  }, [checkingIds.length > 0, accountId]); // eslint-disable-line react-hooks/exhaustive-deps
  const account = bank.accounts.find(a => a.id === accountId);
  if (!account) return <section className="card-glass rounded-xl p-6 text-sm text-muted-foreground" aria-busy={bank.loading}>{bank.loading ? "Loading account…" : <>This account isn't available. <Link to="/finance/cash" className="kit-link">Back to accounts</Link></>}</section>;
  const foreign = !!account.currency && account.currency !== base;
  const money = (n: number) => foreign ? formatMoney(n, account.currency) : formatTableCurrency(n);
  const p = bankPosition(account, bank.imports, bank.transactions, ledger.booksOn, today);
  const mine = bank.transactions.filter(t => t.bank_account_id === account.id);
  // What Bani has done with each line: matched it, has a question, is waiting for a document, or hasn't reached it yet.
  const kindOf = (t: BankTxn): Kind => {
    if (bankSettled(t)) return "matched";
    const r = reviewOf(t.id);
    if (!r || ["queued", "checking"].includes(r.status)) return "checking";
    return (r.reasons ?? []).some((x: string) => /^Waiting/.test(x)) ? "waiting" : "ask";
  };
  const reasonOf = (t: BankTxn) => ((reviewOf(t.id)?.reasons ?? []) as string[]).join(" · ") || "I couldn't match this one";
  // Statement order: oldest first, as the bank prints it (lines arrive newest first, so reverse before the stable sort).
  const inView = (t: BankTxn) => filter === "needs" ? kindOf(t) === "ask" : filter === "waiting" ? kindOf(t) === "waiting" : inPeriod(t.txn_date) && (filter !== "matched" || kindOf(t) === "matched");
  const rows = [...mine].reverse().filter(t => inView(t) && (!search || `${t.description} ${t.reference}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  const unmatched = mine.filter(t => !bankSettled(t)).length;
  const count = (k: Kind, periodOnly = false) => mine.filter(t => kindOf(t) === k && (!periodOnly || inPeriod(t.txn_date))).length;
  const hint = (t: BankTxn) => { const k = kindOf(t); return k === "matched" ? matchedLabel(t) + (reviewOf(t.id)?.status === "posted" ? " · by Bani" : "") : k === "checking" ? "Bani is checking…" : reasonOf(t); };
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
  // Opening and closing balance rows when the whole period is shown in statement order.
  const first = rows[0], last = rows[rows.length - 1];
  const opening = filter === "all" && !search && page === 1 && first?.running_balance != null ? Number(first.running_balance) - Number(first.money_in) + Number(first.money_out) : null;
  const closingBal = filter === "all" && !search && page * PAGE >= rows.length && last?.running_balance != null ? Number(last.running_balance) : null;
  const closingStatement = last ? bank.imports.find(i => i.bank_account_id === account.id && i.period_end === last.txn_date) : undefined;
  const cell = (t: BankTxn) => { const k = kindOf(t); return k === "matched" ? <span className="text-[#1F6B5E]">✓ {hint(t)}</span> : k === "ask" ? <span className="text-[#B45309]">Bani has a question</span> : k === "waiting" ? <span className="text-muted-foreground">◷ {reasonOf(t)}</span> : <span className="text-muted-foreground">Bani is checking…</span>; };
  const ask = (t: BankTxn) => <span className="flex flex-wrap items-center gap-2 text-[13px]"><span><b className="font-semibold text-[color:var(--kit-ink)]">Bani asks:</b> {reasonOf(t)}. Which is it?</span>{!disabled && <button type="button" className="kit kit-btn kit-tool-btn h-8" onClick={e => { e.stopPropagation(); open(t); }}>Match it</button>}</span>;
  const gl = bank.coa.find(c => c.id === account.linked_gl_account_id);
  return <div className="space-y-5 max-sm:space-y-3 min-w-0">
    <Link to="/finance/cash" className="kit kit-link inline-block px-1 text-[13px]">← Accounts</Link>
    <div className="px-1"><h2 className="text-[18px] font-display font-semibold flex flex-wrap items-baseline gap-x-1.5"><span className="truncate">{account.account_name}</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {[account.currency || base, gl ? `${gl.code} ${gl.name}` : "not linked to the books"].join(" · ")}</span>{onEdit && !disabled && <button type="button" className="kit kit-link text-[13px] font-normal" onClick={onEdit}>Edit</button>}</h2></div>
    <Hero aria="Account" busy={ledger.loading} label={p.statement ? shortDay(p.statement.period_end) : 'no statement'}
      check={p.bankSays === null ? 'Upload a statement' : p.behind ? `${sinceText(p.statement!.period_end, today)} behind` : foreign ? 'Other currency' : p.difference ? `Off by ${shortMoney(Math.abs(p.difference))}` : 'Agrees'}
      checkTone={p.bankSays === null || p.behind || (!foreign && p.difference) ? 'amber' : foreign ? 'mut' : 'ok'}
      stats={[{ label: 'Bank says', value: p.bankSays === null ? '—' : shortMoney(p.bankSays) }, { label: 'Books say', value: p.booksSay === null ? 'Not linked' : shortMoney(p.booksSay) }, { label: 'Difference', value: p.difference ? shortMoney(p.difference) : '—', tone: p.difference ? 'amber' : undefined }, { label: 'To match', value: formatTableInteger(unmatched), tone: unmatched ? 'amber' : undefined }]} />
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Statement">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        <h2 className="text-base font-display font-semibold flex flex-wrap gap-x-1.5"><span>Statement</span><span className="text-[13px] text-muted-foreground font-normal">· {filter === "needs" ? `${formatTableInteger(rows.length)} questions, any date` : filter === "waiting" ? `${formatTableInteger(rows.length)} waiting, any date` : `${formatTableInteger(rows.length)} lines in this period`}</span></h2>
        {checkingIds.length > 0 && <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground whitespace-nowrap"><BaniProcessingMark size={14} />Bani is matching · {formatTableInteger(checkingIds.length)} to check</span>}
      </div>
      <QuickFilter label="Lines" value={filter} onChange={v => { setFilter(v); setPage(1); }} options={[{ key: "all", label: "All" }, { key: "needs", label: "Needs you", count: count("ask") }, { key: "waiting", label: "Waiting", count: count("waiting") }, { key: "matched", label: "Matched", count: count("matched", true) }]} />
      <Toolbar search={search} onSearch={v => { setSearch(v); setPage(1); }} placeholder="Search lines" mobileSearchBelow onDownload={download} downloadLabel="Download lines" />
      {/* Phone: one line per bank line, Bani's status under it, his question opening right there. */}
      <ul className="min-[768px]:hidden kit divide-y divide-border/60" aria-label="Bank lines">
        {opening !== null && <li className="flex justify-between gap-2 px-2 py-2.5 bg-[#F6F8F7] text-[13px] font-semibold text-[color:var(--kit-ink)]"><span>Opening balance</span><span className="td-num">{money(opening)}</span></li>}
        {shown.map(t => { const k = kindOf(t), amt = Number(t.money_in) - Number(t.money_out); return <li key={t.id} className={`px-2 py-2.5 ${k === "ask" ? "bg-[#FDF3F2]" : ""}`}>
          <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{t.description}</span><span className="td-num shrink-0 text-[14px]">{amt >= 0 ? "+" : "−"}{money(Math.abs(amt))}</span></span>
          <span className="mt-0.5 flex items-baseline justify-between gap-2 text-[12px]"><span className="truncate"><span className="text-muted-foreground">{shortDay(t.txn_date)} · </span>{cell(t)}</span>{t.running_balance != null && <span className="td-num shrink-0 text-muted-foreground">{money(Number(t.running_balance))}</span>}</span>
          {k === "ask" && <span className="mt-2 block">{ask(t)}</span>}
        </li>; })}
        {closingBal !== null && <li className="flex justify-between gap-2 px-2 py-2.5 bg-[#F6F8F7] text-[13px] font-semibold text-[color:var(--kit-ink)]"><span>Closing balance</span><span className="td-num">{money(closingBal)}</span></li>}
      </ul>
      {/* Computer: the statement's own columns, then Bani's. */}
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Statement table"><table className="sales-table" aria-label="Statement lines">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Date</th><th scope="col" className="sales-cell-left">Description</th><th scope="col" className="sales-cell-right">Money in</th><th scope="col" className="sales-cell-right">Money out</th><th scope="col" className="sales-cell-right">Balance</th><th scope="col" className="sales-cell-left">Bani</th></tr></thead>
        <tbody>
          {opening !== null && <tr className="sales-week-row"><td /><td className="sales-cell-left text-muted-foreground">{shortDay(first.txn_date)}</td><th className="sales-cell-left">Opening balance</th><td /><td /><td className="kit-num font-semibold">{money(opening)}</td><td /></tr>}
          {shown.map(t => { const k = kindOf(t); return <Fragment key={t.id}><tr className={k === "ask" ? "sales-attention-row" : ""}>
            <td className="sales-flag-cell">{k === "ask" && <span className="sales-flag" role="img" aria-label="Bani has a question" title="Bani has a question">!</span>}</td>
            <td className="sales-cell-left">{shortDay(t.txn_date)}</td>
            <td className="sales-cell-left" title={t.description}>{t.description}</td>
            <td className="kit-num">{Number(t.money_in) > 0 ? money(Number(t.money_in)) : <span className="text-muted-foreground">—</span>}</td>
            <td className="kit-num">{Number(t.money_out) > 0 ? money(Number(t.money_out)) : <span className="text-muted-foreground">—</span>}</td>
            <td className="kit-num">{t.running_balance == null ? <span className="text-muted-foreground">—</span> : money(Number(t.running_balance))}</td>
            <td className="sales-cell-left">{cell(t)}</td>
          </tr>{k === "ask" && <tr className="sales-attention-row"><td /><td colSpan={6} className="sales-cell-left !h-auto pb-3">{ask(t)}</td></tr>}</Fragment>; })}
          {closingBal !== null && <tr className="sales-week-row"><td /><td className="sales-cell-left text-muted-foreground">{shortDay(last.txn_date)}</td><th className="sales-cell-left">Closing balance</th><td /><td /><td className="kit-num font-semibold">{money(closingBal)}</td><td className="sales-cell-left">{closingStatement ? Math.abs(Number(closingStatement.closing_balance) - closingBal) < 0.005 ? <span className="text-[#1F6B5E]">✓ agrees with the statement</span> : <span className="text-[#B45309]">Statement says {money(Number(closingStatement.closing_balance))}</span> : null}</td></tr>}
        </tbody></table></div>
      {!rows.length && <p className="p-8 text-center text-sm text-muted-foreground">{filter === "needs" ? "No questions from Bani." : filter === "waiting" ? "Nothing is waiting for a document." : "No lines in this period."}</p>}
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
    </section>
    <BankMatchDialog txn={txn} onClose={() => setTxn(null)} bank={bank} />
    <Dialog open={!!closing} onOpenChange={o => !o && setClosing(null)}><DialogContent><DialogHeader><DialogTitle>Close {closing ? periodLabel(closing) : "month"}</DialogTitle></DialogHeader>
      <p className="text-sm">{closing && `${account.account_name} · ${formatDate(closing.period_start)} – ${formatDate(closing.period_end)} · statement ${money(Number(closing.closing_balance))}`}</p>
      <Label htmlFor="bank-close-note">Note on any difference</Label><Input id="bank-close-note" value={note} onChange={e => setNote(e.target.value)} />
      <DialogFooter><Button variant="outline" onClick={() => setClosing(null)}>Cancel</Button><Button disabled={busy || disabled} onClick={close}>Close month</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
