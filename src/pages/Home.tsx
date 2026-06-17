import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  ArrowRight,
  Sparkles,
  ChevronRight,
  Plus,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useVenues } from "@/hooks/useVenues";

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

type CompareKey = "prev_month" | "last_year" | "target";

const pad = (n: number) => String(n).padStart(2, "0");
const ymKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const ymLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-HK", {
    month: "long",
    year: "numeric",
  });
};

function monthRange(ymStr: string, mtdOnly: boolean): { from: string; to: string } {
  const [y, m] = ymStr.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const now = new Date();
  const isCurrent = ymKey(now) === ymStr;
  const to = mtdOnly && isCurrent ? now : last;
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${to.getFullYear()}-${pad(to.getMonth() + 1)}-${pad(to.getDate())}`,
  };
}

function compareRange(ymStr: string, mtdOnly: boolean, compare: CompareKey) {
  const [y, m] = ymStr.split("-").map(Number);
  if (compare === "last_year") {
    return monthRange(`${y - 1}-${pad(m)}`, mtdOnly);
  }
  // prev_month (also used as proxy for "target" baseline)
  const prevDate = new Date(y, m - 2, 1);
  return monthRange(ymKey(prevDate), mtdOnly);
}

function monthOptions(count = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(ymKey(d));
  }
  return out;
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
  const months = useMemo(() => monthOptions(12), []);
  const [month, setMonth] = useState<string>(months[0]);
  const [compareKey, setCompareKey] = useState<CompareKey>("prev_month");

  const isCurrentMonth = month === months[0];
  const range = useMemo(() => {
    const r = monthRange(month, isCurrentMonth);
    return { ...r, label: isCurrentMonth ? "MTD" : ymLabel(month) };
  }, [month, isCurrentMonth]);
  const prev = useMemo(
    () => compareRange(month, isCurrentMonth, compareKey),
    [month, isCurrentMonth, compareKey]
  );
  const compareLabel =
    compareKey === "prev_month"
      ? "vs prev month"
      : compareKey === "last_year"
      ? "vs last year"
      : "vs target";

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [bankTxns, setBankTxns] = useState<any[]>([]);
  const [coa, setCoa] = useState<any[]>([]);
  const [pl, setPl] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [statements, setStatements] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [salesRows, billsRows, bankRows, coaRes, plRows, auditRes, invRes, stmtRes] = await Promise.all([
          fetchAllRows("sales_records", "id,date,venue,total_sales,subtotal,service_charge,discounts", {
            col: "date",
            asc: false,
          }).catch(() => []),
          fetchAllRows("expense_bills", "*", { col: "bill_date", asc: false }).catch(() => []),
          fetchAllRows("bank_transactions", "id,txn_date,amount,direction,description,account_id,classification,expense_posted_bill_id", {
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
            .limit(100),
          supabase
            .from("expense_vendor_statements" as any)
            .select("id,vendor_name,status,statement_date,closing_balance")
            .order("statement_date", { ascending: false })
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
        setStatements(((stmtRes.data as any[]) || []) as any[]);
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

  function venueNameOf(id: string) {
    return venues.find((v) => v.id === id)?.name || "";
  }
  const venueFilter = (v: string | null | undefined) =>
    venueId === "all" || (v && v.toLowerCase() === venueNameOf(venueId).toLowerCase());

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
  // Target ≈ prior comparable revenue (placeholder until targets module wired in)
  const revenueTarget = revenuePrev || revenueCurrent;
  const targetVariance = revenueTarget ? ((revenueCurrent - revenueTarget) / revenueTarget) * 100 : 0;

  const revenueTrend = useMemo(() => {
    const map = new Map<string, number>();
    salesInRange.forEach((s) => {
      map.set(s.date, (map.get(s.date) || 0) + (Number(s.total_sales) || 0));
    });
    const start = new Date(range.from);
    const end = new Date(range.to);
    const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    const dailyTarget = revenueTarget / Math.max(1, dayCount);
    const out: { date: string; revenue: number; target: number }[] = [];
    let cumActual = 0;
    let cumTarget = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      cumActual += map.get(k) || 0;
      cumTarget += dailyTarget;
      out.push({ date: k.slice(5), revenue: cumActual, target: cumTarget });
    }
    return out;
  }, [salesInRange, range, revenueTarget]);

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
  const grossTarget = revenueTarget * 0.65;
  const grossVariance = grossTarget ? ((plCur.gross - grossTarget) / grossTarget) * 100 : 0;

  // ----- Cash
  const cashIds = new Set(coa.filter((c) => c.is_cash).map((c) => c.id));
  const bankAccountsCount = cashIds.size;
  const cashInBank = useMemo(() => {
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
  const dueThisMonth = unpaidBills.filter(
    (b) => b.due_date && b.due_date >= range.from && b.due_date <= range.to
  );
  const dueThisMonthTotal = dueThisMonth.reduce(
    (a, b) => a + (Number(b.total_amount) || 0),
    0
  );
  const paidBillsMtd = bills.filter(
    (b) => b.status === "paid" && b.bill_date >= range.from && b.bill_date <= range.to
  );
  const paidBillsMtdTotal = paidBillsMtd.reduce(
    (a, b) => a + (Number(b.total_amount) || 0),
    0
  );
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
  const opexPctOfRevenue = revenueCurrent ? (expensesTotal / revenueCurrent) * 100 : 0;

  const bankDetectedExpenses = useMemo(
    () =>
      bankTxns.filter(
        (t) =>
          t.txn_date >= range.from &&
          t.txn_date <= range.to &&
          t.direction === "out" &&
          !t.expense_posted_bill_id &&
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

  const statementsToReview = statements.filter(
    (s) => (s.status || "").toLowerCase() === "pending" || (s.status || "").toLowerCase() === "review"
  );

  // ----- Labour cost / food cost
  const labourCurrent = useMemo(() => {
    return plInRange
      .filter((r) => /(payroll|salary|wage|labor|labour)/i.test(r.name || ""))
      .reduce((a, r) => a + (Number(r.amount) || 0), 0);
  }, [plInRange]);
  const labourPct = plCur.revenue ? (labourCurrent / plCur.revenue) * 100 : 0;
  const labourTarget = 28;
  const foodCostPct = plCur.revenue ? (plCur.cogs / plCur.revenue) * 100 : 0;
  const foodTarget = 32;

  // ----- MTD Priorities
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
    statementsToReview.slice(0, 2).forEach((s) =>
      list.push({
        id: `stmt-${s.id}`,
        title: `Vendor statement needs review — ${s.vendor_name || "Vendor"}`,
        context: `Statement ${s.statement_date || ""}`,
        amount: Number(s.closing_balance) || 0,
        severity: "med",
        to: "/expenses/statements",
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
        title: `${bankDetectedExpenses.length} bank-detected expenses need classification`,
        context: "Review and post to expense",
        amount: bankDetectedTotal,
        severity: "med",
        to: "/expenses/bank-detected",
      });
    }
    if (avoidableCost > 0) {
      list.push({
        id: "avoidable",
        title: "Late fees / penalties detected this month",
        context: "Investigate avoidable charges",
        amount: avoidableCost,
        severity: "high",
        to: "/expenses/bank-detected",
      });
    }
    if (labourPct > labourTarget + 1) {
      list.push({
        id: "labour",
        title: "Labour cost above target",
        context: `${labourPct.toFixed(1)}% vs ${labourTarget}% target`,
        severity: "high",
        to: "/hr/payroll",
      });
    }
    if (foodCostPct > foodTarget + 1) {
      list.push({
        id: "food",
        title: "Food cost above target",
        context: `${foodCostPct.toFixed(1)}% vs ${foodTarget}% target`,
        severity: "med",
        to: "/procurement/inventory",
      });
    }
    return list.slice(0, 10);
  }, [invoices, overdue, bankDetectedExpenses, bankDetectedTotal, avoidableCost, labourPct, foodCostPct, statementsToReview]);

  // ----- AI Insights
  const insights = useMemo(() => {
    const out: string[] = [];
    if (revenueTarget) {
      out.push(
        `Revenue is tracking ${fmtPct(targetVariance)} ${
          targetVariance >= 0 ? "above" : "below"
        } target this month.`
      );
    }
    if (plCur.revenue) {
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
    if (foodCostPct && foodCostPct < foodTarget)
      out.push(`Food cost is ${(foodTarget - foodCostPct).toFixed(1)}pp below target.`);
    if (avoidableCost > 0)
      out.push(`Avoidable charges of ${fmtMoney(avoidableCost)} detected this month.`);
    if (bankDetectedExpenses.length)
      out.push(`${bankDetectedExpenses.length} bank charges auto-detected and need review.`);
    if (overdue.length)
      out.push(`${overdue.length} bills are overdue — ${fmtMoney(overdue.reduce((a, b) => a + (Number(b.total_amount) || 0), 0))} total.`);
    if (!out.length) out.push("No critical signals detected. Operations look healthy.");
    return out.slice(0, 6);
  }, [targetVariance, revenueTarget, gmCur, gmPrv, labourPct, foodCostPct, avoidableCost, bankDetectedExpenses, overdue, plCur]);

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
            Month-to-date view of performance, costs, cash, and actions.
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
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={m} value={m}>
                  {ymLabel(m)} {i === 0 ? "· MTD" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={compareKey} onValueChange={(v) => setCompareKey(v as CompareKey)}>
            <SelectTrigger className="w-[170px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="prev_month">Compare: Prev month</SelectItem>
              <SelectItem value="last_year">Compare: Last year</SelectItem>
              <SelectItem value="target">Compare: Target</SelectItem>
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
          label="Revenue MTD"
          value={fmtMoney(revenueCurrent)}
          delta={{ value: targetVariance, label: "vs target" }}
          sub={`Target ${fmtMoney(revenueTarget)} · ${fmtPct(revenueDelta)} ${compareLabel}`}
          spark={revenueSpark}
          to="/revenue"
          accent="primary"
        />
        <KpiCard
          label="Gross Profit MTD"
          value={fmtMoney(plCur.gross)}
          delta={
            grossTarget
              ? { value: grossVariance, label: "vs target" }
              : plPrv.gross
              ? { value: ((plCur.gross - plPrv.gross) / Math.abs(plPrv.gross)) * 100, label: compareLabel }
              : null
          }
          sub={`Margin ${gmCur.toFixed(1)}%`}
          to="/finance/pl-ledger"
          accent="success"
        />
        <KpiCard
          label="Labour Cost % MTD"
          value={`${labourPct.toFixed(1)}%`}
          delta={{ value: labourPct - labourTarget, label: "pp vs target" }}
          sub={`Target ${labourTarget}%${labourPct > labourTarget ? " · above" : ""}`}
          to="/hr/payroll"
          accent={labourPct > labourTarget ? "warning" : "success"}
        />
        <KpiCard
          label="Food Cost % MTD"
          value={`${foodCostPct.toFixed(1)}%`}
          delta={{ value: foodCostPct - foodTarget, label: "pp vs target" }}
          sub={`Target ${foodTarget}%${foodCostPct > foodTarget ? " · above" : ""}`}
          to="/procurement/inventory"
          accent={foodCostPct > foodTarget ? "warning" : "success"}
        />
        <KpiCard
          label="Operating Expenses MTD"
          value={fmtMoney(expensesTotal)}
          sub={`${opexPctOfRevenue.toFixed(1)}% of revenue · ${bankDetectedExpenses.length} bank-detected · ${fmtMoney(avoidableCost)} avoidable`}
          to="/expenses"
          accent={avoidableCost > 0 ? "warning" : "info"}
        />
        <KpiCard
          label="Cash Position"
          value={fmtMoney(cashInBank)}
          sub={`Net ${fmtMoney(operatingCashMtd)} MTD · ${dueThisMonth.length} due · ${overdue.length} overdue`}
          to="/finance/cashflow-report"
          accent={overdue.length ? "destructive" : "info"}
        />
      </div>

      {/* MTD Priorities */}
      <Card className="p-5 bg-card border-border/60">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-lg text-foreground">MTD Priorities</h2>
            <p className="text-xs text-muted-foreground">Actions to clear before month-end.</p>
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
              <h3 className="font-display text-lg text-foreground">Revenue vs Target MTD</h3>
              <p className="text-xs text-muted-foreground">
                Daily cumulative revenue vs MTD target — {range.label}.
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
                  name="Cumulative Actual"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Cumulative Target"
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
            <h3 className="font-display text-lg text-foreground">Profit & Margin MTD</h3>
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

      {/* Expenses / Procurement / Cash & Payables MTD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Expense Overview MTD</h3>
            <Link to="/expenses" className="text-xs text-primary hover:underline">
              Open
            </Link>
          </div>
          <div className="space-y-2.5 text-sm">
            <Row label="Total expenses" value={fmtMoney(expensesTotal)} />
            <Row label="Expense bills" value={`${expensesInRange.length} · ${fmtMoney(expensesTotal)}`} />
            <Row label="Vendor statements to review" value={String(statementsToReview.length)} />
            <Row
              label="Bank-detected"
              value={`${bankDetectedExpenses.length} · ${fmtMoney(bankDetectedTotal)}`}
            />
            <Row label="Recurring expenses" value="—" muted />
            <Row
              label="Avoidable (late fees, charges)"
              value={fmtMoney(avoidableCost)}
              accent={avoidableCost > 0 ? "warning" : undefined}
            />
          </div>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Procurement & Inventory MTD</h3>
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
              label="Invoices this month"
              value={String(
                invoices.filter(
                  (i) => i.invoice_date && i.invoice_date >= range.from && i.invoice_date <= range.to
                ).length
              )}
            />
            <Row label="Supplier price increases" value="—" muted />
            <Row label="Inventory variances" value="—" muted />
            <Row label="Wastage signals" value="—" muted />
            <Row label="Low stock alerts" value="—" muted />
          </div>
        </Card>

        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg text-foreground">Cash & Payables MTD</h3>
            <Link to="/finance/payables" className="text-xs text-primary hover:underline">
              Open
            </Link>
          </div>
          <div className="space-y-2.5 text-sm">
            <Row label="Cash in bank" value={fmtMoney(cashInBank)} />
            <Row label="Net cash movement" value={fmtMoney(operatingCashMtd)} />
            <Row
              label="Bills due this month"
              value={`${dueThisMonth.length} · ${fmtMoney(dueThisMonthTotal)}`}
            />
            <Row
              label="Overdue bills"
              value={`${overdue.length} · ${fmtMoney(overdue.reduce((a, b) => a + (Number(b.total_amount) || 0), 0))}`}
              accent={overdue.length ? "destructive" : undefined}
            />
            <Row label="Paid bills MTD" value={`${paidBillsMtd.length} · ${fmtMoney(paidBillsMtdTotal)}`} />
            <Row
              label="Upcoming payment"
              value={nextPayable ? `${nextPayable.due_date} · ${fmtMoney(Number(nextPayable.total_amount) || 0)}` : "—"}
              muted={!nextPayable}
            />
            <Row label="Bank accounts" value={String(bankAccountsCount)} muted />
          </div>
        </Card>
      </div>

      {/* AI Insights + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5 bg-card border-border/60">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg text-foreground">AI Insights MTD</h3>
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
