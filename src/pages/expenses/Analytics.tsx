import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExpenseBills } from "@/hooks/useExpenseBills";
import { useVendorStatements } from "@/hooks/useVendorStatements";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  KpiSkeleton,
  EmptyState,
  ScopeLine,
  fmtHKWhole,
  fmtDate,
} from "@/components/expenses/shared";
import { TrendingUp } from "lucide-react";

// Chart palette — semantic HSL tokens driven by the theme (primary/warning/etc),
// never hardcoded hex.
const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--muted-foreground))",
];

export default function ExpenseAnalytics() {
  const { bills, loading: bLoad } = useExpenseBills();
  const { statements, loading: sLoad } = useVendorStatements();
  const loading = bLoad || sLoad;

  const [period, setPeriod] = useState<"12m" | "6m" | "3m" | "ytd">("12m");

  const { since, sinceLabel } = useMemo(() => {
    const now = new Date();
    if (period === "3m") return { since: new Date(now.getFullYear(), now.getMonth() - 2, 1), sinceLabel: "Last 3 months" };
    if (period === "6m") return { since: new Date(now.getFullYear(), now.getMonth() - 5, 1), sinceLabel: "Last 6 months" };
    if (period === "ytd") return { since: new Date(now.getFullYear(), 0, 1), sinceLabel: "Year to date" };
    return { since: new Date(now.getFullYear(), now.getMonth() - 11, 1), sinceLabel: "Last 12 months" };
  }, [period]);
  const sinceISO = since.toISOString().slice(0, 10);

  const scopedBills = useMemo(
    () => bills.filter((b) => (b.bill_date || "") >= sinceISO && b.approval_status === "posted"),
    [bills, sinceISO]
  );
  const scopedStmts = useMemo(
    () => statements.filter((s) => (s.statement_date || "") >= sinceISO),
    [statements, sinceISO]
  );

  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    scopedBills.forEach((b) => {
      const key = (b.bill_date || "").slice(0, 7);
      if (!key) return;
      m[key] = (m[key] || 0) + Number(b.total_amount || 0);
    });
    scopedStmts.forEach((s) => {
      const key = (s.statement_date || "").slice(0, 7);
      if (!key) return;
      m[key] = (m[key] || 0) + Number(s.current_period_charges || 0) + Number(s.late_fees || 0);
    });
    return Object.entries(m)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
  }, [scopedBills, scopedStmts]);

  const byVendor = useMemo(() => {
    const m: Record<string, number> = {};
    scopedBills.forEach((b) => {
      const key = b.vendor_name || "—";
      m[key] = (m[key] || 0) + Number(b.total_amount || 0);
    });
    return Object.entries(m)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [scopedBills]);

  const totals = useMemo(() => {
    const billsTotal = scopedBills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const stmtCharges = scopedStmts.reduce((s, x) => s + Number(x.current_period_charges || 0), 0);
    const lateFees = scopedStmts.reduce((s, x) => s + Number(x.late_fees || 0), 0);
    const monthsSpan = Math.max(byMonth.length, 1);
    return {
      billsTotal,
      stmtCharges,
      lateFees,
      grand: billsTotal + stmtCharges + lateFees,
      avgMonth: (billsTotal + stmtCharges + lateFees) / monthsSpan,
    };
  }, [scopedBills, scopedStmts, byMonth.length]);

  const hasData = byMonth.length > 0 || byVendor.length > 0;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Expense Analytics"
        description="Trends, vendor concentration, and avoidable costs across posted bills and vendor statements."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">Last 3 months</SelectItem>
            <SelectItem value="6m">Last 6 months</SelectItem>
            <SelectItem value="12m">Last 12 months</SelectItem>
            <SelectItem value="ytd">Year to date</SelectItem>
          </SelectContent>
        </Select>
        <ScopeLine>
          {sinceLabel} · from {fmtDate(sinceISO)} · posted bills + statements
        </ScopeLine>
      </div>

      {loading && !bills.length ? (
        <KpiSkeleton count={4} />
      ) : (
        <KpiGrid>
          <KpiCard label="Total expenses" value={fmtHKWhole(totals.grand)} hint="Posted only" tone="success" />
          <KpiCard label="Bills" value={fmtHKWhole(totals.billsTotal)} tone="info" />
          <KpiCard label="Statement charges" value={fmtHKWhole(totals.stmtCharges)} tone="info" />
          <KpiCard label="Late fees" value={fmtHKWhole(totals.lateFees)} hint="Avoidable" tone={totals.lateFees > 0 ? "destructive" : "default"} />
          <KpiCard label="Avg / month" value={fmtHKWhole(totals.avgMonth)} tone="info" />
        </KpiGrid>
      )}

      {!hasData && !loading ? (
        <Card className="card-glass p-0">
          <EmptyState
            icon={<TrendingUp className="h-6 w-6" />}
            title="No posted expenses in this period"
            description="Post a bill through Expenses → Bills or Approvals, then come back to see trends."
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="card-glass p-4 lg:col-span-2">
            <div className="text-sm font-medium mb-3">Monthly trend</div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={byMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => fmtHKWhole(Number(v))} width={100} />
                  <Tooltip
                    formatter={(v: any) => fmtHKWhole(Number(v))}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="card-glass p-4">
            <div className="text-sm font-medium mb-3">Top vendors</div>
            <div className="h-64">
              {byVendor.length === 0 ? (
                <EmptyState title="No vendor breakdown" description="Requires posted bills with a vendor name." />
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={byVendor}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {byVendor.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: any) => fmtHKWhole(Number(v))}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--foreground))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
