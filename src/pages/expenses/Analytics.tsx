import { useMemo } from "react";
import { Card } from "@/components/ui/card";
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
} from "recharts";

const fmt = (n: number) =>
  `HK$ ${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const COLORS = ["#10b981", "#06b6d4", "#a78bfa", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899"];

export default function ExpenseAnalytics() {
  const { bills } = useExpenseBills();
  const { statements } = useVendorStatements();

  const byMonth = useMemo(() => {
    const m: Record<string, number> = {};
    bills.forEach((b) => {
      const key = (b.bill_date || "").slice(0, 7);
      if (!key) return;
      m[key] = (m[key] || 0) + Number(b.total_amount || 0);
    });
    statements.forEach((s) => {
      const key = (s.statement_date || "").slice(0, 7);
      if (!key) return;
      m[key] = (m[key] || 0) + Number(s.current_period_charges || 0) + Number(s.late_fees || 0);
    });
    return Object.entries(m)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));
  }, [bills, statements]);

  const bySource = useMemo(() => {
    const total = bills.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const stmt = statements.reduce(
      (s, x) => s + Number(x.current_period_charges || 0) + Number(x.late_fees || 0),
      0
    );
    return [
      { name: "Bills", value: total },
      { name: "Statements", value: stmt },
    ];
  }, [bills, statements]);

  const avoidable = useMemo(
    () => statements.reduce((s, x) => s + Number(x.late_fees || 0), 0),
    [statements]
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-semibold">Expense Analytics</h1>
        <p className="text-sm text-muted-foreground">Trends, breakdowns and avoidable costs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <div className="text-sm font-medium mb-3">Monthly trend</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={byMonth}>
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmt} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Bar dataKey="amount" fill="hsl(152 76% 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium mb-3">By source</div>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={bySource} dataKey="value" nameKey="name" outerRadius={80} label>
                  {bySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-medium mb-1">Avoidable costs</div>
        <div className="text-3xl font-semibold td-num text-destructive">{fmt(avoidable)}</div>
        <div className="text-xs text-muted-foreground mt-1">Late fees on vendor statements across all periods.</div>
      </Card>
    </div>
  );
}
