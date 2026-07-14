import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLedgerCashflow } from "@/hooks/useLedgerCashflow";
import type { PeriodGranularity } from "@/utils/cashflowCalculations";
import { CASHFLOW_VENUES } from "@/utils/cashflowCalculations";
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
import { ArrowDownCircle, ArrowUpCircle, TrendingUp, Wallet, FileDown, BookOpen, Info } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { generateLedgerCashflowPDF } from "@/utils/financePdfReports";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-HK", { style: "currency", currency: "HKD", maximumFractionDigits: 0 });
const fmtMono = (n: number) =>
  n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SOURCE_LABELS: Record<string, string> = {
  sales: "Sales",
  manual: "Manual journals",
  invoice: "Supplier invoices",
  payroll: "Payroll",
  payroll_salary: "Net salaries",
  payroll_mpf: "MPF",
  other: "Other",
};

export default function CashflowLedger() {
  const today = new Date();
  const [granularity, setGranularity] = useState<PeriodGranularity>("month");
  const [venueFilter, setVenueFilter] = useState<string>("All Venues");
  const [accountFilter, setAccountFilter] = useState<string>("All Accounts");
  const [fromDate, setFromDate] = useState<string>(`${today.getFullYear()}-01-01`);
  const [toDate, setToDate] = useState<string>("");

  const { loading, buckets, totals, byAccount, bySource, accounts, movements } = useLedgerCashflow({
    granularity,
    venueFilter,
    accountFilter,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
  });

  const chartData = useMemo(
    () =>
      buckets.map((b) => ({
        name: b.label,
        "Cash In": Math.round(b.inflows),
        "Cash Out": -Math.round(b.outflows),
        Net: Math.round(b.net),
        Balance: Math.round(b.runningBalance),
      })),
    [buckets],
  );

  const recent = useMemo(
    () => [...movements].sort((a, b) => b.entry_date.localeCompare(a.entry_date)).slice(0, 25),
    [movements],
  );

  const handleExportCSV = () => {
    downloadCSV(
      buckets.map((b) => ({
        period: b.label,
        cash_in: b.inflows.toFixed(2),
        cash_out: b.outflows.toFixed(2),
        net: b.net.toFixed(2),
        running_balance: b.runningBalance.toFixed(2),
      })),
      [
        { key: "period", label: "Period" },
        { key: "cash_in", label: "Cash In" },
        { key: "cash_out", label: "Cash Out" },
        { key: "net", label: "Net" },
        { key: "running_balance", label: "Running Balance" },
      ],
      `cashflow_ledger_${granularity}`,
    );
  };

  const handleExportPDF = () => {
    const accountLabel =
      accountFilter === "All Accounts"
        ? "All cash accounts"
        : (accounts.find((a) => a.code === accountFilter)
            ? `${accountFilter} — ${accounts.find((a) => a.code === accountFilter)!.name}`
            : accountFilter);
    const periodLabel =
      (fromDate || "—") + " → " + (toDate || new Date().toISOString().slice(0, 10));
    generateLedgerCashflowPDF({
      periodLabel,
      granularity: granularity.charAt(0).toUpperCase() + granularity.slice(1),
      venueLabel: venueFilter,
      accountLabel,
      totals,
      buckets,
      byAccount: byAccount.map((a) => ({
        label: `${a.code} — ${a.name}`,
        cashIn: a.cashIn,
        cashOut: a.cashOut,
        net: a.net,
      })),
      bySource: bySource.map((s) => ({
        label: SOURCE_LABELS[s.source] || s.source,
        cashIn: s.cashIn,
        cashOut: s.cashOut,
        net: s.net,
      })),
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Cashflow (Ledger)</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Derived from posted journal entries hitting cash accounts — always agrees with the Trial Balance and Balance Sheet.
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
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-40" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-40" />
          <Select value={venueFilter} onValueChange={setVenueFilter}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All Venues">All Venues</SelectItem>
              {CASHFLOW_VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-[210px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All Accounts">All Cash Accounts</SelectItem>
              {accounts.map((a) => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <FileDown className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button size="sm" onClick={handleExportPDF}>
            <FileDown className="h-4 w-4 mr-1" /> Download PDF
          </Button>
        </div>
      </header>

      <Card className="card-glass p-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Only accounts flagged as <span className="font-mono">is_cash</span> in the Chart of Accounts are included. Merchant
          receivables (Visa, Mastercard, etc.) are <em>not</em> cash until settlement. Compare against the {" "}
          <Link to="/finance/cashflow" className="text-primary underline">operations-based Cashflow</Link> to spot reconciliation gaps.
        </p>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard icon={<Wallet className="h-5 w-5 text-muted-foreground" />} label="Opening Cash" value={fmtMoney(totals.opening)} loading={loading} />
        <KPICard icon={<ArrowUpCircle className="h-5 w-5 text-primary" />} label="Cash In" value={fmtMoney(totals.cashIn)} loading={loading} />
        <KPICard icon={<ArrowDownCircle className="h-5 w-5 text-destructive" />} label="Cash Out" value={fmtMoney(totals.cashOut)} loading={loading} />
        <KPICard icon={<TrendingUp className="h-5 w-5 text-info" />} label="Net Movement" value={fmtMoney(totals.net)} highlight={totals.net >= 0 ? "positive" : "negative"} loading={loading} />
        <KPICard icon={<Wallet className="h-5 w-5 text-warning" />} label="Closing Cash" value={fmtMoney(totals.closing)} loading={loading} />
      </div>

      {/* Chart */}
      <Card className="card-glass p-4">
        <h2 className="text-lg font-semibold mb-3">Cash movements over time</h2>
        {loading ? (
          <div className="h-[320px] w-full rounded-md bg-muted/30 animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-muted-foreground">No cash activity in the selected range.</div>
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
              <Bar dataKey="Cash In" stackId="cf" fill="hsl(var(--primary))" />
              <Bar dataKey="Cash Out" stackId="cf" fill="hsl(var(--destructive))" />
              <Line type="monotone" dataKey="Net" stroke="hsl(var(--info))" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Balance" stroke="hsl(var(--warning))" strokeWidth={2} strokeDasharray="4 4" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Period table */}
      <Card className="card-glass p-4">
        <h2 className="text-lg font-semibold mb-3">Period breakdown</h2>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Cash In</TableHead>
                <TableHead className="text-right">Cash Out</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}><div className="h-3 bg-muted/30 rounded animate-pulse" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : buckets.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
              ) : buckets.map((b) => (
                <TableRow key={b.key}>
                  <TableCell className="font-medium">{b.label}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap text-primary">{fmtMono(b.inflows)}</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap text-destructive">({fmtMono(b.outflows)})</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${b.net >= 0 ? "text-foreground" : "text-destructive"}`}>{fmtMono(b.net)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMono(b.runningBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {buckets.length > 0 && !loading && (
              <tfoot className="border-t-2 border-double border-foreground/40">
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-primary">{fmtMono(totals.cashIn)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold text-destructive">({fmtMono(totals.cashOut)})</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{fmtMono(totals.net)}</TableCell>
                  <TableCell className="text-right tabular-nums font-bold">{fmtMono(totals.closing)}</TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
      </Card>

      {/* By account + by source */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="card-glass p-4">
          <h2 className="text-lg font-semibold mb-3">By cash account</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byAccount.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No activity</TableCell></TableRow>}
              {byAccount.map((a) => (
                <TableRow key={a.code}>
                  <TableCell><span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{fmtMono(a.cashIn)}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">({fmtMono(a.cashOut)})</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${a.net >= 0 ? "" : "text-destructive"}`}>{fmtMono(a.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <Card className="card-glass p-4">
          <h2 className="text-lg font-semibold mb-3">By source</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bySource.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">No activity</TableCell></TableRow>}
              {bySource.map((s) => (
                <TableRow key={s.source}>
                  <TableCell>{SOURCE_LABELS[s.source] || s.source}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{fmtMono(s.cashIn)}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">({fmtMono(s.cashOut)})</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${s.net >= 0 ? "" : "text-destructive"}`}>{fmtMono(s.net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Recent journal lines */}
      <Card className="card-glass p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent cash journal lines</h2>
          <Link to="/finance/journal" className="text-xs text-primary inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" /> View Journal
          </Link>
        </div>
        <div className="overflow-auto max-h-[480px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="text-right">Debit (In)</TableHead>
                <TableHead className="text-right">Credit (Out)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No journal lines.</TableCell></TableRow>}
              {recent.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{r.entry_date}</TableCell>
                  <TableCell><span className="text-xs px-1.5 py-0.5 rounded bg-muted">{r.source_type}</span></TableCell>
                  <TableCell className="text-xs"><span className="font-mono text-muted-foreground">{r.account_code}</span> {r.account_name}</TableCell>
                  <TableCell className="text-xs">{r.venue || "—"}</TableCell>
                  <TableCell className="text-sm">{r.memo}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{r.cash_in ? fmtMono(r.cash_in) : ""}</TableCell>
                  <TableCell className="text-right tabular-nums text-destructive">{r.cash_out ? fmtMono(r.cash_out) : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function KPICard({
  icon, label, value, highlight, loading,
}: {
  icon: React.ReactNode; label: string; value: string; highlight?: "positive" | "negative"; loading?: boolean;
}) {
  const color = highlight === "negative" ? "text-destructive" : highlight === "positive" ? "text-primary" : "text-foreground";
  return (
    <Card className="card-glass p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}<span className="truncate">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-28 bg-muted/40 rounded animate-pulse" />
      ) : (
        <div className={`text-xl md:text-2xl font-semibold tabular-nums truncate ${color}`}>{value}</div>
      )}
    </Card>
  );
}
