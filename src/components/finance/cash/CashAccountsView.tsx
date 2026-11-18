import { Fragment, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { BankAccount, useBankModule } from "@/hooks/useBankModule";
import type { PettyFloat, usePettyCash } from "@/hooks/usePettyCash";
import type { useCashLedger } from "@/hooks/useCashLedger";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Toolbar } from "@/components/kit/Toolbar";
import { FilterPanel, FilterGroup } from "@/components/kit/FilterPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { bankPosition } from "@/utils/cashPosition";
import { getBaseCurrency, formatMoney } from "@/utils/money";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { downloadCSV } from "@/utils/csvDownload";

/** Ledger accounts that hold cash in the tills. */
export const tillAccountIds = (coa: { id: string; name: string; is_cash: boolean }[]) => new Set(coa.filter(a => a.is_cash && /cash on hand|cash in till/i.test(a.name)).map(a => a.id));

/** "6 months" / "45 days" between a date and today. */
export function sinceText(from: string, today: string) {
  const days = Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000);
  if (days < 60) return `${days} days`;
  return `${Math.floor(days / 30.4)} months`;
}

type Tone = "ok" | "amber" | "muted";
type Group = "Banks" | "Cash in tills" | "Cash boxes";
type Row = {
  key: string; group: Group; name: string; currency: string;
  balance: number | null; status: string; tone: Tone; action?: { label: string; run: () => void }; open?: () => void;
  // bank vs books (Columns)
  statementTo: string; bankSays: number | null; booksSay: number | null; difference: number | null; toMatch: number;
};
const GROUPS: Group[] = ["Banks", "Cash in tills", "Cash boxes"];
const TONE: Record<Tone, string> = { ok: "text-[#1F6B5E]", amber: "text-[#B45309]", muted: "text-muted-foreground" };

/**
 * Cash › Accounts: how much cash there is, then one balance and one plain status per bank, till and cash box,
 * with the one thing to do next. Bank vs books stays one click away (Columns, each account, Reports).
 */
export function CashAccountsView({ bank, pc, ledger, asAt, onEditCash, onUpload, onTopUp }: {
  bank: ReturnType<typeof useBankModule>; pc: ReturnType<typeof usePettyCash>; ledger: ReturnType<typeof useCashLedger>;
  asAt: string; today?: string; onEditCash: (f: PettyFloat) => void; onUpload: () => void; onTopUp: () => void;
}) {
  const navigate = useNavigate(), scope = useVenueScope(), base = getBaseCurrency();
  const [search, setSearch] = useState(""), [showTest, setShowTest] = useState(false), [bvb, setBvb] = useState(false);
  const visible = (a: BankAccount) => (showTest || !/^(test|qa)(?:\s|$)/i.test(a.account_name.trim())) && (!a.venue || scope.includesName(a.venue));
  const open = (a: BankAccount, filter?: string) => navigate(`/finance/cash?account=${a.id}${filter ? `&filter=${filter}` : ""}`);
  const bankRows: Row[] = bank.accounts.filter(visible).map(a => {
    const p = bankPosition(a, bank.imports, bank.transactions, ledger.booksOn, asAt), foreign = !!a.currency && a.currency !== base;
    const diff = foreign ? null : p.difference;
    let status: string, tone: Tone, action: Row["action"];
    if (!p.statement) { status = "No statement yet"; tone = "muted"; action = { label: "Upload", run: onUpload }; }
    else if (p.behind) { status = `Statements stop at ${shortDay(p.statement.period_end)}`; tone = "amber"; action = { label: "Upload", run: onUpload }; }
    else if (p.toMatch) { status = `${formatTableInteger(p.toMatch)} ${p.toMatch === 1 ? "line" : "lines"} to match`; tone = "amber"; action = { label: "Match", run: () => open(a, "needs") }; }
    else if (diff) { status = `Books ${formatTableCurrency(Math.abs(diff))} ${diff < 0 ? "higher" : "lower"} than the bank`; tone = "amber"; action = { label: "Check", run: () => open(a) }; }
    else { status = `Matched to ${shortDay(p.statement.period_end)}`; tone = "ok"; }
    return { key: a.id, group: "Banks", name: a.account_name, currency: a.currency || base, balance: p.bankSays ?? p.booksSay, status, tone, action, open: () => open(a),
      statementTo: p.statement ? shortDay(p.statement.period_end) : "No statement", bankSays: p.bankSays, booksSay: p.booksSay, difference: diff, toMatch: p.toMatch };
  });
  // Tills: cash taken in sales, as the books show it (not counted in Bani yet).
  const tillIds = tillAccountIds(bank.coa);
  const tillRows: Row[] = scope.venues.map(v => {
    const books = ledger.venueBooks(tillIds, v.name);
    return { key: `till-${v.id}`, group: "Cash in tills", name: v.name, currency: base, balance: books, status: "From sales · not counted", tone: "muted",
      statementTo: "Not counted", bankSays: null, booksSay: books, difference: null, toMatch: 0 };
  });
  const boxRows: Row[] = pc.floats.filter(f => scope.includesName(f.venue)).map(f => {
    const bal = pc.balanceByFloat[f.id] ?? 0, level = Number(f.replenish_threshold ?? 0), low = bal < level;
    return { key: `box-${f.id}`, group: "Cash boxes", name: f.venue, currency: base, balance: bal,
      status: low ? `Below ${formatTableCurrency(level)} top-up level` : `Float ${formatTableCurrency(Number(f.float_amount))}`, tone: low ? "amber" : "muted",
      action: low ? { label: "Top up", run: onTopUp } : undefined, open: () => onEditCash(f),
      statementTo: "—", bankSays: null, booksSay: bal, difference: null, toMatch: 0 };
  });
  const everything = [...bankRows, ...tillRows, ...boxRows];
  const rows = everything.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const inBase = (r: Row) => r.currency === base;
  const groupTotal = (g: Group, list = everything) => list.filter(r => r.group === g && inBase(r)).reduce((n, r) => n + (r.balance ?? 0), 0);
  const total = GROUPS.reduce((n, g) => n + groupTotal(g), 0);
  const needYou = everything.filter(r => r.tone === "amber").length;
  const shown = GROUPS.filter(g => rows.some(r => r.group === g));
  const loading = bank.loading || ledger.loading || pc.loading;
  const amount = (r: Row, n: number | null): ReactNode => n === null ? <span className="text-muted-foreground">—</span> : inBase(r) ? formatTableCurrency(n) : formatMoney(n, r.currency);
  const actionLink = (r: Row) => r.action ? <button type="button" className="kit-link" onClick={e => { e.stopPropagation(); r.action!.run(); }}>{r.action.label}</button> : null;
  const rowProps = (r: Row) => r.open ? { tabIndex: 0, onClick: r.open, onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.open!(); } }, "aria-label": `Open ${r.name}` } : {};
  const download = () => downloadCSV(everything.map(r => ({ group: r.group, account: r.name, balance: r.balance ?? "", status: r.status, statement_to: r.statementTo, bank: r.bankSays ?? "", books: r.booksSay ?? "", difference: r.difference ?? "", to_match: r.toMatch })),
    [{ key: "group", label: "Group" }, { key: "account", label: "Account" }, { key: "balance", label: "Balance" }, { key: "status", label: "Status" }, { key: "statement_to", label: "Statement to" }, { key: "bank", label: "Bank says" }, { key: "books", label: "Books say" }, { key: "difference", label: "Difference" }, { key: "to_match", label: "Lines to match" }], "cash-accounts");
  const flag = (r: Row) => r.tone === "amber" ? <span className="sales-flag" role="img" aria-label={r.status} title={r.status}>!</span> : null;
  const cols = bvb ? 8 : 5;
  return <>
    <section className="card-glass rounded-xl p-4 min-w-0" aria-label="Cash you have" aria-busy={loading}>
      <p className="px-1 text-[12px] text-muted-foreground whitespace-nowrap">Cash you have · as at {shortDay(asAt)}</p>
      <p className="px-1 mt-0.5 text-[28px] max-sm:text-[24px] font-semibold td-num whitespace-nowrap">{loading ? "…" : formatTableCurrency(total)}</p>
      <div className="mt-3 grid grid-cols-3 gap-3 px-1">{GROUPS.map(g => <div key={g} className="min-w-0"><p className="text-[12px] text-muted-foreground whitespace-nowrap">{g}</p><p className="mt-0.5 text-[15px] max-sm:text-[14px] font-semibold td-num whitespace-nowrap">{formatTableCurrency(groupTotal(g))}</p></div>)}</div>
    </section>
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Accounts" aria-busy={loading}>
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>Accounts</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {formatTableInteger(everything.length)} {everything.length === 1 ? "place" : "places"}{needYou ? ` · ${formatTableInteger(needYou)} need you` : " · all fine"}</span></h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search accounts" mobileSearchBelow onDownload={download} downloadLabel="Download accounts"
        columns={<span className="max-[767px]:hidden contents"><button type="button" className="kit kit-btn kit-tool-btn" aria-pressed={bvb} onClick={() => setBvb(v => !v)}><span className="kit-tool-label">{bvb ? "Columns · simple" : "Columns · bank vs books"}</span></button></span>}
        filter={<FilterPanel activeCount={showTest ? 1 : 0} onReset={() => setShowTest(false)}><FilterGroup title="Show"><Label className="flex gap-2 items-center"><Checkbox checked={showTest} onCheckedChange={v => setShowTest(v === true)} />Test accounts</Label></FilterGroup></FilterPanel>} />
      {/* Phone: name and balance, then one coloured status line with its action. */}
      <div className="min-[768px]:hidden kit">
        {shown.map(g => <Fragment key={g}>
          <p className="mt-3 mb-1 px-2 flex justify-between gap-2 text-[13px] font-semibold text-[color:var(--kit-ink)] whitespace-nowrap"><span>{g}</span><span className="td-num">{formatTableCurrency(groupTotal(g, rows))}</span></p>
          <ul className="divide-y divide-border/60 border-t border-border/60">{rows.filter(r => r.group === g).map(r => <li key={r.key} className={`flex items-center gap-2 px-2 min-h-11 py-2 ${r.tone === "amber" ? "bg-[#FDF3F2]" : ""} ${r.open ? "cursor-pointer" : ""}`} {...rowProps(r)}>
            <span className="w-4 shrink-0">{flag(r)}</span>
            <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{r.name}</span><span className="td-num shrink-0 text-[14px]">{amount(r, r.balance)}</span></span>
              <span className={`mt-0.5 block truncate text-[12px] ${TONE[r.tone]}`}>{r.tone === "ok" ? "✓ " : ""}{r.status}{r.action && <> · {actionLink(r)}</>}</span></span>
          </li>)}</ul></Fragment>)}
        {!rows.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">No accounts yet.</p>}
      </div>
      {/* Computer: balance, status, action; Columns adds bank vs books. */}
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Cash accounts table">
        <table className="sales-table" aria-label="Cash accounts">
          <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Account</th>
            {bvb ? <><th scope="col" className="sales-cell-left">Statement to</th><th scope="col" className="sales-cell-right">Bank says</th><th scope="col" className="sales-cell-right">Books say</th><th scope="col" className="sales-cell-right">Difference</th><th scope="col" className="sales-cell-right">To match</th></>
              : <><th scope="col" className="sales-cell-right">Balance</th><th scope="col" className="sales-cell-left">Status</th></>}
            <th scope="col" className="sales-cell-right"><span className="sr-only">Next step</span></th></tr></thead>
          <tbody>{shown.map(g => <Fragment key={g}>
            <tr className="sales-week-row"><th colSpan={cols - 1}><span>{g}</span></th><td className="kit-num font-semibold">{formatTableCurrency(groupTotal(g, rows))}</td></tr>
            {rows.filter(r => r.group === g).map(r => <tr key={r.key} className={`${r.open ? "sales-record-row" : ""} ${r.tone === "amber" ? "sales-attention-row" : ""}`} {...rowProps(r)}>
              <td className="sales-flag-cell">{flag(r)}</td>
              <td className="sales-cell-left" title={r.name}>{r.name}</td>
              {bvb ? <>
                <td className="sales-cell-left text-muted-foreground">{r.statementTo}</td>
                <td className="kit-num">{amount(r, r.bankSays)}</td>
                <td className="kit-num">{amount(r, r.booksSay)}</td>
                <td className="kit-num">{r.difference ? <span className="font-semibold text-[#B45309]">{formatTableCurrency(r.difference)}</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="kit-num">{r.toMatch ? formatTableInteger(r.toMatch) : <span className="text-muted-foreground">—</span>}</td>
              </> : <>
                <td className="kit-num">{amount(r, r.balance)}</td>
                <td className={`sales-cell-left ${TONE[r.tone]}`}>{r.tone === "ok" ? "✓ " : ""}{r.status}</td>
              </>}
              <td className="kit-num">{actionLink(r)}</td>
            </tr>)}</Fragment>)}
          </tbody></table>
        {!rows.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">No accounts yet.</p>}
      </div>
      <p className="px-1 text-[12px] text-muted-foreground">Balance is the bank's own figure from the last statement; tills and cash boxes show what the books say. Bank vs books is on each account and under Columns.</p>
    </section>
  </>;
}
