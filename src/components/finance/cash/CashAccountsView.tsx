import { Fragment, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { BankAccount, useBankModule } from "@/hooks/useBankModule";
import type { PettyFloat, usePettyCash } from "@/hooks/usePettyCash";
import type { useFinanceBooks } from "@/hooks/useFinanceBooks";
import type { useCashLedger } from "@/hooks/useCashLedger";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Toolbar } from "@/components/kit/Toolbar";
import { FilterPanel, FilterGroup } from "@/components/kit/FilterPanel";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NeedYouLine } from "@/components/hr/NeedYouLine";
import { bankPosition, type BankPosition } from "@/utils/cashPosition";
import { getBaseCurrency, formatMoney } from "@/utils/money";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { downloadCSV } from "@/utils/csvDownload";
import type { PageWorkItem } from "@/utils/baniPageWork";

type Row = { key: string; group: string; name: string; dateText: string; reason: string | null; bankSays: number | null; booksSay: number | null; difference: number | null; toMatch: number; currency: string; flag: boolean; open?: () => void; missing?: string };

/** "6 months" / "45 days" between a date and today. */
export function sinceText(from: string, today: string) {
  const days = Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000);
  if (days < 60) return `${days} days`;
  return `${Math.floor(days / 30.4)} months`;
}

/** Cash › Accounts: every bank account, till and cash box with what the bank says and what the books say. Tap an account to open it. */
export function CashAccountsView({ bank, books, pc, ledger, asAt, today, onEditCash }: {
  bank: ReturnType<typeof useBankModule>; books: ReturnType<typeof useFinanceBooks>; pc: ReturnType<typeof usePettyCash>; ledger: ReturnType<typeof useCashLedger>;
  asAt: string; today: string; onEditCash: (f: PettyFloat) => void;
}) {
  const navigate = useNavigate(), scope = useVenueScope(), base = getBaseCurrency();
  const [search, setSearch] = useState(""), [showTest, setShowTest] = useState(false);
  const visible = (a: BankAccount) => (showTest || !/^(test|qa)(?:\s|$)/i.test(a.account_name.trim())) && (!a.venue || scope.includesName(a.venue));
  const accounts = bank.accounts.filter(visible);
  const positions: BankPosition[] = accounts.map(a => bankPosition(a, bank.imports, bank.transactions, ledger.booksOn, asAt));
  const open = (a: BankAccount, filter?: string) => navigate(`/finance/cash?account=${a.id}${filter ? `&filter=${filter}` : ""}`);
  const bankRows: Row[] = positions.map(p => {
    const foreign = !!p.account.currency && p.account.currency !== base;
    const reason = !p.statement ? null : p.behind ? `${sinceText(p.statement.period_end, asAt)} behind` : p.toMatch ? `${formatTableInteger(p.toMatch)} to match` : p.difference && !foreign ? "differs from books" : null;
    return { key: p.account.id, group: (p.account as BankAccount & { group_label?: string | null }).group_label || p.account.bank_name || "Bank", name: p.account.account_name,
      dateText: p.statement ? shortDay(p.statement.period_end) : "No statement", reason, bankSays: p.bankSays, booksSay: p.booksSay,
      difference: foreign ? null : p.difference, toMatch: p.toMatch, currency: p.account.currency || base, flag: !!reason, open: () => open(p.account), missing: p.account.linked_gl_account_id ? undefined : "Not linked" };
  });
  // Tills: cash taken in sales, as the books show it (not counted in Bani yet).
  const posted = new Set(books.entries.filter(e => e.status === "posted").map(e => e.id));
  const tillIds = new Set(books.accounts.filter(a => a.is_cash && /cash on hand|cash in till/i.test(a.name)).map(a => a.id));
  const tillRows: Row[] = scope.venues.map(v => ({ key: `till-${v.id}`, group: "Cash in tills and boxes", name: `Tills · ${v.name}`, dateText: "Not counted", reason: null, bankSays: null,
    booksSay: books.lines.filter(l => !!l.account_id && tillIds.has(l.account_id) && l.venue === v.name && posted.has(l.entry_id)).reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0),
    difference: null, toMatch: 0, currency: base, flag: false }));
  const boxRows: Row[] = pc.floats.filter(f => scope.includesName(f.venue)).map(f => {
    const bal = pc.balanceByFloat[f.id] ?? 0, low = bal < Number(f.replenish_threshold ?? 0);
    return { key: `box-${f.id}`, group: "Cash in tills and boxes", name: `Cash box · ${f.venue}`, dateText: `Float ${formatTableCurrency(Number(f.float_amount))}`, reason: low ? "below top-up level" : null,
      bankSays: null, booksSay: bal, difference: null, toMatch: 0, currency: base, flag: low, open: () => onEditCash(f) };
  });
  const all = [...bankRows, ...tillRows, ...boxRows].filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const groups = [...new Set(all.map(r => r.group))];
  const amount = (r: Row) => r.bankSays ?? r.booksSay ?? 0;
  const total = all.filter(r => r.currency === base).reduce((n, r) => n + amount(r), 0);
  const toMatch = bankRows.reduce((n, r) => n + r.toMatch, 0);
  const banks = bankRows.length, tills = tillRows.length, boxes = boxRows.length;
  const behind = positions.filter(p => p.behind), low = boxRows.filter(r => r.flag), noStatement = positions.filter(p => !p.statement);
  const findings: PageWorkItem[] = [
    ...(toMatch ? [{ id: "cash-match", tone: "amber" as const, title: `${formatTableInteger(toMatch)} bank ${toMatch === 1 ? "line" : "lines"} to match`, detail: bankRows.filter(r => r.toMatch).map(r => `${r.name} ${formatTableInteger(r.toMatch)}`).join(" · "), label: "Show them", question: "Which bank lines still need matching, and what are they most likely?" }] : []),
    ...(behind.length ? [{ id: "cash-behind", tone: "amber" as const, title: `${behind.length} ${behind.length === 1 ? "account's" : "accounts'"} statements are behind`, detail: behind.map(p => `${p.account.account_name} to ${shortDay(p.statement!.period_end)}`).join(" · "), label: "Show", question: "Which bank statements do I need to upload?" }] : []),
    ...(low.length ? [{ id: "cash-low", tone: "amber" as const, title: `${low.length} cash ${low.length === 1 ? "box is" : "boxes are"} below top-up level`, detail: low.map(r => r.name).join(" · "), label: "Show", question: "Which cash boxes need a top-up?" }] : []),
    ...(noStatement.length && !behind.length ? [{ id: "cash-none", tone: "amber" as const, title: `${noStatement.length} ${noStatement.length === 1 ? "account has" : "accounts have"} no statement`, detail: noStatement.map(p => p.account.account_name).join(" · "), label: "Show", question: "Which bank statements do I need to upload?" }] : []),
  ];
  const money = (r: Row, n: number | null, missing = "—") => n === null ? <span className="text-muted-foreground">{missing}</span> : r.currency !== base ? formatMoney(n, r.currency) : formatTableCurrency(n);
  const diff = (r: Row) => r.difference ? <span className="font-semibold text-[#B45309]">{formatTableCurrency(r.difference)}</span> : <span className="text-muted-foreground">—</span>;
  const dateCell = (r: Row) => <span className={r.reason ? "text-[#B45309]" : r.bankSays === null && !r.key.startsWith("box-") ? "text-muted-foreground" : ""}>{r.dateText}{r.reason ? ` · ${r.reason}` : ""}</span>;
  const download = () => downloadCSV(all.map(r => ({ account: r.name, statement: r.dateText, bank: r.bankSays ?? "", books: r.booksSay ?? "", difference: r.difference ?? "", to_match: r.toMatch })),
    [{ key: "account", label: "Account" }, { key: "statement", label: "Statement or count" }, { key: "bank", label: "Bank says" }, { key: "books", label: "Books say" }, { key: "difference", label: "Difference" }, { key: "to_match", label: "To match" }], "cash-accounts");
  const rowProps = (r: Row) => r.open ? { tabIndex: 0, onClick: r.open, onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.open!(); } }, "aria-label": `Open ${r.name}` } : {};
  return <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Accounts">
    <div className="space-y-3">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5" aria-label="Cash summary"><span className="td-num">{bank.loading || ledger.loading ? "…" : `${formatTableCurrency(total)} cash`}</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {formatTableInteger(banks)} bank {banks === 1 ? "account" : "accounts"}{tills ? ` · ${tills} ${tills === 1 ? "till" : "tills"}` : ""}{boxes ? ` · ${boxes} cash ${boxes === 1 ? "box" : "boxes"}` : ""}</span></h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search accounts" mobileSearchBelow onDownload={download} downloadLabel="Download accounts"
        filter={<FilterPanel activeCount={showTest ? 1 : 0} onReset={() => setShowTest(false)}><FilterGroup title="Show"><Label className="flex gap-2 items-center"><Checkbox checked={showTest} onCheckedChange={v => setShowTest(v === true)} />Test accounts</Label></FilterGroup></FilterPanel>} />
      <NeedYouLine findings={findings} />
    </div>
    {/* Phone: one line per account. */}
    <div className="min-[768px]:hidden kit">
      {groups.map(g => <Fragment key={g}><p className="mt-3 mb-1 px-1 text-[13px] font-semibold text-[color:var(--kit-ink)] whitespace-nowrap overflow-hidden text-ellipsis">{g}</p>
        <ul className="divide-y divide-border/60">{all.filter(r => r.group === g).map(r => <li key={r.key} className={`flex items-center gap-2 px-2 min-h-11 py-2 ${r.flag ? "bg-[#FDF3F2]" : ""} ${r.open ? "cursor-pointer" : ""}`} {...rowProps(r)}>
          <span className="w-4 shrink-0">{r.flag && <span className="sales-flag" role="img" aria-label={r.reason ?? ""}>!</span>}</span>
          <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{r.name}</span><span className="td-num shrink-0 text-[14px]">{money(r, r.bankSays ?? r.booksSay, r.missing ?? "—")}</span></span>
            <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{r.key.startsWith("till-") ? "From sales · not counted" : r.key.startsWith("box-") ? (r.reason ? `${r.dateText} · ${r.reason}` : r.dateText) : [r.bankSays === null ? "No statement" : `Statement to ${r.dateText}`, r.reason, !r.reason && r.difference === 0 ? "agrees with books" : null, r.difference ? `books ${formatTableCurrency(Math.abs(r.difference))} ${r.difference > 0 ? "lower" : "higher"}` : null].filter(Boolean).join(" · ")}</span></span>
        </li>)}</ul></Fragment>)}
      {!all.length && <p className="p-8 text-center text-sm text-muted-foreground">No accounts yet.</p>}
    </div>
    {/* Computer: bank says, books say, difference, lines to match. */}
    <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Cash accounts table">
      <table className="sales-table" aria-label="Cash accounts">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Account</th><th scope="col" className="sales-cell-left">Statement or count</th><th scope="col" className="sales-cell-right">Bank says</th><th scope="col" className="sales-cell-right">Books say</th><th scope="col" className="sales-cell-right">Difference</th><th scope="col" className="sales-cell-right">To match</th></tr></thead>
        <tbody>{groups.map(g => <Fragment key={g}><tr className="sales-week-row"><th colSpan={7}><span>{g}</span></th></tr>
          {all.filter(r => r.group === g).map(r => <tr key={r.key} className={`${r.open ? "sales-record-row" : ""} ${r.flag ? "sales-attention-row" : ""}`} {...rowProps(r)}>
            <td className="sales-flag-cell">{r.flag && <span className="sales-flag" role="img" aria-label={r.reason ?? ""} title={r.reason ?? ""}>!</span>}</td>
            <td className="sales-cell-left" title={r.name}>{r.name}</td>
            <td className="sales-cell-left">{dateCell(r)}</td>
            <td className="kit-num">{money(r, r.bankSays)}</td>
            <td className="kit-num">{money(r, r.booksSay, r.missing ?? "—")}</td>
            <td className="kit-num">{diff(r)}</td>
            <td className="kit-num">{r.toMatch ? <button type="button" className="kit-link" onClick={e => { e.stopPropagation(); const a = accounts.find(x => x.id === r.key); if (a) open(a, "needs"); }}>{formatTableInteger(r.toMatch)}</button> : <span className="text-muted-foreground">—</span>}</td>
          </tr>)}</Fragment>)}
          {all.length > 0 && <tr><th colSpan={3} className="sales-cell-left font-semibold">Total</th><td className="kit-num font-semibold">{formatTableCurrency(all.filter(r => r.currency === base).reduce((n, r) => n + (r.bankSays ?? 0), 0))}</td><td className="kit-num font-semibold">{formatTableCurrency(all.filter(r => r.currency === base).reduce((n, r) => n + (r.booksSay ?? 0), 0))}</td><td className="kit-num font-semibold">{formatTableCurrency(bankRows.reduce((n, r) => n + (r.difference ?? 0), 0))}</td><td className="kit-num font-semibold">{formatTableInteger(toMatch)}</td></tr>}
        </tbody></table>
      {!all.length && <p className="p-8 text-center text-sm text-muted-foreground">No accounts yet.</p>}
    </div>
    <p className="px-1 text-[12px] text-muted-foreground">Bank says is the closing balance on the last statement; books say is the same account in your ledger on that day. Open an account to match its lines and close its months.</p>
  </section>;
}
