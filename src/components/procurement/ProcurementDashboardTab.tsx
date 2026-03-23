import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, FileText, Package, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
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

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(48, 96%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(25, 95%, 53%)",
];

const fmt = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function ProcurementDashboardTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lineItems, setLineItems] = useState<LineItemRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const [invRes, liRes, supRes] = await Promise.all([
        supabase.from("invoices").select("id, supplier_id, invoice_date, total_amount, payment_status, status, venue"),
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

  const filteredInvoices = useMemo(() => {
    if (periodFilter === "all") return invoices;
    const now = new Date();
    const cutoff = new Date();
    if (periodFilter === "30d") cutoff.setDate(now.getDate() - 30);
    else if (periodFilter === "90d") cutoff.setDate(now.getDate() - 90);
    else if (periodFilter === "ytd") { cutoff.setMonth(0); cutoff.setDate(1); }
    return invoices.filter(inv => new Date(inv.invoice_date) >= cutoff);
  }, [invoices, periodFilter]);

  const filteredInvoiceIds = useMemo(() => new Set(filteredInvoices.map(i => i.id)), [filteredInvoices]);
  const filteredLineItems = useMemo(() => lineItems.filter(li => filteredInvoiceIds.has(li.invoice_id)), [lineItems, filteredInvoiceIds]);

  // KPIs
  const totalSpend = filteredInvoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const invoiceCount = filteredInvoices.length;
  const avgInvoiceValue = invoiceCount ? totalSpend / invoiceCount : 0;
  const unpaidTotal = filteredInvoices.filter(i => i.payment_status === "unpaid").reduce((s, i) => s + Number(i.total_amount), 0);
  const uniqueProducts = new Set(filteredLineItems.map(li => li.description?.toLowerCase().trim())).size;
  const unmatchedItems = filteredLineItems.filter(li => !li.product_master_id).length;

  // Spend by supplier
  const spendBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      const name = supplierMap.get(inv.supplier_id) || "Unknown";
      map.set(name, (map.get(name) || 0) + Number(inv.total_amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredInvoices, supplierMap]);

  // Monthly spend trend
  const monthlySpend = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      const d = new Date(inv.invoice_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + Number(inv.total_amount));
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => {
        const [y, m] = month.split("-");
        return { month: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m) - 1]} ${y.slice(2)}`, total };
      });
  }, [filteredInvoices]);

  // Top products by total spend
  const topProducts = useMemo(() => {
    const map = new Map<string, number>();
    filteredLineItems.forEach(li => {
      const desc = li.description?.trim() || "Unknown";
      map.set(desc, (map.get(desc) || 0) + Number(li.total));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: name.length > 25 ? name.slice(0, 25) + "…" : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredLineItems]);

  // Payment status breakdown
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      const status = inv.payment_status || "unknown";
      map.set(status, (map.get(status) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));
  }, [filteredInvoices]);

  // Spend by venue
  const spendByVenue = useMemo(() => {
    const map = new Map<string, number>();
    filteredInvoices.forEach(inv => {
      const venue = inv.venue || "Unknown";
      map.set(venue, (map.get(venue) || 0) + Number(inv.total_amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredInvoices]);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><p className="text-muted-foreground">Loading dashboard...</p></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Period filter */}
      <div className="flex justify-end">
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={DollarSign} label="Total Spend" value={fmt(totalSpend)} />
        <KPICard icon={FileText} label="Invoices" value={String(invoiceCount)} />
        <KPICard icon={TrendingUp} label="Avg Invoice" value={fmt(avgInvoiceValue)} />
        <KPICard icon={TrendingDown} label="Unpaid" value={fmt(unpaidTotal)} accent />
        <KPICard icon={Package} label="Unique Products" value={String(uniqueProducts)} />
        <KPICard icon={AlertTriangle} label="Unmatched Items" value={String(unmatchedItems)} accent={unmatchedItems > 0} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Spend Trend */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Spend Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlySpend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} />
                  <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Spend by Supplier */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spend by Supplier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={spendBySupplier} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ strokeWidth: 1 }} fontSize={11}>
                    {spendBySupplier.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top 10 Products by Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis type="number" tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} />
                  <Bar dataKey="value" fill="hsl(48, 96%, 53%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Spend by Venue + Payment Status */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Spend by Venue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[130px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spendByVenue}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                    <Tooltip formatter={(v: number) => [fmt(v), "Spend"]} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Payment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[130px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={50} label={({ name, value }) => `${name}: ${value}`} fontSize={11}>
                      {paymentBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-destructive/30" : ""}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-3.5 w-3.5 ${accent ? "text-destructive" : "text-muted-foreground"}`} />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</span>
        </div>
        <p className={`text-lg font-bold font-display ${accent ? "text-destructive" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
