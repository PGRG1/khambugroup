import { useMemo, useState } from "react";
import { useCashflowData } from "@/hooks/useCashflowData";
import type { PeriodGranularity } from "@/utils/cashflowCalculations";
import { CASHFLOW_VENUES } from "@/utils/cashflowCalculations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, Wallet, FileDown, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/utils/csvDownload";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-HK", { style: "currency", currency: "HKD", maximumFractionDigits: 0 });
const fmtMono = (n: number) =>
  n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CATEGORY_LABELS: Record<string, string> = {
  sales: "Sales receipts",
  invoice: "Supplier payments",
  payroll_salary: "Net salaries",
  payroll_mpf: "MPF contributions",
  manual: "Manual Profit & Loss",
};

export default function Cashflow() {
  const { isAdmin } = useAuth();
  const [granularity, setGranularity] = useState<PeriodGranularity>("month");
  const [venueFilter, setVenueFilter] = useState<string>("All Venues");
  const [editingOpening, setEditingOpening] = useState(false);
  const [openingDraft, setOpeningDraft] = useState({ balance: "", date: "" });

  const { loading, buckets, totals, settings, inflows, outflows, refetch } = useCashflowData({
    granularity,
    venueFilter,
  });

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        name: b.label,
        Inflows: Math.round(b.inflows),
        Outflows: -Math.round(b.outflows),
        Net: Math.round(b.net),
        Balance: Math.round(b.runningBalance),
      })),
    [buckets],
  );

  // Category breakdown across all visible buckets
  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    inflows.forEach((e) => map.set(e.category, (map.get(e.category) || 0) + e.amount));
    outflows.forEach((e) => map.set(e.category, (map.get(e.category) || 0) - e.amount));
    return Array.from(map.entries()).map(([k, v]) => ({ category: k, label: CATEGORY_LABELS[k] || k, amount: v }));
  }, [inflows, outflows]);

  // Recent transaction feed (last 20 cash events across in/out)
  const recentTxns = useMemo(() => {
    const all = [
      ...inflows.map((e) => ({ ...e, sign: 1 as const })),
      ...outflows.map((e) => ({ ...e, sign: -1 as const })),
    ];
    return all.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  }, [inflows, outflows]);

  const handleSaveOpening = async () => {
    if (!settings) return;
    const balance = parseFloat(openingDraft.balance);
    if (isNaN(balance)) {
      toast.error("Enter a valid number");
      return;
    }
    const { error } = await (supabase.from("cashflow_settings" as any) as any)
      .update({ opening_balance: balance, opening_date: openingDraft.date || settings.opening_date })
      .eq("id", settings.id);
    if (error) {
      toast.error("Failed to update opening balance");
      return;
    }
    toast.success("Opening balance updated");
    setEditingOpening(false);
    refetch();
  };

  const startEdit = () => {
    if (!settings) return;
    setOpeningDraft({
      balance: String(settings.opening_balance ?? 0),
      date: settings.opening_date ?? new Date().toISOString().slice(0, 10),
    });
    setEditingOpening(true);
  };

  const handleExportCSV = () => {
    const rows = buckets.map((b) => ({
      period: b.label,
      inflows: b.inflows.toFixed(2),
      outflows: b.outflows.toFixed(2),
      net: b.net.toFixed(2),
      running_balance: b.runningBalance.toFixed(2),
    }));
    downloadCSV(
      rows,
      [
        { key: "period", label: "Period" },
        { key: "inflows", label: "Inflows" },
        { key: "outflows", label: "Outflows" },
        { key: "net", label: "Net" },
        { key: "running_balance", label: "Running Balance" },
      ],
      `cashflow_${granularity}`,
    );
  };

  return (
    <div className="p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cashflow</h1>
          <p className="text-sm text-muted-foreground mt-1">
            True cash basis — timed by actual payment dates across sales, invoices, and payroll.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v as PeriodGranularity)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="quarter">Quarter</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Venues">All Venues</SelectItem>
              {CASHFLOW_VENUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileDown className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          icon={<ArrowUpCircle className="h-5 w-5 text-emerald-600" />}
          label="Total Inflows"
          value={fmtMoney(totals.inflow)}
        />
        <KPICard
          icon={<ArrowDownCircle className="h-5 w-5 text-rose-600" />}
          label="Total Outflows"
          value={fmtMoney(totals.outflow)}
        />
        <KPICard
          icon={<TrendingUp className="h-5 w-5 text-primary" />}
          label="Net Cashflow"
          value={fmtMoney(totals.net)}
          highlight={totals.net >= 0 ? "positive" : "negative"}
        />
        <KPICard
          icon={<Wallet className="h-5 w-5 text-amber-600" />}
          label="Closing Position"
          value={fmtMoney(totals.closing)}
        />
      </div>

      {/* Opening balance editor */}
      <Card className="card-glass p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm">
          <div className="text-muted-foreground">Opening Cash Balance</div>
          {!editingOpening ? (
            <div className="font-mono text-lg font-semibold mt-1">
              {fmtMoney(settings?.opening_balance ?? 0)}
              <span className="ml-3 text-xs text-muted-foreground font-sans">
                as of {settings?.opening_date ?? "—"}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Input
                type="number"
                step="0.01"
                placeholder="Balance"
                value={openingDraft.balance}
                onChange={(e) => setOpeningDraft({ ...openingDraft, balance: e.target.value })}
                className="w-40"
              />
              <Input
                type="date"
                value={openingDraft.date}
                onChange={(e) => setOpeningDraft({ ...openingDraft, date: e.target.value })}
                className="w-44"
              />
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {!editingOpening ? (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="h-4 w-4 mr-1" /> Edit
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSaveOpening}>
                  <Check className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingOpening(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Chart */}
      <Card className="card-glass p-4">
        <h2 className="text-lg font-semibold mb-3">Cashflow over time</h2>
        {loading ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground">No cash activity yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => fmtMoney(Math.abs(v))}
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))" }}
              />
              <Legend />
              <Bar dataKey="Inflows" stackId="cf" fill="hsl(142 71% 45%)" />
              <Bar dataKey="Outflows" stackId="cf" fill="hsl(0 72% 51%)" />
              <Line type="monotone" dataKey="Net" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              <Line
                type="monotone"
                dataKey="Balance"
                stroke="hsl(38 92% 50%)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Period breakdown table */}
      <Card className="card-glass p-4">
        <h2 className="text-lg font-semibold mb-3">Period breakdown</h2>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Inflows</TableHead>
                <TableHead className="text-right">Outflows</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {buckets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                    No data
                  </TableCell>
                </TableRow>
              )}
              {buckets.map((b) => (
                <TableRow key={b.key}>
                  <TableCell className="font-medium">{b.label}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">{fmtMono(b.inflows)}</TableCell>
                  <TableCell className="text-right font-mono text-rose-700">({fmtMono(b.outflows)})</TableCell>
                  <TableCell
                    className={`text-right font-mono font-semibold ${b.net >= 0 ? "text-foreground" : "text-rose-700"}`}
                  >
                    {fmtMono(b.net)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtMono(b.runningBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {buckets.length > 0 && (
              <tfoot className="border-t-2 border-double border-foreground/40">
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-mono font-semibold text-emerald-700">
                    {fmtMono(totals.inflow)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-rose-700">
                    ({fmtMono(totals.outflow)})
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">{fmtMono(totals.net)}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{fmtMono(totals.closing)}</TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
      </Card>

      {/* Category breakdown + recent transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-glass p-4">
          <h2 className="text-lg font-semibold mb-3">By category</h2>
          <div className="space-y-2">
            {categoryTotals.length === 0 && <p className="text-sm text-muted-foreground">No activity.</p>}
            {categoryTotals.map((c) => (
              <div key={c.category} className="flex justify-between border-b border-border/50 py-1.5">
                <span className="text-sm">{c.label}</span>
                <span
                  className={`font-mono text-sm ${c.amount >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {fmtMono(c.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="card-glass p-4">
          <h2 className="text-lg font-semibold mb-3">Recent cash events</h2>
          <div className="space-y-1.5 max-h-[400px] overflow-auto">
            {recentTxns.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {recentTxns.map((t, i) => (
              <div key={i} className="flex justify-between items-center text-sm border-b border-border/30 py-1.5">
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{t.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.date}
                    {t.venue ? ` · ${t.venue}` : ""}
                  </span>
                </div>
                <span
                  className={`font-mono font-medium whitespace-nowrap ml-3 ${
                    t.sign > 0 ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {t.sign > 0 ? "+" : "-"}
                  {fmtMono(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: "positive" | "negative";
}) {
  const color =
    highlight === "negative" ? "text-rose-700" : highlight === "positive" ? "text-emerald-700" : "text-foreground";
  return (
    <Card className="card-glass p-4 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 min-w-0">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`font-bold font-mono whitespace-nowrap min-w-0 ${kpiValueSizeClass(value)} ${color}`} title={value}>{value}</div>
    </Card>
  );
}
