import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, FileText, Users, BarChart3, CalendarIcon } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from "recharts";
import { cn } from "@/lib/utils";

interface InvoiceRow {
  id: string;
  supplier_id: string;
  invoice_date: string;
  invoice_number: string;
  total_amount: number;
  payment_status: string;
  status: string;
  venue: string;
}

interface LineItemRow {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  product_master_id: string | null;
}

interface SupplierRow {
  id: string;
  name: string;
}

interface SalesRow {
  date: string;
  total_sales: number;
}

interface PMCategory {
  id: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  internal_product_name: string;
}

// Warm muted palette consistent with platform design tokens
const PALETTE = [
  "hsl(24, 80%, 50%)",   // primary - terracotta
  "hsl(14, 70%, 52%)",   // accent
  "hsl(175, 55%, 42%)",  // chart-3 teal
  "hsl(258, 50%, 55%)",  // chart-4 muted purple
  "hsl(145, 45%, 42%)",  // chart-5 sage
  "hsl(30, 60%, 58%)",   // warm gold
  "hsl(200, 40%, 50%)",  // muted steel blue
  "hsl(340, 40%, 52%)",  // dusty rose
];

const fmt = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

function getMonthOptions(invoices: InvoiceRow[]) {
  const months = new Set<string>();
  invoices.forEach(inv => {
    const d = new Date(inv.invoice_date);
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  return Array.from(months).sort().reverse();
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

const tooltipStyle = {
  backgroundColor: "hsl(33, 25%, 94%)",
  border: "1px solid hsl(30, 15%, 85%)",
  borderRadius: "0.5rem",
  fontSize: "12px",
  boxShadow: "0 4px 24px -4px hsl(25 20% 15% / 0.08)",
};

export default function ProcurementDashboardTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [pmCategories, setPmCategories] = useState<PMCategory[]>([]);
  const [salesRecords, setSalesRecords] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [invRes, liData, supRes, pmRes, salesData] = await Promise.all([
        supabase.from("invoices").select("id, supplier_id, invoice_date, invoice_number, total_amount, payment_status, status, venue"),
        fetchAllRows("invoice_line_items", "id, invoice_id, description, quantity, unit_price, total, product_master_id"),
        supabase.from("suppliers").select("id, name"),
        supabase.from("product_master" as any).select("id, level1_category, level2_category, level3_category, internal_product_name"),
        fetchAllRows("sales_records", "date, total_sales"),
      ]);
      if (invRes.data) setInvoices(invRes.data);
      setLineItems(liData);
      if (supRes.data) setSuppliers(supRes.data);
      if (pmRes.data) setPmCategories(pmRes.data as unknown as PMCategory[]);
      setSalesRecords(salesData as unknown as SalesRow[]);
      setLoading(false);
    })();
  }, []);

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
  const pmMap = useMemo(() => new Map(pmCategories.map(p => [p.id, p])), [pmCategories]);
  const monthOptions = useMemo(() => getMonthOptions(invoices), [invoices]);

  const isCustomPeriod = selectedMonth === "custom";
  const isSingleMonth = selectedMonth !== "all" && selectedMonth !== "custom";

  // Filter invoices by selected month or custom range
  const filteredInvoices = useMemo(() => {
    if (selectedMonth === "all") return invoices;
    if (isCustomPeriod) {
      if (!customFrom && !customTo) return invoices;
      return invoices.filter(inv => {
        const d = new Date(inv.invoice_date);
        if (customFrom && d < customFrom) return false;
        if (customTo) {
          const endOfDay = new Date(customTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (d > endOfDay) return false;
        }
        return true;
      });
    }
    const [y, m] = selectedMonth.split("-").map(Number);
    return invoices.filter(inv => {
      const d = new Date(inv.invoice_date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [invoices, selectedMonth, customFrom, customTo, isCustomPeriod]);

  const filteredInvoiceIds = useMemo(() => new Set(filteredInvoices.map(i => i.id)), [filteredInvoices]);
  const filteredLineItems = useMemo(() => lineItems.filter(li => filteredInvoiceIds.has(li.invoice_id)), [lineItems, filteredInvoiceIds]);

  // ─── KPI Data ───
  const kpis = useMemo(() => {
    const totalSpend = filteredInvoices.reduce((s, inv) => s + Number(inv.total_amount), 0);
    const count = filteredInvoices.length;
    const avg = count > 0 ? totalSpend / count : 0;
    const uniqueSuppliers = new Set(filteredInvoices.map(inv => inv.supplier_id)).size;
    return { totalSpend, count, avg, uniqueSuppliers };
  }, [filteredInvoices]);

  // ─── Monthly Spend Trend (all time) ───
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
    return Array.from(allKeys)
      .sort()
      .map(key => {
        const spend = spendMap.get(key) || 0;
        const revenue = revMap.get(key) || 0;
        const costPct = revenue > 0 ? (spend / revenue) * 100 : null;
        return { month: formatMonthLabel(key), spend, revenue, costPct };
      });
  }, [invoices, salesRecords]);

  // ─── Daily Spend + Cumulative (single month / custom) ───
  const dailySpendData = useMemo(() => {
    if (!isSingleMonth && !isCustomPeriod) return [];
    const spendMap = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      spendMap.set(inv.invoice_date, (spendMap.get(inv.invoice_date) || 0) + Number(inv.total_amount));
    });
    // Filter sales by same period
    const filteredSales = salesRecords.filter(s => {
      if (selectedMonth === "all") return true;
      if (isCustomPeriod) {
        if (!customFrom && !customTo) return true;
        const d = new Date(s.date);
        if (customFrom && d < customFrom) return false;
        if (customTo) {
          const endOfDay = new Date(customTo);
          endOfDay.setHours(23, 59, 59, 999);
          if (d > endOfDay) return false;
        }
        return true;
      }
      const [y, m] = selectedMonth.split("-").map(Number);
      const d = new Date(s.date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
    const revMap = new Map<string, number>();
    filteredSales.forEach(s => {
      revMap.set(s.date, (revMap.get(s.date) || 0) + Number(s.total_sales));
    });
    const allDates = new Set<string>([...spendMap.keys(), ...revMap.keys()]);
    const sorted = Array.from(allDates).sort();
    let cumulative = 0;
    return sorted.map(date => {
      const spend = spendMap.get(date) || 0;
      const revenue = revMap.get(date) || 0;
      cumulative += spend;
      const costPct = revenue > 0 ? (spend / revenue) * 100 : null;
      const d = new Date(date);
      return {
        day: format(d, "d MMM"),
        value: spend,
        revenue,
        costPct,
        cumulative,
      };
    });
  }, [filteredInvoices, salesRecords, isSingleMonth, isCustomPeriod, selectedMonth, customFrom, customTo]);

  const showDailyView = (isSingleMonth || isCustomPeriod) && dailySpendData.length > 0;

  // ─── Supplier Spend (horizontal bar) ───
  const supplierSpendData = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      map.set(name, (map.get(name) || 0) + Number(inv.total_amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredInvoices, supplierMap]);

  const grandTotal = supplierSpendData.reduce((s, d) => s + d.value, 0);

  // Supplier concentration (top 3)
  const supplierConcentration = useMemo(() => {
    if (supplierSpendData.length === 0) return { top3Pct: 0, top3Names: [] as string[] };
    const top3 = supplierSpendData.slice(0, 3);
    const top3Total = top3.reduce((s, d) => s + d.value, 0);
    return {
      top3Pct: grandTotal > 0 ? (top3Total / grandTotal) * 100 : 0,
      top3Names: top3.map(d => d.name),
    };
  }, [supplierSpendData, grandTotal]);

  // ─── Category Spend (L1 only) ───
  const l1Data = useMemo(() => {
    const l1Map = new Map<string, number>();
    filteredLineItems.forEach(li => {
      const pm = li.product_master_id ? pmMap.get(li.product_master_id) : null;
      const l1 = pm?.level1_category || "Uncategorized";
      l1Map.set(l1, (l1Map.get(l1) || 0) + Number(li.total));
    });
    return Array.from(l1Map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredLineItems, pmMap]);

  const l1Total = l1Data.reduce((s, d) => s + d.value, 0);

  // ─── Product Expenses ───
  const productExpenses = useMemo(() => {
    const map = new Map<string, number>();
    filteredLineItems.forEach(li => {
      const desc = li.description?.trim() || "Unknown";
      map.set(desc, (map.get(desc) || 0) + Number(li.total));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredLineItems]);

  const visibleProducts = showAllProducts ? productExpenses : productExpenses.slice(0, 20);

  // ─── Price Variance ───
  const priceVariance = useMemo(() => {
    const map = new Map<string, { name: string; prices: { date: string; price: number }[] }>();
    const invDateMap = new Map<string, string>();
    filteredInvoices.forEach(inv => invDateMap.set(inv.id, inv.invoice_date));

    filteredLineItems.forEach(li => {
      if (!li.product_master_id || li.unit_price <= 0) return;
      const pm = pmMap.get(li.product_master_id);
      const name = pm?.internal_product_name || li.description;
      const date = invDateMap.get(li.invoice_id) || "";
      if (!map.has(li.product_master_id)) {
        map.set(li.product_master_id, { name, prices: [] });
      }
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
      if (Math.abs(changePct) >= 1) {
        results.push({ name, change, changePct, first, last });
      }
    });

    return results
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 10);
  }, [filteredLineItems, filteredInvoices, pmMap]);

  // ─── Supplier Tree ───
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

  const toggleSupplier = (name: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // Custom supplier bar label showing $ + %
  const renderSupplierBarLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    const pct = grandTotal > 0 ? ((value / grandTotal) * 100).toFixed(1) : "0";
    return (
      <text
        x={x + width + 6}
        y={y + height / 2}
        fill="hsl(25, 10%, 50%)"
        fontSize={10}
        fontFamily="monospace"
        dominantBaseline="middle"
      >
        {fmtShort(value)} ({pct}%)
      </text>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading dashboard...</p></div>;
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Header + Period filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold font-display">Procurement Analytics</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedMonth} onValueChange={v => { setSelectedMonth(v); if (v !== "custom") { setCustomFrom(undefined); setCustomTo(undefined); } }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              {monthOptions.map(m => (
                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
              ))}
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {isCustomPeriod && (
            <div className="flex items-center gap-2">
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("text-xs gap-1.5 h-8", !customFrom && "text-muted-foreground")}>
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
                  <Button variant="outline" size="sm" className={cn("text-xs gap-1.5 h-8", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="h-3 w-3" />
                    {customTo ? format(customTo, "MMM d, yyyy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={d => { setCustomTo(d); setToOpen(false); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {(customFrom || customTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setCustomFrom(undefined); setCustomTo(undefined); }}>
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Spend", value: fmt(kpis.totalSpend), icon: DollarSign },
          { label: "Invoice Count", value: kpis.count.toString(), icon: FileText },
          { label: "Avg Invoice", value: fmt(kpis.avg), icon: BarChart3 },
          { label: "Unique Suppliers", value: kpis.uniqueSuppliers.toString(), icon: Users },
        ].map(kpi => (
          <Card key={kpi.label} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold font-mono tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Spend Trend: Monthly (all) OR Daily + Cumulative (single month/custom) ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {showDailyView ? "Daily Spend & Cumulative" : "Monthly Spend Trend"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            {showDailyView ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailySpendData} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval="preserveStartEnd" />
                  <YAxis yAxisId="left" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, name: string) => [fmt(v), name === "value" ? "Daily Spend" : "Cumulative"]}
                    labelStyle={{ fontWeight: 600, fontSize: 12 }}
                  />
                  <defs>
                    <linearGradient id="dailyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(24, 80%, 50%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(24, 80%, 50%)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <Bar yAxisId="left" dataKey="value" fill="url(#dailyGrad)" radius={[3, 3, 0, 0]} name="Daily Spend" />
                  <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="hsl(14, 70%, 52%)" strokeWidth={2} dot={false} name="Cumulative" />
                </ComposedChart>
              </ResponsiveContainer>
            ) : monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), "Spend"]} labelStyle={{ fontWeight: 600, fontSize: 12 }} />
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(24, 80%, 50%)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(24, 80%, 50%)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="value" fill="url(#trendGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Spend by Supplier + Concentration ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend by Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(220, supplierSpendData.length * 36) }}>
              {supplierSpendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierSpendData} layout="vertical" margin={{ left: 10, right: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                      interval={0}
                      tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + "…" : v}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), "Spend"]} labelStyle={{ fontWeight: 600, fontSize: 12 }} />
                    <defs>
                      <linearGradient id="supplierGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(24, 80%, 50%)" stopOpacity={0.7} />
                        <stop offset="100%" stopColor="hsl(24, 80%, 55%)" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <Bar dataKey="value" fill="url(#supplierGrad)" radius={[0, 4, 4, 0]} label={renderSupplierBarLabel} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Supplier Concentration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-full min-h-[220px] gap-4">
              <div className="text-center">
                <p className="text-4xl font-bold font-mono tabular-nums text-primary">{supplierConcentration.top3Pct.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">of total spend from top 3 suppliers</p>
              </div>
              <div className="space-y-2 w-full">
                {supplierConcentration.top3Names.map((name, i) => {
                  const d = supplierSpendData.find(s => s.name === name);
                  const pct = grandTotal > 0 && d ? ((d.value / grandTotal) * 100).toFixed(1) : "0";
                  const amt = d ? fmtShort(d.value) : "$0";
                  return (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PALETTE[i] }} />
                      <span className="flex-1 truncate">{name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{amt} · {pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Category Breakdown L1 (full width donut) ─── */}
      {l1Data.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row items-center gap-6">
              <div className="h-[280px] w-full lg:w-1/2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={l1Data}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={115}
                      dataKey="value"
                      nameKey="name"
                      paddingAngle={2}
                      stroke="hsl(33, 25%, 94%)"
                      strokeWidth={2}
                    >
                      {l1Data.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), "Spend"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full lg:w-1/2 space-y-2">
                {l1Data.map((item, i) => {
                  const pct = l1Total > 0 ? ((item.value / l1Total) * 100).toFixed(1) : "0";
                  return (
                    <div key={item.name} className="flex items-center gap-2.5 text-sm">
                      <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                      <span className="flex-1 truncate" title={item.name}>{item.name}</span>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums shrink-0">{fmtShort(item.value)}</span>
                      <span className="font-mono text-xs font-medium tabular-nums shrink-0 w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Expenses by Product ─── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Expenses by Product ({productExpenses.length} items)
            </CardTitle>
            {productExpenses.length > 20 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowAllProducts(v => !v)}>
                {showAllProducts ? "Show Top 20" : `Show All ${productExpenses.length}`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {visibleProducts.length > 0 ? (
            <div style={{ height: Math.max(400, visibleProducts.length * 28) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleProducts} layout="vertical" margin={{ left: 10, right: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={180}
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    interval={0}
                    tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 26) + "…" : v}
                  />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmt(v), "Spend"]} labelStyle={{ fontWeight: 600, fontSize: 12 }} />
                  <defs>
                    <linearGradient id="productGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(175, 55%, 42%)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(175, 55%, 42%)" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="value" fill="url(#productGrad)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No product data for this period</div>
          )}
        </CardContent>
      </Card>

      {/* ─── Price Variance ─── */}
      {priceVariance.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Price Changes (First → Last Invoice)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priceVariance.map((item, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt(item.first)} → {fmt(item.last)}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-sm font-mono font-semibold ${item.change > 0 ? "text-destructive" : "text-accent"}`}>
                    {item.change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {item.changePct > 0 ? "+" : ""}{item.changePct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Supplier Tree View ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Supplier Detail {isSingleMonth && `— ${formatMonthLabel(selectedMonth)}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40">
              <span className="text-sm font-semibold">Grand Total</span>
              <span className="text-sm font-bold font-mono">{fmt(grandTotal)}</span>
            </div>
            {supplierTree.map((supplier, idx) => {
              const isExpanded = expandedSuppliers.has(supplier.name);
              const pct = grandTotal > 0 ? ((supplier.total / grandTotal) * 100).toFixed(1) : "0";
              return (
                <div key={supplier.name}>
                  <button
                    onClick={() => toggleSupplier(supplier.name)}
                    className="flex items-center w-full px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />}
                    <div className="h-2.5 w-2.5 rounded-full mr-2.5 shrink-0" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                    <span className="text-sm font-medium flex-1">{supplier.name}</span>
                    <span className="text-xs text-muted-foreground mr-3">{pct}%</span>
                    <span className="text-sm font-mono font-semibold tabular-nums">{fmt(supplier.total)}</span>
                  </button>
                  {isExpanded && (
                    <div className="bg-muted/10 border-t border-border">
                      {supplier.invoices.map((inv, i) => (
                        <div key={i} className="flex items-center px-4 py-1.5 pl-12 text-xs">
                          <span className="text-muted-foreground w-24 shrink-0">{inv.date}</span>
                          <span className="flex-1 text-muted-foreground truncate">{inv.number}</span>
                          <span className="font-mono tabular-nums">{fmt(inv.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
