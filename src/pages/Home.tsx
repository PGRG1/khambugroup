import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  Receipt,
  PiggyBank,
  Users,
  UtensilsCrossed,
  ArrowRight,
  AlertTriangle,
  Sparkles,
  FileText,
  ChevronRight,
  Plus,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useVenues } from "@/hooks/useVenues";
import { useNavigate } from "react-router-dom";

const fmtMoney = (n: number) =>
  `HK$ ${Math.round(n).toLocaleString("en-HK")}`;
const fmtPct = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-HK", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

type DateRangeKey = "today" | "wtd" | "mtd" | "qtd" | "ytd";

function getRange(key: DateRangeKey): { from: string; to: string; label: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from = to;
  switch (key) {
    case "today":
      from = to;
      break;
    case "wtd": {
      const d = new Date(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - (day - 1));
      from = d.toISOString().slice(0, 10);
      break;
    }
    case "mtd":
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      break;
    case "qtd": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      from = `${now.getFullYear()}-${String(q + 1).padStart(2, "0")}-01`;
      break;
    }
    case "ytd":
      from = `${now.getFullYear()}-01-01`;
      break;
  }
  return { from, to, label: key.toUpperCase() };
}

function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.max(1, Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1);
  const prevTo = new Date(f);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  };
}

// ----- Sparkline -----
function Sparkline({
  data,
  color = "hsl(var(--primary))",
}: {
  data: { v: number }[];
  color?: string;
}) {
  if (!data.length) return <div className="h-10" />;
  return (
    <div className="h-10 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill="url(#sparkfill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ----- KPI Card -----
function KpiCard({
  label,
  value,
  delta,
  sub,
  spark,
  to,
  accent = "primary",
}: {
  label: string;
  value: string;
  delta?: { value: number; label?: string } | null;
  sub?: string;
  spark?: { v: number }[];
  to?: string;
  accent?: "primary" | "success" | "warning" | "info" | "destructive";
}) {
  const accentVar =
    accent === "success"
      ? "hsl(var(--success))"
      : accent === "warning"
      ? "hsl(var(--warning))"
      : accent === "info"
      ? "hsl(var(--info))"
      : accent === "destructive"
      ? "hsl(var(--destructive))"
      : "hsl(var(--primary))";
  const positive = delta == null ? null : delta.value >= 0;
  const Inner = (
    <Card className="p-5 hover:shadow-md transition-all h-full bg-card border-border/60">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-2xl mt-1.5 truncate text-foreground">{value}</div>
          {sub && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>
          )}
        </div>
        {delta && (
          <div
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
              positive
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {fmtPct(delta.value)} {delta.label ? <span className="font-normal opacity-80">{delta.label}</span> : null}
          </div>
        )}
      </div>
      {spark && spark.length > 1 && <Sparkline data={spark} color={accentVar} />}
    </Card>
  );
  return to ? (
    <Link to={to} className="block h-full">
      {Inner}
    </Link>
  ) : (
    Inner
  );
}

// ----- Page -----
type Priority = {
  id: string;
  title: string;
  context: string;
  amount?: number;
  severity: "high" | "med" | "low";
  to: string;
};

export default function Home() {
  const navigate = useNavigate();
  const { venues } = useVenues();
  const [venueId, setVenueId] = useState<string>("all");
  const [rangeKey, setRangeKey] = useState<DateRangeKey>("mtd");
  const range = useMemo(() => getRange(rangeKey), [rangeKey]);
  const prev = useMemo(() => previousRange(range.from, range.to), [range]);

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [bankTxns, setBankTxns] = useState<any[]>([]);
  const [coa, setCoa] = useState<any[]>([]);
  const [pl, setPl] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const last60 = new Date();
      last60.setDate(last60.getDate() - 60);
      const last60Str = last60.toISOString().slice(0, 10);
      try {
        const [salesRows, billsRows, bankRows, coaRes, plRows, auditRes, invRes] = await Promise.all([
          fetchAllRows("sales_records", "id,date,venue,total_sales,subtotal,service_charge,discounts", {
            col: "date",
            asc: false,
          }).catch(() => []),
          fetchAllRows("expense_bills", "*", { col: "bill_date", asc: false }).catch(() => []),
          fetchAllRows("bank_transactions", "id,txn_date,amount,direction,description,account_id,classification", {
            col: "txn_date",
            asc: false,
          }).catch(() => []),
          supabase.from("chart_of_accounts" as any).select("id,code,name,account_type,is_cash"),
          fetchAllRows(
            "v_pl",
            "account_id,code,name,account_type,entry_date,amount"
          ).catch(() => []),
          supabase
            .from("audit_log")
            .select("id,action,entity_type,user_display_name,created_at,details")
            .order("created_at", { ascending: false })
            .limit(15),
          supabase
            .from("invoices")
            .select("id,invoice_number,supplier_name,total_amount,status,invoice_date")
            .order("invoice_date", { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;
        setSales(salesRows as any[]);
        setBills(billsRows as any[]);
        setBankTxns(bankRows as any[]);
        setCoa(((coaRes.data as any[]) || []) as any[]);
        setPl(plRows as any[]);
        setActivity(((auditRes.data as any[]) || []) as any[]);
        setInvoices(((invRes.data as any[]) || []) as any[]);
      } catch (e) {
        console.error("Home load error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ----- Sales / Revenue
  const venueFilter = (v: string | null | undefined) =>
    venueId === "all" || (v && v.toLowerCase() === venueNameOf(venueId).toLowerCase());

  function venueNameOf(id: string) {
    return venues.find((v) => v.id === id)?.name || "";
  }

  const salesInRange = useMemo(
    () =>
      sales.filter(
        (s) => s.date >= range.from && s.date <= range.to && venueFilter(s.venue)
      ),
    [sales, range, venueId]
  );
  const salesPrev = useMemo(
    () =>
      sales.filter(
        (s) => s.date >= prev.from && s.date <= prev.to && venueFilter(s.venue)
      ),
    [sales, prev, venueId]
  );

  const revenueCurrent = salesInRange.reduce((a, s) => a + (Number(s.total_sales) || 0), 0);
  const revenuePrev = salesPrev.reduce((a, s) => a + (Number(s.total_sales) || 0), 0);
  const revenueDelta = revenuePrev ? ((revenueCurrent - revenuePrev) / revenuePrev) * 100 : 0;

  // Revenue trend (daily within range)
  const revenueTrend = useMemo(() => {
    const map = new Map<string, number>();
    salesInRange.forEach((s) => {
      map.set(s.date, (map.get(s.date) || 0) + (Number(s.total_sales) || 0));
    });
    const out: { date: string; revenue: number; target: number }[] = [];
    const start = new Date(range.from);
    const end = new Date(range.to);
    // Estimate a flat target based on prev-month daily avg
    const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const target = (revenuePrev || revenueCurrent) / Math.max(1, dayCount);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      out.push({ date: k.slice(5), revenue: map.get(k) || 0, target });
    }
    return out;
  }, [salesInRange, range, revenuePrev, revenueCurrent]);

  const revenueSpark = useMemo(
    () => revenueTrend.slice(-14).map((d) => ({ v: d.revenue })),
    [revenueTrend]
  );

  // ----- P&L derived
  const plInRange = useMemo(
    () => pl.filter((r) => r.entry_date >= range.from && r.entry_date <= range.to),
    [pl, range]
  );
  const plPrev = useMemo(
    () => pl.filter((r) => r.entry_date >= prev.from && r.entry_date <= prev.to),
    [pl, prev]
  );
  const sumPL = (rows: any[]) => {
    let revenue = 0,
      cogs = 0,
      opex = 0;
    for (const r of rows) {
      const t = (r.account_type || "").toLowerCase();
      const a = Number(r.amount) || 0;
      if (t === "income" || t === "revenue") revenue += -a;
      else if (t.includes("cogs") || t.includes("cost_of") || t === "cost of goods sold") cogs += a;
      else if (t.includes("expense")) opex += a;
    }
    return { revenue, cogs, opex, gross: revenue - cogs, op: revenue - cogs - opex };
  };
  const plCur = useMemo(() => sumPL(plInRange), [plInRange]);
  const plPrv = useMemo(() => sumPL(plPrev), [plPrev]);
  const gmCur = plCur.revenue ? (plCur.gross / plCur.revenue) * 100 : 0;
  const gmPrv = plPrv.revenue ? (plPrv.gross / plPrv.revenue) * 100 : 0;
  const omCur = plCur.revenue ? (plCur.op / plCur.revenue) * 100 : 0;

  // ----- Cash
  const cashIds = new Set(coa.filter((c) => c.is_cash).map((c) => c.id));
  const bankAccountsCount = cashIds.size;
  const cashInBank = useMemo(() => {
    // Use bank_transactions running sum as proxy
    let total = 0;
    bankTxns.forEach((t) => {
      const amt = Number(t.amount) || 0;
      total += t.direction === "out" ? -amt : amt;
    });
    return total;
  }, [bankTxns]);
  const lastBankUpdate = bankTxns[0]?.txn_date || null;

  const operatingCashMtd = useMemo(() => {
    return bankTxns
      .filter((t) => t.txn_date >= range.from && t.txn_date <= range.to)
      .reduce((a, t) => {
        const amt = Number(t.amount) || 0;
        return a + (t.direction === "out" ? -amt : amt);
      }, 0);
  }, [bankTxns, range]);

  // ----- Bills due
  const today = new Date().toISOString().slice(0, 10);
  const unpaidBills = useMemo(
    () => bills.filter((b) => b.status !== "paid" && b.status !== "void"),
    [bills]
  );
  const totalDue = unpaidBills.reduce((a, b) => a + (Number(b.total_amount) || 0), 0);
  const overdue = unpaidBills.filter((b) => b.due_date && b.due_date < today);
  const nextPayable = unpaidBills
    .filter((b) => b.due_date && b.due_date >= today)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0];

  const expensesInRange = useMemo(
    () => bills.filter((b) => b.bill_date >= range.from && b.bill_date <= range.to),
    [bills, range]
  );
  const expensesTotal = expensesInRange.reduce(
    (a, b) => a + (Number(b.total_amount) || 0),
    0
  );
  const bankDetectedExpenses = useMemo(
    () =>
      bankTxns.filter(
        (t) =>
          t.txn_date >= range.from &&
          t.txn_date <= range.to &&
          t.direction === "out" &&
          (t.classification === "expense" || /(fee|charge|penalty|interest)/i.test(t.description || ""))
      ),
    [bankTxns, range]
  );
  const bankDetectedTotal = bankDetectedExpenses.reduce(
    (a, t) => a + Math.abs(Number(t.amount) || 0),
    0
  );
  const avoidableCost = bankDetectedExpenses
    .filter((t) => /(late|penalty|fee|charge|interest)/i.test(t.description || ""))
    .reduce((a, t) => a + Math.abs(Number(t.amount) || 0), 0);

  // ----- Labour cost / food cost (rough proxies from PL)
  const labourCurrent = useMemo(() => {
    return plInRange
      .filter((r) => /(payroll|salary|wage|labor|labour)/i.test(r.name || ""))
      .reduce((a, r) => a + (Number(r.amount) || 0), 0);
  }, [plInRange]);
  const labourPct = plCur.revenue ? (labourCurrent / plCur.revenue) * 100 : 0;
  const labourTarget = 28;
  const foodCostPct = plCur.revenue ? (plCur.cogs / plCur.revenue) * 100 : 0;
  const foodTarget = 32;

  // ----- Today's Priorities
  const priorities = useMemo<Priority[]>(() => {
    const list: Priority[] = [];
    invoices
      .filter((i) => i.status === "pending_review")
      .slice(0, 3)
      .forEach((i) =>
        list.push({
          id: `inv-${i.id}`,
          title: `Invoice ${i.invoice_number || "—"} pending review`,
          context: i.supplier_name || "Supplier",
          amount: Number(i.total_amount) || 0,
          severity: "med",
          to: "/procurement/invoices",
        })
      );
    overdue.slice(0, 4).forEach((b) =>
      list.push({
        id: `bill-${b.id}`,
        title: `Overdue bill — ${b.vendor_name || "Vendor"}`,
        context: `Due ${b.due_date}`,
        amount: Number(b.total_amount) || 0,
        severity: "high",
        to: "/expenses/bills",
      })
    );
    if (bankDetectedExpenses.length) {
      list.push({
        id: "bank-detected",
        title: `${bankDetectedExpenses.length} bank-detected expenses`,
        context: "Review and post to expense",
        amount: bankDetectedTotal,
        severity: "med",
        to: "/expenses/bank-detected",
      });
    }
    if (labourPct > labourTarget + 2) {
      list.push({
        id: "labour",
        title: "Labour cost above target",
        context: `${labourPct.toFixed(1)}% vs ${labourTarget}% target`,
        severity: "high",
        to: "/hr/payroll",
      });
    }
    if (foodCostPct > foodTarget + 2) {
      list.push({
        id: "food",
        title: "Food cost above target",
        context: `${foodCostPct.toFixed(1)}% vs ${foodTarget}% target`,
        severity: "med",
        to: "/procurement/inventory",
      });
    }
    return list.slice(0, 8);
  }, [invoices, overdue, bankDetectedExpenses, bankDetectedTotal, labourPct, foodCostPct]);

  // ----- AI Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (plCur.revenue) {
      if (revenueDelta !== 0)
        out.push(
          `Revenue is tracking ${fmtPct(revenueDelta)} vs the previous comparable period.`
        );
      const gmDelta = gmCur - gmPrv;
      if (Math.abs(gmDelta) >= 0.5)
        out.push(
          `Gross margin ${gmDelta >= 0 ? "improved" : "fell"} by ${Math.abs(gmDelta).toFixed(
            1
          )}pp vs last period (${gmCur.toFixed(1)}%).`
        );
    }
    if (labourPct && labourPct > labourTarget)
      out.push(
        `Labour cost is ${(labourPct - labourTarget).toFixed(1)}pp above target.`
      );
    if (avoidableCost > 0)
      out.push(`Avoidable charges of ${fmtMoney(avoidableCost)} detected this period.`);
    if (overdue.length)
      out.push(`${overdue.length} bills are overdue — ${fmtMoney(overdue.reduce((a, b) => a + (Number(b.total_amount) || 0), 0))} total.`);
    if (!out.length) out.push("No critical signals detected. Operations look healthy.");
    return out.slice(0, 5);
  }, [revenueDelta, gmCur, gmPrv, labourPct, avoidableCost, overdue, plCur]);

  // ----- Activity normalized
  const recentActivity = useMemo(() => {
    return activity.slice(0, 8).map((a) => ({
      id: a.id,
      who: a.user_display_name || "System",
      what: `${a.action} ${a.entity_type || ""}`.trim(),
      when: a.created_at,
    }));
  }, [activity]);

  return (
    <div className="p-6 space-y-6 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display tracking-tight text-foreground">Bani Home</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This is what's happening in your business today.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Venues</SelectItem>
              {venues
                .filter((v) => v.is_active)
                .map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as DateRangeKey)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="wtd">Week to date</SelectItem>
              <SelectItem value="mtd">Month to date</SelectItem>
              <SelectItem value="qtd">Quarter to date</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9">
                Quick actions <ChevronDown className="h-3.5 w-3.5 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/expenses/bills")}>
                Upload bill
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/expenses/statements")}>
                Upload vendor statement
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/expenses")}>
                New expense
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/procurement/invoices")}>
                Upload invoice
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/finance/payables")}>
                Record payment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="h-9" onClick={() => navigate("/pl-report")}>
            <Plus className="h-4 w-4 mr-1" /> New Report
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Revenue"
          value={fmtMoney(revenueCurrent)}
          delta={{ value: revenueDelta, label: "vs prev" }}
          sub={`Target ~ ${fmtMoney((revenuePrev || revenueCurrent) || 0)}`}
          spark={revenueSpark}
          to="/revenue"
          accent="primary"
        />
        <KpiCard
          label="Gross Profit"
          value={fmtMoney(plCur.gross)}
          delta={
            plPrv.gross
              ? { value: ((plCur.gross - plPrv.gross) / Math.abs(plPrv.gross)) * 100 }
              : null
          }
          sub={`Margin ${gmCur.toFixed(1)}%`}
          to="/finance/pl-ledger"
          accent="success"
        />
        <KpiCard
          label="Labour Cost %"
          value={`${labourPct.toFixed(1)}%`}
          delta={{ value: labourPct - labourTarget, label: "vs target" }}
          sub={`Target ${labourTarget}%`}
          to="/hr/payroll"
          accent={labourPct > labourTarget ? "warning" : "success"}
        />
        <KpiCard
          label="Food Cost %"
          value={`${foodCostPct.toFixed(1)}%`}
          delta={{ value: foodCostPct - foodTarget, label: "vs target" }}
          sub={`Target ${foodTarget}%`}
          to="/procurement/inventory"
          accent={foodCostPct > foodTarget ? "warning" : "success"}
        />
        <KpiCard
          label="Cash in Bank"
          value={fmtMoney(cashInBank)}
          sub={lastBankUpdate ? `Updated ${lastBankUpdate}` : "No bank data"}
          to="/finance/cashflow-report"
          accent="info"
        />
        <KpiCard
          label="Bills Due"
          value={fmtMoney(totalDue)}
          sub={`${overdue.length} overdue${nextPayable ? ` · Next ${fmtMoney(Number(nextPayable.total_amount) || 0)}` : ""}`}
          to="/expenses/bills"
          accent={overdue.length ? "destructive" : "primary"}
        />
      </div>

      {/* Today's Priorities */}
      <Card className="p-5 bg-card border-border/60">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg text-foreground">Today's Priorities</h2>
            <p className="text-xs text-muted-foreground">Actions across the business that need your attention.</p>
          </div>
          <span className="text-xs text-muted-foreground">{priorities.length} items</span>
        </div>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : priorities.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Nothing urgent. You're clear.</div>
        ) : (
          <ul className="divide-y divide-border/60">
            {priorities.map((p) => (
              <li key={p.id}>
                <Link
                  to={p.to}
                  className="flex items-center gap-3 py-3 -mx-2 px-2 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${
                      p.severity === "high"
                        ? "bg-destructive"
                        : p.severity === "med"
                        ? "bg-warning"
                        : "bg-muted-foreground"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">{p.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.context}</div>
                  </div>
                  {p.amount != null && (
                    <div className="text-sm font-mono text-foreground whitespace-nowrap">
                      {fmtMoney(p.amount)}
                    </div>
                  )}
                  <span
                    className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                      p.severity === "high"
                        ? "bg-destructive/10 text-destructive"
                        : p.severity === "med"
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.severity === "high" ? "Urgent" : p.severity === "med" ? "Review" : "Info"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Trend + Profit Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border/60 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display text-lg text-foreground">Revenue Trend</h3>
              <p className="text-xs text-muted-foreground">
                Actual vs an estimated daily target for {range.label}.
              </p>
            </div>
            <Link to="/revenue" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (v / 1000).toFixed(0) + "k"}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => fmtMoney(Number(v))}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-foreground">Profit & Margin</h3>
            <Link to="/finance/pl-ledger" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              P&L <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {[
              { label: "Revenue", value: plCur.revenue, accent: "hsl(var(--primary))" },
              { label: "COGS", value: plCur.cogs, accent: "hsl(var(--warning))" },
              { label: "Gross Profit", value: plCur.gross, accent: "hsl(var(--success))" },
              { label: "Operating Expenses", value: plCur.opex, accent: "hsl(var(--destructive))" },
              { label: "Operating Profit", value: plCur.op, accent: "hsl(var(--info))" },
            ].map((row) => {
              const max = Math.max(plCur.revenue, 1);
              const pct = Math.min(100, Math.abs((row.value / max) * 100));
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-foreground">{fmtMoney(row.value)}</span>
                  </div>
                  <div className="h-1.5 bg-muted/60 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: row.accent }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border/60">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross Margin</div>
              <div className="font-display text-lg text-foreground">{gmCur.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Operating Margin</div>
              <div className="font-display text-lg text-foreground">{omCur.toFixed(1)}%</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Three small section cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Cash Position</h3>
            <Link to="/finance/cashflow-report" className="text-xs text-primary hover:underline">
              Open
            </Link>
          </div>
          <div className="space-y-2.5 text-sm">
            <Row label="Total cash" value={fmtMoney(cashInBank)} />
            <Row label="Net cash flow (period)" value={fmtMoney(operatingCashMtd)} />
            <Row label="Bank accounts" value={String(bankAccountsCount)} />
            {lastBankUpdate && (
              <Row label="Last bank update" value={lastBankUpdate} muted />
            )}
          </div>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Expenses</h3>
            <Link to="/expenses" className="text-xs text-primary hover:underline">
              Open
            </Link>
          </div>
          <div className="space-y-2.5 text-sm">
            <Row label="Total expenses (period)" value={fmtMoney(expensesTotal)} />
            <Row
              label="Bank-detected"
              value={`${bankDetectedExpenses.length} · ${fmtMoney(bankDetectedTotal)}`}
            />
            <Row
              label="Avoidable costs"
              value={fmtMoney(avoidableCost)}
              accent={avoidableCost > 0 ? "warning" : undefined}
            />
            <Row label="Unpaid bills" value={`${unpaidBills.length} · ${fmtMoney(totalDue)}`} />
          </div>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Procurement & Inventory</h3>
            <Link to="/procurement/dashboard" className="text-xs text-primary hover:underline">
              Open
            </Link>
          </div>
          <div className="space-y-2.5 text-sm">
            <Row
              label="Invoices pending review"
              value={String(invoices.filter((i) => i.status === "pending_review").length)}
            />
            <Row
              label="Invoices last 30 days"
              value={String(
                invoices.filter((i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - 30);
                  return i.invoice_date && i.invoice_date >= d.toISOString().slice(0, 10);
                }).length
              )}
            />
            <Row label="Suppliers active" value="—" muted />
            <Row label="Low stock alerts" value="—" muted />
          </div>
        </Card>
      </div>

      {/* AI Insights + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg text-foreground">AI Insights</h3>
          </div>
          <ul className="space-y-2.5">
            {insights.map((line, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="mt-2 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Recent Activity</h3>
            <Link to="/activity-log" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No recent activity.</div>
          ) : (
            <ul className="space-y-2">
              {recentActivity.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <div className="text-foreground truncate">{a.what}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.who}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{fmtTime(a.when)}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: "warning" | "success" | "destructive";
}) {
  const accentClass =
    accent === "warning"
      ? "text-warning"
      : accent === "success"
      ? "text-success"
      : accent === "destructive"
      ? "text-destructive"
      : muted
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${accentClass}`}>{value}</span>
    </div>
  );
}
