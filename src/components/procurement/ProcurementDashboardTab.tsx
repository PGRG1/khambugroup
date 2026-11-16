import {baseSymbol} from '@/utils/money';
import { shortDay } from "@/utils/salesRecordChecks";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Search } from "lucide-react";
import { CategoryBreakdown, categoryOpens } from "@/components/procurement/CategoryBreakdown";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useAuth } from "@/hooks/useAuth";
import { usePurchasingMode } from "@/hooks/usePurchasingMode";
import { usePurchasingBudgets, usePurchasingSalesForecast } from "@/hooks/usePurchasingBudgets";
import { purchasingOverviewRows } from "@/utils/purchasingMode";
import { KpiCard } from "@/components/expenses/shared";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import { PageTop } from "@/components/kit/PageTop";
import { usePurchasingData } from "@/hooks/usePurchasingData";
import { Num } from "@/components/home/HomeMotion";
import { RevenueEnter, useRevenueCount } from "@/components/revenue/RevenueMotion";
import { shortMoney } from "@/utils/revenueOverview";
import { PurchasingRunningTotal } from "./PurchasingRunningTotal";
import { usePagePeriod } from "@/hooks/usePagePeriod";
import { formatMonthLabel } from "@/utils/format";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMenuCurrency as priceMoney, formatCurrency as money, formatTableInteger as integer, formatPercent as pct, formatDecimal, formatDate } from "@/utils/format";
import { type CategoryTree, purchasingChecks, priceMoves, categoryRanking, itemRanking, supplierRanking, monthPace, previousCalendarMonth, periodIncludes, sumSpend, sumRevenue, percentage, changePercent, budgetByDay, isBudgetableCategory, hongKongDate, daysInMonth, suggestBudgets, comparisonCutoff, withinCutoff, type OverviewInvoice, type OverviewLine, type OverviewProduct, type OverviewSale } from "@/utils/purchasingOverview";
import { budgetBarScale, rankedBudgetCategories } from "./purchasingOverviewPresentation";
import { PurchasingBudgetsDialog } from "./PurchasingBudgetsDialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const monthLabel = formatMonthLabel;
const monthName = formatMonthLabel;
const delta = (value: number | null) => value == null ? "—" : `${value >= 0 ? "+" : ""}${pct(value)}`;
const wholePct = (value: number | null) => value == null ? "—" : `${integer(value)}%`;
type Item = ReturnType<typeof itemRanking>[number];
function OverviewChartShell({ children, className, ...props }: Parameters<typeof ChartShell>[0]) {
  return <ChartShell {...props} className={cn("max-sm:p-3.5 max-sm:[&>div:first-child]:mb-2", "[&>div:first-child>div:first-child>div:first-child]:text-[15px] [&>div:first-child>div:first-child>div:first-child]:font-semibold [&>p]:text-[12.5px] [&>div:first-child]:flex-wrap [&>div:first-child>div:last-child]:max-w-full [&>div:first-child>div:last-child]:shrink [&>div:first-child>div:last-child]:min-w-0 max-sm:[&>div:first-child>div:last-child]:basis-full", className)}>{children}</ChartShell>;
}
function OverviewKpi(props: Parameters<typeof KpiCard>[0]) {
  // Phones: compact 2×2 stats; larger screens unchanged.
  return <div className="min-w-0 [&>div]:h-full [&>div]:p-[18px] max-sm:[&>div]:p-[14px] [&>div>span]:hidden [&>div>div:first-of-type]:normal-case [&>div>div:first-of-type]:tracking-normal [&>div>div:first-of-type]:text-[13px] max-sm:[&>div>div:first-of-type]:text-[12px] [&>div>div:nth-of-type(2)]:text-[26px] max-sm:[&>div>div:nth-of-type(2)]:text-[19px] [&>div>div:nth-of-type(2)]:font-medium [&>div>div:nth-of-type(3)]:min-h-[26px] max-sm:[&>div>div:nth-of-type(3)]:min-h-0 [&>div>div:nth-of-type(3)]:text-[12px] max-sm:[&>div>div:nth-of-type(3)]:text-[11.5px]"><KpiCard {...props} /></div>;
}
type Ranked = { id: string; name: string; value: number; share: number | null };

function BudgetBar({ share, over, tick, height = "h-2" }: { share: number; over: boolean; tick: number | null; height?: "h-1" | "h-2" }) {
  return <div className={cn("relative rounded-full purchasing-track", height)}><div className={cn("h-full rounded-full", over ? "bg-warning" : "purchasing-bar")} style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />{tick != null && <span aria-hidden className="purchasing-tick" style={{ left: `${Math.max(0, Math.min(100, tick))}%` }} />}</div>;
}

function RankedList({ rows }: { rows: Ranked[] }) {
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return rows.length ? <div>{rows.map(row => <div key={row.id} className="grid grid-cols-[minmax(0,150px)_minmax(20px,1fr)_70px_38px] max-sm:grid-cols-[minmax(0,1fr)_56px_64px_44px] items-center gap-x-2 h-[30px] text-[13px]">
    <span className="min-w-0 truncate" title={row.name}>{row.name}</span>
    <div className="h-2 rounded-full purchasing-track"><div className="h-full rounded-full purchasing-bar" style={{ width: `${Math.min(100, Math.abs(row.value) / maximum * 100)}%` }} /></div>
    <span className="td-num whitespace-nowrap text-right" title={money(row.value)}>{integer(row.value)}</span><span className="td-num text-right text-muted-foreground whitespace-nowrap">{pct(row.share)}</span>
  </div>)}</div> : <p className="py-8 text-sm text-muted-foreground">No spend in this period.</p>;
}

type CategoryRow = CategoryTree;
/** A level 1 category name; when it has parts below it, a tap opens the breakdown pop-up. */
function CategoryName({ row, onOpen, className }: { row: CategoryRow; onOpen: (row: CategoryRow) => void; className?: string }) {
  if (!categoryOpens(row)) return <span className={cn("min-w-0 truncate", className)} title={row.name}>{row.name}</span>;
  return <button type="button" onClick={() => onOpen(row)} title={`See what's in ${row.name}`}
    className={cn("min-w-0 inline-flex items-center gap-0.5 text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm", className)}>
    <span className="truncate">{row.name}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
  </button>;
}
function CategoryList({ rows, onOpen }: { rows: CategoryRow[]; onOpen: (row: CategoryRow) => void }) {
  const maximum = Math.max(1, ...rows.map(row => Math.abs(row.value)));
  return rows.length ? <div className="divide-y divide-border/40">{rows.map(row => <div key={row.id} className="py-1">
    <div className={cn("grid grid-cols-[minmax(0,150px)_minmax(20px,1fr)_70px_38px] max-sm:grid-cols-[minmax(0,1fr)_56px_64px_44px] items-center gap-x-2 h-[30px] text-[13px]", (row.id === "deposits" || row.id === "deductions") && "text-muted-foreground")}>
      <CategoryName row={row} onOpen={onOpen} className="font-medium" />
      <div className="h-2 rounded-full purchasing-track"><div className="h-full rounded-full purchasing-bar" style={{ width: `${Math.min(100, Math.abs(row.value) / maximum * 100)}%` }} /></div>
      <span className="td-num whitespace-nowrap text-right" title={money(row.value)}>{integer(row.value)}</span><span className="td-num text-right text-muted-foreground whitespace-nowrap">{pct(row.share)}</span>
    </div>
  </div>)}</div> : <p className="py-8 text-sm text-muted-foreground">No spend in this period.</p>;
}

function ItemsTable({ rows, previous, sort, onSort, full = false }: { rows: Item[]; previous: string | null; full?: boolean; sort?: { key: "name" | "value" | "change"; desc: boolean }; onSort?: (key: "name" | "value" | "change") => void }) {
  const heading = (label: string, key: "name" | "value" | "change") => onSort ? <Button variant="ghost" size="sm" className="h-8 p-0 text-xs hover:bg-muted/40 hover:text-foreground" onClick={() => onSort(key)}>{label}<ArrowUpDown className="ml-1 h-3 w-3" />{sort?.key === key && <span className="sr-only">{sort.desc ? "descending" : "ascending"}</span>}</Button> : label;
  return <div className="min-w-0">{full && <div className="sm:hidden"><div className="flex flex-wrap gap-4 border-b border-border">{heading("Item", "name")}{heading(`Spend (${baseSymbol()})`, "value")}{previous && heading(`vs ${previous}`, "change")}</div>{rows.map(row => <div key={row.id} className="border-b border-border/40 py-3 text-[13px]"><p className="break-words font-medium">{row.name}</p><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2"><div><p className="text-[11px] text-muted-foreground">Spend ({baseSymbol()})</p><p className="td-num">{money(row.value)}</p></div>{previous && <div><p className="text-[11px] text-muted-foreground">vs {previous}</p><p className={cn("td-num", (row.change ?? 0) > 0 && "text-warning")}>{row.isNew ? "new" : delta(row.change)}</p></div>}<div><p className="text-[11px] text-muted-foreground">Unit price</p><p className="td-num break-words">{row.price == null ? "—" : formatDecimal(row.price)}{row.unit ? ` / ${row.unit}` : ""}</p></div>{previous && <div><p className="text-[11px] text-muted-foreground">Price vs {previous}</p><p className={cn(row.priceComparison !== "Same" && "text-warning")}>{row.priceComparison}</p></div>}</div></div>)}</div>}<table className={cn("w-full table-fixed text-[13px]", full && "max-sm:hidden")}><colgroup><col className="w-[34%] max-sm:w-[50%]" /><col className="w-[15%] max-sm:w-[25%]" />{previous && <col className="w-[12%] max-sm:w-[25%]" />}<col className={cn("w-[22%]", !full && "max-sm:hidden")} />{previous && <col className={cn("w-[17%]", !full && "max-sm:hidden")} />}</colgroup><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-muted-foreground">
    <th className="px-1 py-3 sm:px-3 text-left font-medium" aria-sort={sort?.key === "name" ? sort.desc ? "descending" : "ascending" : undefined}>{heading("Item", "name")}</th><th className="px-1 py-3 sm:px-3 text-right font-medium" aria-sort={sort?.key === "value" ? sort.desc ? "descending" : "ascending" : undefined}>{heading(`Spend (${baseSymbol()})`, "value")}</th>{previous && <th className="px-1 py-3 sm:px-3 text-right font-medium" aria-sort={sort?.key === "change" ? sort.desc ? "descending" : "ascending" : undefined}>{heading(`vs ${previous}`, "change")}</th>}<th className={cn("px-1 py-3 sm:px-3 text-right font-medium", !full && "max-sm:hidden")}>Unit price</th>{previous && <th className={cn("px-1 py-3 sm:px-3 text-left font-medium", !full && "max-sm:hidden")}>Price vs {previous}</th>}
  </tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20"><td className={cn("px-1 py-3 sm:px-3", full ? "break-words whitespace-normal" : "sm:truncate max-sm:break-words max-sm:whitespace-normal")} title={row.name}><span className={cn(!full && "max-sm:block max-sm:max-h-[2.8em] max-sm:overflow-hidden max-sm:leading-[1.4]")}>{row.name}</span></td><td title={money(row.value)} className="px-1 py-3 sm:px-3 text-right td-num truncate">{full ? money(row.value) : integer(row.value)}</td>{previous && <td title={row.isNew ? "new" : delta(row.change)} className={cn("px-1 py-3 sm:px-3 text-right td-num truncate", !row.isNew && (row.change ?? 0) > 0 && "text-warning")}>{row.isNew ? "new" : delta(row.change)}</td>}<td title={`${row.price == null ? "—" : formatDecimal(row.price)}${row.unit ? ` / ${row.unit}` : ""}`} className={cn("px-1 py-3 sm:px-3 text-right td-num", !full ? "max-sm:hidden truncate" : "break-words")}>{row.price == null ? "—" : formatDecimal(row.price)}{row.unit ? ` / ${row.unit}` : ""}</td>{previous && <td title={row.priceComparison} className={cn("px-1 py-3 sm:px-3 truncate", row.priceComparison !== "Same" && "text-warning", !full && "max-sm:hidden", full && "whitespace-normal break-words")}>{row.priceComparison}</td>}</tr>)}</tbody></table>{!rows.length && <p className="p-6 text-sm text-muted-foreground">No matched items in this period.</p>}</div>;
}

/** Spend so far, built like Revenue's "so far" card: the number, the change, budget, three figures. */
function SpendSoFar({ label, spend, previousSpend, previousLabel, budget, stats, note }: {
  label: string; spend: number; previousSpend: number | null; previousLabel: string | null; note?: string | null;
  budget: { total: number; spent: number; daysLeft: number | null } | null;
  stats: { label: string; value: string; was: string | null }[];
}) {
  const count = useRevenueCount();
  const change = previousSpend && previousSpend > 0 ? (spend - previousSpend) / previousSpend * 100 : null;
  const same = change != null && Math.abs(change) < 0.5;
  // Spending more is the warning direction here (Revenue's chip is the other way round).
  const tone = same ? { background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
    : (change ?? 0) > 0 ? { background: "rgba(224,123,26,.15)", color: "#B45309" } : { background: "rgba(22,163,74,.12)", color: "#15803D" };
  const over = !!budget && budget.spent > budget.total;
  const used = budget && budget.total > 0 ? Math.min(100, budget.spent / budget.total * 100) : 0;
  return <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4 max-sm:px-4 max-sm:py-4 max-sm:space-y-3" aria-label={label}>
    <div>
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums text-foreground"><Num value={spend} format={shortMoney} play={count} /></p>
        {change != null && previousLabel && <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium tabular-nums" style={tone}>{same ? `Same as ${previousLabel}` : `${change > 0 ? "+" : "−"}${Math.round(Math.abs(change))}% vs ${previousLabel}`}</span>}
      </div>
      {previousSpend != null && previousSpend > 0 && previousLabel && <p className="mt-2 max-sm:mt-1.5 text-[13px] max-sm:text-[12px] text-muted-foreground tabular-nums">{shortMoney(previousSpend)} in {previousLabel}</p>}
      {note && <p className="mt-2 max-sm:mt-1.5 text-[13px] max-sm:text-[12px] text-muted-foreground">{note}</p>}
    </div>
    {budget && <div className="space-y-2">
      <div className="relative h-3 rounded-full bg-muted overflow-hidden" role="img" aria-label={`${integer(used)}% of budget used`}><div className={cn("rv-fill absolute inset-y-0 left-0 rounded-full", over ? "bg-warning" : "bg-primary")} style={{ width: `${used}%` }} /></div>
      <div className="flex justify-between gap-3 text-[11px] text-muted-foreground td-num">
        <span className={cn(over && "text-warning")}>{shortMoney(Math.abs(budget.total - budget.spent))} {over ? "over budget" : "left"}{budget.daysLeft != null ? ` · ${integer(budget.daysLeft)} days to go` : ""}</span>
        <span>Budget {shortMoney(budget.total)}</span>
      </div>
    </div>}
    <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map(stat => <div key={stat.label} className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{stat.label}</p>
        <p className="text-[16px] font-semibold td-num tabular-nums">{stat.value}</p>
        {stat.was && <p className="truncate text-[11px] text-muted-foreground tabular-nums">{stat.was}</p>}
      </div>)}
    </div>
  </section>;
}

export default function ProcurementDashboardTab() {
  const purchasing = usePurchasingMode();
  const scope = useVenueScope();
  const { isAdmin } = useAuth();
  const budgetsQuery = usePurchasingBudgets();
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [breakdown, setBreakdown] = useState<CategoryRow | null>(null);
  const mobile = useIsMobile();
  const [budgetSuggestions, setBudgetSuggestions] = useState<Map<string, number> | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: "name" | "value" | "change"; desc: boolean }>({ key: "value", desc: true });
  const data = usePurchasingData(purchasing.tenantId);
  // Draft invoices are not spend: excluded from every Overview/budgets figure.
  const invoices = useMemo(() => purchasingOverviewRows(data.data?.invoices ?? [], purchasing.mode, scope.includesName).filter(row => row.review_status !== "Draft"), [data.data, purchasing.mode, scope.includesName]);
  const sales = useMemo(() => purchasingOverviewRows(data.data?.sales ?? [], purchasing.mode, scope.includesName), [data.data, purchasing.mode, scope.includesName]);
  const products = useMemo(() => new Map((data.data?.products ?? []).map(row => [row.id, row])), [data.data]);
  const names = useMemo(() => new Map((data.data?.suppliers ?? []).map(row => [row.id, row.name])), [data.data]);
  const currentMonth = hongKongDate().slice(0, 7);
  // One month at a time (this month by default); the longer picture is on Trends.
  const datePeriod = usePagePeriod(invoices.map(row => row.invoice_date), "mtd", "month");
  const { from, to } = datePeriod;
  const period = datePeriod.fromIso.slice(0,7) === datePeriod.toIso.slice(0,7) ? datePeriod.month : "custom";
  const fallback = false;
  const previous = previousCalendarMonth(period);
  const fromDate = from ? format(from, "yyyy-MM-dd") : undefined, toDate = to ? format(to, "yyyy-MM-dd") : undefined;
  const currentInvoices = invoices.filter(row => datePeriod.inPeriod(row.invoice_date));
  const currentSales = sales.filter(row => datePeriod.inPeriod(row.date));
  // While a month is running, last month is compared over the same days (1–14 Oct against 1–14 Nov).
  const cutoff = comparisonCutoff(period, hongKongDate(), Math.max(0, ...currentInvoices.map(row => Number(row.invoice_date.slice(8, 10))), ...currentSales.map(row => Number(row.date.slice(8, 10)))));
  const previousLabel = previous ? (cutoff ? `1–${cutoff} ${monthLabel(previous).split(" ")[0]}` : monthLabel(previous)) : null;
  const previousInvoices = previous ? invoices.filter(row => row.invoice_date.startsWith(previous) && withinCutoff(row.invoice_date, cutoff)) : [];
  const previousSales = previous ? sales.filter(row => row.date.startsWith(previous) && withinCutoff(row.date, cutoff)) : [];
  const currentIds = new Set(currentInvoices.map(row => row.id)), previousIds = new Set(previousInvoices.map(row => row.id));
  const lines = (data.data?.lines ?? []).filter(row => currentIds.has(row.invoice_id));
  const previousLines = (data.data?.lines ?? []).filter(row => previousIds.has(row.invoice_id));
  const spend = sumSpend(currentInvoices), revenue = sumRevenue(currentSales), previousSpend = sumSpend(previousInvoices);
  const suppliers = supplierRanking(currentInvoices, previousInvoices, names);
  const items = itemRanking(lines, previousLines, products);
  const categories = categoryRanking(lines, currentInvoices, products);
  const checks = purchasingChecks(currentInvoices, previousInvoices, revenue, sumRevenue(previousSales));
  const moves = priceMoves(items);
  const largeMoves = priceMoves(items,20);
  const priorSuppliers = supplierRanking(previousInvoices, [], names).map(row=>({...row,count:previousInvoices.filter(i=>i.supplier_id===row.id).length})).sort((a,b)=>b.count-a.count).slice(0,3);
  const foodRatio = percentage(categories.find(c=>c.name==="Food")?.value??0,revenue);
  const drinkRatio = percentage(categories.find(c=>c.name==="Beverages")?.value??0,revenue);
  const months = [...new Set([currentMonth, ...invoices.map(row => row.invoice_date.slice(0, 7))])].sort().reverse();
  const periodLabel = previous ? monthLabel(period) : period === "all" ? "All time" : "Custom range";
  const lastInvoiceDate = invoices.map(row => row.invoice_date).filter(Boolean).sort().at(-1);
  const latestDay = Math.max(0, ...currentInvoices.map(row => Number(row.invoice_date.slice(8, 10))), ...currentSales.map(row => Number(row.date.slice(8, 10))));
  const isCurrent = period === currentMonth;
  // ---- Purchasing budgets (single-month periods only) ----
  const singleMonth = !!previous;
  const scopeVenueIds = (purchasing.mode === "central" ? scope.venues : scope.selectedVenues).map(venue => venue.id);
  const budgetVenueId = purchasing.mode === "central" ? null : (scope.selectedVenues.length === 1 ? scope.selectedVenues[0].id : null);
  const budgetRows = useMemo(() => singleMonth ? budgetsQuery.budgets.filter(row => row.month.slice(0, 7) === period && (budgetVenueId ? row.venue_id === budgetVenueId : purchasing.mode === "central" ? row.venue_id === null : row.venue_id !== null && scopeVenueIds.includes(row.venue_id))) : [], [budgetsQuery.budgets, singleMonth, period, budgetVenueId, purchasing.mode, scopeVenueIds.join(",")]);
  const budgetChanges = useMemo(() => singleMonth ? budgetsQuery.changes.filter(row => row.month.slice(0, 7) === period && (budgetVenueId ? row.venue_id === budgetVenueId : purchasing.mode === "central" ? row.venue_id === null : row.venue_id !== null && scopeVenueIds.includes(row.venue_id))) : [], [budgetsQuery.changes, singleMonth, period, budgetVenueId, purchasing.mode, scopeVenueIds.join(",")]);
  const budgetByCategory = useMemo(() => { const map = new Map<string, number>(); budgetRows.forEach(row => map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount))); return map; }, [budgetRows]);
  const totalBudget = [...budgetByCategory.values()].reduce((a, b) => a + b, 0);
  const budgetsExist = singleMonth && budgetRows.length > 0;
  const budgetedSpend = categories.filter(row => budgetByCategory.has(row.name)).reduce((n, row) => n + row.value, 0);
  const spentPct = totalBudget > 0 ? budgetedSpend / totalBudget * 100 : 0;
  const overBudget = budgetedSpend > totalBudget;
  const forecastQuery = usePurchasingSalesForecast(period, scopeVenueIds, budgetsExist);
  const salesForecast = forecastQuery.data?.forecast ?? null;
  const expectedSales = forecastQuery.data?.expected ?? 0;
  const actualSales = forecastQuery.data?.actual ?? 0;
  const salesDifference = expectedSales > 0 ? actualSales / expectedSales - 1 : null;
  const suggestions = suggestBudgets(budgetByCategory, actualSales, expectedSales);
  const suggestedTotal = [...suggestions.values()].reduce((sum, amount) => sum + amount, 0);
  const daysLeft = singleMonth ? daysInMonth(period) - Number(hongKongDate().slice(8, 10)) : 0;
  const spendBarMaximum = budgetBarScale([budgetedSpend, totalBudget]);
  const categoryBudgetRows = rankedBudgetCategories(categories, budgetByCategory);
  const categoryBarMaximum = budgetBarScale(categoryBudgetRows.flatMap(row => [row.value, row.budget ?? 0]));
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
  const finalPct = percentage(spend, revenue);
  const visibleItems = items.filter(row => row.name.toLowerCase().includes(search.toLowerCase())).sort((a, b) => {
    if (sort.key === "change" && a.change == null && b.change == null) return a.name.localeCompare(b.name);
    if (sort.key === "change" && a.change == null) return 1;
    if (sort.key === "change" && b.change == null) return -1;
    const cmp = sort.key === "name" ? a.name.localeCompare(b.name) : (a[sort.key] ?? 0) - (b[sort.key] ?? 0);
    return sort.desc ? -cmp : cmp;
  });
  const toggleSort = (key: "name" | "value" | "change") => setSort(old => ({ key, desc: old.key === key ? !old.desc : key !== "name" }));

  if (data.isError || purchasing.isError) return <Alert><AlertDescription>Could not load purchasing figures. Please reload to try again.</AlertDescription></Alert>;
  if (!data.isSuccess || !purchasing.isSuccess) return <div className="space-y-4 py-4" aria-label="Loading purchasing overview"><div className="h-10 w-44 animate-pulse rounded-lg bg-muted/40" /><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{[1,2,3,4].map(n => <div key={n} className="h-28 rounded-xl bg-card/40 animate-pulse" />)}</div><div className="h-80 rounded-xl bg-card/40 animate-pulse" /></div>;
  return <div data-purchasing-overview data-phone-compact className="space-y-5 max-sm:space-y-3 min-w-0 td-num">
    <PageTop tabsAbove title="Purchasing overview" period={datePeriod.control} actions={isAdmin && singleMonth && (purchasing.mode === "central" || scope.selectedVenues.length === 1) ? <Button variant="outline" size="sm" className="h-10" onClick={() => { setBudgetSuggestions(null); setBudgetsOpen(true); }}>Budgets</Button> : undefined} />
    <RevenueEnter id="purchasing" className="space-y-5 max-sm:space-y-3">{() => <>
    <SpendSoFar note={[!currentInvoices.length ? `Nothing recorded yet${lastInvoiceDate ? ` · last invoice ${shortDay(lastInvoiceDate)}` : ""}` : null, purchasing.mode === "central" && !scope.isAll ? "Bought centrally, so this is the whole group" : null].filter(Boolean).join(" · ") || null} label={previous ? (isCurrent ? `${monthLabel(period).split(" ")[0]} so far` : monthLabel(period)) : periodLabel} spend={spend} previousSpend={previous ? previousSpend : null} previousLabel={previousLabel}
      budget={budgetsExist ? { total: totalBudget, spent: budgetedSpend, daysLeft: isCurrent ? daysLeft : null } : null}
      stats={[
        { label: "% of sales", value: checks.waiting ? "—" : pct(finalPct), was: previous && checks.priorRatio != null && !checks.waiting ? `was ${pct(checks.priorRatio)}` : null },
        { label: "Invoices", value: integer(currentInvoices.length), was: previous ? `was ${integer(previousInvoices.length)}` : null },
        { label: "Suppliers", value: integer(suppliers.length), was: previous ? `was ${integer(new Set(previousInvoices.map(row => row.supplier_id)).size)}` : null },
      ]} />
    {previous && <PurchasingRunningTotal month={period} currentName={monthLabel(period).split(" ")[0]} priorName={monthLabel(previous).split(" ")[0]} days={pairRows.map(row => ({ day: row.day, current: row.current, prior: row.prior, budget: row.budget }))} />}
    <OverviewChartShell title={budgetsExist ? "Categories against budget" : "Categories"}>{budgetsExist ? <div className="space-y-4 max-sm:space-y-3"><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-3 w-[2px] bg-foreground opacity-[0.55]" aria-hidden />Budget</div>{categoryBudgetRows.map(({ name, value: spentValue, budget: budgetValue }) => {
      const hasBudget = budgetValue != null;
      const over = hasBudget && spentValue > budgetValue;
      const latestChange = budgetChanges.filter(row => row.category === name).sort((a, b) => b.changed_at.localeCompare(a.changed_at))[0];
      const changedAt = latestChange ? format(new Date(`${hongKongDate(latestChange.changed_at)}T12:00:00`), "d MMM") : null;
      const changeWord = latestChange?.old_amount == null ? "set" : Number(latestChange.new_amount) > Number(latestChange.old_amount) ? "raised" : "lowered";
      // Refundable deposits are not spend: one quiet line, no bar and no budget.
      if (name.startsWith("Deposits")) return <div key={name} className="flex items-baseline justify-between gap-2 border-t border-border/40 pt-3 text-[13px] text-muted-foreground"><span className="min-w-0 truncate">{name}</span><span className="td-num whitespace-nowrap">{integer(spentValue)}</span></div>;
      return <div key={name} data-budget-category={name}><div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[13px]">{(() => { const row = categories.find(r => r.name === name); return row ? <CategoryName row={row} onOpen={setBreakdown} /> : <span className="min-w-0" title={name}>{name}</span>; })()}<span className="ml-auto flex items-baseline justify-end gap-2 whitespace-nowrap td-num"><span>{integer(spentValue)}</span>{hasBudget && <><span className="text-muted-foreground">{`of ${integer(budgetValue)}`}</span><span className={cn("font-semibold", over && "text-warning")}>{wholePct(budgetValue > 0 ? spentValue / budgetValue * 100 : null)}</span></>}</span></div><div className="mt-1"><BudgetBar share={spentValue / categoryBarMaximum * 100} over={over} tick={hasBudget ? budgetValue / categoryBarMaximum * 100 : null} /></div><p className="mt-1 text-[11px] text-muted-foreground td-num">{hasBudget ? `Budget ${integer(budgetValue)}${changedAt ? ` · ${changeWord} ${changedAt}` : ""}` : "Not budgeted"}</p></div>;
    })}</div> : <CategoryList rows={categories} onOpen={setBreakdown} />}</OverviewChartShell>
    <OverviewChartShell title="Items"><ItemsTable rows={items.slice(0, mobile ? 5 : 10)} previous={previousLabel} /><Button variant="link" className="px-0 h-9 text-xs hover:text-foreground" onClick={()=>setItemsOpen(true)}>See all {integer(items.length)} items</Button></OverviewChartShell>
    <OverviewChartShell title="Suppliers"><RankedList rows={suppliers.slice(0, mobile ? 5 : 10)} /><Button variant="link" className="px-0 h-9 text-xs hover:text-foreground" onClick={()=>setSupplierOpen(true)}>See all {integer(suppliers.length)} suppliers</Button></OverviewChartShell>
    </>}</RevenueEnter>
    <CategoryBreakdown category={breakdown} period={previous && isCurrent ? `${monthLabel(period).split(" ")[0]} so far` : periodLabel} onClose={() => setBreakdown(null)} />
    <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}><DialogContent className="max-w-[900px] overflow-hidden"><DialogHeader className="text-left pr-8"><DialogTitle>Suppliers</DialogTitle><DialogDescription>{periodLabel} · {purchasing.mode === "central" ? "Whole group" : scope.label}</DialogDescription></DialogHeader><div className="max-h-[65svh] overflow-y-auto overflow-x-hidden"><table className="w-full table-fixed text-xs sm:text-sm"><thead className="sticky top-0 z-10 bg-card"><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-1 py-3 sm:px-3 text-left font-medium">Supplier</th><th className="px-1 py-3 sm:px-3 text-right font-medium whitespace-nowrap">Spend ({baseSymbol()})</th>{previous && <th className="px-1 py-3 sm:px-3 text-right font-medium whitespace-nowrap">vs {previousLabel}</th>}<th className="px-1 py-3 sm:px-3 text-right font-medium">Share</th></tr></thead><tbody>{suppliers.map(row => <tr key={row.id} className="border-b border-border/40 hover:bg-muted/20"><td className="p-3 whitespace-normal break-words max-w-[360px]">{row.name}</td><td title={money(row.value)} className="px-1 py-3 sm:px-3 text-right td-num truncate">{money(row.value)}</td>{previous && <td className="px-1 py-3 sm:px-3 text-right td-num truncate">{delta(row.change)}</td>}<td className="px-1 py-3 sm:px-3 text-right td-num truncate">{pct(row.share)}</td></tr>)}</tbody></table></div></DialogContent></Dialog>
    <Dialog open={itemsOpen} onOpenChange={setItemsOpen}><DialogContent className="max-w-[1100px] overflow-hidden"><DialogHeader className="text-left pr-8"><DialogTitle>Items</DialogTitle><DialogDescription>{periodLabel} · {purchasing.mode === "central" ? "Whole group" : scope.label}</DialogDescription></DialogHeader><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search items" placeholder="Search items" className="pl-9" value={search} onChange={event=>setSearch(event.target.value)} /></div><div className="max-h-[60svh] overflow-auto"><ItemsTable rows={visibleItems} previous={previousLabel} full sort={sort} onSort={toggleSort} /></div></DialogContent></Dialog>
    {singleMonth && <PurchasingBudgetsDialog open={budgetsOpen} onOpenChange={setBudgetsOpen} defaultMonth={period} scopeLabel={purchasing.mode === "central" ? "Whole group · bought centrally" : scope.label} venueId={budgetVenueId} isAdmin={isAdmin} categories={budgetCategories} spendFor={spendForMonth} revenueFor={revenueForMonth} venueIds={scopeVenueIds} initialSuggestions={budgetSuggestions} />}
  </div>;
}
