import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";

interface InvoiceRow {
  id: string;
  supplier_id: string;
  invoice_date: string;
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

const SUPPLIER_COLORS = [
  "hsl(48, 96%, 53%)",
  "hsl(var(--primary))",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(25, 95%, 53%)",
  "hsl(330, 80%, 55%)",
  "hsl(180, 60%, 45%)",
  "hsl(60, 70%, 50%)",
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

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

export default function ProcurementDashboardTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [invRes, liRes, supRes] = await Promise.all([
        supabase.from("invoices").select("id, supplier_id, invoice_date, invoice_number, total_amount, payment_status, status, venue"),
        supabase.from("invoice_line_items").select("id, invoice_id, description, quantity, unit_price, total, product_master_id"),
        supabase.from("suppliers").select("id, name"),
      ]);
      if (invRes.data) setInvoices(invRes.data);
      if (liRes.data) setLineItems(liRes.data);
      if (supRes.data) setSuppliers(supRes.data);
      setLoading(false);
    })();
  }, []);

  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id, s.name])), [suppliers]);
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

  // ─── SECTION 1: Spend per supplier ───

  // Daily spend by supplier for line chart (only when a month is selected)
  const dailySupplierSpend = useMemo(() => {
    if (selectedMonth === "all") return [];
    const [y, m] = selectedMonth.split("-").map(Number);
    const daysCount = getDaysInMonth(y, m);
    const supplierNames = new Set<string>();
    
    // Build day -> supplier -> amount map
    const dayMap = new Map<number, Map<string, number>>();
    filteredInvoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const day = d.getDate();
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      supplierNames.add(name);
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      const sm = dayMap.get(day)!;
      sm.set(name, (sm.get(name) || 0) + Number(inv.total_amount));
    });

    const result: any[] = [];
    for (let d = 1; d <= daysCount; d++) {
      const entry: any = { day: d };
      const sm = dayMap.get(d);
      supplierNames.forEach(name => {
        entry[name] = sm?.get(name) || 0;
      });
      result.push(entry);
    }
    return result;
  }, [filteredInvoices, selectedMonth, supplierMap]);

  const activeSupplierNames = useMemo(() => {
    const names = new Set<string>();
    filteredInvoices.forEach(inv => names.add(supplierMap.get(inv.supplier_id) || "Unknown"));
    return Array.from(names).sort();
  }, [filteredInvoices, supplierMap]);

  // Monthly spend by supplier for line chart (when "all" is selected)
  const monthlySupplierSpend = useMemo(() => {
    if (selectedMonth !== "all") return [];
    const supplierNames = new Set<string>();
    const monthMap = new Map<string, Map<string, number>>();
    
    invoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      supplierNames.add(name);
      if (!monthMap.has(key)) monthMap.set(key, new Map());
      const sm = monthMap.get(key)!;
      sm.set(name, (sm.get(name) || 0) + Number(inv.total_amount));
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, sm]) => {
        const entry: any = { period: formatMonthLabel(key) };
        supplierNames.forEach(name => { entry[name] = sm.get(name) || 0; });
        return entry;
      });
  }, [invoices, selectedMonth, supplierMap]);

  // Tree view: supplier totals with invoice breakdown
  const supplierTree = useMemo(() => {
    const map = new Map<string, { total: number; supplierId: string; invoices: { date: string; number: string; amount: number }[] }>();
    filteredInvoices.forEach(inv => {
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      if (!map.has(name)) map.set(name, { total: 0, supplierId: inv.supplier_id, invoices: [] });
      const entry = map.get(name)!;
      entry.total += Number(inv.total_amount);
      entry.invoices.push({
        date: inv.invoice_date,
        number: (inv as any).invoice_number || inv.id.slice(0, 8),
        amount: Number(inv.total_amount),
      });
    });
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        total: data.total,
        invoices: data.invoices.sort((a, b) => a.date.localeCompare(b.date)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredInvoices, supplierMap]);

  const grandTotal = supplierTree.reduce((s, t) => s + t.total, 0);

  const toggleSupplier = (name: string) => {
    setExpandedSuppliers(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // ─── SECTION 2: Expenses by product ───
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

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading dashboard...</p></div>;
  }

  const chartData = selectedMonth === "all" ? monthlySupplierSpend : dailySupplierSpend;
  const xKey = selectedMonth === "all" ? "period" : "day";

  return (
    <div className="space-y-6 mt-4">
      {/* Period filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold font-display">Procurement Analytics</h2>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time (Monthly)</SelectItem>
            {monthOptions.map(m => (
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── 1. Spend per Supplier ─── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Spend by Supplier</h3>

        {/* Time-series chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedMonth === "all" ? "Monthly Spend by Supplier" : `Daily Spend — ${formatMonthLabel(selectedMonth)}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey={xKey} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                    <Legend />
                    {activeSupplierNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        connectNulls={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for this period</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tree view totals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Supplier Totals {selectedMonth !== "all" && `— ${formatMonthLabel(selectedMonth)}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {/* Grand total header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40">
                <span className="text-sm font-semibold">Grand Total</span>
                <span className="text-sm font-bold font-mono">{fmt(grandTotal)}</span>
              </div>

              {supplierTree.map((supplier, idx) => {
                const isExpanded = expandedSuppliers.has(supplier.name);
                const pct = grandTotal > 0 ? ((supplier.total / grandTotal) * 100).toFixed(1) : "0";
                return (
                  <div key={supplier.name}>
                    {/* Supplier row */}
                    <button
                      onClick={() => toggleSupplier(supplier.name)}
                      className="flex items-center w-full px-4 py-2.5 hover:bg-muted/30 transition-colors text-left"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 mr-2 text-muted-foreground shrink-0" />}
                      <div
                        className="h-2.5 w-2.5 rounded-full mr-2.5 shrink-0"
                        style={{ backgroundColor: SUPPLIER_COLORS[idx % SUPPLIER_COLORS.length] }}
                      />
                      <span className="text-sm font-medium flex-1">{supplier.name}</span>
                      <span className="text-xs text-muted-foreground mr-3">{pct}%</span>
                      <span className="text-sm font-mono font-semibold tabular-nums">{fmt(supplier.total)}</span>
                    </button>

                    {/* Expanded invoice list */}
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

      {/* ─── 2. Expenses by Product ─── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Expenses by Product ({productExpenses.length} items)
        </h3>
        <Card>
          <CardContent className="pt-4 pb-2">
            {productExpenses.length > 0 ? (
              <div style={{ height: Math.max(400, productExpenses.length * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productExpenses} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={180}
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                      interval={0}
                    />
                    <Tooltip
                      formatter={(v: number) => [fmt(v), "Spend"]}
                      labelStyle={{ fontWeight: 600 }}
                    />
                    <Bar dataKey="value" fill="hsl(48, 96%, 53%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">No product data for this period</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
