import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useUnmappedVenues } from "@/hooks/useUnmappedVenues";
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
const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

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

type Tone = "primary" | "info" | "warning" | "destructive" | "muted";
const TONE_TILE: Record<Tone, string> = {
  primary: "text-primary bg-primary/10",
  info: "text-info bg-info/10",
  warning: "text-warning bg-warning/10",
  destructive: "text-destructive bg-destructive/10",
  muted: "text-muted-foreground bg-muted",
};

export default function FinanceDashboard() {
  const today = new Date();
  const asOf = today.toISOString().slice(0, 10);
  const ymStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const yStart = `${today.getFullYear()}-01-01`;
  // Bound queries to a 13-month window (this month + trailing 12) — the dashboard
  // never displays data older than that.
  const windowStart = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    return d.toISOString().slice(0, 10);
  })();

  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { unmappedVenues, unmappedCount: unmappedVenueCount } = useUnmappedVenues();
  const [pl, setPl] = useState<PLRow[]>([]);
  const [bs, setBs] = useState<BSRow[]>([]);
  const [cash, setCash] = useState<CashRow[]>([]);
  const [coa, setCoa] = useState<CoA[]>([]);
  const [loading, setLoading] = useState(true);
  const [unpostedApproved, setUnpostedApproved] = useState<number>(0);



  useEffect(() => {
    if (tenantLoading) return;
    if (!tenantId) { setPl([]); setBs([]); setCash([]); setCoa([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [plRows, bsRows, cashRows, coaRes, invAll, jeInv] = await Promise.all([
        fetchWindowed("v_pl", "account_id,code,name,account_type,entry_date,year,month,amount", windowStart, tenantId),
        fetchWindowed("v_balance_sheet", "account_id,code,name,account_type,entry_date,amount", windowStart, tenantId),
        fetchWindowed("v_cash_movements", "entry_date,account_code,account_name,cash_in,cash_out,net_cash,venue", windowStart, tenantId),
        supabase.from("chart_of_accounts" as any).select("id,code,name,account_type,is_cash").eq("tenant_id", tenantId),
        fetchAllRows("invoices", "id, review_status", undefined, tenantId).catch(() => []),
        fetchAllRows("journal_entries", "source_id,source_type,status", undefined, tenantId).catch(() => []),
      ]);
      if (cancelled) return;
      setPl(plRows as unknown as PLRow[]);
      setBs(bsRows as unknown as BSRow[]);
      setCash(cashRows as unknown as CashRow[]);
      setCoa(((coaRes.data as any[]) || []) as CoA[]);
      const postedInvIds = new Set(
        (jeInv as any[])
          .filter((e) => e.source_type === "invoice" && e.status === "posted" && e.source_id)
          .map((e) => e.source_id as string),
      );
      const unposted = (invAll as any[]).filter(
        (i) => i.review_status === "Approved" && !postedInvIds.has(i.id)
      ).length;
      setUnpostedApproved(unposted);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [windowStart, tenantId, tenantLoading]);

  // ===== KPIs =====
  const kpis = useMemo(() => {
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

    const cashIds = new Set(coa.filter((c) => c.is_cash).map((c) => c.id));
    let cashPosition = 0;
    for (const r of bs) {
      if (cashIds.has(r.account_id) && r.entry_date <= asOf) cashPosition += Number(r.amount) || 0;
    }

    let ar = 0;
    let ap = 0;
    for (const r of bs) {
      if (r.entry_date > asOf) continue;
      const t = (r.account_type || "").toLowerCase();
      if (t === "accounts_receivable" || t === "receivable" || /^113/.test(r.code || "")) ar += Number(r.amount) || 0;
      if (t === "accounts_payable" || t === "payable" || /^21/.test(r.code || "")) ap += -Number(r.amount) || 0;
    }

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
    <div className="p-4 sm:p-6 space-y-6 max-w-[1920px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Finance Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">As of {fmtDate(asOf)}</p>
        </div>
      </div>

      {(unpostedApproved > 0 || unmappedVenueCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {unpostedApproved > 0 && (
            <Link
              to="/finance/payables"
              className="flex items-center justify-between gap-4 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm hover:border-warning/60 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-warning">
                  {unpostedApproved} approved invoice{unpostedApproved === 1 ? "" : "s"} not yet posted to the ledger
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Run "Rebuild ledger" from Journal, or fix any missing account mappings, so these invoices land in the trial balance.
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-warning shrink-0" />
            </Link>
          )}
          {unmappedVenueCount > 0 && (
            <Link
              to="/finance/chart-of-accounts?tab=revenue-mapping"
              className="flex items-center justify-between gap-4 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm hover:border-destructive/60 transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-destructive">
                  {unmappedVenueCount} venue{unmappedVenueCount === 1 ? "" : "s"} missing a revenue account mapping
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  {unmappedVenues.slice(0, 4).join(", ")}{unmappedVenues.length > 4 ? `, +${unmappedVenues.length - 4} more` : ""} — sales for these venues won't post until mapped.
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-destructive shrink-0" />
            </Link>
          )}
        </div>
      )}



      {/* KPI ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Wallet className="h-4 w-4" />}
          label="Cash Position"
          value={fmtCurrency(kpis.cashPosition)}
          tone="primary"
          to="/finance/cashflow-report"
          loading={loading}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Revenue (MTD)"
          value={fmtCurrency(kpis.mtd.revenue)}
          sub={`YTD ${fmtCurrency(kpis.ytd.revenue)}`}
          tone="info"
          to="/finance/pl-ledger"
          loading={loading}
        />
        <KpiCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Net Profit (MTD)"
          value={fmtSigned(kpis.mtd.net)}
          sub={`YTD ${fmtSigned(kpis.ytd.net)}`}
          tone={kpis.mtd.net >= 0 ? "primary" : "destructive"}
          to="/finance/pl-ledger"
          loading={loading}
        />
        <KpiCard
          icon={<Scale className="h-4 w-4" />}
          label="Total Equity"
          value={fmtCurrency(kpis.equity)}
          sub={`Assets ${fmtCurrency(kpis.assets)} · Liab ${fmtCurrency(kpis.liabilities)}`}
          tone="info"
          to="/finance/balance-sheet"
          loading={loading}
        />
      </div>

      {/* AR/AP row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="Accounts Receivable"
          value={fmtCurrency(kpis.ar)}
          tone="info"
          to="/finance/receivables"
          loading={loading}
        />
        <KpiCard
          icon={<CreditCard className="h-4 w-4" />}
          label="Accounts Payable"
          value={fmtCurrency(kpis.ap)}
          tone="warning"
          to="/finance/payables"
          loading={loading}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          label="COGS (MTD)"
          value={fmtCurrency(kpis.mtd.cogs)}
          sub={`Gross ${fmtSigned(kpis.mtd.gross)}`}
          tone="warning"
          to="/finance/pl-ledger"
          loading={loading}
        />
        <KpiCard
          icon={<BookText className="h-4 w-4" />}
          label="OpEx (MTD)"
          value={fmtCurrency(kpis.mtd.opex)}
          sub={`Other Exp ${fmtCurrency(kpis.mtd.other)}`}
          tone="destructive"
          to="/finance/pl-ledger"
          loading={loading}
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
            {loading ? (
              <div className="h-full w-full rounded-md bg-muted/30 animate-pulse" />
            ) : (
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
                  <Bar dataKey="inflow" name="Inflow" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" name="Outflow" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="net" stroke="hsl(var(--info))" strokeWidth={2} dot={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
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
            {loading ? (
              <div className="h-full w-full rounded-md bg-muted/30 animate-pulse" />
            ) : (
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
                  <Line type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expense" name="Expenses" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
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
                  <SkeletonRows cols={3} rows={4} />
                ) : cashAccounts.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No cash accounts.</td></tr>
                ) : cashAccounts.map((a) => (
                  <tr key={a.code} className="border-t border-border/30">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(a.balance)}</td>
                  </tr>
                ))}
                {!loading && cashAccounts.length > 0 && (
                  <tr className="border-t border-border/60 bg-muted/20 font-semibold">
                    <td colSpan={2} className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(cashAccounts.reduce((s, a) => s + a.balance, 0))}</td>
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
              Profit & Loss <ArrowRight className="h-3 w-3" />
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
                  <SkeletonRows cols={3} rows={5} />
                ) : topExpenses.length === 0 ? (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No expense activity this month.</td></tr>
                ) : topExpenses.map((a) => (
                  <tr key={a.code} className="border-t border-border/30">
                    <td className="px-3 py-2 font-mono text-xs">{a.code}</td>
                    <td className="px-3 py-2">{a.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCurrency(a.amount)}</td>
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

// Windowed fetch — bounds v_pl / v_balance_sheet / v_cash_movements by entry_date + tenant.
async function fetchWindowed(view: string, select: string, sinceIso: string, tenantId?: string | null): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    let q: any = (supabase.from(view as any) as any)
      .select(select)
      .gte("entry_date", sinceIso)
      .range(offset, offset + PAGE - 1);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function SkeletonRows({ cols, rows }: { cols: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-border/30">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-3 py-2">
              <div className="h-3 bg-muted/40 rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "primary",
  to,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  to?: string;
  loading?: boolean;
}) {
  const Inner = (
    <Card className="card-glass p-4 hover:border-border transition-colors h-full min-w-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        <span className={`p-1.5 rounded-md ${TONE_TILE[tone]}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <>
          <div className="h-7 w-32 bg-muted/40 rounded animate-pulse" />
          {sub !== undefined && <div className="h-3 w-24 bg-muted/30 rounded animate-pulse mt-2" />}
        </>
      ) : (
        <>
          <div className={`font-display tabular-nums whitespace-nowrap min-w-0 ${kpiValueSizeClass(value)}`} title={typeof value === "string" ? value : undefined}>{value}</div>
          {sub && <div className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</div>}
        </>
      )}
    </Card>
  );
  return to ? <Link to={to} className="block">{Inner}</Link> : Inner;
}
