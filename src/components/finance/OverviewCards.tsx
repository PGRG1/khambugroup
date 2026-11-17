import { Link } from "react-router-dom";
import { useBankModule } from "@/hooks/useBankModule";
import { usePettyCash } from "@/hooks/usePettyCash";
import { usePayables } from "@/hooks/usePayables";
import { useFinanceObligations } from "@/hooks/useFinanceObligations";
import { useReceivables } from "@/hooks/useReceivables";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useSupplierDisplayTerms } from "@/components/finance/FinanceAging";
import { dueFromTerms } from "@/utils/financeReportViews";
import { financeProfit } from "@/utils/financeOverview";
import { formatMonthLabel, formatTableCurrency } from "@/utils/format";
import { shortMoney } from "@/utils/revenueOverview";
import { shortDay } from "@/utils/salesRecordChecks";

type Books = { entries: any[]; lines: any[]; accounts: any[] };
type Payroll = Parameters<typeof financeProfit>[3];

const card = "kit card-glass rounded-xl p-4 max-sm:p-3.5 min-w-0";
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const Head = ({ title, sub, right }: { title: string; sub?: string; right?: string }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
    <div className="min-w-0"><p className="text-[13px] font-medium leading-tight">{title}</p>{sub && <p className="text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{sub}</p>}</div>
    {right && <p className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">{right}</p>}
  </div>
);
const Stat = ({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) => (
  <div className="min-w-0"><p className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</p><p className="text-[16px] font-semibold td-num tabular-nums whitespace-nowrap">{value}</p>{sub && <p className={`text-[11px] whitespace-nowrap overflow-hidden text-ellipsis ${warn ? "text-[#B45309]" : "text-muted-foreground"}`}>{sub}</p>}</div>
);
const Line = ({ label, value, total }: { label: string; value: number; total?: boolean }) => (
  <div className={`flex justify-between gap-3 px-1 py-2.5 border-t border-border/60 text-[13px] ${total ? "font-semibold" : ""}`}><span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{label}</span><span className="td-num whitespace-nowrap">{value < 0 ? "−" : ""}{formatTableCurrency(Math.abs(value))}</span></div>
);

/** Finance Overview cards: will cash be fine, who's late, is any cost creeping up, can I trust the books. */
export function OverviewCards({ books, payroll, completeMonths, clearingIds, today, checks, closed, month }: {
  books: Books; payroll: Payroll; completeMonths: string[]; clearingIds: Set<string>; today: string;
  checks: { month: string; complete?: boolean }[]; closed: { month_start: string; reopened_at: string | null }[]; month: string;
}) {
  const bank = useBankModule(), pc = usePettyCash(), ap = usePayables(), other = useFinanceObligations(), ar = useReceivables(), scope = useVenueScope(), terms = useSupplierDisplayTerms();
  const soon = addDays(today, 14);

  // Cash today
  const accounts = bank.accounts.filter(a => a.is_active && !/^test(?:\s|$)/i.test(a.account_name.trim()) && (!a.venue || scope.includesName(a.venue)));
  const bankNow = accounts.reduce((n, a) => n + bank.statementBalanceFor(a.id), 0);
  const posted = new Set(books.entries.filter(e => e.status === "posted").map(e => e.id));
  const transit = books.lines.filter(l => l.account_id && clearingIds.has(l.account_id) && posted.has(l.entry_id)).reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0);
  const floats = pc.floats.filter(f => scope.includesName(f.venue));
  const boxes = floats.reduce((n, f) => n + (pc.balanceByFloat[f.id] ?? 0), 0);

  // Owed
  const supplierItems = ap.invoices.filter(i => i.outstanding_amount > .005 && i.payment_status !== "voided" && scope.includesName(i.venue))
    .map(i => ({ amount: i.outstanding_amount, due: dueFromTerms(i.invoice_date, i.due_date, terms.data?.find(s => s.id === i.supplier_id)?.payment_terms) }));
  const owedItems = [...supplierItems, ...other.items.map(i => ({ amount: i.amount, due: i.due }))];
  const youOwe = owedItems.reduce((n, i) => n + i.amount, 0);
  const overdue = owedItems.filter(i => i.due && i.due < today).reduce((n, i) => n + i.amount, 0);
  const goingOut = owedItems.filter(i => !i.due || i.due <= soon).reduce((n, i) => n + i.amount, 0);
  const customers = ar.openItems.filter(i => !i.venue || scope.includesName(i.venue));
  const owedToYou = customers.reduce((n, i) => n + Number(i.open_amount), 0) + Math.max(0, transit);
  const late = customers.filter(i => i.age_days > 30).reduce((n, i) => n + Number(i.open_amount), 0);
  const comingIn = Math.max(0, transit) + customers.reduce((n, i) => n + Number(i.open_amount), 0);

  // Costs as % of sales, last 5 complete months
  const months = [...completeMonths].sort().slice(-5);
  const rows = months.map(m => ({ m, p: financeProfit(books.entries, books.lines, books.accounts, payroll, m) }));
  const pct = (v: number | null, s: number) => (v == null || !s ? null : v / s * 100);
  const series = [
    { name: "Food & drink", vals: rows.map(r => pct(r.p.food, r.p.sales)), up: true },
    { name: "Staff", vals: rows.map(r => pct(r.p.staff, r.p.sales)), up: true },
    { name: "Other costs", vals: rows.map(r => pct(r.p.running, r.p.sales)), up: true },
    { name: "Profit", vals: rows.map(r => pct(r.p.profit, r.p.sales)), up: false },
  ];
  const drifting = (vals: (number | null)[], up: boolean) => {
    const last = vals[vals.length - 1], before = vals.slice(0, -1).filter((v): v is number => v != null);
    if (last == null || before.length < 2) return false;
    const usual = before.reduce((n, v) => n + v, 0) / before.length;
    return up ? last > usual + 1 : last < usual - 1;
  };

  // Books
  const isClosed = (m: string) => closed.some(c => c.month_start === `${m}-01` && !c.reopened_at);
  const recent = Array.from({ length: 4 }, (_, i) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 3 + i); return d.toISOString().slice(0, 7); });
  const statementTo = bank.imports.map(i => i.period_end).filter(Boolean).sort().pop();
  const firstOpen = recent.find(m => !isClosed(m) && m < today.slice(0, 7));

  return <>
    <section className={card} aria-label="Cash">
      <Head title="Cash" sub="Today and the next 14 days" right={statementTo ? `bank to ${shortDay(statementTo)}` : "no statement yet"} />
      <div className="grid gap-3 px-1" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Stat label="Bank" value={shortMoney(bankNow)} sub={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`} />
        <Stat label="Cards in transit" value={shortMoney(Math.max(0, transit))} sub="paid out, not in bank" />
        <Stat label="Cash boxes" value={shortMoney(boxes)} sub={`${floats.length} ${floats.length === 1 ? "box" : "boxes"}`} />
      </div>
      <div className="mt-3">
        <Line label="Coming in · cards and customers" value={comingIn} />
        <Line label="Going out · due in 14 days" value={-goingOut} />
        <Line label={`Bank on ${shortDay(soon)}`} value={bankNow + comingIn - goingOut} total />
      </div>
    </section>

    <section className={card} aria-label="Owed">
      <Head title="Owed" />
      <div className="grid grid-cols-2 gap-3 px-1">
        <Link to="/finance/receivables?view=age" className="min-w-0"><Stat label="To you" value={shortMoney(owedToYou)} sub={late > .005 ? `${shortMoney(late)} over 30 days late` : "nothing late"} warn={late > .005} /></Link>
        <Link to="/finance/payables?view=age" className="min-w-0"><Stat label="By you" value={shortMoney(youOwe)} sub={overdue > .005 ? `${shortMoney(overdue)} overdue` : "nothing overdue"} warn={overdue > .005} /></Link>
      </div>
    </section>

    {rows.length > 0 && <section className={card} aria-label="Costs as % of sales">
      <Head title="Costs as % of sales" sub={`Last ${rows.length} ${rows.length === 1 ? "month" : "months"} · amber when off your usual`} />
      <div className="kit sales-table-scroll"><table className="sales-table w-full" aria-label="Costs as % of sales">
        <thead><tr><th className="sales-cell-left"><span className="sr-only">Cost</span></th>{rows.map(r => <th key={r.m} className="sales-cell-right">{formatMonthLabel(r.m).split(" ")[0]}</th>)}</tr></thead>
        <tbody>{series.map(s => <tr key={s.name} className="sales-record-row"><td className="sales-cell-left">{s.name}</td>{s.vals.map((v, i) => <td key={i} className={`sales-cell-right td-num ${i === s.vals.length - 1 && drifting(s.vals, s.up) ? "text-[#B45309] font-semibold" : ""}`}>{v == null ? "—" : v.toFixed(1)}</td>)}</tr>)}</tbody>
      </table></div>
    </section>}

    <section className={card} aria-label="Books">
      <Head title="Books" sub="What you can rely on" right={statementTo ? `matched to ${shortDay(statementTo)}` : undefined} />
      <div className="grid grid-cols-4 gap-1.5">{recent.map(m => {
        const c = checks.find(x => x.month === m), state = isClosed(m) ? "Closed" : m === today.slice(0, 7) ? "Open" : c?.complete ? "Booked" : m > today.slice(0, 7) ? "—" : "Not closed";
        return <Link key={m} to={`/finance/close?month=${m}`} className="bg-muted/50 rounded-lg py-2.5 px-1 text-center min-w-0"><span className="block text-[13px] font-medium">{formatMonthLabel(m).split(" ")[0]}</span><span className={`block text-[11px] mt-1 whitespace-nowrap ${state === "Closed" ? "text-success" : state === "Not closed" ? "text-[#B45309]" : "text-muted-foreground"}`}>{state}</span></Link>;
      })}</div>
      {firstOpen && <p className="mt-2 px-1 text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{formatMonthLabel(firstOpen).split(" ")[0]} isn’t closed yet · <Link to={`/finance/close?month=${firstOpen}`} className="kit-link">Finish it</Link></p>}
    </section>
  </>;
}
