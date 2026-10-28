import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarIcon, ArrowUpDown, Search } from "lucide-react";
import { Bar, ComposedChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useVenueScope } from "@/hooks/useVenueScope";
import { usePurchasingMode } from "@/hooks/usePurchasingMode";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";
import { purchasingOverviewRows } from "@/utils/purchasingMode";
import { KpiCard } from "@/components/expenses/shared";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import { PRIMARY, DESTRUCTIVE, chartAxis, chartGrid, chartTooltipContentStyle, chartLegendStyle, compactHK, monthOpacity } from "@/components/revenue-overview/chartTheme";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency as money, formatTableInteger as integer, formatPercent as pct, formatDecimal, formatDate } from "@/utils/format";
import { categoryRanking, itemRanking, supplierRanking, monthPace, previousCalendarMonth, periodIncludes, sumSpend, sumRevenue, percentage, changePercent, type OverviewInvoice, type OverviewLine, type OverviewProduct, type OverviewSale } from "@/utils/purchasingOverview";
import { cn } from "@/lib/utils";

const monthLabel = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMM yyyy");
const monthName = (key: string) => format(new Date(`${key}-01T12:00:00`), "MMMM");
const delta = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${pct(value)}`;
type Item = ReturnType<typeof itemRanking>[number];
type Ranked = { id: string; name: string; value: number; share: number | null };

function RankedList({ rows }: { rows: Ranked[] }) {
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return rows.length ? <div className="divide-y divide-border/40">{rows.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto_48px] items-center gap-x-3 py-3 text-xs">
    <div className="min-w-0"><div className="truncate text-sm" title={row.name}>{row.name}</div><div className="mt-2 h-1 rounded-full bg-muted/40"><div className={cn("h-full rounded-full", row.value < 0 ? "bg-destructive/60" : "bg-primary/50")} style={{ width: `${Math.min(100, Math.abs(row.value) / maximum * 100)}%` }} /></div></div>
    <span className={cn("td-num whitespace-nowrap text-right", row.value < 0 && "text-destructive")}>{money(row.value)}</span><span className="td-num text-right text-muted-foreground whitespace-nowrap">{pct(row.share)}</span>
  </div>)}</div> : <p className="py-8 text-sm text-muted-foreground">No spend in this period.</p>;
}

function ItemsTable({ rows, previous, sort, onSort, full = false }: { rows: Item[]; previous: string | null; full?: boolean; sort?: { key: "name" | "value" | "change"; desc: boolean }; onSort?: (key: "name" | "value" | "change") => void }) {
  const heading = (label: string, key: "name" | "value" | "change") => onSort ? <Button variant="ghost" size="sm" className="h-8 p-0 text-xs hover:bg-muted/40 hover:text-foreground" onClick={() => onSort(key)}>{label}<ArrowUpDown className="ml-1 h-3 w-3" />{sort?.key === key && <span className="sr-only">{sort.desc ? "descending" : "ascending"}</span>}</Button> : label;
  return <div className={full ? "" : "overflow-auto"}><table className="w-full min-w-[640px] table-fixed text-xs"><colgroup><col className="w-[32%]" /><col className="w-[17%]" />{previous && <col className="w-[15%]" />}<col className="w-[20%]" />{previous && <col className="w-[16%]" />}</colgroup><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground">
    <th className="p-3 text-left font-medium" aria-sort={sort?.key === "name" ? sort.desc ? "descending" : "ascending" : undefined}>{heading("Item", "name")}</th><th className="p-3 text-right font-medium" aria-sort={sort?.key === "value" ? sort.desc ? "descending" : "ascending" : undefined}>{heading("Spend (HK$)", "value")}</th>{previous && <th className="p-3 text-right font-medium" aria-sort={sort?.key === "change" ? sort.desc ? "descending" : "ascending" : undefined}>{heading(`vs ${monthLabel(previous)}`, "change")}</th>}<th className="p-3 text-right font-medium">Unit price</th>{previous && <th className="p-3 text-left font-medium">Price vs {monthLabel(previous)}</th>}
  </tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20"><td className={cn("p-3", full ? "break-words whitespace-normal" : "truncate")} title={row.name}>{row.name}</td><td className="p-3 text-right td-num whitespace-nowrap">{money(row.value)}</td>{previous && <td className="p-3 text-right td-num whitespace-nowrap">{row.isNew ? "new" : delta(row.change)}</td>}<td className="p-3 text-right td-num whitespace-nowrap">{row.price == null ? "—" : formatDecimal(row.price)}{row.unit ? ` / ${row.unit}` : ""}</td>{previous && <td className="p-3 whitespace-nowrap text-muted-foreground">{row.priceComparison}</td>}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-sm text-muted-foreground">No matched items in this period.</p>}</div>;
}

export default function ProcurementDashboardTab() {
  const purchasing = usePurchasingMode();
  const scope = useVenueScope();
  const access = usePurchasingNavigationAccess();
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "value" | "change"; desc: boolean }>({ key: "value", desc: true });
  const [hiddenMonths, setHiddenMonths] = useState<Set<string>>(new Set());
  const data = useQuery({
    queryKey: ["proc-dash", "overview-redesign", purchasing.tenantId], enabled: !!purchasing.tenantId, staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const id = purchasing.tenantId;
      const [invoices, suppliers, sales, lines, products] = await Promise.all([
        fetchAllRows("invoices", "id,supplier_id,invoice_date,total_amount,discount,venue,created_at,review_status,has_disputes", { col: "invoice_date", asc: false }, id),
        fetchAllRows("suppliers", "id,name", undefined, id),
        fetchAllRows("sales_records", "date,total_sales,venue", undefined, id),
        fetchAllRows("invoice_line_items", "invoice_id,product_master_id,total,unit_price,unit,quantity", undefined, id),
        fetchAllRows("product_master", "id,internal_product_name,financial_treatment,level1_category,unit", undefined, id),
      ]);
      return { invoices: invoices as OverviewInvoice[], suppliers: suppliers as { id: string; name: string }[], sales: sales as OverviewSale[], lines: lines as OverviewLine[], products: products as OverviewProduct[] };
    },
  });
  const invoices = useMemo(() => purchasingOverviewRows(data.data?.invoices ?? [], purchasing.mode, scope.includesName), [data.data, purchasing.mode, scope.includesName]);
  const sales = useMemo(() => purchasingOverviewRows(data.data?.sales ?? [], purchasing.mode, scope.includesName), [data.data, purchasing.mode, scope.includesName]);
  const products = useMemo(() => new Map((data.data?.products ?? []).map(row => [row.id, row])), [data.data]);
  const names = useMemo(() => new Map((data.data?.suppliers ?? []).map(row => [row.id, row.name])), [data.data]);
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
  const currentMonth = format(new Date(), "yyyy-MM");
  const months = [...new Set([currentMonth, ...invoices.map(row => row.invoice_date.slice(0, 7))])].sort().reverse();
  const periodLabel = previous ? monthLabel(period) : period === "all" ? "All time" : "Custom range";
  const latestUpload = currentInvoices.map(row => row.created_at).filter(Boolean).sort().at(-1);
  const latestDay = Math.max(0, ...currentInvoices.map(row => Number(row.invoice_date.slice(8, 10))), ...currentSales.map(row => Number(row.date.slice(8, 10))));
  const isCurrent = period === currentMonth;
  const currentPace = previous ? monthPace(period, invoices, sales, isCurrent ? latestDay : undefined) : [];
  const previousPace = previous ? monthPace(previous, invoices, sales) : [];
  const pairRows = Array.from({ length: Math.max(currentPace.length, previousPace.length) }, (_, i) => ({ day: i + 1, current: currentPace[i]?.spend ?? null, prior: previousPace[i]?.spend ?? null, currentPct: currentPace[i]?.pct ?? null, priorPct: previousPace[i]?.pct ?? null }));
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
  const chartDates = [...new Set([...currentInvoices.map(row => row.invoice_date.slice(0, period === "all" ? 7 : 10)), ...currentSales.map(row => row.date.slice(0, period === "all" ? 7 : 10))])].sort();
  const combinedRows = chartDates.map(date => {
    const spendValue = sumSpend(currentInvoices.filter(row => row.invoice_date.startsWith(date)));
    const revenueValue = sumRevenue(currentSales.filter(row => row.date.startsWith(date)));
    return { label: period === "all" ? monthLabel(date) : format(new Date(`${date}T12:00:00`), "d MMM"), spend: spendValue, revenue: revenueValue, pct: percentage(spendValue, revenueValue) };
  });
  const visibleItems = items.filter(row => row.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    const cmp = sort.key === "name" ? a.name.localeCompare(b.name) : (a[sort.key] ?? -Infinity) - (b[sort.key] ?? -Infinity);
    return sort.desc ? -cmp : cmp;
  });
  const toggleSort = (key: "name" | "value" | "change") => setSort(old => ({ key, desc: old.key === key ? !old.desc : key !== "name" }));
  const caption = previous ? `Day by day, ${monthName(period)} against ${monthName(previous)}.${latestDay ? ` By the ${integer(latestDay)}${latestDay % 100 >= 11 && latestDay % 100 <= 13 ? "th" : latestDay % 10 === 1 ? "st" : latestDay % 10 === 2 ? "nd" : latestDay % 10 === 3 ? "rd" : "th"}: ${money(byDayCurrent)} this month vs ${money(byDayPrevious)} in ${monthName(previous)}.` : " No invoices or sales in this month yet."}` : "All months comparison · day-of-month basis";
  const canPricing = access.canOpen({ title: "Supplier Pricing", url: "/procurement/supplier-pricing", adminOnly: true });
  const paceChart = (percent: boolean) => <div className="min-w-0"><div className="h-[260px] md:h-[290px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={previous ? pairRows : allRows} margin={{ top: 8, right: 12, left: -10, bottom: 5 }}><CartesianGrid {...chartGrid} /><XAxis dataKey="day" {...chartAxis} domain={percent ? [3, 31] : [1, 31]} type="number" allowDataOverflow /><YAxis {...chartAxis} tickFormatter={value => percent ? `${integer(Number(value))}%` : compactHK(Number(value))} /><Tooltip contentStyle={chartTooltipContentStyle} labelFormatter={label => `Day ${label}`} formatter={(value: number, name: string) => [percent ? pct(value) : money(value), name]} /><Legend wrapperStyle={chartLegendStyle} onClick={entry => { if (previous) return; const key = String(entry.dataKey).replace(/^(spend_|pct_)/, ""); setHiddenMonths(old => { const next = new Set(old); next.has(key) ? next.delete(key) : next.add(key); return next; }); }} />{previous ? <><Line dataKey={percent ? "currentPct" : "current"} name={monthLabel(period)} stroke={PRIMARY} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Line dataKey={percent ? "priorPct" : "prior"} name={monthLabel(previous)} stroke={PRIMARY} strokeOpacity={0.45} strokeDasharray="4 4" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /></> : allMonthKeys.map((month, i) => <Line key={month} dataKey={`${percent ? "pct" : "spend"}_${month}`} name={monthLabel(month)} stroke={PRIMARY} strokeOpacity={monthOpacity(i)} strokeWidth={2} dot={false} hide={hiddenMonths.has(month)} connectNulls={false} isAnimationActive={false} />)}</LineChart></ResponsiveContainer></div><p className="mt-3 text-xs text-muted-foreground">{percent ? `From day 3 · ${pct(finalPct)} ${isCurrent ? "so far" : "by month end"}` : "Cumulative spend"}</p></div>;

  if (data.isError || purchasing.isError) return <Alert><AlertDescription>Could not load purchasing figures. Please reload to try again.</AlertDescription></Alert>;
  if (!data.isSuccess || !purchasing.isSuccess) return <div className="space-y-4 py-4" aria-label="Loading purchasing overview"><div className="h-10 w-44 animate-pulse rounded-lg bg-muted/40" /><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(n => <div key={n} className="h-28 rounded-xl bg-card/40 animate-pulse" />)}</div><div className="h-80 rounded-xl bg-card/40 animate-pulse" /></div>;
  return <div className="space-y-5 mt-4 min-w-0 td-num">
    <div className="flex flex-wrap justify-end gap-2"><Select value={period} onValueChange={value => { setPeriod(value); if(value !== "custom") { setFrom(undefined); setTo(undefined); } }}><SelectTrigger className="w-[180px] h-9" aria-label="Period"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Time</SelectItem>{months.map(month => <SelectItem key={month} value={month}>{monthLabel(month)}</SelectItem>)}<SelectItem value="custom">Custom Range</SelectItem></SelectContent></Select>{period === "custom" && <div className="flex flex-wrap items-center gap-2">{[{ label: "From", date: from, set: setFrom, open: fromOpen, setOpen: setFromOpen }, { label: "To", date: to, set: setTo, open: toOpen, setOpen: setToOpen }].map(field => <Popover key={field.label} open={field.open} onOpenChange={field.setOpen}><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-9 text-xs"><CalendarIcon className="h-3 w-3 mr-1" />{field.date ? formatDate(field.date.toISOString()) : field.label}</Button></PopoverTrigger><PopoverContent className="w-auto p-0" align="end"><Calendar mode="single" selected={field.date} onSelect={date => { field.set(date); field.setOpen(false); }} /></PopoverContent></Popover>)}{(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(undefined); setTo(undefined); }}>Clear</Button>}</div>}</div>
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{purchasing.mode === "central" ? "Whole group" : scope.label} · {integer(currentInvoices.length)} invoices · last invoice uploaded {latestUpload ? formatDate(latestUpload) : "—"}</span>{isCurrent && !currentInvoices.length && <span className="rounded-full bg-warning/10 text-warning border border-warning/30 px-2 py-1">No {monthName(period)} invoices yet</span>}</div>
    {purchasing.mode === "central" && <Alert className="border-info/40 bg-info/5"><AlertDescription>{purchasing.tenantName} buys centrally. Figures are for the whole group; picking a venue in the top bar doesn't split purchasing.</AlertDescription></Alert>}
    <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-4 gap-3"><KpiCard label="Spend" value={money(spend)} hint={previous ? <span className="whitespace-nowrap">{delta(changePercent(spend, previousSpend))} vs {monthLabel(previous)}</span> : undefined} /><KpiCard label="Spend as % of revenue" value={pct(finalPct)} hint={previous ? <span className="whitespace-nowrap">{monthLabel(previous)} {pct(percentage(previousSpend, sumRevenue(previousSales)))}</span> : undefined} /><KpiCard label="Top 3 suppliers" value={pct(percentage(suppliers.slice(0,3).reduce((n,row)=>n+row.value,0), spend))} hint="of spend" /><KpiCard label="Invoices" value={integer(currentInvoices.length)} hint={`${integer(currentInvoices.filter(row => row.has_disputes || row.review_status === "Disputed").length)} disputed`} /></div>
    <ChartShell title={previous ? "This month so far" : "Purchasing pace"} className="[&>div:first-child]:mb-1"><p className="text-xs text-muted-foreground mb-5 leading-relaxed">{caption}</p><div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{paceChart(false)}{paceChart(true)}</div></ChartShell>
    <ChartShell title="Spend vs revenue"><div className="h-[280px] md:h-[320px]">{combinedRows.length ? <ResponsiveContainer width="100%" height="100%"><ComposedChart data={combinedRows} margin={{ top: 8, right: 0, left: -10, bottom: 5 }}><CartesianGrid {...chartGrid} /><XAxis dataKey="label" {...chartAxis} interval="preserveStartEnd" /><YAxis yAxisId="money" {...chartAxis} tickFormatter={compactHK} /><YAxis yAxisId="pct" orientation="right" {...chartAxis} tickFormatter={value => `${integer(value)}%`} /><Tooltip contentStyle={chartTooltipContentStyle} formatter={(value: number,name: string)=>[name.includes("%") ? pct(value) : money(value),name]} /><Legend wrapperStyle={chartLegendStyle} /><Bar yAxisId="money" dataKey="revenue" name="Revenue" fill={PRIMARY} fillOpacity={0.25} radius={[3,3,0,0]} isAnimationActive={false} /><Bar yAxisId="money" dataKey="spend" name="Spend" fill={PRIMARY} fillOpacity={0.7} radius={[3,3,0,0]} isAnimationActive={false} /><Line yAxisId="pct" dataKey="pct" name="Spend % of revenue" stroke={DESTRUCTIVE} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer> : <p className="py-12 text-sm text-muted-foreground">No data in this period.</p>}</div></ChartShell>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5"><ChartShell title="Suppliers"><RankedList rows={suppliers.slice(0,10)} /><Button variant="link" className="px-0 h-9 text-xs hover:text-foreground" onClick={()=>setSupplierOpen(true)}>See all {integer(suppliers.length)} suppliers</Button></ChartShell><ChartShell title="Categories"><RankedList rows={categories} /></ChartShell></div>
    <ChartShell title="Items"><p className="text-xs text-muted-foreground leading-relaxed mb-4">Top items by {periodLabel} spend. Unit price is compared like for like (same unit). Keg and bottle deposits are left out.</p><ItemsTable rows={items.slice(0,10)} previous={previous} /><Button variant="link" className="px-0 h-9 text-xs hover:text-foreground" onClick={()=>setItemsOpen(true)}>See all {integer(items.length)} items</Button></ChartShell>
    <ChartShell title="Worth checking"><p className="text-xs text-muted-foreground mb-2">Things that need a person</p><div className="divide-y divide-border/40">{[...(canPricing ? [{ name: "Prices above the agreed price", path: "/procurement/supplier-pricing" }] : []), { name: "Invoice lines not matched to an item", path: "/procurement/line-items" }, { name: "Invoices that differ from the delivery", path: "/procurement/invoices" }].map(row => <div key={row.path} className="flex items-center justify-between gap-4 py-3 text-sm"><span>{row.name}</span><Button asChild variant="link" className="h-9 px-0 text-xs shrink-0 hover:text-foreground"><Link to={row.path}>Open</Link></Button></div>)}</div></ChartShell>
    <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}><DialogContent className="max-w-[900px] overflow-hidden"><DialogHeader className="text-left pr-8"><DialogTitle>Suppliers</DialogTitle><DialogDescription>{periodLabel} · {purchasing.mode === "central" ? "Whole group" : scope.label}</DialogDescription></DialogHeader><div className="max-h-[65svh] overflow-auto"><table className="w-full min-w-[500px] text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-xs text-muted-foreground"><th className="p-3 text-left font-medium">Supplier</th><th className="p-3 text-right font-medium whitespace-nowrap">Spend (HK$)</th>{previous && <th className="p-3 text-right font-medium whitespace-nowrap">vs {monthLabel(previous)}</th>}<th className="p-3 text-right font-medium">Share</th></tr></thead><tbody>{suppliers.map(row => <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20"><td className="p-3 whitespace-normal break-words max-w-[360px]">{row.name}</td><td className="p-3 text-right td-num whitespace-nowrap">{money(row.value)}</td>{previous && <td className="p-3 text-right td-num whitespace-nowrap">{delta(row.change)}</td>}<td className="p-3 text-right td-num whitespace-nowrap">{pct(row.share)}</td></tr>)}</tbody></table></div></DialogContent></Dialog>
    <Dialog open={itemsOpen} onOpenChange={setItemsOpen}><DialogContent className="max-w-[1100px] overflow-hidden"><DialogHeader className="text-left pr-8"><DialogTitle>Items</DialogTitle><DialogDescription>{periodLabel} · {purchasing.mode === "central" ? "Whole group" : scope.label}</DialogDescription></DialogHeader><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search items" placeholder="Search items" className="pl-9" value={search} onChange={event=>setSearch(event.target.value)} /></div><div className="max-h-[60svh] overflow-auto"><ItemsTable rows={visibleItems} previous={previous} full sort={sort} onSort={toggleSort} /></div></DialogContent></Dialog>
  </div>;
}
