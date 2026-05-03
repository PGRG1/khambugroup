import React, { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid } from "recharts";
import { DollarSign, FileText, TrendingUp, Clock } from "lucide-react";
import { Invoice } from "@/hooks/useInvoiceData";
import { useState } from "react";

const COLORS = [
  "hsl(24, 80%, 50%)",   // primary
  "hsl(14, 70%, 52%)",   // accent
  "hsl(175, 55%, 42%)",  // chart-3
  "hsl(258, 50%, 55%)",  // chart-4
  "hsl(145, 45%, 42%)",  // chart-5
  "hsl(210, 60%, 50%)",
  "hsl(340, 55%, 50%)",
  "hsl(45, 70%, 50%)",
];

interface Props {
  invoices: Invoice[];
}

export default function InvoiceAnalytics({ invoices }: Props) {
  const [yearFilter, setYearFilter] = useState("all");

  const years = useMemo(() => {
    const yrs = [...new Set(invoices.map((inv) => inv.invoice_date?.slice(0, 4)).filter(Boolean))].sort().reverse();
    return yrs;
  }, [invoices]);

  const filtered = useMemo(() => {
    if (yearFilter === "all") return invoices;
    return invoices.filter((inv) => inv.invoice_date?.startsWith(yearFilter));
  }, [invoices, yearFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filtered.reduce((s, inv) => s + inv.total_amount, 0);
    const count = filtered.length;
    const avgPerInvoice = count > 0 ? total / count : 0;
    const pending = filtered.filter((inv) => inv.status === "pending").length;
    return { total, count, avgPerInvoice, pending };
  }, [filtered]);

  // Monthly spending trend
  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of filtered) {
      const month = inv.invoice_date?.slice(0, 7); // YYYY-MM
      if (!month) continue;
      map[month] = (map[month] || 0) + inv.total_amount;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        amount: Math.round(amount),
      }));
  }, [filtered]);

  // Top suppliers
  const topSuppliers = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of filtered) {
      const name = inv.supplier_name || "Unknown";
      map[name] = (map[name] || 0) + inv.total_amount;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name: name.length > 18 ? name.slice(0, 16) + "…" : name, value: Math.round(value), fullName: name }));
  }, [filtered]);

  // By venue
  const venueData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of filtered) {
      map[inv.venue] = (map[inv.venue] || 0) + inv.total_amount;
    }
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [filtered]);

  // By status
  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of filtered) {
      map[inv.status] = (map[inv.status] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));
  }, [filtered]);

  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  return (
    <div className="space-y-4">
      {/* Year filter */}
      <div className="flex items-center gap-2">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="All Years" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-full p-2 bg-primary/10">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="text-lg font-bold font-mono">{fmt(kpis.total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-full p-2 bg-primary/10">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invoices</p>
              <p className="text-lg font-bold font-mono">{kpis.count}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <div className="rounded-full p-2 bg-primary/10">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg / Invoice</p>
              <p className="text-lg font-bold font-mono">{fmt(kpis.avgPerInvoice)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={kpis.pending > 0 ? "border-yellow-400/50" : ""}>
          <CardContent className="p-3 flex items-center gap-3">
            <div className={`rounded-full p-2 ${kpis.pending > 0 ? "bg-yellow-100" : "bg-muted"}`}>
              <Clock className={`h-4 w-4 ${kpis.pending > 0 ? "text-yellow-700" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-lg font-bold font-mono">{kpis.pending}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Spending Trend */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-foreground">Monthly Spending</h3>
            {monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 85%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(25, 10%, 50%)" />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="hsl(25, 10%, 50%)" />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Amount"]} />
                  <Bar dataKey="amount" fill="hsl(24, 80%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No data</p>
            )}
          </CardContent>
        </Card>

        {/* Top Suppliers */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-foreground">Top Suppliers</h3>
            {topSuppliers.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topSuppliers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30, 15%, 85%)" />
                  <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} stroke="hsl(25, 10%, 50%)" />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} stroke="hsl(25, 10%, 50%)" />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Total"]} labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""} />
                  <Bar dataKey="value" fill="hsl(14, 70%, 52%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No data</p>
            )}
          </CardContent>
        </Card>

        {/* By Venue */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-foreground">Spend by Venue</h3>
            {venueData.length > 0 ? (
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={venueData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {venueData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Total"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No data</p>
            )}
          </CardContent>
        </Card>

        {/* By Status */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 text-foreground">Invoice Status</h3>
            {statusData.length > 0 ? (
              <div className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name} (${value})`} labelLine={false}>
                      {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
