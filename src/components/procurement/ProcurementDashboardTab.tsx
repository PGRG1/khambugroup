import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, DollarSign, FileText, Users, BarChart3 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

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

interface PMCategory {
  id: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  internal_product_name: string;
}

const COLORS = [
  "hsl(48, 96%, 53%)",
  "hsl(199, 89%, 48%)",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(25, 95%, 53%)",
  "hsl(330, 80%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(60, 70%, 50%)",
  "hsl(210, 70%, 55%)",
  "hsl(300, 60%, 50%)",
  "hsl(120, 50%, 40%)",
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

// Custom pie label
const renderPieLabel = ({ name, percent }: { name: string; percent: number }) => {
  if (percent < 0.03) return null;
  return `${name} (${(percent * 100).toFixed(1)}%)`;
};

export default function ProcurementDashboardTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [pmCategories, setPmCategories] = useState<PMCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [showAllProducts, setShowAllProducts] = useState(false);

  useEffect(() => {
    (async () => {
      const [invRes, liData, supRes, pmRes] = await Promise.all([
        supabase.from("invoices").select("id, supplier_id, invoice_date, invoice_number, total_amount, payment_status, status, venue"),
        fetchAllRows("invoice_line_items", "id, invoice_id, description, quantity, unit_price, total, product_master_id"),
        supabase.from("suppliers").select("id, name"),
        supabase.from("product_master" as any).select("id, level1_category, level2_category, level3_category, internal_product_name"),
      ]);
      if (invRes.data) setInvoices(invRes.data);
      setLineItems(liData);
      if (supRes.data) setSuppliers(supRes.data);
      if (pmRes.data) setPmCategories(pmRes.data as unknown as PMCategory[]);
      setLoading(false);
    })();
  }, []);

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
  const pmMap = useMemo(() => new Map(pmCategories.map(p => [p.id, p])), [pmCategories]);
  const monthOptions = useMemo(() => getMonthOptions(invoices), [invoices]);

  // Filter invoices by selected month
  const filteredInvoices = useMemo(() => {
    if (selectedMonth === "all") return invoices;
    const [y, m] = selectedMonth.split("-").map(Number);
    return invoices.filter(inv => {
      const d = new Date(inv.invoice_date);
      return d.getFullYear() === y && d.getMonth() + 1 === m;
    });
  }, [invoices, selectedMonth]);

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

  // ─── Monthly Spend Trend ───
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>();
    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + Number(inv.total_amount));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ month: formatMonthLabel(key), value }));
  }, [invoices]);

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

  // ─── Category Spend (L1, L2, L3) ───
  const categoryData = useMemo(() => {
    const l1Map = new Map<string, number>();
    const l2Map = new Map<string, number>();
    const l3Map = new Map<string, number>();

    filteredLineItems.forEach(li => {
      const pm = li.product_master_id ? pmMap.get(li.product_master_id) : null;
      const l1 = pm?.level1_category || "Uncategorized";
      const l2 = pm?.level2_category || "";
      const l3 = pm?.level3_category || "";
      const total = Number(li.total);

      l1Map.set(l1, (l1Map.get(l1) || 0) + total);
      if (l2) l2Map.set(l2, (l2Map.get(l2) || 0) + total);
      if (l3) l3Map.set(l3, (l3Map.get(l3) || 0) + total);
    });

    const toSorted = (m: Map<string, number>) =>
      Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    return { l1: toSorted(l1Map), l2: toSorted(l2Map), l3: toSorted(l3Map) };
  }, [filteredLineItems, pmMap]);

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
    // Group by product_master_id: collect all unit prices with dates
    const map = new Map<string, { name: string; prices: { date: string; price: number }[] }>();
    
    // Build invoice date lookup
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

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading dashboard...</p></div>;
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Header + Period filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold font-display">Procurement Analytics</h2>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            {monthOptions.map(m => (
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Spend", value: fmt(kpis.totalSpend), icon: DollarSign, color: "text-amber-500" },
          { label: "Invoice Count", value: kpis.count.toString(), icon: FileText, color: "text-blue-500" },
          { label: "Avg Invoice", value: fmt(kpis.avg), icon: BarChart3, color: "text-emerald-500" },
          { label: "Unique Suppliers", value: kpis.uniqueSuppliers.toString(), icon: Users, color: "text-purple-500" },
        ].map(kpi => (
          <Card key={kpi.label} className="relative overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold font-mono tabular-nums">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Monthly Spend Trend ─── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Monthly Spend Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            {monthlyTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} labelStyle={{ fontWeight: 600 }} />
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(48, 96%, 53%)" stopOpacity={1} />
                      <stop offset="100%" stopColor="hsl(48, 96%, 53%)" stopOpacity={0.6} />
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
            <div style={{ height: Math.max(200, supplierSpendData.length * 36) }}>
              {supplierSpendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={supplierSpendData} layout="vertical" margin={{ left: 0, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} className="fill-muted-foreground" interval={0} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} labelStyle={{ fontWeight: 600 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {supplierSpendData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
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
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4">
              <div className="text-center">
                <p className="text-4xl font-bold font-mono tabular-nums">{supplierConcentration.top3Pct.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground mt-1">of total spend from top 3 suppliers</p>
              </div>
              <div className="space-y-2 w-full">
                {supplierConcentration.top3Names.map((name, i) => {
                  const d = supplierSpendData.find(s => s.name === name);
                  const pct = grandTotal > 0 && d ? ((d.value / grandTotal) * 100).toFixed(1) : "0";
                  return (
                    <div key={name} className="flex items-center gap-2 text-sm">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i] }} />
                      <span className="flex-1 truncate">{name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Category Breakdown (L1 Pie + L2 Bar) ─── */}
      {(categoryData.l1.length > 0 || categoryData.l2.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* L1 Donut */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Spend by Category (L1)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[320px]">
                {categoryData.l1.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData.l1}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={110}
                        dataKey="value"
                        nameKey="name"
                        label={renderPieLabel}
                        labelLine={false}
                      >
                        {categoryData.l1.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No category data</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* L2 Horizontal Bar */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Spend by Sub-Category (L2)</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: Math.max(200, categoryData.l2.length * 30) }}>
                {categoryData.l2.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryData.l2} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                      <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={0} />
                      <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {categoryData.l2.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No L2 data</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* L3 Category */}
      {categoryData.l3.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend by Detail Category (L3)</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(200, categoryData.l3.length * 28) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData.l3} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={0} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} />
                  <Bar dataKey="value" fill="hsl(199, 89%, 48%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Expenses by Product (improved) ─── */}
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
                <BarChart data={visibleProducts} layout="vertical" margin={{ left: 0, right: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={180}
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    interval={0}
                    tickFormatter={(v: string) => v.length > 28 ? v.slice(0, 26) + "…" : v}
                  />
                  <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} labelStyle={{ fontWeight: 600 }} />
                  <defs>
                    <linearGradient id="productGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(48, 96%, 53%)" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="hsl(48, 96%, 63%)" stopOpacity={1} />
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
                  <div className={`flex items-center gap-1 text-sm font-mono font-semibold ${item.change > 0 ? "text-red-500" : "text-emerald-500"}`}>
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
            Supplier Detail {selectedMonth !== "all" && `— ${formatMonthLabel(selectedMonth)}`}
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
                    <div className="h-2.5 w-2.5 rounded-full mr-2.5 shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
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
