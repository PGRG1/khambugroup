import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useChartOfAccounts, ACCOUNT_TYPE_LABEL } from "@/hooks/useChartOfAccounts";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useFinancePeriod } from "@/components/kit/PeriodControl";
import { PageTop } from "@/components/kit/PageTop";
import { Toolbar } from "@/components/kit/Toolbar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCSV } from "@/utils/csvDownload";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { sourceLabel } from "@/utils/booksReview";
import { Section, PhoneRow, Note, Empty, Pager, keyOpen, type Stat } from "@/components/finance/accounting/AccountingKit";

interface GLRow {
  entry_id: string; entry_date: string; entry_memo: string; source_type: string; account_id: string;
  debit: number; credit: number; line_memo: string;
}
const PAGE = 50;

// Ledger: pick an account, see its opening, money in and out, closing, then every line with a running balance.
// Only the picked account's lines are read (paged), never the whole general ledger.
export default function Ledger() {
  const { items: accounts } = useChartOfAccounts();
  const { tenantId } = useActiveTenant();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const accountId = params.get("account") || "";
  const period = useFinancePeriod("period");
  const fromDate = period.fromIso, toDate = period.toIso;
  const [all, setAll] = useState<GLRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const setAccountId = (v: string) => { const next = new URLSearchParams(params); if (v) next.set("account", v); else next.delete("account"); setParams(next, { replace: true }); setPage(1); };

  useEffect(() => {
    if (!accountId || !tenantId) { setAll([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const out: GLRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase.from("v_general_ledger" as any) as any).select("entry_id,entry_date,entry_memo,source_type,account_id,debit,credit,line_memo")
          .eq("tenant_id", tenantId).eq("account_id", accountId).order("entry_date", { ascending: true }).order("entry_id", { ascending: true }).range(from, from + 999);
        if (error || !data?.length) break;
        out.push(...data);
        if (data.length < 1000) break;
      }
      if (!cancelled) { setAll(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [accountId, tenantId]);

  const account = accounts.find(a => a.id === accountId);
  const sign = (r: GLRow) => account?.normal_side === "credit" ? Number(r.credit) - Number(r.debit) : Number(r.debit) - Number(r.credit);
  const opening = useMemo(() => fromDate ? all.filter(r => r.entry_date < fromDate).reduce((n, r) => n + sign(r), 0) : 0, [all, fromDate, account]); // eslint-disable-line react-hooks/exhaustive-deps
  const lines = useMemo(() => {
    let bal = opening;
    return all.filter(r => (!fromDate || r.entry_date >= fromDate) && (!toDate || r.entry_date <= toDate)).map(r => { bal += sign(r); return { ...r, running: bal }; });
  }, [all, fromDate, toDate, opening]); // eslint-disable-line react-hooks/exhaustive-deps
  const closing = lines.at(-1)?.running ?? opening;
  const moneyIn = lines.reduce((n, r) => n + Number(r.debit), 0), moneyOut = lines.reduce((n, r) => n + Number(r.credit), 0);
  const shown = lines.filter(r => !search || `${r.entry_memo} ${r.line_memo ?? ""}`.toLowerCase().includes(search.toLowerCase())).reverse();
  const pages = Math.max(1, Math.ceil(shown.length / PAGE)), current = Math.min(page, pages), visible = shown.slice((current - 1) * PAGE, current * PAGE);
  const open = (r: GLRow) => navigate(`/finance/books?view=journal&entry=${r.entry_id}`);
  const what = (r: GLRow) => r.line_memo && r.line_memo !== r.entry_memo ? `${r.entry_memo} · ${r.line_memo}` : r.entry_memo;
  const balance = (n: number) => `${formatTableCurrency(Math.abs(n))}${n < -0.005 ? " Cr" : ""}`;

  const download = () => account && downloadCSV(lines.map(r => ({ date: r.entry_date, from: sourceLabel(r.source_type), what: what(r), debit: Number(r.debit).toFixed(2), credit: Number(r.credit).toFixed(2), balance: r.running.toFixed(2) })),
    [{ key: "date", label: "Date" }, { key: "from", label: "From" }, { key: "what", label: "What" }, { key: "debit", label: "In (debit)" }, { key: "credit", label: "Out (credit)" }, { key: "balance", label: "Balance" }], `ledger_${account.code}`);

  const stats: Stat[] = [
    { label: "Opening", value: balance(opening), sub: fromDate ? shortDay(fromDate) : "from the start" },
    { label: "In (debit)", value: formatTableCurrency(moneyIn), sub: `${formatTableInteger(lines.filter(r => Number(r.debit)).length)} lines` },
    { label: "Out (credit)", value: formatTableCurrency(moneyOut), sub: `${formatTableInteger(lines.filter(r => Number(r.credit)).length)} lines` },
    { label: "Closing", value: balance(closing), sub: toDate ? shortDay(toDate) : "today" },
  ];

  return <div className="min-w-0 space-y-5 max-sm:space-y-3">
    <PageTop tabsAbove title="Ledger" period={period.control} />
    <section className="card-glass rounded-xl p-4 min-w-0 space-y-3" aria-label="Account" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger className="h-10 w-full sm:w-[420px] rounded-full bg-white" aria-label="Account"><SelectValue placeholder="Pick an account" /></SelectTrigger>
          <SelectContent>{accounts.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent>
        </Select>
        {account && <span className="text-[12px] text-muted-foreground whitespace-nowrap">{ACCOUNT_TYPE_LABEL[account.account_type]} · normal side {account.normal_side}</span>}
      </div>
      {account && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-1">{stats.map(s => <div key={s.label} className="min-w-0">
        <p className="text-[12px] text-muted-foreground whitespace-nowrap">{s.label}</p>
        <p className="mt-0.5 text-[20px] max-sm:text-[15px] font-semibold td-num whitespace-nowrap overflow-hidden text-ellipsis">{loading ? "…" : s.value}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground whitespace-nowrap">{s.sub}</p>
      </div>)}</div>}
    </section>
    {!account ? <section className="card-glass rounded-xl p-4"><Empty>Pick an account to see every line in it, with a running balance.</Empty></section> :
      <Section title="Lines" detail={`${period.label} · ${formatTableInteger(lines.length)}`} busy={loading}>
        <Toolbar search={search} onSearch={v => { setSearch(v); setPage(1); }} placeholder="Search lines" mobileSearchBelow onDownload={download} downloadLabel="Download ledger" />
        <ul className="min-[768px]:hidden kit divide-y divide-border/60" aria-label="Lines">{visible.map((r, i) => <PhoneRow key={`${r.entry_id}-${i}`} title={what(r)} amount={Number(r.debit) ? formatTableCurrency(Number(r.debit)) : `−${formatTableCurrency(Number(r.credit))}`} sub={`${shortDay(r.entry_date)} · ${sourceLabel(r.source_type)} · balance ${balance(r.running)}`} onOpen={() => open(r)} />)}</ul>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Lines table"><table className="sales-table" aria-label="Ledger lines">
          <thead><tr><th scope="col" className="sales-cell-left">Date</th><th scope="col" className="sales-cell-left">What</th><th scope="col" className="sales-cell-left">From</th><th scope="col" className="sales-cell-right">In (debit)</th><th scope="col" className="sales-cell-right">Out (credit)</th><th scope="col" className="sales-cell-right">Balance</th></tr></thead>
          <tbody>{visible.map((r, i) => <tr key={`${r.entry_id}-${i}`} className="sales-record-row" {...keyOpen(() => open(r))}>
            <td className="sales-cell-left">{shortDay(r.entry_date)}</td>
            <td className="sales-cell-left" title={what(r)}>{what(r)}</td>
            <td className="sales-cell-left"><span className="kit-link">{sourceLabel(r.source_type)}</span></td>
            <td className="kit-num">{Number(r.debit) ? formatTableCurrency(Number(r.debit)) : <span className="text-muted-foreground">—</span>}</td>
            <td className="kit-num">{Number(r.credit) ? formatTableCurrency(Number(r.credit)) : <span className="text-muted-foreground">—</span>}</td>
            <td className="kit-num">{balance(r.running)}</td>
          </tr>)}</tbody></table></div>
        {!visible.length && <Empty>{loading ? "Loading lines…" : "No lines in this period."}</Empty>}
        <Pager page={current} pages={pages} onPage={setPage} />
        <Note>Newest first. Tap a line to open the entry it came from.</Note>
      </Section>}
  </div>;
}
