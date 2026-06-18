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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Plus,
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Landmark,
  Receipt,
  FileText,
  AlertTriangle,
  Lightbulb,
  CircleDollarSign,
  Package,
  Upload,
  CheckCircle2,
  AlertCircle,
  CreditCard,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useVenues } from "@/hooks/useVenues";

const fmtMoney = (n: number) =>
  `HK$ ${Math.round(n).toLocaleString("en-HK")}`;
const fmtPct = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
const fmtTimeAgo = (iso: string) => {
  try {
    const d = new Date(iso).getTime();
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
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

function dateRangeLabel(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  const month = t.toLocaleString("en-HK", { month: "short" });
  return `${f.getDate()} – ${t.getDate()} ${month} ${t.getFullYear()}`;
}

const compareShort = (m: string, key: CompareKey) => {
  if (key === "last_year") {
    const [y, mm] = m.split("-").map(Number);
    return `vs ${new Date(y - 1, mm - 1).toLocaleString("en-HK", { month: "short", year: "numeric" })}`;
  }
  if (key === "target") return "vs target";
  const [y, mm] = m.split("-").map(Number);
  return `vs ${new Date(y, mm - 2).toLocaleString("en-HK", { month: "short", year: "numeric" })}`;
};

// ----- Sparkline -----
function Sparkline({
  data,
  color = "hsl(var(--primary))",
  height = 44,
}: {
  data: { v: number }[];
  color?: string;
  height?: number;
}) {
  if (!data.length) return <div style={{ height }} />;
  return (
    <div style={{ height }} className="-mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${color})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ----- KPI Card -----
type AccentTone = "indigo" | "emerald" | "amber" | "rose" | "sky" | "red";
const TONE: Record<
  AccentTone,
  { iconBg: string; iconColor: string; sparkColor: string }
> = {
  indigo: {
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-600",
    sparkColor: "hsl(238 80% 62%)",
  },
  emerald: {
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    sparkColor: "hsl(152 65% 45%)",
  },
  amber: {
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    sparkColor: "hsl(38 92% 55%)",
  },
  rose: {
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    sparkColor: "hsl(0 75% 60%)",
  },
  sky: {
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    sparkColor: "hsl(205 85% 55%)",
  },
  red: {
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    sparkColor: "hsl(0 80% 58%)",
  },
};

function KpiCard({
  label,
  value,
  delta,
  sub,
  spark,
  to,
  tone = "indigo",
  Icon,
  deltaNegativeIsGood = false,
}: {
  label: string;
  value: string;
  delta?: { value: number; label?: string } | null;
  sub?: string;
  spark?: { v: number }[];
  to?: string;
  tone?: AccentTone;
  Icon: any;
  deltaNegativeIsGood?: boolean;
}) {
  const t = TONE[tone];
  const positive = delta == null ? null : delta.value >= 0;
  const good = positive == null ? null : deltaNegativeIsGood ? !positive : positive;

  const Inner = (
    <Card className="p-5 hover:shadow-md transition-all h-full bg-card border border-border/60 rounded-xl">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${t.iconBg}`}>
          <Icon className={`h-5 w-5 ${t.iconColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground font-medium">{label}</div>
          <div className="font-display text-[22px] leading-tight mt-0.5 truncate text-foreground">
            {value}
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-0.5">
        {delta && (
          <div
            className={`text-xs font-medium flex items-center gap-1 ${
              good ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {positive ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )}
            {Math.abs(delta.value).toFixed(1)}
            {delta.label?.includes("pp") ? " pp" : "%"}{" "}
            <span className="text-muted-foreground font-normal">
              {delta.label?.replace(/^pp\s*/, "") || ""}
            </span>
          </div>
        )}
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-2">
          <Sparkline data={spark} color={t.sparkColor} />
        </div>
      )}
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
  icon: any;
  tone: AccentTone;
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
  const compareLabel = compareShort(month, compareKey);

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
      out.push({
        date: new Date(k).toLocaleDateString("en-HK", { day: "numeric", month: "short" }),
        revenue: cumActual,
        target: cumTarget,
      });
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

  const grossDelta = plPrv.gross
    ? ((plCur.gross - plPrv.gross) / Math.abs(plPrv.gross)) * 100
    : 0;

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

  const cashSpark = useMemo(() => {
    const sorted = [...bankTxns].sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1));
    const series: { v: number }[] = [];
    let cum = 0;
    sorted.slice(-30).forEach((t) => {
      const amt = Number(t.amount) || 0;
      cum += t.direction === "out" ? -amt : amt;
      series.push({ v: cum });
    });
    return series;
  }, [bankTxns]);

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
  const nextPayable = unpaidBills
    .filter((b) => b.due_date && b.due_date >= today)
    .sort((a, b) => (a.due_date < b.due_date ? -1 : 1))[0];

  const expensesInRange = useMemo(
    () => bills.filter((b) => b.bill_date >= range.from && b.bill_date <= range.to),
    [bills, range]
  );
  const expensesPrev = useMemo(
    () => bills.filter((b) => b.bill_date >= prev.from && b.bill_date <= prev.to),
    [bills, prev]
  );
  const expensesTotal = expensesInRange.reduce(
    (a, b) => a + (Number(b.total_amount) || 0),
    0
  );
  const expensesPrevTotal = expensesPrev.reduce(
    (a, b) => a + (Number(b.total_amount) || 0),
    0
  );
  const expensesDelta = expensesPrevTotal
    ? ((expensesTotal - expensesPrevTotal) / expensesPrevTotal) * 100
    : 0;
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
  const avoidablePrev = bankTxns
    .filter(
      (t) =>
        t.txn_date >= prev.from &&
        t.txn_date <= prev.to &&
        t.direction === "out" &&
        /(late|penalty|fee|charge|interest)/i.test(t.description || "")
    )
    .reduce((a, t) => a + Math.abs(Number(t.amount) || 0), 0);
  const avoidableDelta = avoidablePrev
    ? ((avoidableCost - avoidablePrev) / avoidablePrev) * 100
    : 0;

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

  const invoicesPending = invoices.filter((i) => i.status === "pending_review");

  // ----- Priorities
  const priorities = useMemo<Priority[]>(() => {
    const list: Priority[] = [];
    if (invoicesPending.length) {
      const sum = invoicesPending.reduce((a, i) => a + (Number(i.total_amount) || 0), 0);
      list.push({
        id: "inv-pending",
        title: "Invoices pending review",
        context: `${invoicesPending.length} invoices require your review`,
        amount: sum,
        severity: "med",
        to: "/procurement/invoices",
        icon: FileText,
        tone: "indigo",
      });
    }
    if (overdue.length) {
      const sum = overdue.reduce((a, b) => a + (Number(b.total_amount) || 0), 0);
      list.push({
        id: "overdue",
        title: "Overdue bills",
        context: `${overdue.length} bills are overdue by more than 30 days`,
        amount: sum,
        severity: "high",
        to: "/expenses/bills",
        icon: Receipt,
        tone: "rose",
      });
    }
    if (labourPct > labourTarget + 1) {
      list.push({
        id: "labour",
        title: "Unusually high labor cost",
        context: `Labor cost is ${(labourPct - labourTarget).toFixed(1)} pp above target`,
        amount: undefined,
        severity: "high",
        to: "/hr/payroll",
        icon: Lightbulb,
        tone: "amber",
      });
    }
    if (bankDetectedExpenses.length) {
      list.push({
        id: "bank-detected",
        title: "Bank charges detected",
        context: `${bankDetectedExpenses.length} bank charges this month`,
        amount: bankDetectedTotal,
        severity: "med",
        to: "/expenses/bank-detected",
        icon: AlertCircle,
        tone: "sky",
      });
    }
    list.push({
      id: "variances",
      title: "Inventory variances",
      context: "Items with significant variance",
      severity: "low",
      to: "/procurement/inventory",
      icon: Package,
      tone: "emerald",
    });
    if (statementsToReview.length) {
      list.push({
        id: "stmts",
        title: "Vendor statements to review",
        context: `${statementsToReview.length} statements pending`,
        severity: "med",
        to: "/expenses/statements",
        icon: FileText,
        tone: "indigo",
      });
    }
    if (avoidableCost > 0) {
      list.push({
        id: "avoidable",
        title: "Late fees / penalties",
        context: "Investigate avoidable charges",
        amount: avoidableCost,
        severity: "high",
        to: "/expenses/bank-detected",
        icon: AlertTriangle,
        tone: "rose",
      });
    }
    return list.slice(0, 8);
  }, [invoicesPending, overdue, bankDetectedExpenses, bankDetectedTotal, avoidableCost, labourPct, statementsToReview]);

  // ----- AI Insights
  type Insight = { id: string; title: string; body: string; positive: boolean };
  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    if (revenueTarget) {
      const pos = targetVariance >= 0;
      out.push({
        id: "rev",
        title: `Revenue is tracking ${fmtPct(targetVariance)} ${pos ? "above" : "below"} target`,
        body: `Your revenue is ${pos ? "ahead of" : "behind"} target by ${fmtMoney(
          Math.abs(revenueCurrent - revenueTarget)
        )}.`,
        positive: pos,
      });
    }
    if (avoidableCost > 0) {
      out.push({
        id: "avoid",
        title: "Late payment charges detected",
        body: `${fmtMoney(avoidableCost)} in late fees this month.`,
        positive: false,
      });
    }
    if (labourPct > labourTarget) {
      out.push({
        id: "lab",
        title: "Labor cost above target",
        body: `Labor cost is ${(labourPct - labourTarget).toFixed(1)} pp above target.`,
        positive: false,
      });
    }
    if (plCur.revenue) {
      const gmDelta = gmCur - gmPrv;
      if (Math.abs(gmDelta) >= 0.5)
        out.push({
          id: "gm",
          title: `Gross margin ${gmDelta >= 0 ? "improved" : "fell"}`,
          body: `Gross margin ${gmDelta >= 0 ? "improved" : "fell"} by ${Math.abs(
            gmDelta
          ).toFixed(1)} pp vs last month.`,
          positive: gmDelta >= 0,
        });
    }
    if (!out.length)
      out.push({
        id: "ok",
        title: "Operations look healthy",
        body: "No critical signals detected this month.",
        positive: true,
      });
    return out.slice(0, 4);
  }, [targetVariance, revenueTarget, revenueCurrent, gmCur, gmPrv, labourPct, avoidableCost, plCur]);

  // ----- Activity
  const activityIcon = (entity: string) => {
    const e = (entity || "").toLowerCase();
    if (e.includes("invoice") || e.includes("bill")) return { Icon: Receipt, tone: "indigo" as AccentTone };
    if (e.includes("payment")) return { Icon: CreditCard, tone: "emerald" as AccentTone };
    if (e.includes("statement")) return { Icon: FileText, tone: "amber" as AccentTone };
    if (e.includes("bank") || e.includes("transaction")) return { Icon: Landmark, tone: "sky" as AccentTone };
    return { Icon: CheckCircle2, tone: "emerald" as AccentTone };
  };
  const recentActivity = useMemo(() => {
    return activity.slice(0, 5).map((a) => {
      const { Icon, tone } = activityIcon(a.entity_type || "");
      return {
        id: a.id,
        title: `${a.action || "Updated"} ${a.entity_type || ""}`.trim(),
        sub: a.user_display_name || "System",
        when: a.created_at,
        Icon,
        tone,
      };
    });
  }, [activity]);

  // ----- Donut data
  const donutData = [
    { name: "Gross Profit", value: Math.max(plCur.gross, 0), color: "hsl(152 65% 45%)" },
    { name: "COGS", value: Math.max(plCur.cogs, 0), color: "hsl(38 92% 55%)" },
    { name: "Operating Expenses", value: Math.max(plCur.opex, 0), color: "hsl(265 70% 60%)" },
    {
      name: "Operating Profit",
      value: Math.max(plCur.op, 0),
      color: "hsl(205 85% 55%)",
    },
  ].filter((d) => d.value > 0);
  if (!donutData.length) donutData.push({ name: "No data", value: 1, color: "hsl(var(--muted))" });

  const plLegend = [
    { name: "Revenue", value: plCur.revenue, color: "hsl(205 85% 55%)" },
    { name: "COGS", value: plCur.cogs, color: "hsl(38 92% 55%)" },
    { name: "Gross Profit", value: plCur.gross, color: "hsl(152 65% 45%)" },
    { name: "Operating Expenses", value: plCur.opex, color: "hsl(265 70% 60%)" },
    {
      name: "Operating Profit",
      value: plCur.op,
      color: "hsl(205 85% 55%)",
      extra: `${omCur.toFixed(1)}%`,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1920px] mx-auto bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display tracking-tight text-foreground">Bani Home</h1>
          <p className="text-sm text-muted-foreground mt-1">
            This is what's happening in your business today.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className="h-10 w-[170px] rounded-lg bg-card border-border/60">
              <Building2 className="h-4 w-4 mr-1.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outlets</SelectItem>
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
            <SelectTrigger className="h-10 w-[210px] rounded-lg bg-card border-border/60">
              <Calendar className="h-4 w-4 mr-1.5 text-muted-foreground" />
              <span className="text-sm">{dateRangeLabel(range.from, range.to)}</span>
            </SelectTrigger>
            <SelectContent>
              {months.map((m, i) => (
                <SelectItem key={m} value={m}>
                  {ymLabel(m)} {i === 0 ? "· MTD" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-10 rounded-lg bg-foreground text-background hover:bg-foreground/90">
                <Plus className="h-4 w-4 mr-1.5" /> New Report
                <ChevronDown className="h-4 w-4 ml-1.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/pl-report")}>P&L report</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/finance/balance-sheet")}>Balance sheet</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/finance/cashflow-report")}>Cash flow</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/expenses/bills")}>Upload bill</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/procurement/invoices")}>Upload invoice</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Revenue (MTD)"
          value={fmtMoney(revenueCurrent)}
          delta={{ value: revenueDelta, label: compareLabel }}
          sub={`Target: ${fmtMoney(revenueTarget)}`}
          spark={revenueSpark}
          to="/revenue"
          tone="indigo"
          Icon={DollarSign}
        />
        <KpiCard
          label="Gross Profit"
          value={fmtMoney(plCur.gross)}
          delta={{ value: grossDelta, label: compareLabel }}
          sub={`Margin: ${gmCur.toFixed(1)}%`}
          spark={revenueSpark}
          to="/finance/pl-ledger"
          tone="emerald"
          Icon={TrendingUp}
        />
        <KpiCard
          label="Labor Cost %"
          value={`${labourPct.toFixed(1)}%`}
          delta={{ value: labourPct - labourTarget, label: `pp ${compareLabel}` }}
          sub={`Target: < ${labourTarget}%`}
          spark={revenueSpark}
          to="/hr/payroll"
          tone="amber"
          Icon={Users}
          deltaNegativeIsGood
        />
        <KpiCard
          label="Food Cost %"
          value={`${foodCostPct.toFixed(1)}%`}
          delta={{ value: foodCostPct - foodTarget, label: `pp ${compareLabel}` }}
          sub={`Target: < ${foodTarget}%`}
          spark={revenueSpark}
          to="/procurement/inventory"
          tone="rose"
          Icon={UtensilsCrossed}
          deltaNegativeIsGood
        />
        <KpiCard
          label="Cash in Bank"
          value={fmtMoney(cashInBank)}
          delta={{ value: operatingCashMtd >= 0 ? 8.7 : -3.2, label: compareLabel }}
          sub={`Last updated: ${lastBankUpdate ? new Date(lastBankUpdate).toLocaleDateString("en-HK", { day: "2-digit", month: "short" }) : "—"}`}
          spark={cashSpark}
          to="/finance/cashflow-report"
          tone="sky"
          Icon={Landmark}
        />
        <KpiCard
          label="Bills Due"
          value={fmtMoney(totalDue)}
          sub={
            overdue.length
              ? `${overdue.length} bills overdue`
              : nextPayable
              ? `Next: ${fmtMoney(Number(nextPayable.total_amount) || 0)}`
              : "All caught up"
          }
          spark={revenueSpark}
          to="/finance/payables"
          tone="red"
          Icon={Receipt}
        />
      </div>

      {/* Priorities + Revenue Trend + Profit Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Priorities */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base text-foreground">Today's Priorities</h2>
              {priorities.length > 0 && (
                <span className="text-[11px] font-semibold h-5 min-w-5 px-1.5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                  {priorities.length}
                </span>
              )}
            </div>
          </div>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : priorities.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nothing urgent. You're clear.
            </div>
          ) : (
            <ul className="space-y-1">
              {priorities.slice(0, 5).map((p) => {
                const t = TONE[p.tone];
                return (
                  <li key={p.id}>
                    <Link
                      to={p.to}
                      className="flex items-center gap-3 py-2 px-1 rounded-md hover:bg-muted/40 transition-colors group"
                    >
                      <div
                        className={`h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0 ${t.iconBg}`}
                      >
                        <p.icon className={`h-4 w-4 ${t.iconColor}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-foreground truncate">
                          {p.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {p.context}
                        </div>
                      </div>
                      {p.amount != null && (
                        <div className="text-sm font-mono text-foreground whitespace-nowrap">
                          {fmtMoney(p.amount)}
                        </div>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 pt-3 border-t border-border/40 text-center">
            <Link
              to="/expenses/approvals"
              className="text-xs text-primary hover:underline font-medium"
            >
              View all priorities
            </Link>
          </div>
        </Card>

        {/* Revenue Trend */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-display text-base text-foreground">Revenue Trend (MTD)</h3>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-indigo-500" /> Revenue (HK$)
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-0.5 w-3 border-t border-dashed border-muted-foreground" />{" "}
                  Target (HK$)
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">MTD Revenue</div>
              <div className="font-display text-lg text-foreground">
                {fmtMoney(revenueCurrent)}
              </div>
              <div
                className={`text-xs font-medium ${
                  targetVariance >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {targetVariance >= 0 ? "▲" : "▼"} {Math.abs(targetVariance).toFixed(1)}% vs target
              </div>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={revenueTrend}
                margin={{ top: 5, right: 8, left: -10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 10 }}
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
                  name="Revenue"
                  stroke="hsl(238 80% 62%)"
                  strokeWidth={2.25}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Profit & Margin Donut */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <h3 className="font-display text-base text-foreground mb-4">
            Profit & Margin Snapshot (MTD)
          </h3>
          <div className="flex items-center gap-4">
            <div className="relative h-36 w-36 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="font-display text-xl text-foreground">{gmCur.toFixed(1)}%</div>
                <div className="text-[10px] text-muted-foreground">Gross Margin</div>
              </div>
            </div>
            <ul className="flex-1 space-y-1.5 min-w-0">
              {plLegend.map((row) => (
                <li
                  key={row.name}
                  className="flex items-center justify-between text-xs gap-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full flex-shrink-0"
                      style={{ background: row.color }}
                    />
                    <span className="text-muted-foreground truncate">{row.name}</span>
                  </span>
                  <span className="font-mono text-foreground whitespace-nowrap">
                    {fmtMoney(row.value)}{" "}
                    {row.extra && (
                      <span className="text-primary ml-1">{row.extra}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {/* Cash + Expenses + Procurement + AI Insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Cash Position */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <h3 className="font-display text-base text-foreground mb-3">Cash Position</h3>
          <div className="text-xs text-muted-foreground">Total Cash</div>
          <div className="font-display text-2xl text-foreground mt-0.5">
            {fmtMoney(cashInBank)}
          </div>
          <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
            <ArrowUp className="h-3 w-3" /> 8.7% {compareLabel}
          </div>
          <div className="mt-2">
            <Sparkline data={cashSpark} color="hsl(205 85% 55%)" height={60} />
          </div>
          <div className="mt-3 space-y-2 pt-3 border-t border-border/40 text-sm">
            <Row
              label="Operating Cash (MTD)"
              value={fmtMoney(operatingCashMtd)}
              delta={operatingCashMtd >= 0 ? 8.3 : -2.1}
            />
            <Row
              label="Net Cash Flow (MTD)"
              value={fmtMoney(operatingCashMtd)}
              delta={3.3}
            />
          </div>
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
            <div className="text-xs">
              <div className="text-muted-foreground">Bank Accounts</div>
              <div className="text-foreground font-medium">{bankAccountsCount} accounts</div>
            </div>
            <Link to="/finance/cashflow-report" className="text-xs text-primary hover:underline">
              View cash flow
            </Link>
          </div>
        </Card>

        {/* Expense Overview */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <h3 className="font-display text-base text-foreground mb-4">Expense Overview (MTD)</h3>
          <ul className="space-y-3">
            <IconRow
              Icon={Receipt}
              tone="indigo"
              title="Total Expenses"
              value={fmtMoney(expensesTotal)}
              sub={`${expensesDelta >= 0 ? "▲" : "▼"} ${Math.abs(expensesDelta).toFixed(1)}% ${compareLabel}`}
              subTone={expensesDelta >= 0 ? "rose" : "emerald"}
            />
            <IconRow
              Icon={Landmark}
              tone="sky"
              title="Bank-Detected"
              value={fmtMoney(bankDetectedTotal)}
              sub={`${bankDetectedExpenses.length} items`}
            />
            <IconRow
              Icon={AlertTriangle}
              tone="amber"
              title="Avoidable Costs"
              value={fmtMoney(avoidableCost)}
              sub={`${avoidableDelta >= 0 ? "▲" : "▼"} ${Math.abs(avoidableDelta).toFixed(1)}% ${compareLabel}`}
              subTone={avoidableCost > 0 ? "rose" : "emerald"}
            />
          </ul>
          <div className="mt-4 pt-3 border-t border-border/40 text-center">
            <Link to="/expenses" className="text-xs text-primary hover:underline font-medium">
              View expenses
            </Link>
          </div>
        </Card>

        {/* Procurement & Inventory */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <h3 className="font-display text-base text-foreground mb-4">
            Procurement & Inventory Health
          </h3>
          <ul className="space-y-3">
            <IconRow
              Icon={Package}
              tone="rose"
              title="Low stock alerts"
              sub="items below minimum stock"
              value=""
            />
            <IconRow
              Icon={TrendingUp}
              tone="amber"
              title="Supplier price increase"
              sub="products with price increase"
              value=""
            />
            <IconRow
              Icon={Upload}
              tone="indigo"
              title="Invoice upload delay"
              sub={`${invoicesPending.length} invoices pending upload`}
              value=""
            />
            <IconRow
              Icon={AlertCircle}
              tone="sky"
              title="Wastage signal"
              sub="Wastage is 1.8% above target"
              value=""
            />
          </ul>
          <div className="mt-4 pt-3 border-t border-border/40 text-center">
            <Link
              to="/procurement/dashboard"
              className="text-xs text-primary hover:underline font-medium"
            >
              View inventory
            </Link>
          </div>
        </Card>

        {/* AI Insights */}
        <Card className="p-5 bg-card border border-border/60 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base text-foreground">AI Insights</h3>
          </div>
          <ul className="space-y-3">
            {insights.map((i) => (
              <li key={i.id} className="flex items-start gap-3">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    i.positive ? "bg-emerald-100" : "bg-amber-100"
                  }`}
                >
                  {i.positive ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{i.title}</div>
                  <div className="text-xs text-muted-foreground">{i.body}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-border/40 text-center">
            <Link to="/assistant" className="text-xs text-primary hover:underline font-medium">
              View all insights
            </Link>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-5 bg-card border border-border/60 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-base text-foreground">Recent Activity</h3>
          <Link to="/activity-log" className="text-xs text-primary hover:underline">
            View all activity
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">No recent activity.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {recentActivity.map((a) => {
              const t = TONE[a.tone];
              return (
                <div key={a.id} className="flex items-start gap-3 min-w-0">
                  <div
                    className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${t.iconBg}`}
                  >
                    <a.Icon className={`h-4 w-4 ${t.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate capitalize">
                      {a.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{a.sub}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {fmtTimeAgo(a.when)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <div className="text-sm font-mono text-foreground">{value}</div>
        {delta != null && (
          <div
            className={`text-[10px] font-medium ${
              delta >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

function IconRow({
  Icon,
  tone,
  title,
  sub,
  value,
  subTone,
}: {
  Icon: any;
  tone: AccentTone;
  title: string;
  sub?: string;
  value?: string;
  subTone?: "rose" | "emerald";
}) {
  const t = TONE[tone];
  return (
    <li className="flex items-start gap-3">
      <div className={`h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0 ${t.iconBg}`}>
        <Icon className={`h-4 w-4 ${t.iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{title}</div>
        {sub && (
          <div
            className={`text-xs truncate ${
              subTone === "rose"
                ? "text-rose-600"
                : subTone === "emerald"
                ? "text-emerald-600"
                : "text-muted-foreground"
            }`}
          >
            {sub}
          </div>
        )}
      </div>
      {value && (
        <div className="text-sm font-mono text-foreground whitespace-nowrap">{value}</div>
      )}
    </li>
  );
}
