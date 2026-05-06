import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Scale,
  Receipt,
  ArrowRight,
  BookText,
} from "lucide-react";

const fmtCurrency = (n: number) =>
  `HK$ ${n.toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtSigned = (n: number) =>
  `${n < 0 ? "-" : ""}HK$ ${Math.abs(n).toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface PLRow {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  entry_date: string;
  year: number;
  month: number;
  amount: number;
}
interface BSRow {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  entry_date: string;
  amount: number;
}
interface CashRow {
  entry_date: string;
  account_code: string;
  account_name: string;
  cash_in: number;
  cash_out: number;
  net_cash: number;
  venue: string | null;
}
interface CoA {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_cash: boolean;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function FinanceDashboard() {
  const today = new Date();
  const asOf = today.toISOString().slice(0, 10);
  const ymStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const yStart = `${today.getFullYear()}-01-01`;

  const [pl, setPl] = useState<PLRow[]>([]);
  const [bs, setBs] = useState<BSRow[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [coa, setCoa] = useState<CoA[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [plRows, bsRows, cashRows, coaRes] = await Promise.all([
        fetchAllRows("v_pl", "account_id,code,name,account_type,entry_date,year,month,amount"),
        fetchAllRows("v_balance_sheet", "account_id,code,name,account_type,entry_date,amount"),
        fetchAllRows("v_cash_movements", "entry_date,account_code,account_name,cash_in,cash_out,net_cash,venue"),
        supabase.from("chart_of_accounts" as any).select("id,code,name,account_type,is_cash"),
      ]);
      if (cancelled) return;
      setPl(plRows as unknown as PLRow[]);
      setBs(bsRows as unknown as BSRow[]);
      setCash(cashRows as unknown as CashRow[]);
      setCoa(((coaRes.data as any[]) || []) as CoA[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ===== KPIs =====
  const kpis = useMemo(() => {
    // Profit & Loss convention: revenue = credit-normal (amount positive = credit). For income statements,
    // revenue should be shown positive, expenses positive. v_pl `amount` is debit - credit per line.
    // Income accounts are credit-normal so amount is typically negative -> revenue = -amount.
    // Expense accounts are debit-normal so amount is positive.
    const sumByType = (rows: PLRow[]) => {
      let revenue = 0;
      let cogs = 0;
      let opex = 0;
      let other = 0;
      for (const r of rows) {
        const t = (r.account_type || "").toLowerCase();
        const a = Number(r.amount) || 0;
        if (t === "income" || t === "revenue") revenue += -a;
        else if (t === "cogs" || t === "cost of goods sold" || t === "cost_of_sales") cogs += a;
        else if (t === "expense" || t === "operating expense" || t === "operating_expense") opex += a;
        else if (t.includes("expense")) other += a;
      }
      return { revenue, cogs, opex, other, gross: revenue - cogs, net: revenue - cogs - opex - other };
    };

    const mtd = sumByType(pl.filter((r) => r.entry_date >= ymStart && r.entry_date <= asOf));
    const ytd = sumByType(pl.filter((r) => r.entry_date >= yStart && r.entry_date <= asOf));

    // Cash position: from BS rows where account is cash
    const cashIds = new Set(coa.filter((c) => c.is_cash).map((c) => c.id));
    let cashPosition = 0;
    for (const r of bs) {
      if (cashIds.has(r.account_id) && r.entry_date <= asOf) cashPosition += Number(r.amount) || 0;
    }

    // AR / AP from BS by account_type
    let ar = 0;
    let ap = 0;
    for (const r of bs) {
      if (r.entry_date > asOf) continue;
      const t = (r.account_type || "").toLowerCase();
      if (t.includes("receivable") || /^11/.test(r.code || "")) {
        // Account receivable codes typically 11xx; tolerate
      }
      if (t === "accounts_receivable" || t === "receivable" || /^113/.test(r.code || "")) ar += Number(r.amount) || 0;
      if (t === "accounts_payable" || t === "payable" || /^21/.test(r.code || "")) ap += -Number(r.amount) || 0;
    }

    // Totals from BS
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    for (const r of bs) {
      if (r.entry_date > asOf) continue;
      const t = (r.account_type || "").toLowerCase();
      const a = Number(r.amount) || 0;
      if (t === "asset") assets += a;
      else if (t === "liability") liabilities += -a;
      else if (t === "equity") equity += -a;
    }

    return { mtd, ytd, cashPosition, ar, ap, assets, liabilities, equity };
  }, [pl, bs, coa, asOf, ymStart, yStart]);

  // ===== 12-month cashflow trend =====
  const cashTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; inflow: number; outflow: number; net: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, inflow: 0, outflow: 0, net: 0 });
    }
    for (const c of cash) {
      const key = c.entry_date.slice(0, 7);
      const b = buckets.get(key);
      if (!b) continue;
      b.inflow += Number(c.cash_in) || 0;
      b.outflow += Number(c.cash_out) || 0;
      b.net = b.inflow - b.outflow;
    }
    return [...buckets.values()];
  }, [cash]);

  // ===== Revenue vs Expenses (last 6 months) =====
  const revVsExp = useMemo(() => {
    const buckets = new Map<string, { label: string; revenue: number; expense: number }>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, revenue: 0, expense: 0 });
    }
    for (const r of pl) {
      const key = r.entry_date.slice(0, 7);
      const b = buckets.get(key);
      if (!b) continue;
      const t = (r.account_type || "").toLowerCase();
      const a = Number(r.amount) || 0;
      if (t === "income" || t === "revenue") b.revenue += -a;
      else if (t.includes("expense") || t.includes("cogs") || t.includes("cost")) b.expense += a;
    }
    return [...buckets.values()];
  }, [pl]);

  // ===== Top expense accounts MTD =====
  const topExpenses = useMemo(() => {
    const m = new Map<string, { name: string; code: string; amount: number }>();
    for (const r of pl) {
      if (r.entry_date < ymStart || r.entry_date > asOf) continue;
      const t = (r.account_type || "").toLowerCase();
      if (!(t.includes("expense") || t.includes("cogs") || t.includes("cost"))) continue;
      const cur = m.get(r.account_id) || { name: r.name, code: r.code, amount: 0 };
      cur.amount += Number(r.amount) || 0;
      m.set(r.account_id, cur);
    }
    return [...m.values()].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 8);
  }, [pl, ymStart, asOf]);

  // ===== Cash account balances =====
  const cashAccounts = useMemo(() => {
    const cashIds = new Set(coa.filter((c) => c.is_cash).map((c) => c.id));
    const m = new Map<string, { code: string; name: string; balance: number }>();
    for (const r of bs) {
      if (!cashIds.has(r.account_id) || r.entry_date > asOf) continue;
      const cur = m.get(r.account_id) || { code: r.code, name: r.name, balance: 0 };
      cur.balance += Number(r.amount) || 0;
      m.set(r.account_id, cur);
    }
    return [...m.values()].sort((a, b) => b.balance - a.balance);
  }, [bs, coa, asOf]);

  return (
    <div className="p-6 space-y-6 max-w-[1920px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display tracking-tight">Finance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">As of {asOf}</p>
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Cash Position"
          value={fmtCurrency(kpis.cashPosition)}
          accent="emerald"
          to="/finance/cashflow-report"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Revenue (MTD)"
          value={fmtCurrency(kpis.mtd.revenue)}
          sub={`YTD ${fmtCurrency(kpis.ytd.revenue)}`}
          accent="sky"
          to="/finance/pl-ledger"
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Net Profit (MTD)"
          value={fmtSigned(kpis.mtd.net)}
          sub={`YTD ${fmtSigned(kpis.ytd.net)}`}
          accent={kpis.mtd.net >= 0 ? "emerald" : "rose"}
          to="/finance/pl-ledger"
        />
        <KpiCard
          icon={<Scale className="h-4 w-4" />}
          label="Total Equity"
          value={fmtCurrency(kpis.equity)}
          sub={`Assets ${fmtCurrency(kpis.assets)} • Liab ${fmtCurrency(kpis.liabilities)}`}
          accent="violet"
          to="/finance/balance-sheet"
        />
      </div>

      {/* AR/AP row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Accounts Receivable"
          value={fmtCurrency(kpis.ar)}
          accent="sky"
          to="/finance/receivables"
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Accounts Payable"
          value={fmtCurrency(kpis.ap)}
          accent="amber"
          to="/finance/payables"
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="COGS (MTD)"
          value={fmtCurrency(kpis.mtd.cogs)}
          sub={`Gross ${fmtSigned(kpis.mtd.gross)}`}
          accent="amber"
          to="/finance/pl-ledger"
        />
        <KpiCard
          icon={<BookText className="h-4 w-4" />}
          label="OpEx (MTD)"
          value={fmtCurrency(kpis.mtd.opex)}
          sub={`Other Exp ${fmtCurrency(kpis.mtd.other)}`}
          accent="rose"
          to="/finance/pl-ledger"
        />
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg">Cashflow trend (12 months)</h3>
            <Link to="/finance/cashflow-report" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: any) => fmtCurrency(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="inflow" name="Inflow" fill="hsl(152 76% 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="Outflow" fill="hsl(0 70% 60%)" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="net" stroke="hsl(199 90% 55%)" strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="card-glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg">Revenue vs Expenses (6 months)</h3>
            <Link to="/finance/pl-ledger" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revVsExp} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: any) => fmtCurrency(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(152 76% 50%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expense" name="Expenses" stroke="hsl(0 70% 60%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* DETAIL TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="card-glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg">Cash accounts</h3>
            <Link to="/finance/trial-balance" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Trial Balance <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-20">Code</th>
                  <th className="text-left font-medium px-3 py-2">Account</th>
                  <th className="text-right font-medium px-3 py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : cashAccounts.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No cash accounts.</td></tr>
                ) : cashAccounts.map((a) => (
                  <tr key={a.code} className="border-t border-border/30">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 text-right td-num">{fmtCurrency(a.balance)}</td>
                  </tr>
                ))}
                {cashAccounts.length > 0 && (
                  <tr className="border-t border-border/60 bg-muted/20 font-medium">
                    <td colSpan={2} className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right td-num">{fmtCurrency(cashAccounts.reduce((s, a) => s + a.balance, 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="card-glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg">Top expenses (MTD)</h3>
            <Link to="/finance/pl-ledger" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              P&L <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/40">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-20">Code</th>
                  <th className="text-left font-medium px-3 py-2">Account</th>
                  <th className="text-right font-medium px-3 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
                ) : topExpenses.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No expense activity this month.</td></tr>
                ) : topExpenses.map((a) => (
                  <tr key={a.code} className="border-t border-border/30">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 text-right td-num">{fmtCurrency(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent = "emerald",
  to,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "emerald" | "sky" | "amber" | "rose" | "violet";
  to?: string;
}) {
  const accentMap: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    sky: "text-sky-400 bg-sky-500/10",
    amber: "text-amber-400 bg-amber-500/10",
    rose: "text-rose-400 bg-rose-500/10",
    violet: "text-violet-400 bg-violet-500/10",
  };
  const Inner = (
    <Card className="card-glass p-4 hover:border-border transition-colors h-full min-w-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className={`p-1.5 rounded-md ${accentMap[accent]}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="font-display text-2xl td-num truncate">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to} className="block">{Inner}</Link> : Inner;
}
