import { Link } from "react-router-dom";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import { cn } from "@/lib/utils";
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
/** Purchasing Overview's card, unchanged. */
function OverviewChartShell({ children, className, ...props }: Parameters<typeof ChartShell>[0]) {
  return <ChartShell {...props} className={cn("max-sm:p-3.5 max-sm:[&>div:first-child]:mb-2", "[&>div:first-child>div:first-child>div:first-child]:text-[15px] [&>div:first-child>div:first-child>div:first-child]:font-semibold [&>p]:text-[12.5px] [&>div:first-child]:flex-wrap [&>div:first-child>div:last-child]:max-w-full [&>div:first-child>div:last-child]:shrink [&>div:first-child>div:last-child]:min-w-0 max-sm:[&>div:first-child>div:last-child]:basis-full", className)}>{children}</ChartShell>;
}
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
export function OverviewCards({ books, payroll, completeMonths, clearingIds, today, checks, closed, month, lines, profit }: {
  books: Books; payroll: Payroll; completeMonths: string[]; clearingIds: Set<string>; today: string;
  checks: { month: string; complete?: boolean }[]; closed: { month_start: string; reopened_at: string | null }[]; month: string;
  lines?: { id: string; label: string; amount?: number; href: string }[]; profit?: { month: string; value: number } | null;
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

  const landing = bankNow + boxes + comingIn - goingOut;
  const needs = (lines ?? []).slice(0, 6);
  const states = recent.map(m => {
    const c = checks.find(x => x.month === m);
    const state = isClosed(m) ? "Closed" : m === today.slice(0, 7) ? "Open" : c?.complete ? "Booked" : m > today.slice(0, 7) ? "—" : "Not closed";
    return { m, state };
  });
  const row = "flex items-center justify-between gap-3 min-h-11 border-t border-border/60 first:border-t-0 text-[13px]";

  return <>
    <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4 max-sm:px-4 max-sm:py-4 max-sm:space-y-3" aria-label="Cash">
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">Cash on {shortDay(soon)}</p>
        <p className="mt-1 text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums">{landing < 0 ? "−" : ""}{shortMoney(Math.abs(landing))}</p>
        <p className="mt-2 max-sm:mt-1.5 text-[13px] max-sm:text-[12px] text-muted-foreground tabular-nums">{shortMoney(bankNow + boxes)} now · {shortMoney(comingIn)} in · {shortMoney(goingOut)} out{statementTo ? "" : " · no bank statement yet"}</p>
      </div>
      <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Link to="/finance/receivables" className="min-w-0"><Stat label="Owed to you" value={shortMoney(owedToYou)} sub={late > .005 ? `${shortMoney(late)} late` : undefined} warn={late > .005} /></Link>
        <Link to="/finance/payables" className="min-w-0"><Stat label="You owe" value={shortMoney(youOwe)} sub={overdue > .005 ? `${shortMoney(overdue)} overdue` : undefined} warn={overdue > .005} /></Link>
        {profit ? <Link to="/finance/reports?view=pl" className="min-w-0"><Stat label={`Profit · ${formatMonthLabel(profit.month).split(" ")[0]}`} value={`${profit.value < 0 ? "−" : ""}${shortMoney(Math.abs(profit.value))}`} /></Link>
          : <Stat label="Profit" value="—" sub="no closed month" />}
      </div>
    </section>

    <div className="grid gap-5 max-sm:gap-3 lg:grid-cols-2 items-stretch min-w-0 [&>*]:min-w-0">
      <OverviewChartShell className="h-full min-w-0" title={(lines ?? []).length ? `${(lines ?? []).length} ${(lines ?? []).length === 1 ? "thing needs" : "things need"} you` : "Nothing needs you"}>
        <div className="kit">{needs.map(l => <Link key={l.id} to={l.href} className={row}><span className="min-w-0 truncate">{l.label}</span><span className="shrink-0 td-num text-muted-foreground">{l.amount != null ? formatTableCurrency(l.amount) : "›"}</span></Link>)}</div>
        {(lines ?? []).length > needs.length && <Link to="/finance/close?view=approvals" className="inline-flex h-9 items-center text-xs text-muted-foreground hover:text-foreground">See all {(lines ?? []).length}</Link>}
      </OverviewChartShell>
      <OverviewChartShell className="h-full min-w-0" title="Books">
        <div className="kit">{states.map(({ m, state }) => <Link key={m} to={`/finance/close?month=${m}`} className={row}><span>{formatMonthLabel(m)}</span><span className={`shrink-0 ${state === "Closed" ? "text-[#15803D]" : state === "Not closed" ? "text-[#B45309]" : "text-muted-foreground"}`}>{state}</span></Link>)}</div>
      </OverviewChartShell>
    </div>
  </>;
}
