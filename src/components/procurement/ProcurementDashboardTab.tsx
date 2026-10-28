import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowUpDown, Search } from "lucide-react";
import { Bar, ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Customized } from "recharts";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useAuth } from "@/hooks/useAuth";
import { usePurchasingMode } from "@/hooks/usePurchasingMode";
import { usePurchasingBudgets } from "@/hooks/usePurchasingBudgets";
import { useScopedProjections } from "@/hooks/useScopedProjections";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";
import { purchasingOverviewRows } from "@/utils/purchasingMode";
import { KpiCard } from "@/components/expenses/shared";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import { PRIMARY, chartAxis, chartGrid, chartTooltipContentStyle, compactHK, monthOpacity } from "@/components/revenue-overview/chartTheme";
import { PageTop } from "@/components/kit/PageTop";
import DateFilter from "@/components/dashboard/DateFilter";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency as money, formatTableInteger as integer, formatPercent as pct, formatDecimal, formatDate } from "@/utils/format";
import { categoryRanking, itemRanking, supplierRanking, monthPace, previousCalendarMonth, periodIncludes, sumSpend, sumRevenue, percentage, changePercent, usualPace, budgetByDay, budgetPaceStatus, suggestBudgets, isBudgetableCategory, daysInMonth, type OverviewInvoice, type OverviewLine, type OverviewProduct, type OverviewSale } from "@/utils/purchasingOverview";
import { purchasingAnalysisPages } from "@/utils/purchasingNavigation";
import { defaultInvoiceMonth, trailingMonths } from "./purchasingOverviewPresentation";
import { PurchasingBudgetsDialog } from "./PurchasingBudgetsDialog";
import { cn } from "@/lib/utils";

const monthLabel = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMM yyyy");
const monthName = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMMM");
const delta = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${pct(value)}`;
type Item = ReturnType<typeof itemRanking>[number];
const WARM = "hsl(var(--chart-7))";
function OverviewChartShell({ children, className, ...props }: Parameters<typeof ChartShell>[0]) {
  return <ChartShell {...props} className={cn("[&>div:first-child>div:first-child>div:first-child]:text-[15px] [&>div:first-child>div:first-child>div:first-child]:font-semibold [&>p]:text-[12.5px] [&>div:first-child]:flex-wrap [&>div:first-child>div:last-child]:max-w-full [&>div:first-child>div:last-child]:shrink [&>div:first-child>div:last-child]:min-w-0 max-sm:[&>div:first-child>div:last-child]:basis-full", className)}>{children}</ChartShell>;
}
function OverviewKpi(props: Parameters<typeof KpiCard>[0]) {
  return <div className="min-w-0 [&>div]:p-[18px] [&>div>span]:hidden [&>div>div:first-of-type]:normal-case [&>div>div:first-of-type]:tracking-normal [&>div>div:first-of-type]:text-[13px] [&>div>div:nth-of-type(2)]:text-[26px] [&>div>div:nth-of-type(2)]:font-medium [&>div>div:nth-of-type(3)]:text-[12px]"><KpiCard {...props} /></div>;
}
type Ranked = { id: string; name: string; value: number; share: number | null };

function RankedList({ rows }: { rows: Ranked[] }) {
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return rows.length ? <div>{rows.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,150px)_minmax(20px,1fr)_70px_38px] items-center gap-x-2 h-[30px] text-[13px]">
    <span className="min-w-0 truncate" title={row.name}>{row.name}</span>
    <div className="h-2 rounded-full bg-muted/40"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.abs(row.value) / maximum * 100)}%` }} /></div>
    <span className="td-num whitespace-nowrap text-right" title={money(row.value)}>{integer(row.value)}</span><span className="td-num text-right text-muted-foreground whitespace-nowrap">{pct(row.share)}</span>
  </div>)}</div> : <p className="py-8 text-sm text-muted-foreground">No spend in this period.</p>;
}

function ItemsTable({ rows, previous, sort, onSort, full = false }: { rows: Item[]; previous: string | null; full?: boolean; sort?: { key: "name" | "value" | "change"; desc: boolean }; onSort?: (key: "name" | "value" | "change") => void }) {
  const heading = (label: string, key: "name" | "value" | "change") => onSort ? <Button variant="ghost" size="sm" className="h-8 p-0 text-xs hover:bg-muted/40 hover:text-foreground" onClick={() => onSort(key)}>{label}<ArrowUpDown className="ml-1 h-3 w-3" />{sort?.key === key && <span className="sr-only">{sort.desc ? "descending" : "ascending"}</span>}</Button> : label;
  return <div className={full ? "" : "overflow-auto"}><table className={cn("w-full table-fixed text-[13px]", full && "min-w-[640px]")}><colgroup><col className="w-[34%]" /><col className="w-[15%]" />{previous && <col className="w-[12%]" />}<col className="w-[22%]" />{previous && <col className="w-[17%]" />}</colgroup><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground">
    <th className="px-1 py-3 sm:px-3 text-left font-medium" aria-sort={sort?.key === "name" ? sort.desc ? "descending" : "ascending" : undefined}>{heading("Item", "name")}</th><th className="px-1 py-3 sm:px-3 text-right font-medium" aria-sort={sort?.key === "value" ? sort.desc ? "descending" : "ascending" : undefined}>{heading("Spend (HK$)", "value")}</th>{previous && <th className="px-1 py-3 sm:px-3 text-right font-medium" aria-sort={sort?.key === "change" ? sort.desc ? "descending" : "ascending" : undefined}>{heading(`vs ${monthLabel(previous)}`, "change")}</th>}<th className="px-1 py-3 sm:px-3 text-right font-medium">Unit price</th>{previous && <th className="px-1 py-3 sm:px-3 text-left font-medium">Price vs {monthLabel(previous)}</th>}
  </tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20"><td className={cn("px-1 py-3 sm:px-3", full ? "break-words whitespace-normal" : "truncate")} title={row.name}>{row.name}</td><td title={money(row.value)} className="px-1 py-3 sm:px-3 text-right td-num truncate">{full ? money(row.value) : integer(row.value)}</td>{previous && <td title={row.isNew ? "new" : delta(row.change)} className={cn("px-1 py-3 sm:px-3 text-right td-num truncate", !row.isNew && (row.change ?? 0) > 0 && "text-warning")}>{row.isNew ? "new" : delta(row.change)}</td>}<td title={`${row.price == null ? "—" : formatDecimal(row.price)}${row.unit ? ` / ${row.unit}` : ""}`} className="px-1 py-3 sm:px-3 text-right td-num truncate">{row.price == null ? "—" : formatDecimal(row.price)}{row.unit ? ` / ${row.unit}` : ""}</td>{previous && <td title={row.priceComparison} className={cn("px-1 py-3 sm:px-3 truncate", row.priceComparison !== "Same" && "text-warning")}>{row.priceComparison}</td>}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-sm text-muted-foreground">No matched items in this period.</p>}</div>;
}

export default function ProcurementDashboardTab() {
  const purchasing = usePurchasingMode();
  const scope = useVenueScope();
  const access = usePurchasingNavigationAccess();
  const { isAdmin } = useAuth();
  const budgetsQuery = usePurchasingBudgets();
  const [chosenPeriod, setPeriod] = useState<string | null>(null);
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [budgetSuggest, setBudgetSuggest] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "value" | "change"; desc: boolean }>({ key: "value", desc: true });
  const [hiddenMonths, setHiddenMonths] = useState<Set<string>>(new Set());
  const data = useQuery({
    queryKey: ["proc-dash", "overview-redesign", purchasing.tenantId], enabled: !!purchasing.tenantId, staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const id = purchasing.tenantId;
      const [invoices, suppliers, sales, lines, products, categoryRows] = await Promise.all([
        fetchAllRows("invoices", "id,supplier_id,invoice_date,total_amount,discount,venue,created_at,review_status,has_disputes", { col: "invoice_date", asc: false }, id),
        fetchAllRows("suppliers", "id,name", undefined, id),
        fetchAllRows("sales_records", "date,total_sales,venue", undefined, id),
        fetchAllRows("invoice_line_items", "invoice_id,product_master_id,total,unit_price,unit,quantity", undefined, id),
        fetchAllRows("product_master", "id,internal_product_name,financial_treatment,level1_category,unit", undefined, id),
        fetchAllRows("product_categories", "name,level,is_active", undefined, id),
      ]);
      return { invoices: invoices as OverviewInvoice[], suppliers: suppliers as { id: string; name: string }[], sales: sales as OverviewSale[], lines: lines as OverviewLine[], products: products as OverviewProduct[], categoryRows: categoryRows as { name: string; level: number; is_active: boolean }[] };
    },
  });
  const invoices = useMemo(() => purchasingOverviewRows(data.data?.invoices ?? [], purchasing.mode, scope.includesName), [data.data, purchasing.mode, scope.includesName]);
  const sales = useMemo(() => purchasingOverviewRows(data.data?.sales ?? [], purchasing.mode, scope.includesName), [data.data, purchasing.mode, scope.includesName]);
  const products = useMemo(() => new Map((data.data?.products ?? []).map(row => [row.id, row])), [data.data]);
  const names = useMemo(() => new Map((data.data?.suppliers ?? []).map(row => [row.id, row.name])), [data.data]);
  const currentMonth = format(new Date(), "yyyy-MM");
  const period = chosenPeriod ?? defaultInvoiceMonth(currentMonth, invoices.map(row => row.invoice_date));
  const fallback = chosenPeriod === null && period !== currentMonth;
  const previous = previousCalendarMonth(period);
  const fromDate = from ? format(from, "yyyy-MM-dd") : undefined, toDate = to ? format(to, "yyyy-MM-dd") : undefined;
  const currentInvoices = invoices.filter(row => periodIncludes(row.invoice_date, period, fromDate, toDate));
  const currentSales = sales.filter(row => periodIncludes(row.date, period, fromDate, toDate));
  const previousInvoices = previous ? invoices.filter(row => row.invoice_date.startsWith(previous)) : [];
  const previousSales = previous ? sales.filter(row => row.date.startsWith(previous)) : [];
  const currentIds = new Set(currentInvoices.map(row => row.id)), previousIds = new Set(previousInvoices.map(row => row.id));
  const lines = (data.data?.lines ?? []).filter(row => currentIds.has(row.invoice_id));
  const previousLines = (data.data?.lines ?? []).filter(row => previousIds.has(row.invoice_id));
  const spend = sumSpend(currentInvoices), revenue = sumRevenue(currentSales), previousSpend = sumSpend(previousInvoices);
  const suppliers = supplierRanking(currentInvoices, previousInvoices, names);
  const items = itemRanking(lines, previousLines, products);
  const categories = categoryRanking(lines, currentInvoices, products);
  const months = [...new Set([currentMonth, ...invoices.map(row => row.invoice_date.slice(0, 7))])].sort().reverse();
  const periodLabel = previous ? monthLabel(period) : period === "all" ? "All time" : "Custom range";
  const latestUpload = currentInvoices.map(row => row.created_at).filter(Boolean).sort().at(-1);
  const latestDay = Math.max(0, ...currentInvoices.map(row => Number(row.invoice_date.slice(8, 10))), ...currentSales.map(row => Number(row.date.slice(8, 10))));
  const isCurrent = period === currentMonth;
  // ---- Purchasing budgets (single-month periods only) ----
  const singleMonth = !!previous;
  const [budgetYear, budgetMonthNum] = singleMonth ? period.split("-").map(Number) : [0, 0];
  const scopeVenueIds = (purchasing.mode === "central" ? scope.venues : scope.selectedVenues).map(venue => venue.id);
  const projections = useScopedProjections(scopeVenueIds, budgetYear, budgetMonthNum, singleMonth && scopeVenueIds.length > 0);
  const { getTarget } = useRevenueTargets();
  const budgetVenueId = purchasing.mode === "central" ? null : (!scope.isAll && scope.selectedVenues.length === 1 ? scope.selectedVenues[0].id : null);
  const budgetRows = useMemo(() => singleMonth ? budgetsQuery.budgets.filter(row => row.month.slice(0, 7) === period && (budgetVenueId ? row.venue_id === budgetVenueId : purchasing.mode === "central" ? row.venue_id === null : true)) : [], [budgetsQuery.budgets, singleMonth, period, budgetVenueId, purchasing.mode]);
  const budgetChanges = useMemo(() => singleMonth ? budgetsQuery.changes.filter(row => row.month.slice(0, 7) === period && (budgetVenueId ? row.venue_id === budgetVenueId : purchasing.mode === "central" ? row.venue_id === null : true)) : [], [budgetsQuery.changes, singleMonth, period, budgetVenueId, purchasing.mode]);
  const budgetByCategory = useMemo(() => { const map = new Map<string, number>(); budgetRows.forEach(row => map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount))); return map; }, [budgetRows]);
  const totalBudget = [...budgetByCategory.values()].reduce((a, b) => a + b, 0);
  const budgetsExist = singleMonth && budgetRows.length > 0 && totalBudget > 0;
  const budgetedSpend = categories.filter(row => budgetByCategory.has(row.name)).reduce((n, row) => n + row.value, 0);
  const usual = singleMonth ? usualPace(period, invoices) : [];
  const todayDay = isCurrent ? new Date().getDate() : singleMonth ? daysInMonth(period) : 0;
  const pace = budgetsExist ? budgetPaceStatus(budgetedSpend, totalBudget, usual, todayDay) : null;
  const projectionTarget = projections.hasManagerTarget ? projections.rows.reduce((n, row) => n + (row.projectedSales ?? 0), 0) : null;
  const savedTarget = singleMonth ? getTarget(budgetYear, budgetMonthNum)?.targetAmount ?? null : null;
  const monthTarget = projectionTarget ?? ((purchasing.mode === "central" || scope.isAll) ? savedTarget : null);
  const expectedToDate = projectionTarget != null
    ? projections.rows.filter(row => Number(row.date.slice(8, 10)) <= todayDay).reduce((n, row) => n + (row.projectedSales ?? 0), 0)
    : monthTarget != null && singleMonth ? monthTarget * todayDay / daysInMonth(period) : null;
  const actualToDate = currentSales.filter(row => Number(row.date.slice(8, 10)) <= todayDay).reduce((n, row) => n + Number(row.total_sales), 0);
  const salesDiff = expectedToDate ? actualToDate / expectedToDate - 1 : null;
  const showSalesNote = isAdmin && isCurrent && budgetsExist && salesDiff != null && Math.abs(salesDiff) >= 0.03;
  const suggestedTotal = showSalesNote ? [...suggestBudgets(budgetByCategory, actualToDate, expectedToDate!).values()].reduce((a, b) => a + b, 0) : 0;
  const budgetSeries = budgetsExist ? budgetByDay(period, budgetChanges, budgetByCategory) : [];
  const budgetCategories = (data.data?.categoryRows ?? []).filter(row => row.level === 1 && row.is_active && isBudgetableCategory(row.name)).map(row => row.name);
  const spendForMonth = (key: string) => {
    const ids = new Set(invoices.filter(row => row.invoice_date.startsWith(key)).map(row => row.id));
    const map = new Map<string, number>();
    (data.data?.lines ?? []).filter(line => ids.has(line.invoice_id)).forEach(line => {
      const name = line.product_master_id ? products.get(line.product_master_id)?.level1_category : null;
      if (name) map.set(name, (map.get(name) ?? 0) + Number(line.total));
    });
    return map;
  };
  const revenueForMonth = (key: string) => sales.filter(row => row.date.startsWith(key)).reduce((n, row) => n + Number(row.total_sales), 0);
  const currentPace = previous ? monthPace(period, invoices, sales, isCurrent ? latestDay : undefined) : [];
  const previousPace = previous ? monthPace(previous, invoices, sales) : [];
  const pairRows = Array.from({ length: Math.max(currentPace.length, previousPace.length) }, (_, i) => ({ day: i + 1, current: currentPace[i]?.spend ?? null, prior: previousPace[i]?.spend ?? null, currentPct: currentPace[i]?.pct ?? null, priorPct: previousPace[i]?.pct ?? null, budget: budgetSeries[i] ?? null }));
  const byDayCurrent = currentPace[Math.max(0, latestDay - 1)]?.spend ?? 0;
  const byDayPrevious = previousPace[Math.min(Math.max(0, latestDay - 1), previousPace.length - 1)]?.spend ?? 0;
  const finalPct = percentage(spend, revenue);
  const allMonthKeys = [...new Set([...currentInvoices.map(row => row.invoice_date.slice(0, 7)), ...currentSales.map(row => row.date.slice(0, 7))])].sort().reverse();
  const paces = new Map(allMonthKeys.map(month => [month, monthPace(month, currentInvoices, currentSales)]));
  const allRows = Array.from({ length: 31 }, (_, i) => {
    const row: Record<string, number | null> = { day: i + 1 };
    allMonthKeys.forEach(month => { row[`spend_${month}`] = paces.get(month)?.[i]?.spend ?? null; row[`pct_${month}`] = paces.get(month)?.[i]?.pct ?? null; });
    return row;
  });
  const chartDates = previous ? trailingMonths(period) : [...new Set([...currentInvoices.map(row => row.invoice_date.slice(0,7)), ...currentSales.map(row => row.date.slice(0,7))])].sort();
  const combinedRows = chartDates.map(date => {
    const spendValue = sumSpend((previous ? invoices : currentInvoices).filter(row => row.invoice_date.startsWith(date)));
    const revenueValue = sumRevenue((previous ? sales : currentSales).filter(row => row.date.startsWith(date)));
    return { date, label: monthLabel(date), spend: spendValue, pct: percentage(spendValue, revenueValue) };
  });
  const lastRatioIndex = combinedRows.reduce((last, row, index) => row.pct != null ? index : last, -1);
  const visibleItems = items.filter(row => row.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    if (sort.key === "change" && a.change == null && b.change == null) return a.name.localeCompare(b.name);
    if (sort.key === "change" && a.change == null) return 1;
    if (sort.key === "change" && b.change == null) return -1;
    const cmp = sort.key === "name" ? a.name.localeCompare(b.name) : (a[sort.key] ?? 0) - (b[sort.key] ?? 0);
    return sort.desc ? -cmp : cmp;
  });
  const toggleSort = (key: "name" | "value" | "change") => setSort(old => ({ key, desc: old.key === key ? !old.desc : key !== "name" }));
  const caption = previous ? `Day by day, ${monthName(period)} against ${monthName(previous)}.${latestDay ? ` By the ${integer(latestDay)}${latestDay % 100 >= 11 && latestDay % 100 <= 13 ? "th" : latestDay % 10 === 1 ? "st" : latestDay % 10 === 2 ? "nd" : latestDay % 10 === 3 ? "rd" : "th"}: ${money(byDayCurrent)} this month vs ${money(byDayPrevious)} in ${monthName(previous)}.` : " No invoices or sales in this month yet."}` : "All months comparison · day-of-month basis";
  const canPricing = access.canOpen({ title: "Supplier Pricing", url: "/procurement/supplier-pricing", adminOnly: true });
  const paceChart = (percent: boolean) => <div className="min-w-0"><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={previous ? pairRows : allRows} margin={{ top: 8, right: 12, left: -10, bottom: 5 }}><CartesianGrid {...chartGrid} /><XAxis dataKey="day" {...chartAxis} domain={percent ? [3, 31] : [1, 31]} type="number" allowDataOverflow /><YAxis {...chartAxis} tickFormatter={value => percent ? `${integer(Number(value))}%` : compactHK(Number(value))} /><Tooltip contentStyle={chartTooltipContentStyle} labelFormatter={label => `Day ${label}`} formatter={(value: number, name: string) => [percent ? pct(value) : money(value), name]} />{previous ? <><Line dataKey={percent ? "currentPct" : "current"} name={monthLabel(period)} stroke={percent ? WARM : PRIMARY} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Line dataKey={percent ? "priorPct" : "prior"} name={monthLabel(previous)} stroke={percent ? WARM : PRIMARY} strokeOpacity={0.45} strokeDasharray="4 4" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /></> : allMonthKeys.map((month, i) => <Line key={month} dataKey={`${percent ? "pct" : "spend"}_${month}`} name={monthLabel(month)} stroke={percent ? WARM : PRIMARY} strokeOpacity={monthOpacity(i)} strokeWidth={2} dot={false} hide={hiddenMonths.has(month)} connectNulls={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div><p className="mt-3 text-xs text-muted-foreground">{percent ? previous ? `From day 3 · ${pct(finalPct)} ${isCurrent ? "so far" : "by month end"}` : "From day 3 · cumulative spend as % of revenue" : "Cumulative spend"}</p></div>;

  if (data.isError || purchasing.isError) return <Alert><AlertDescription>Could not load purchasing figures. Please reload to try again.</AlertDescription></Alert>;
  if (!data.isSuccess || !purchasing.isSuccess) return <div className="space-y-4 py-4" aria-label="Loading purchasing overview"><div className="h-10 w-44 animate-pulse rounded-lg bg-muted/40" /><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(n => <div key={n} className="h-28 rounded-xl bg-card/40 animate-pulse" />)}</div><div className="h-80 rounded-xl bg-card/40 animate-pulse" /></div>;
  return <div data-purchasing-overview className="space-y-5 min-w-0 td-num">
    <style>{`body:has([data-purchasing-overview]) nav[aria-label="Purchasing analysis"] { display: none; }`}</style>
    <PageTop title="Purchasing overview" period={<DateFilter
      from={from}
      to={to}
      onFromChange={date => { setPeriod("custom"); setFrom(date); }}
      onToChange={date => { setPeriod("custom"); setTo(date); }}
      months={months.filter(month => month !== currentMonth).map(monthLabel)}
      onPeriodSelect={selection => {
        const next = selection === "MTD" ? currentMonth : selection === "All Time" ? "all" : selection === "Custom" ? "custom" : months.find(month => monthLabel(month) === selection);
        if (!next) return;
        setPeriod(next);
        if (next !== "custom") { setFrom(undefined); setTo(undefined); }
      }}
      initialPeriod={period === currentMonth ? "MTD" : period === "all" ? "All Time" : period === "custom" ? "Custom" : monthLabel(period)}
      labelled
      includeMtd
    />} actions={isAdmin && singleMonth && (purchasing.mode === "central" || !scope.isAll) ? <Button variant="outline" size="sm" className="h-10" onClick={() => { setBudgetSuggest(false); setBudgetsOpen(true); }}>Budgets</Button> : undefined} />
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{purchasing.mode === "central" ? "Whole group" : scope.label} · {integer(currentInvoices.length)} invoices · last invoice uploaded <span className="whitespace-nowrap">{latestUpload ? formatDate(latestUpload) : "—"}</span></span>{(fallback || (isCurrent && !currentInvoices.length)) && <span className="rounded-full bg-warning/10 text-warning border border-warning/30 px-2 py-1">No {monthName(currentMonth)} invoices yet{fallback ? ` · showing ${monthName(period)}` : ""}</span>}</div>
    {budgetsExist && pace && <div className={cn("inline-flex flex-wrap items-center gap-x-1.5 rounded-full border px-3 py-1 text-xs", pace.ahead ? "border-warning/30 bg-warning/10 text-warning" : "border-primary/20 bg-primary/5 text-primary")}>{isCurrent ? <span>{money(Math.abs(pace.delta))} {pace.ahead ? "ahead of" : "under"} usual pace · {format(new Date(), "d MMM")}: {pct(pace.spentPct)} of the budget spent; by now you usually have {pct(pace.usualPct * 100)}</span> : <span>Month closed: {money(Math.abs(totalBudget - budgetedSpend))} {budgetedSpend > totalBudget ? "over" : "under"} budget</span>}</div>}
    {showSalesNote && <Alert className="border-info/40 bg-info/5"><AlertDescription className="flex flex-wrap items-center gap-2"><span>Sales are {pct(Math.abs(salesDiff! * 100))} {salesDiff! >= 0 ? "above" : "below"} forecast so far. Budgets moved in line: {money(totalBudget)} (now {money(suggestedTotal)}).</span><Button variant="outline" size="sm" className="h-8" onClick={() => { setBudgetSuggest(true); setBudgetsOpen(true); }}>Update budgets</Button></AlertDescription></Alert>}
    {purchasing.mode === "central" && <Alert className="border-info/40 bg-info/5"><AlertDescription>{purchasing.tenantName} buys centrally. Figures are for the whole group; picking a venue in the top bar doesn't split purchasing.</AlertDescription></Alert>}
    <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3"><OverviewKpi label="Spend" value={money(spend)} hint={previous ? <span className="whitespace-nowrap">{delta(changePercent(spend, previousSpend))} vs {monthLabel(previous)}</span> : undefined} /><OverviewKpi label="Spend as % of revenue" value={pct(finalPct)} hint={previous ? <span className="whitespace-nowrap">{monthLabel(previous)} {pct(percentage(previousSpend, sumRevenue(previousSales)))}</span> : undefined} /><OverviewKpi label="Top 3 suppliers" value={pct(percentage(suppliers.slice(0,3).reduce((n,row)=>n+row.value,0), spend))} hint="of spend" /><OverviewKpi label="Invoices" value={integer(currentInvoices.length)} hint={`${integer(currentInvoices.filter(row => row.has_disputes || row.review_status === "Disputed").length)} disputed`} /></div>
    <OverviewChartShell headerRight={<div aria-label="Pace key" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">{previous ? <>
      <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-foreground" />{monthLabel(period)}</span>
      <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-dashed border-foreground opacity-[0.45]" />{monthLabel(previous)}</span>
    </> : allMonthKeys.map((month,i) => <Button key={month} variant="ghost" aria-pressed={!hiddenMonths.has(month)} onClick={() => setHiddenMonths(old => { const next = new Set(old); next.has(month) ? next.delete(month) : next.add(month); return next; })} className={cn("inline-flex h-auto items-center gap-1.5 rounded-none p-0 text-[11px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground", hiddenMonths.has(month) && "line-through opacity-50")}><span className="w-3 border-t-2 border-foreground" style={{ opacity: monthOpacity(i) }} />{monthLabel(month)}</Button>)}</div>} title={previous ? "This month so far" : "Purchasing pace"} className="[&>div:first-child]:mb-1"><p className="text-xs text-muted-foreground mb-5 leading-relaxed">{caption}</p><div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{paceChart(false)}{paceChart(true)}</div></OverviewChartShell>
    <OverviewChartShell title="Spend vs revenue" headerRight={<div aria-label="Spend key" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />Spend</span><span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2 border-warning" />Spend % of revenue</span></div>}><div className="h-[280px] md:h-[320px]">{combinedRows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={combinedRows} margin={{ top: 12, right: 12, left: -10, bottom: 5 }}><CartesianGrid {...chartGrid} /><XAxis dataKey="label" {...chartAxis} interval="preserveStartEnd" /><YAxis yAxisId="money" {...chartAxis} tickFormatter={compactHK} /><YAxis yAxisId="pct" orientation="right" {...chartAxis} tickFormatter={value => `${integer(value)}%`} /><Tooltip contentStyle={chartTooltipContentStyle} formatter={(value: number,name: string)=>[name.includes("%") ? pct(value) : money(value),name]} /><Bar yAxisId="money" dataKey="spend" name="Spend" fill={PRIMARY} radius={[3,3,0,0]} isAnimationActive={false}>{combinedRows.map((row,i) => <Cell key={row.date} fillOpacity={previous ? row.date === period ? 1 : 0.55 : i === combinedRows.length - 1 ? 1 : 0.55} />)}</Bar><Line yAxisId="pct" dataKey="pct" name="Spend % of revenue" stroke={WARM} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}></Line><Customized component={(props: { xAxisMap?: Record<string, { scale: ((value: string) => number) & { bandwidth?: () => number } }>; yAxisMap?: Record<string, { scale: (value: number) => number }>; offset?: { left: number; top: number; width: number; height: number } }) => {
      const row = combinedRows[lastRatioIndex], xAxis = Object.values(props.xAxisMap ?? {})[0];
      const moneyAxis = props.yAxisMap?.money, ratioAxis = props.yAxisMap?.pct, bounds = props.offset;
      if (!row || row.pct == null || !xAxis || !moneyAxis || !ratioAxis || !bounds) return <g />;
      const text = pct(row.pct), width = text.length * 6.2 + 12;
      const pointX = xAxis.scale(row.label) + (xAxis.scale.bandwidth?.() ?? 0) / 2;
      const pointY = ratioAxis.scale(row.pct);
      const tagX = Math.max(bounds.left + 2, Math.min(pointX - width / 2, bounds.left + bounds.width - width - 2));
      const band = xAxis.scale.bandwidth?.() ?? 0;
      const coveredBars = combinedRows.filter(candidate => {
        const centre = xAxis.scale(candidate.label) + band / 2;
        return centre + band * 0.4 >= tagX && centre - band * 0.4 <= tagX + width;
      });
      const barTop = Math.min(...coveredBars.map(candidate => moneyAxis.scale(candidate.spend)));
      const tagY = Math.max(2, Math.min(pointY - 26, barTop - 24));
      return <g data-percentage-tag><rect x={tagX} y={tagY} width={width} height={18} rx={5} fill="hsl(var(--card))" stroke={WARM} strokeOpacity={0.5} /><text x={tagX + width / 2} y={tagY + 12.5} textAnchor="middle" fontSize={11} fontWeight={600} fill="color-mix(in srgb, hsl(var(--chart-7)) 75%, hsl(var(--foreground)))">{text}</text></g>;
    }} /></ComposedChart></ResponsiveContainer> : <p className="py-12 text-sm text-muted-foreground">No data in this period.</p>}</div></OverviewChartShell>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><OverviewChartShell title="Suppliers"><RankedList rows={suppliers.slice(0,10)} /><Button variant="link" className="px-0 h-9 text-xs hover:text-foreground" onClick={()=>setSupplierOpen(true)}>See all {integer(suppliers.length)} suppliers</Button></OverviewChartShell><OverviewChartShell title="Categories"><RankedList rows={categories} /></OverviewChartShell></div>
    <OverviewChartShell title="Items"><p className="text-xs text-muted-foreground leading-relaxed mb-4">Top items by {periodLabel} spend. Unit price is compared like for like (same unit). Keg and bottle deposits are left out.</p><ItemsTable rows={items.slice(0,10)} previous={previous} /><Button variant="link" className="px-0 h-9 text-xs hover:text-foreground" onClick={()=>setItemsOpen(true)}>See all {integer(items.length)} items</Button></OverviewChartShell>
    <OverviewChartShell title="Worth checking"><p className="text-xs text-muted-foreground mb-2">Things that need a person</p><div className="divide-y divide-border/40">{[...(canPricing ? [{ name: "Prices above the agreed price", path: "/procurement/supplier-pricing" }] : []), { name: "Invoice lines not matched to an item", path: "/procurement/line-items" }, { name: "Invoices that differ from the delivery", path: "/procurement/invoices" }].map(row => <div key={row.path} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{row.name}</span><Button asChild variant="link" className="h-9 px-0 text-xs shrink-0 hover:text-foreground"><Link to={row.path}>Open</Link></Button></div>)}</div></OverviewChartShell>
    <nav aria-label="Overview analysis" className="flex flex-wrap gap-4 text-xs text-muted-foreground">{purchasingAnalysisPages.filter(access.canOpen).map(page => <Link className="underline underline-offset-4 hover:text-foreground" key={page.url} to={page.url}>{page.title}</Link>)}</nav>
    <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}><DialogContent className="max-w-[900px] overflow-hidden"><DialogHeader className="text-left pr-8"><DialogTitle>Suppliers</DialogTitle><DialogDescription>{periodLabel} · {purchasing.mode === "central" ? "Whole group" : scope.label}</DialogDescription></DialogHeader><div className="max-h-[65svh] overflow-auto"><table className="w-full min-w-[500px] text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-1 py-3 sm:px-3 text-left font-medium">Supplier</th><th className="px-1 py-3 sm:px-3 text-right font-medium whitespace-nowrap">Spend (HK$)</th>{previous && <th className="px-1 py-3 sm:px-3 text-right font-medium whitespace-nowrap">vs {monthLabel(previous)}</th>}<th className="px-1 py-3 sm:px-3 text-right font-medium">Share</th></tr></thead><tbody>{suppliers.map(row => <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20"><td className="p-3 whitespace-normal break-words max-w-[360px]">{row.name}</td><td title={money(row.value)} className="px-1 py-3 sm:px-3 text-right td-num truncate">{money(row.value)}</td>{previous && <td className="px-1 py-3 sm:px-3 text-right td-num truncate">{delta(row.change)}</td>}<td className="px-1 py-3 sm:px-3 text-right td-num truncate">{pct(row.share)}</td></tr>)}</tbody></table></div></DialogContent></Dialog>
    <Dialog open={itemsOpen} onOpenChange={setItemsOpen}><DialogContent className="max-w-[1100px] overflow-hidden"><DialogHeader className="text-left pr-8"><DialogTitle>Items</DialogTitle><DialogDescription>{periodLabel} · {purchasing.mode === "central" ? "Whole group" : scope.label}</DialogDescription></DialogHeader><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search items" placeholder="Search items" className="pl-9" value={search} onChange={event=>setSearch(event.target.value)} /></div><div className="max-h-[60svh] overflow-auto"><ItemsTable rows={visibleItems} previous={previous} full sort={sort} onSort={toggleSort} /></div></DialogContent></Dialog>
  </div>;
}
