import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, CalendarIcon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, LineChart, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/revenue-overview/SectionHeader";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import {
  chartAxis, chartGrid, chartTooltipContentStyle,
  monthOpacity, PRIMARY, DESTRUCTIVE, compactHK,
} from "@/components/revenue-overview/chartTheme";

interface InvoiceRow {
  id: string;
  supplier_id: string;
  invoice_date: string;
  invoice_number: string;
  total_amount: number;
  discount?: number;
  discount_type?: string;
  payment_status: string;
  status: string;
  venue: string;
}

interface LineItemRow {
  invoice_id: string;
  description: string;
  unit_price: number;
  total: number;
  product_master_id: string | null;
}

interface SupplierRow { id: string; name: string; }
interface SalesRow { date: string; total_sales: number; }
interface PMCategory {
  id: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  internal_product_name: string;
}

const fmt = (v: number) =>
  `HK$ ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (v: number) => `HK$ ${compactHK(v)}`;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}
function getMonthOptions(invoices: InvoiceRow[]) {
  const months = new Set<string>();
  invoices.forEach(inv => {
    const d = new Date(inv.invoice_date);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  return Array.from(months).sort().reverse();
}

const PAID_STATUSES = new Set(["paid", "settled", "voided", "cancelled", "credit_applied"]);

// ─── Skeleton primitives ───
const Skel = ({ className = "" }: { className?: string }) =>
  <div className={cn("rounded-xl border border-border/60 bg-card/40 animate-pulse", className)} />;

function DashboardSkeleton() {
  return (
    <div className="space-y-6 mt-4">
      <div className="h-9 w-40 rounded-md bg-card/40 animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skel key={i} className="h-[92px]" />)}
      </div>
      <Skel className="h-[280px]" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skel className="h-[280px]" /><Skel className="h-[280px]" />
      </div>
      <Skel className="h-[320px]" />
    </div>
  );
}

// ─── KPI card ───
function KpiCard({ label, value, subline, tone = "default" }:
  { label: string; value: string; subline?: React.ReactNode; tone?: "default" | "danger" }) {
  return (
    <div className="card-glass rounded-xl border border-border/60 p-4 min-w-0">
      <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground truncate">{label}</div>
      <div className={cn(
        "mt-1 text-[22px] leading-tight font-semibold tabular-nums truncate",
        tone === "danger" ? "text-destructive" : "text-foreground"
      )}>{value}</div>
      {subline && <div className="mt-1 text-[11px] text-muted-foreground tabular-nums truncate">{subline}</div>}
    </div>
  );
}

// ─── Data hooks ───
function usePhase1() {
  const invoicesQ = useQuery({
    queryKey: ["proc-dash", "invoices"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await fetchAllRows(
      "invoices",
      "id, supplier_id, invoice_date, invoice_number, total_amount, discount, discount_type, payment_status, status, venue",
      { col: "invoice_date", asc: false }
    )) as InvoiceRow[],
  });
  const suppliersQ = useQuery({
    queryKey: ["proc-dash", "suppliers"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await fetchAllRows("suppliers", "id, name", { col: "name", asc: true })) as SupplierRow[],
  });
  const salesQ = useQuery({
    queryKey: ["proc-dash", "sales-records"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await fetchAllRows("sales_records", "date, total_sales")) as unknown as SalesRow[],
  });
  return { invoicesQ, suppliersQ, salesQ };
}

function usePhase2(enabled: boolean) {
  const liQ = useQuery({
    queryKey: ["proc-dash", "line-items"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await fetchAllRows(
      "invoice_line_items",
      "invoice_id, description, unit_price, total, product_master_id"
    )) as LineItemRow[],
  });
  const pmQ = useQuery({
    queryKey: ["proc-dash", "product-master"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => (await fetchAllRows(
      "product_master",
      "id, level1_category, level2_category, level3_category, internal_product_name"
    )) as unknown as PMCategory[],
  });
  return { liQ, pmQ };
}

export default function ProcurementDashboardTab() {
  const { invoicesQ, suppliersQ, salesQ } = usePhase1();
  const phase1Ready = invoicesQ.isSuccess && suppliersQ.isSuccess && salesQ.isSuccess;
  const { liQ, pmQ } = usePhase2(phase1Ready);
  const phase2Ready = liQ.isSuccess && pmQ.isSuccess;

  const invoices = invoicesQ.data ?? [];
  const suppliers = suppliersQ.data ?? [];
  const salesRecords = salesQ.data ?? [];
  const lineItems = liQ.data ?? [];
  const pmCategories = pmQ.data ?? [];

  const [selectedMonth, setSelectedMonth] = useState("all");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);
  const [hiddenMonths, setHiddenMonths] = useState<Set<string>>(new Set());
  const toggleMonth = (key: string) =>
    setHiddenMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
  const pmMap = useMemo(() => new Map(pmCategories.map(p => [p.id, p])), [pmCategories]);
  const monthOptions = useMemo(() => getMonthOptions(invoices), [invoices]);

  const isCustomPeriod = selectedMonth === "custom";
  const isSingleMonth = selectedMonth !== "all" && selectedMonth !== "custom";
  const isAllTime = selectedMonth === "all";

  const filteredInvoices = useMemo(() => {
    if (isAllTime) return invoices;
    if (isCustomPeriod) {
      if (!customFrom && !customTo) return invoices;
      return invoices.filter(inv => {
        const d = new Date(inv.invoice_date);
        if (customFrom && d < customFrom) return false;
        if (customTo) {
          const eod = new Date(customTo); eod.setHours(23, 59, 59, 999);
          if (d > eod) return false;
        }
        return true;
      });
    }
    const [y, m] = selectedMonth.split("-").map(Number);
    return invoices.filter(inv => {
      const d = new Date(inv.invoice_date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [invoices, selectedMonth, customFrom, customTo, isCustomPeriod, isAllTime]);

  const filteredInvoiceIds = useMemo(() => new Set(filteredInvoices.map(i => i.id)), [filteredInvoices]);
  const filteredLineItems = useMemo(
    () => phase2Ready ? lineItems.filter(li => filteredInvoiceIds.has(li.invoice_id)) : [],
    [lineItems, filteredInvoiceIds, phase2Ready]
  );

  // ─── KPIs ───
  const kpis = useMemo(() => {
    const totalSpend = filteredInvoices.reduce((s, inv) => s + Number(inv.total_amount), 0);
    const count = filteredInvoices.length;
    const avg = count > 0 ? totalSpend / count : 0;
    const uniqueSuppliers = new Set(filteredInvoices.map(inv => inv.supplier_id)).size;
    const totalDiscounts = filteredInvoices
      .filter(inv => (inv.discount_type || "discount") === "discount")
      .reduce((s, inv) => s + Number(inv.discount || 0), 0);
    const totalRefunds = filteredInvoices
      .filter(inv => inv.discount_type === "refund")
      .reduce((s, inv) => s + Number(inv.discount || 0), 0);
    const unpaid = filteredInvoices.filter(inv => {
      const st = (inv.payment_status || "").toLowerCase();
      return !PAID_STATUSES.has(st);
    });
    const unpaidTotal = unpaid.reduce((s, inv) => s + Number(inv.total_amount), 0);
    return {
      totalSpend, count, avg, uniqueSuppliers,
      totalDiscounts, totalRefunds,
      deductions: totalDiscounts + totalRefunds,
      unpaidTotal, unpaidCount: unpaid.length,
    };
  }, [filteredInvoices]);

  // ─── Monthly trend (all time) ───
  const monthlyTrend = useMemo(() => {
    const spendMap = new Map<string, number>();
    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      spendMap.set(key, (spendMap.get(key) || 0) + Number(inv.total_amount));
    });
    const revMap = new Map<string, number>();
    salesRecords.forEach(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      revMap.set(key, (revMap.get(key) || 0) + Number(s.total_sales));
    });
    const allKeys = new Set<string>([...spendMap.keys(), ...revMap.keys()]);
    return Array.from(allKeys).sort().map(key => {
      const spend = spendMap.get(key) || 0;
      const revenue = revMap.get(key) || 0;
      const costPct = revenue > 0 ? (spend / revenue) * 100 : null;
      return { month: formatMonthLabel(key), spend, revenue, costPct };
    });
  }, [invoices, salesRecords]);

  // ─── Daily spend/revenue (single month / custom) ───
  const dailySpendData = useMemo(() => {
    if (!isSingleMonth && !isCustomPeriod) return [];
    const spendMap = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      spendMap.set(inv.invoice_date, (spendMap.get(inv.invoice_date) || 0) + Number(inv.total_amount));
    });
    const filteredSales = salesRecords.filter(s => {
      if (isAllTime) return true;
      if (isCustomPeriod) {
        if (!customFrom && !customTo) return true;
        const d = new Date(s.date);
        if (customFrom && d < customFrom) return false;
        if (customTo) { const eod = new Date(customTo); eod.setHours(23, 59, 59, 999); if (d > eod) return false; }
        return true;
      }
      const [y, m] = selectedMonth.split("-").map(Number);
      const d = new Date(s.date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    const revMap = new Map<string, number>();
    filteredSales.forEach(s => revMap.set(s.date, (revMap.get(s.date) || 0) + Number(s.total_sales)));
    const allDates = new Set<string>([...spendMap.keys(), ...revMap.keys()]);
    const sorted = Array.from(allDates).sort();
    let cumulative = 0, cumulativeRevenue = 0;
    return sorted.map(date => {
      const spend = spendMap.get(date) || 0;
      const revenue = revMap.get(date) || 0;
      cumulative += spend; cumulativeRevenue += revenue;
      const costPct = cumulativeRevenue > 0 ? (cumulative / cumulativeRevenue) * 100 : null;
      const d = new Date(date);
      return { day: format(d, "d MMM"), value: spend, revenue, costPct, cumulative };
    });
  }, [filteredInvoices, salesRecords, isSingleMonth, isCustomPeriod, selectedMonth, customFrom, customTo, isAllTime]);

  const showDailyView = (isSingleMonth || isCustomPeriod) && dailySpendData.length > 0;

  // ─── MTD ───
  const mtdMonth = useMemo(() => {
    if (isSingleMonth) {
      const [y, m] = selectedMonth.split("-").map(Number);
      return { year: y, month: m, isSelected: true };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, isSelected: false };
  }, [isSingleMonth, selectedMonth]);

  const mtdDaily = useMemo(() => {
    const { year, month } = mtdMonth;
    const daysInMonth = new Date(year, month, 0).getDate();
    const spendByDay = new Map<number, number>();
    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        spendByDay.set(day, (spendByDay.get(day) || 0) + Number(inv.total_amount));
      }
    });
    const revenueByDay = new Map<number, number>();
    const revenueHasDay = new Set<number>();
    salesRecords.forEach(s => {
      const d = new Date(s.date);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        revenueByDay.set(day, (revenueByDay.get(day) || 0) + Number(s.total_sales));
        revenueHasDay.add(day);
      }
    });
    let cum = 0, cumRev = 0;
    const out: { day: number; label: string; dailySpend: number; cumulativeSpend: number;
      dailyRevenue: number | null; cumulativeRevenue: number; spendPctRevenue: number | null; }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dailySpend = spendByDay.get(day) || 0;
      cum += dailySpend;
      const dailyRevenue = revenueHasDay.has(day) ? (revenueByDay.get(day) || 0) : null;
      cumRev += dailyRevenue || 0;
      const spendPctRevenue = cumRev > 0 ? (cum / cumRev) * 100 : null;
      out.push({
        day, label: format(new Date(year, month - 1, day), "d MMM"),
        dailySpend, cumulativeSpend: cum, dailyRevenue,
        cumulativeRevenue: cumRev, spendPctRevenue,
      });
    }
    return out;
  }, [invoices, salesRecords, mtdMonth]);

  const mtdVsLastMonth = useMemo(() => {
    const { year, month } = mtdMonth;
    const prevDate = new Date(year, month - 2, 1);
    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;
    const daysCurrent = new Date(year, month, 0).getDate();
    const daysPrev = new Date(prevYear, prevMonth, 0).getDate();
    const sumByDay = (y: number, m: number) => {
      const map = new Map<number, number>();
      invoices.forEach(inv => {
        const d = new Date(inv.invoice_date);
        if (d.getFullYear() === y && d.getMonth() + 1 === m) {
          const day = d.getDate();
          map.set(day, (map.get(day) || 0) + Number(inv.total_amount));
        }
      });
      return map;
    };
    const curSpend = sumByDay(year, month);
    const prevSpend = sumByDay(prevYear, prevMonth);
    const maxDays = Math.max(daysCurrent, daysPrev);
    let curCum = 0, prevCum = 0;
    const out: { day: number; currentCum: number | null; prevCum: number | null }[] = [];
    for (let day = 1; day <= maxDays; day++) {
      if (day <= daysCurrent) curCum += curSpend.get(day) || 0;
      if (day <= daysPrev) prevCum += prevSpend.get(day) || 0;
      out.push({
        day,
        currentCum: day <= daysCurrent ? curCum : null,
        prevCum: day <= daysPrev ? prevCum : null,
      });
    }
    return out;
  }, [invoices, mtdMonth]);

  const allMonthsComparison = useMemo(() => {
    const spendByMonth = new Map<string, Map<number, number>>();
    const revByMonth = new Map<string, Map<number, number>>();
    const monthKeySet = new Set<string>();

    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const day = d.getDate();
      monthKeySet.add(key);
      if (!spendByMonth.has(key)) spendByMonth.set(key, new Map());
      const m = spendByMonth.get(key)!;
      m.set(day, (m.get(day) || 0) + Number(inv.total_amount));
    });
    salesRecords.forEach(s => {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const day = d.getDate();
      monthKeySet.add(key);
      if (!revByMonth.has(key)) revByMonth.set(key, new Map());
      const m = revByMonth.get(key)!;
      m.set(day, (m.get(day) || 0) + Number(s.total_sales));
    });

    const monthKeys = Array.from(monthKeySet).sort();
    const rows: Array<Record<string, number | null> & { day: number }> = [];
    const cumSpend = new Map<string, number>(monthKeys.map(k => [k, 0]));
    const cumRev = new Map<string, number>(monthKeys.map(k => [k, 0]));

    for (let day = 1; day <= 31; day++) {
      const row: Record<string, number | null> & { day: number } = { day };
      monthKeys.forEach(key => {
        const [y, m] = key.split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        if (day > daysInMonth) {
          row[`spend_${key}`] = null; row[`pct_${key}`] = null; return;
        }
        const addSpend = spendByMonth.get(key)?.get(day) || 0;
        const addRev = revByMonth.get(key)?.get(day) || 0;
        const cs = (cumSpend.get(key) || 0) + addSpend;
        const cr = (cumRev.get(key) || 0) + addRev;
        cumSpend.set(key, cs); cumRev.set(key, cr);
        row[`spend_${key}`] = cs;
        row[`pct_${key}`] = cr > 0 ? (cs / cr) * 100 : null;
      });
      rows.push(row);
    }
    // reverse so most-recent gets brightest opacity (index 0)
    const monthKeysRev = [...monthKeys].reverse();
    return { rows, monthKeys: monthKeysRev };
  }, [invoices, salesRecords]);

  const mtdSubtitle = isAllTime
    ? `All months comparison — day-of-month basis`
    : mtdMonth.isSelected
      ? `Selected month view — ${formatMonthLabel(`${mtdMonth.year}-${String(mtdMonth.month).padStart(2, "0")}`)}`
      : `Current month view — ${formatMonthLabel(`${mtdMonth.year}-${String(mtdMonth.month).padStart(2, "0")}`)}`;

  // ─── Supplier spend ───
  const supplierSpendData = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      map.set(name, (map.get(name) || 0) + Number(inv.total_amount));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredInvoices, supplierMap]);

  const grandTotal = supplierSpendData.reduce((s, d) => s + d.value, 0);

  const supplierConcentration = useMemo(() => {
    if (supplierSpendData.length === 0) return { top3Pct: 0, top3Names: [] as string[] };
    const top3 = supplierSpendData.slice(0, 3);
    const top3Total = top3.reduce((s, d) => s + d.value, 0);
    return {
      top3Pct: grandTotal > 0 ? (top3Total / grandTotal) * 100 : 0,
      top3Names: top3.map(d => d.name),
    };
  }, [supplierSpendData, grandTotal]);

  // ─── Category (phase 2) ───
  const l1Data = useMemo(() => {
    if (!phase2Ready) return [];
    const l1Map = new Map<string, number>();
    filteredLineItems.forEach(li => {
      const pm = li.product_master_id ? pmMap.get(li.product_master_id) : null;
      const l1 = pm?.level1_category || "Uncategorized";
      l1Map.set(l1, (l1Map.get(l1) || 0) + Number(li.total));
    });
    const arr: { name: string; value: number; isDeduction?: boolean }[] =
      Array.from(l1Map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    const deduction = filteredInvoices.reduce((s, inv) => s + Number(inv.discount || 0), 0);
    if (deduction > 0) arr.push({ name: "Discount / Refund", value: deduction, isDeduction: true });
    return arr;
  }, [filteredLineItems, pmMap, filteredInvoices, phase2Ready]);

  const l1Total = l1Data.reduce((s, d) => s + d.value, 0);

  const productExpenses = useMemo(() => {
    if (!phase2Ready) return [];
    const map = new Map<string, number>();
    filteredLineItems.forEach(li => {
      const desc = li.description?.trim() || "Unknown";
      map.set(desc, (map.get(desc) || 0) + Number(li.total));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filteredLineItems, phase2Ready]);

  const productMax = productExpenses[0]?.value || 0;
  const topProducts = productExpenses.slice(0, 20);
  const overflowProducts = showAllProducts ? productExpenses.slice(20) : [];

  const priceVariance = useMemo(() => {
    if (!phase2Ready) return [];
    const map = new Map<string, { name: string; prices: { date: string; price: number }[] }>();
    const invDateMap = new Map<string, string>();
    filteredInvoices.forEach(inv => invDateMap.set(inv.id, inv.invoice_date));
    filteredLineItems.forEach(li => {
      if (!li.product_master_id || li.unit_price <= 0) return;
      const pm = pmMap.get(li.product_master_id);
      const name = pm?.internal_product_name || li.description;
      const date = invDateMap.get(li.invoice_id) || "";
      if (!map.has(li.product_master_id)) map.set(li.product_master_id, { name, prices: [] });
      map.get(li.product_master_id)!.prices.push({ date, price: Number(li.unit_price) });
    });
    const results: { name: string; change: number; changePct: number; first: number; last: number }[] = [];
    map.forEach(({ name, prices }) => {
      if (prices.length < 2) return;
      prices.sort((a, b) => a.date.localeCompare(b.date));
      const first = prices[0].price;
      const last = prices[prices.length - 1].price;
      const change = last - first;
      const changePct = first > 0 ? (change / first) * 100 : 0;
      if (Math.abs(changePct) >= 1) results.push({ name, change, changePct, first, last });
    });
    return results.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 10);
  }, [filteredLineItems, filteredInvoices, pmMap, phase2Ready]);

  const supplierTree = useMemo(() => {
    const map = new Map<string, { total: number; invoices: { date: string; number: string; amount: number }[] }>();
    filteredInvoices.forEach(inv => {
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      if (!map.has(name)) map.set(name, { total: 0, invoices: [] });
      const entry = map.get(name)!;
      entry.total += Number(inv.total_amount);
      entry.invoices.push({
        date: inv.invoice_date,
        number: inv.invoice_number || inv.id.slice(0, 8),
        amount: Number(inv.total_amount),
      });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({ name, total: data.total, invoices: data.invoices.sort((a, b) => a.date.localeCompare(b.date)) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredInvoices, supplierMap]);

  const toggleSupplier = (name: string) =>
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const renderSupplierBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    const pct = grandTotal > 0 ? ((value / grandTotal) * 100).toFixed(1) : "0";
    return (
      <text x={x + width + 6} y={y + height / 2}
        fill="hsl(var(--muted-foreground))" fontSize={10}
        dominantBaseline="middle" style={{ fontVariantNumeric: "tabular-nums" }}>
        {fmtShort(value)} ({pct}%)
      </text>
    );
  };

  if (!phase1Ready) return <DashboardSkeleton />;

  return (
    <div className="space-y-4 mt-4">
      {/* Filter bar */}
      <div className="flex items-center justify-end flex-wrap gap-2">
        <Select value={selectedMonth} onValueChange={v => { setSelectedMonth(v); if (v !== "custom") { setCustomFrom(undefined); setCustomTo(undefined); } }}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            {monthOptions.map(m => <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>)}
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        {isCustomPeriod && (
          <div className="flex items-center gap-2">
            <Popover open={fromOpen} onOpenChange={setFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs gap-1.5 h-9", !customFrom && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3" />
                  {customFrom ? format(customFrom, "MMM d, yyyy") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customFrom} onSelect={d => { setCustomFrom(d); setFromOpen(false); }} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground text-xs">→</span>
            <Popover open={toOpen} onOpenChange={setToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("text-xs gap-1.5 h-9", !customTo && "text-muted-foreground")}>
                  <CalendarIcon className="h-3 w-3" />
                  {customTo ? format(customTo, "MMM d, yyyy") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customTo} onSelect={d => { setCustomTo(d); setToOpen(false); }} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            {(customFrom || customTo) && (
              <Button variant="ghost" size="sm" className="h-9 text-xs"
                onClick={() => { setCustomFrom(undefined); setCustomTo(undefined); }}>Clear</Button>
            )}
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total Spend" value={fmt(kpis.totalSpend)}
          subline={<>{kpis.count.toLocaleString()} invoices</>} />
        <KpiCard label="Avg Invoice" value={fmt(kpis.avg)} />
        <KpiCard label="Suppliers & Vendors" value={kpis.uniqueSuppliers.toLocaleString()} />
        <KpiCard label="Discounts & Refunds" value={fmt(kpis.deductions)}
          subline={<>Disc {fmtShort(kpis.totalDiscounts)} · Ref {fmtShort(kpis.totalRefunds)}</>} />
        <KpiCard label="Unpaid Invoices" value={fmt(kpis.unpaidTotal)} tone="danger"
          subline={<>{kpis.unpaidCount.toLocaleString()} outstanding</>} />
      </div>

      {/* ── Pace ── */}
      <SectionHeader title="Pace" description={mtdSubtitle} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartShell title={isAllTime ? "Cumulative Spend — All Months" : "Cumulative Spend MTD"}>
          <div className="h-[240px] md:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              {isAllTime ? (
                <LineChart data={allMonthsComparison.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="day" {...chartAxis} />
                  <YAxis tickFormatter={compactHK} {...chartAxis} />
                  <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                    formatter={(v: any, name: string) => [v == null ? "—" : fmt(Number(v)), formatMonthLabel(name.replace(/^spend_/, ""))]}
                    labelFormatter={(l: any) => `Day ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                    onClick={(e: any) => toggleMonth(String(e?.dataKey || e?.value || "").replace(/^spend_/, ""))}
                    formatter={(value: string) => {
                      const key = value.replace(/^spend_/, "");
                      const hidden = hiddenMonths.has(key);
                      return <span style={{ textDecoration: hidden ? "line-through" : "none", opacity: hidden ? 0.5 : 1 }}>{formatMonthLabel(key)}</span>;
                    }} />
                  {allMonthsComparison.monthKeys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={`spend_${key}`}
                      stroke={PRIMARY} strokeOpacity={monthOpacity(i)}
                      strokeWidth={2} dot={false} name={`spend_${key}`}
                      connectNulls={false} hide={hiddenMonths.has(key)}
                      isAnimationActive={false} />
                  ))}
                </LineChart>
              ) : (
                <LineChart data={mtdDaily} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="label" {...chartAxis} interval="preserveStartEnd" />
                  <YAxis tickFormatter={compactHK} {...chartAxis} />
                  <Tooltip isAnimationActive={false} content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as typeof mtdDaily[number];
                    return (
                      <div style={chartTooltipContentStyle} className="px-2.5 py-2">
                        <div className="font-medium">{label}</div>
                        <div>Daily spend: {fmt(d.dailySpend)}</div>
                        <div>Cumulative MTD: {fmt(d.cumulativeSpend)}</div>
                      </div>
                    );
                  }} />
                  <Line type="monotone" dataKey="cumulativeSpend" stroke={PRIMARY}
                    strokeWidth={2} dot={{ r: 2 }} name="Cumulative Spend" isAnimationActive={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </ChartShell>

        <ChartShell title={isAllTime ? "Spend as % of Revenue — All Months" : "Spend as % of Revenue"}>
          <div className="h-[240px] md:h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              {isAllTime ? (
                <LineChart data={allMonthsComparison.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="day" {...chartAxis} />
                  <YAxis tickFormatter={v => `${Number(v).toFixed(0)}%`} {...chartAxis} />
                  <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                    formatter={(v: any, name: string) => [v == null ? "—" : `${Number(v).toFixed(1)}%`, formatMonthLabel(name.replace(/^pct_/, ""))]}
                    labelFormatter={(l: any) => `Day ${l}`} />
                  <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                    onClick={(e: any) => toggleMonth(String(e?.dataKey || e?.value || "").replace(/^pct_/, ""))}
                    formatter={(value: string) => {
                      const key = value.replace(/^pct_/, "");
                      const hidden = hiddenMonths.has(key);
                      return <span style={{ textDecoration: hidden ? "line-through" : "none", opacity: hidden ? 0.5 : 1 }}>{formatMonthLabel(key)}</span>;
                    }} />
                  {allMonthsComparison.monthKeys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={`pct_${key}`}
                      stroke={PRIMARY} strokeOpacity={monthOpacity(i)}
                      strokeWidth={2} dot={false} name={`pct_${key}`}
                      connectNulls={false} hide={hiddenMonths.has(key)} isAnimationActive={false} />
                  ))}
                </LineChart>
              ) : (
                <LineChart data={mtdDaily} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid {...chartGrid} />
                  <XAxis dataKey="label" {...chartAxis} interval="preserveStartEnd" />
                  <YAxis tickFormatter={v => `${Number(v).toFixed(0)}%`} {...chartAxis} />
                  <Tooltip isAnimationActive={false} content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as typeof mtdDaily[number];
                    return (
                      <div style={chartTooltipContentStyle} className="px-2.5 py-2">
                        <div className="font-medium">{label}</div>
                        <div>Cumulative spend: {fmt(d.cumulativeSpend)}</div>
                        <div>Cumulative revenue: {fmt(d.cumulativeRevenue)}</div>
                        <div>Cum. spend % of revenue: {d.spendPctRevenue == null ? "—" : `${d.spendPctRevenue.toFixed(1)}%`}</div>
                      </div>
                    );
                  }} />
                  <Line type="monotone" dataKey="spendPctRevenue" stroke={PRIMARY}
                    strokeWidth={2} dot={{ r: 2 }} name="Cum. Spend % of Revenue"
                    connectNulls={false} isAnimationActive={false} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </ChartShell>
      </div>

      <ChartShell title={isAllTime ? "Cumulative Spend by Month (All Months)" : "MTD Spend vs Last Month"}>
        <div className="h-[280px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            {isAllTime ? (
              <LineChart data={allMonthsComparison.rows} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="day" {...chartAxis} />
                <YAxis tickFormatter={compactHK} {...chartAxis} />
                <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                  formatter={(v: any, name: string) => [v == null ? "—" : fmt(Number(v)), formatMonthLabel(name.replace(/^spend_/, ""))]}
                  labelFormatter={(l: any) => `Day ${l}`} />
                <Legend wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                  onClick={(e: any) => toggleMonth(String(e?.dataKey || e?.value || "").replace(/^spend_/, ""))}
                  formatter={(value: string) => {
                    const key = value.replace(/^spend_/, "");
                    const hidden = hiddenMonths.has(key);
                    return <span style={{ textDecoration: hidden ? "line-through" : "none", opacity: hidden ? 0.5 : 1 }}>{formatMonthLabel(key)}</span>;
                  }} />
                {allMonthsComparison.monthKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={`spend_${key}`}
                    stroke={PRIMARY} strokeOpacity={monthOpacity(i)}
                    strokeWidth={2} dot={false} name={`spend_${key}`}
                    connectNulls={false} hide={hiddenMonths.has(key)} isAnimationActive={false} />
                ))}
              </LineChart>
            ) : (
              <LineChart data={mtdVsLastMonth} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey="day" {...chartAxis} />
                <YAxis tickFormatter={compactHK} {...chartAxis} />
                <Tooltip isAnimationActive={false} content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as typeof mtdVsLastMonth[number];
                  const cur = d.currentCum, prev = d.prevCum;
                  const diff = cur !== null && prev !== null ? cur - prev : null;
                  const diffPct = cur !== null && prev !== null && prev > 0 ? ((cur - prev) / prev) * 100 : null;
                  return (
                    <div style={chartTooltipContentStyle} className="px-2.5 py-2">
                      <div className="font-medium">Day {label}</div>
                      <div>Current: {cur === null ? "—" : fmt(cur)}</div>
                      <div>Previous: {prev === null ? "—" : fmt(prev)}</div>
                      <div>Δ HK$: {diff === null ? "—" : fmt(diff)}</div>
                      <div>Δ %: {diffPct === null ? "—" : `${diffPct >= 0 ? "+" : ""}${diffPct.toFixed(1)}%`}</div>
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="currentCum" stroke={PRIMARY}
                  strokeWidth={2} dot={{ r: 2 }} name="Current Month" connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="prevCum" stroke={PRIMARY} strokeOpacity={0.45}
                  strokeWidth={2} dot={{ r: 2 }} name="Previous Month" connectNulls={false}
                  strokeDasharray="4 4" isAnimationActive={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </ChartShell>

      {/* ── Spend vs Revenue ── */}
      <SectionHeader title="Spend vs Revenue" />
      <ChartShell title={showDailyView ? "Daily Spend vs Revenue" : "Monthly Spend vs Revenue"}>
        <div className="h-[260px] md:h-[320px]">
          {(showDailyView ? dailySpendData.length : monthlyTrend.length) > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={showDailyView ? dailySpendData : monthlyTrend} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
                <CartesianGrid {...chartGrid} />
                <XAxis dataKey={showDailyView ? "day" : "month"} {...chartAxis} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tickFormatter={compactHK} {...chartAxis} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v.toFixed(0)}%`} {...chartAxis} />
                <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                  formatter={(v: any, name: string) => {
                    if (v == null) return ["—", name];
                    if (String(name).includes("%")) return [`${Number(v).toFixed(1)}%`, name];
                    return [fmt(Number(v)), name];
                  }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="revenue" fill={PRIMARY} fillOpacity={0.35}
                  radius={[3, 3, 0, 0]} name="Revenue" isAnimationActive={false} />
                <Bar yAxisId="left" dataKey={showDailyView ? "value" : "spend"} fill={PRIMARY}
                  radius={[3, 3, 0, 0]} name="Spend" isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="costPct" stroke={DESTRUCTIVE}
                  strokeWidth={2} dot={{ r: 3 }}
                  name={showDailyView ? "Cumulative Cost of Revenue %" : "Cost of Revenue %"}
                  connectNulls={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
          )}
        </div>
      </ChartShell>

      {/* ── Where It Goes ── */}
      <SectionHeader title="Where It Goes" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartShell title="Spend by Supplier & Vendor" className="lg:col-span-2">
          <div style={{ height: Math.max(220, supplierSpendData.length * 34) }}>
            {supplierSpendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierSpendData} layout="vertical" margin={{ left: 10, right: 100 }}>
                  <CartesianGrid {...chartGrid} horizontal={false} />
                  <XAxis type="number" tickFormatter={compactHK} {...chartAxis} />
                  <YAxis type="category" dataKey="name" width={140} {...chartAxis} interval={0}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + "…" : v} />
                  <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                    formatter={(v: number) => [fmt(v), "Spend"]} />
                  <Bar dataKey="value" fill={PRIMARY} radius={[0, 4, 4, 0]}
                    label={renderSupplierBarLabel} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
            )}
          </div>
        </ChartShell>

        <ChartShell title="Supplier & Vendor Concentration">
          <div className="flex flex-col items-center justify-center h-full min-h-[220px] gap-4">
            <div className="text-center">
              <p className="text-4xl font-semibold tabular-nums text-primary">{supplierConcentration.top3Pct.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground mt-1">of total spend from top 3 suppliers & vendors</p>
            </div>
            <div className="space-y-2 w-full">
              {supplierConcentration.top3Names.map((name, i) => {
                const d = supplierSpendData.find(s => s.name === name);
                const pct = grandTotal > 0 && d ? ((d.value / grandTotal) * 100).toFixed(1) : "0";
                const amt = d ? fmtShort(d.value) : "HK$ 0";
                return (
                  <div key={name} className="flex items-center gap-2 text-sm">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PRIMARY, opacity: monthOpacity(i) }} />
                    <span className="flex-1 truncate">{name}</span>
                    <span className="tabular-nums text-xs text-muted-foreground">{amt} · {pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartShell>
      </div>

      {phase2Ready ? (
        l1Data.length > 0 && (
          <ChartShell title="Spend by Category">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="h-[240px] md:h-[280px] w-full lg:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={l1Data} cx="50%" cy="50%" innerRadius={65} outerRadius={115}
                      dataKey="value" nameKey="name" paddingAngle={2}
                      stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                      {l1Data.map((d, i) => (
                        <Cell key={i}
                          fill={d.isDeduction ? DESTRUCTIVE : PRIMARY}
                          fillOpacity={d.isDeduction ? 0.7 : monthOpacity(i)} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                      formatter={(v: number, _n, p: any) => [fmt(p?.payload?.isDeduction ? -v : v), p?.payload?.isDeduction ? "Deduction" : "Spend"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full lg:w-1/2 space-y-2">
                {l1Data.map((item, i) => {
                  const pct = l1Total > 0 ? ((item.value / l1Total) * 100).toFixed(1) : "0";
                  return (
                    <div key={item.name} className="flex items-center gap-2.5 text-sm">
                      <div className="h-3 w-3 rounded-sm shrink-0"
                        style={{
                          backgroundColor: item.isDeduction ? DESTRUCTIVE : PRIMARY,
                          opacity: item.isDeduction ? 0.7 : monthOpacity(i),
                        }} />
                      <span className="flex-1 truncate" title={item.name}>{item.name}</span>
                      <span className={cn("text-xs tabular-nums shrink-0",
                        item.isDeduction ? "text-destructive" : "text-muted-foreground")}>
                        {item.isDeduction ? `-${fmtShort(item.value)}` : fmtShort(item.value)}
                      </span>
                      <span className="text-xs font-medium tabular-nums shrink-0 w-12 text-right">
                        {item.isDeduction ? `-${pct}%` : `${pct}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </ChartShell>
        )
      ) : (
        <Skel className="h-[280px]" />
      )}

      {/* ── Line-Item Intelligence ── */}
      <SectionHeader title="Line-Item Intelligence"
        description={phase2Ready ? undefined : "Loading detailed line-item analytics…"} />
      {phase2Ready ? (
        <>
          <ChartShell
            title={`Expenses by Bill / Invoice (${productExpenses.length} items)`}
            headerRight={productExpenses.length > 20 && (
              <button className="text-[11px] text-primary hover:underline"
                onClick={() => setShowAllProducts(v => !v)}>
                {showAllProducts ? "Show Top 20" : `Show All ${productExpenses.length}`}
              </button>
            )}
          >
            {topProducts.length > 0 ? (
              <>
                <div style={{ height: Math.max(300, topProducts.length * 26) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical" margin={{ left: 10, right: 70 }}>
                      <CartesianGrid {...chartGrid} horizontal={false} />
                      <XAxis type="number" tickFormatter={compactHK} {...chartAxis} />
                      <YAxis type="category" dataKey="name" width={180} {...chartAxis} interval={0}
                        tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 26) + "…" : v} />
                      <Tooltip contentStyle={chartTooltipContentStyle} isAnimationActive={false}
                        formatter={(v: number) => [fmt(v), "Spend"]} />
                      <Bar dataKey="value" fill={PRIMARY} fillOpacity={0.75}
                        radius={[0, 4, 4, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {overflowProducts.length > 0 && (
                  <div className="mt-3 border-t border-border/60 pt-3 space-y-1">
                    {overflowProducts.map(p => {
                      const pct = productMax > 0 ? (p.value / productMax) * 100 : 0;
                      return (
                        <div key={p.name} className="flex items-center gap-3 text-xs min-h-[24px]">
                          <span className="flex-1 truncate" title={p.name}>{p.name}</span>
                          <div className="w-40 h-1.5 rounded-full bg-muted/40 overflow-hidden shrink-0">
                            <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular-nums text-muted-foreground w-24 text-right shrink-0">{fmtShort(p.value)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No bill / invoice data for this period</div>
            )}
          </ChartShell>

          {priceVariance.length > 0 && (
            <ChartShell title="Top Price Changes (First → Last Invoice)">
              <div className="space-y-2">
                {priceVariance.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {fmt(item.first)} → {fmt(item.last)}
                      </p>
                    </div>
                    <div className={cn("flex items-center gap-1 text-sm tabular-nums font-medium",
                      item.change > 0 ? "text-destructive" : "text-primary")}>
                      {item.change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {item.changePct > 0 ? "+" : ""}{item.changePct.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </ChartShell>
          )}
        </>
      ) : (
        <>
          <Skel className="h-[320px]" />
          <Skel className="h-[200px]" />
        </>
      )}

      {/* ── Supplier Detail ── */}
      <SectionHeader title="Supplier Detail"
        description={isSingleMonth ? formatMonthLabel(selectedMonth) : undefined} />
      <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
        <div className="divide-y divide-border/60">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
            <span className="text-sm font-semibold">Grand Total</span>
            <span className="text-sm font-semibold tabular-nums">{fmt(grandTotal)}</span>
          </div>
          {supplierTree.map((supplier, idx) => {
            const isExpanded = expandedSuppliers.has(supplier.name);
            const pct = grandTotal > 0 ? ((supplier.total / grandTotal) * 100).toFixed(1) : "0";
            return (
              <div key={supplier.name}>
                <button
                  onClick={() => toggleSupplier(supplier.name)}
                  className="flex items-center w-full px-4 py-2.5 min-h-[44px] hover:bg-muted/20 transition-colors text-left"
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />}
                  <div className="h-2.5 w-2.5 rounded-full mr-2.5 shrink-0"
                    style={{ backgroundColor: PRIMARY, opacity: monthOpacity(idx) }} />
                  <span className="text-sm font-medium flex-1 truncate">{supplier.name}</span>
                  <span className="text-xs text-muted-foreground mr-3 tabular-nums">{pct}%</span>
                  <span className="text-sm font-medium tabular-nums">{fmt(supplier.total)}</span>
                </button>
                {isExpanded && (
                  <div className="bg-muted/10 border-t border-border/60">
                    {supplier.invoices.map((inv, i) => (
                      <div key={i} className="flex items-center px-4 py-1.5 pl-12 text-xs">
                        <span className="text-muted-foreground w-24 shrink-0 tabular-nums">{inv.date}</span>
                        <span className="flex-1 text-muted-foreground truncate">{inv.number}</span>
                        <span className="tabular-nums">{fmt(inv.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
