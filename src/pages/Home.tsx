import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  Line,
  ComposedChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  Receipt,
  Package,
  Landmark,
  Target,
  BarChart3,
  ShoppingCart,
  CreditCard,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useVenues } from "@/hooks/useVenues";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/revenue-overview/Sparkline";
import { DeltaChip } from "@/components/revenue-overview/DeltaChip";
import { SectionHeader } from "@/components/revenue-overview/SectionHeader";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import {
  chartAxis,
  chartGrid,
  chartTooltipContentStyle,
  compactHK,
  PRIMARY,
  MUTED_FG,
} from "@/components/revenue-overview/chartTheme";
import { fmtHKD, fmtNum, pctDelta } from "@/components/revenue-overview/utils";

// ── helpers ──────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};
const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};
const dayLabel = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STALE = 5 * 60 * 1000;

// ── data hooks ───────────────────────────────────────────────────────────

type SaleRow = { date: string; venue: string | null; total_sales: number | null; guests: number | null };

function useSales70() {
  return useQuery({
    queryKey: ["home", "sales70"],
    staleTime: STALE,
    queryFn: async (): Promise<SaleRow[]> => {
      const from = isoDate(daysAgo(70));
      const { data, error } = await supabase
        .from("sales_records")
        .select("date,venue,total_sales,guests")
        .gte("date", from)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });
}

function useUnpaidInvoices() {
  return useQuery({
    queryKey: ["home", "unpaidInvoices"],
    staleTime: STALE,
    queryFn: async () => {
      const from = isoDate(daysAgo(365));
      const { data, error } = await supabase
        .from("invoices")
        .select("total_amount,payment_status,invoice_date")
        .gte("invoice_date", from)
        .neq("payment_status", "paid");
      if (error) throw error;
      const rows = (data ?? []) as { total_amount: number | null; payment_status: string | null }[];
      const filtered = rows.filter((r) => (r.payment_status ?? "").toLowerCase() !== "paid");
      const amount = filtered.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      return { count: filtered.length, amount };
    },
  });
}

function usePendingBills() {
  return useQuery({
    queryKey: ["home", "pendingBills"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_bills")
        .select("total_amount,payment_status,approval_status")
        .or("payment_status.eq.unpaid,payment_status.eq.pending,approval_status.eq.pending");
      if (error) throw error;
      const rows = (data ?? []) as {
        total_amount: number | null;
        payment_status: string | null;
        approval_status: string | null;
      }[];
      const amount = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      return { count: rows.length, amount };
    },
  });
}

function useUnreconciledBank() {
  return useQuery({
    queryKey: ["home", "bankUnrec"],
    staleTime: STALE,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return { count: count ?? 0 };
    },
  });
}

function useUnmappedProducts() {
  return useQuery({
    queryKey: ["home", "unmappedProducts"],
    staleTime: STALE,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("product_master")
        .select("id", { count: "exact", head: true })
        .is("default_coa_account_id", null);
      if (error) throw error;
      return { count: count ?? 0 };
    },
  });
}

function useRecentActivity() {
  return useQuery({
    queryKey: ["home", "activity"],
    staleTime: STALE,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id,action,entity_type,user_display_name,created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        action: string;
        entity_type: string | null;
        user_display_name: string | null;
        created_at: string;
      }[];
    },
  });
}

// ── page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { user } = useAuth();
  const { venues } = useVenues();
  const activeVenues = venues.filter((v) => v.is_active).map((v) => v.name);
  const [venue, setVenue] = useState<string>("All Venues");
  const navigate = useNavigate();

  const sales = useSales70();
  const unpaid = useUnpaidInvoices();
  const pendingBills = usePendingBills();
  const bankUnrec = useUnreconciledBank();
  const unmappedProducts = useUnmappedProducts();
  const activity = useRecentActivity();

  const filteredSales = useMemo(() => {
    const rows = sales.data ?? [];
    if (venue === "All Venues") return rows;
    return rows.filter((r) => (r.venue ?? "").toLowerCase() === venue.toLowerCase());
  }, [sales.data, venue]);

  // Roll-ups
  const pulse = useMemo(() => {
    const byDate = new Map<string, { revenue: number; guests: number }>();
    for (const r of filteredSales) {
      const k = r.date;
      const bucket = byDate.get(k) ?? { revenue: 0, guests: 0 };
      bucket.revenue += Number(r.total_sales) || 0;
      bucket.guests += Number(r.guests) || 0;
      byDate.set(k, bucket);
    }
    const y = daysAgo(1);
    const y7 = daysAgo(8);
    const yStr = isoDate(y);
    const y7Str = isoDate(y7);
    const yesterdayRev = byDate.get(yStr)?.revenue ?? 0;
    const yesterdayGuests = byDate.get(yStr)?.guests ?? 0;
    const prevWeekRev = byDate.get(y7Str)?.revenue ?? 0;
    const prevWeekGuests = byDate.get(y7Str)?.guests ?? 0;

    // MTD
    const today = new Date();
    const mFirst = new Date(today.getFullYear(), today.getMonth(), 1);
    const dayOfMonth = today.getDate();
    let mtdRev = 0;
    for (const [k, v] of byDate) {
      const d = new Date(k);
      if (d >= mFirst && d <= today) mtdRev += v.revenue;
    }
    // Same day-count previous month
    const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth() - 1, dayOfMonth);
    let prevMtdRev = 0;
    for (const [k, v] of byDate) {
      const d = new Date(k);
      if (d >= prevMonthStart && d <= prevMonthEnd) prevMtdRev += v.revenue;
    }

    // 7-day avg vs prior 7
    let last7 = 0;
    let prev7 = 0;
    for (let i = 1; i <= 7; i++) last7 += byDate.get(isoDate(daysAgo(i)))?.revenue ?? 0;
    for (let i = 8; i <= 14; i++) prev7 += byDate.get(isoDate(daysAgo(i)))?.revenue ?? 0;
    const avg7 = last7 / 7;
    const avgPrev7 = prev7 / 7;

    // 30-day sparks
    const spark30: { v: number }[] = [];
    const sparkGuests: { v: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const b = byDate.get(isoDate(daysAgo(i)));
      spark30.push({ v: b?.revenue ?? 0 });
      sparkGuests.push({ v: b?.guests ?? 0 });
    }

    return {
      yesterdayRev,
      yesterdayGuests,
      yesterdayDelta: pctDelta(yesterdayRev, prevWeekRev),
      yesterdayGuestsDelta: pctDelta(yesterdayGuests, prevWeekGuests),
      mtdRev,
      mtdDelta: pctDelta(mtdRev, prevMtdRev),
      avg7,
      avg7Delta: pctDelta(avg7, avgPrev7),
      spark30,
      sparkGuests,
    };
  }, [filteredSales]);

  // Trend chart 30 days
  const trend30 = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const r of filteredSales) {
      byDate.set(r.date, (byDate.get(r.date) ?? 0) + (Number(r.total_sales) || 0));
    }
    const rows: { date: string; revenue: number; ma7: number | null }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = isoDate(daysAgo(i));
      const rev = byDate.get(d) ?? 0;
      rows.push({ date: d, revenue: rev, ma7: null });
    }
    for (let i = 0; i < rows.length; i++) {
      if (i < 6) continue;
      let s = 0;
      for (let j = i - 6; j <= i; j++) s += rows[j].revenue;
      rows[i].ma7 = s / 7;
    }
    return rows;
  }, [filteredSales]);

  // Attention items
  const attention = useMemo(() => {
    const items: {
      key: string;
      title: string;
      icon: any;
      tone: "destructive" | "warn" | "info";
      to: string;
    }[] = [];
    if ((unpaid.data?.count ?? 0) > 0) {
      items.push({
        key: "unpaid",
        title: `HK$ ${fmtHKD(unpaid.data!.amount)} unpaid across ${unpaid.data!.count} supplier invoice${unpaid.data!.count === 1 ? "" : "s"}`,
        icon: Receipt,
        tone: "destructive",
        to: "/procurement/finance/payables",
      });
    }
    if ((pendingBills.data?.count ?? 0) > 0) {
      items.push({
        key: "bills",
        title: `${pendingBills.data!.count} expense bill${pendingBills.data!.count === 1 ? "" : "s"} awaiting action · HK$ ${fmtHKD(pendingBills.data!.amount)}`,
        icon: Receipt,
        tone: "warn",
        to: "/expenses",
      });
    }
    if ((bankUnrec.data?.count ?? 0) > 0) {
      items.push({
        key: "bank",
        title: `${bankUnrec.data!.count} unreconciled bank transaction${bankUnrec.data!.count === 1 ? "" : "s"}`,
        icon: Landmark,
        tone: "info",
        to: "/bank/reconciliation",
      });
    }
    if ((unmappedProducts.data?.count ?? 0) > 0) {
      items.push({
        key: "unmapped",
        title: `${unmappedProducts.data!.count} unmapped items in Items Master`,
        icon: Package,
        tone: "warn",
        to: "/procurement/products",
      });
    }
    return items;
  }, [unpaid.data, pendingBills.data, bankUnrec.data, unmappedProducts.data]);

  const attentionLoading =
    unpaid.isLoading || pendingBills.isLoading || bankUnrec.isLoading || unmappedProducts.isLoading;

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <div className="w-full mx-auto space-y-6">
      {/* Greeting */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight truncate">
            {greeting()}
            {user?.email ? <span className="text-muted-foreground font-normal">, {user.email.split("@")[0]}</span> : null}
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">{dayLabel()}</p>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {["All Venues", ...activeVenues].map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={`px-2.5 h-8 text-[12px] font-medium rounded-md border transition-colors ${
                venue === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-transparent text-foreground/70 hover:bg-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Pulse row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {sales.isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[128px] rounded-xl" />)
          : (
            <>
              <PulseCard
                label="Yesterday"
                value={`HK$ ${fmtHKD(pulse.yesterdayRev)}`}
                delta={pulse.yesterdayDelta}
                deltaSuffix="vs last wk"
                spark={pulse.spark30}
              />
              <PulseCard
                label="MTD Revenue"
                value={`HK$ ${fmtHKD(pulse.mtdRev)}`}
                delta={pulse.mtdDelta}
                deltaSuffix="vs last mo"
                spark={pulse.spark30}
              />
              <PulseCard
                label="Covers Yesterday"
                value={fmtNum(pulse.yesterdayGuests)}
                delta={pulse.yesterdayGuestsDelta}
                deltaSuffix="vs last wk"
                spark={pulse.sparkGuests}
              />
              <PulseCard
                label="7-Day Avg Revenue"
                value={`HK$ ${fmtHKD(pulse.avg7)}`}
                delta={pulse.avg7Delta}
                deltaSuffix="vs prior 7d"
                spark={pulse.spark30}
              />
            </>
          )}
      </div>

      {/* Needs attention */}
      <SectionHeader title="Needs attention" description="Action items across your books" />
      <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
        {attentionLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : attention.length === 0 ? (
          <div className="flex items-center gap-2 p-4 text-primary">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-[13px] font-medium">All clear — nothing needs your attention.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {attention.map((item) => {
              const Icon = item.icon;
              const tone =
                item.tone === "destructive"
                  ? "text-destructive bg-destructive/10"
                  : item.tone === "warn"
                    ? "text-warn bg-warn/10"
                    : "text-info bg-info/10";
              return (
                <li key={item.key}>
                  <button
                    onClick={() => navigate(item.to)}
                    className="w-full flex items-center gap-3 px-4 min-h-[44px] py-2.5 text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className={`shrink-0 h-8 w-8 rounded-md flex items-center justify-center ${tone}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 min-w-0 text-[13px] text-foreground/90 truncate">{item.title}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Trend chart */}
      <SectionHeader title="Revenue — last 30 days" />
      {sales.isLoading ? (
        <Skeleton className="h-[240px] rounded-xl" />
      ) : (
        <ChartShell
          title="Daily revenue with 7-day moving average"
          subtitle={venue === "All Venues" ? "All venues" : venue}
          headerRight={
            <Link to="/revenue" className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors">
              Revenue Overview <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          <div className="h-[200px] sm:h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend30} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid {...chartGrid} />
                <XAxis
                  dataKey="date"
                  {...chartAxis}
                  tickFormatter={(d) => {
                    const dt = new Date(d);
                    return `${dt.getDate()}/${dt.getMonth() + 1}`;
                  }}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis {...chartAxis} tickFormatter={(v) => compactHK(v)} width={44} />
                <Tooltip
                  contentStyle={chartTooltipContentStyle}
                  formatter={(v: any, name: string) => [`HK$ ${fmtHKD(Number(v))}`, name === "revenue" ? "Revenue" : "7-day MA"]}
                  labelFormatter={(l) =>
                    new Date(l).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
                  }
                />
                <Bar dataKey="revenue" fill={PRIMARY} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Line
                  type="monotone"
                  dataKey="ma7"
                  stroke={MUTED_FG}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartShell>
      )}

      {/* Bottom two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <SectionHeader title="Shortcuts" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SHORTCUTS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  className="card-glass rounded-lg border border-border/60 p-3 flex items-center gap-2.5 min-h-[52px] hover:border-primary/40 hover:bg-muted/40 transition-colors"
                >
                  <span className="shrink-0 h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[13px] font-medium truncate">{s.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <div>
          <SectionHeader title="Recent activity" />
          <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
            {activity.isLoading ? (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-md" />
                ))}
              </div>
            ) : (activity.data?.length ?? 0) === 0 ? (
              <div className="p-6 text-center text-[12px] text-muted-foreground">No recent activity.</div>
            ) : (
              <>
                <ul className="divide-y divide-border/60">
                  {(activity.data ?? []).map((a) => (
                    <li key={a.id} className="px-4 py-2.5 flex items-center gap-3 min-h-[44px]">
                      <span className="text-[12px] flex-1 min-w-0 truncate text-foreground/85">
                        <span className="text-foreground/60">{a.user_display_name ?? "System"}</span>{" "}
                        <span>{a.action}</span>
                        {a.entity_type ? <span className="text-muted-foreground"> · {a.entity_type}</span> : null}
                      </span>
                      <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                        {timeAgo(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/activity-log"
                  className="block px-4 py-2.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors border-t border-border/60"
                >
                  View all <ArrowRight className="inline h-3 w-3 ml-0.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── sub-components ───────────────────────────────────────────────────────

function PulseCard({
  label,
  value,
  delta,
  deltaSuffix,
  spark,
}: {
  label: string;
  value: string;
  delta: number | null;
  deltaSuffix?: string;
  spark: { v: number }[];
}) {
  // Auto-shrink long values
  const size = value.length > 14 ? "text-[19px]" : "text-[22px]";
  return (
    <div className="card-glass rounded-xl border border-border/60 p-3.5 flex flex-col gap-1.5 min-w-0">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </div>
      <div className={`${size} font-semibold tabular-nums leading-tight truncate`}>{value}</div>
      <div className="min-h-[20px]">
        <DeltaChip value={delta} suffix={deltaSuffix} />
      </div>
      <div className="-mx-1 mt-auto">
        <Sparkline data={spark} fill height={36} />
      </div>
    </div>
  );
}

const SHORTCUTS: { label: string; to: string; icon: any }[] = [
  { label: "Revenue Overview", to: "/revenue", icon: BarChart3 },
  { label: "Procurement", to: "/procurement/dashboard", icon: ShoppingCart },
  { label: "KPIs", to: "/kpis/my-cards", icon: Target },
  { label: "Payables", to: "/procurement/finance/payables", icon: CreditCard },
  { label: "Bank", to: "/bank/reconciliation", icon: Landmark },
  { label: "AI Analyst", to: "/assistant", icon: Sparkles },
];
