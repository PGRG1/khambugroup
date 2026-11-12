import { ReceiptIntakes, useReceiptIntakes } from "@/components/sales/ReceiptIntakes";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { TeamAvatar } from "@/components/team/TeamAvatar";
import { TEAM_CHARACTERS } from "@/components/team/teamCharacters";
import "@/components/team/team.css";
import { useBaniAsk, useFloatingBaniOpen } from "@/components/assistant/FloatingBaniContext";
import { useHomeFinance } from "@/hooks/useHomeFinance";
import { useWorkLog, WorkLogDialog } from "@/components/home/WorkLog";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { closeRows, financeProfit } from "@/utils/financeOverview";
import { accruedStaff, accruedProfit, menuCostPercent, theoreticalStock, rotaStaff, type ShiftRow, type PayRow } from "@/utils/landingAccrual";
import { roleViews, type Review, type Role } from "./YourTeam";
import type { Finding } from "../../supabase/functions/_shared/financeTeamReview";
import { WEEKDAYS, type SaleRow } from "@/utils/landingNumbers";
import "./landing.css";
import "./landing2.css";

const ORDER: Role[] = ["revenue", "procurement", "people", "accountant", "controller"];
const TEAMNAME: Record<Role, string> = { revenue: "Sales", procurement: "Purchasing", people: "People", accountant: "Books", controller: "Cash" };
const pad = (n: number) => String(n).padStart(2, "0");
const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const iso = (d: Date) => `${ym(d)}-${pad(d.getDate())}`;
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleString("en-GB", { month: "long" });
const addMonths = (m: string, n: number) => { const d = new Date(`${m}-01T00:00:00`); d.setMonth(d.getMonth() + n); return ym(d); };
const rev = (r: SaleRow) => (Number(r.subtotal) || 0) + (Number(r.service_charge) || 0);
const short = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(2)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k` : `${Math.round(a)}`;
  return `${n < 0 ? "−" : ""}HK$${s}`;
};
const pctTxt = (n: number) => `${n.toFixed(1)}%`;
const DAYNAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Counts up from the number this viewer last saw to the new one; still when nothing changed. */
function CountUp({ value, storeKey }: { value: number; storeKey: string }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    let from = value;
    try { const v = Number(localStorage.getItem(storeKey)); if (Number.isFinite(v) && v > 0 && v < value) from = v; localStorage.setItem(storeKey, String(value)); } catch { /* storage unavailable: no animation */ }
    if (from === value || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(value); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 900); setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
  }, [value, storeKey]);
  return <>{shown}</>;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1200, left: 0 });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const read = () => { const r = el.getBoundingClientRect(); setBox({ w: r.width, left: r.left }); };
    const ro = new ResizeObserver(read); ro.observe(el); window.addEventListener("resize", read); read();
    return () => { ro.disconnect(); window.removeEventListener("resize", read); };
  }, []);
  return [ref, box.w, box.left] as const;
}

type Tile = { label: string; value: string; sub: React.ReactNode; status: string; tone: "ok" | "amb" | "quiet"; to: string };

export default function Landing() {
  const { user } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const vs = useVenueScope();
  const ask = useBaniAsk();
  const [talking] = useFloatingBaniOpen();
  const [ref, width, left] = useWidth();
  const askSlot = useRef<HTMLDivElement>(null);
  const size = width >= 1100 ? "wide" : width >= 700 ? "tab" : "ph";

  // Bani's typing box is rendered inside the ask slot (see FloatingBani); these centre the conversation when it opens.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--home-mid", `${left + width / 2}px`);
    root.style.setProperty("--home-w", `${Math.max(0, width - 32)}px`);
    // A conversation fills the whole page area: edge to edge, right under the top bar.
    const main = ref.current?.closest("main");
    if (main) {
      const r = main.getBoundingClientRect();
      root.style.setProperty("--chat-l", `${r.left}px`);
      root.style.setProperty("--chat-w", `${r.width}px`);
      root.style.setProperty("--chat-t", `${main.querySelector("header")?.getBoundingClientRect().bottom ?? r.top}px`);
    }
    return () => { ["--home-mid", "--home-w", "--chat-l", "--chat-w", "--chat-t"].forEach((v) => root.style.removeProperty(v)); };
  }, [left, width, talking]); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const thisMonth = ym(now);
  const lastMonth = addMonths(thisMonth, -1);
  // Home is always the month in progress; looking back happens in the overviews and the P&L report.
  const month = thisMonth;
  const isCurrent = month === thisMonth;
  const scopeIds = vs.filterIds;
  // A one-venue business picking its only venue sees the whole-business review.
  const onlyVenue = vs.venues.length === 1 && !vs.restricted;
  const venueId = scopeIds && scopeIds.length === 1 && !onlyVenue ? scopeIds[0] : null;
  const mixed = !!scopeIds && scopeIds.length > 1;

  const profile = useQuery({
    queryKey: ["landing", "profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await supabase.from("profiles").select("display_name").eq("user_id", user!.id).maybeSingle()).data?.display_name ?? "",
  });
  const first = (profile.data || (user?.user_metadata as any)?.full_name || user?.email?.split("@")[0] || "").split(/\s+/)[0];
  const hour = now.getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // Finance-team engine: latest completed review for this scope.
  const reviewQ = useQuery({
    queryKey: ["landing", "review", tenantId, venueId],
    enabled: !!tenantId && vs.ready && !mixed,
    queryFn: async (): Promise<Review | null> => {
      let q = (supabase as any).from("finance_team_reviews")
        .select("id,venue_id,venue_label,review_type,period_start,period_end,status,generated_at,specialists,synthesis")
        .eq("tenant_id", tenantId).eq("status", "completed").order("generated_at", { ascending: false }).limit(1);
      q = venueId ? q.eq("venue_id", venueId) : q.is("venue_id", null);
      const { data, error } = await q; if (error) throw error;
      return (data?.[0] ?? null) as Review | null;
    },
  });
  const views = useMemo(() => (reviewQ.data ? roleViews(reviewQ.data) : []), [reviewQ.data]);
  const needs = useMemo(() => ORDER.flatMap((r) => (views.find((v) => v.role === r)?.findings ?? [])
    .filter((f) => f.recommendation && (f.severity === "action" || f.severity === "watch")).map((f) => ({ role: r, f })))
    .sort((a, b) => (a.f.severity === "action" ? 0 : 1) - (b.f.severity === "action" ? 0 : 1)), [views]);
  const intakes = useReceiptIntakes(scopeIds ?? null);
  const total = needs.length + intakes.rows.length;
  const overdue = useMemo(() => {
    for (const v of views) for (const f of v.findings ?? []) if (/overdue/.test(f.key)) {
      const hk = (f.figures ?? []).filter((x: any) => x.unit === "HKD").reduce((a: number, x: any) => a + (Number(x.value) || 0), 0);
      if (hk > 0) return hk;
    }
    return 0;
  }, [views]);

  // Sales records: the chosen month (to yesterday when current), the same days a month earlier, and 8 weeks for the weekday chart.
  const salesQ = useQuery({
    queryKey: ["landing2", "sales", tenantId, scopeIds?.join(",") ?? "all", iso(now)],
    enabled: !!tenantId && vs.ready,
    queryFn: async () => {
      // Only the window Home shows: the oldest month choice (or 8 weeks back, if earlier) to today.
      const eight = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 56));
      const oldest = `${addMonths(thisMonth, -4)}-01`;
      const from = eight < oldest ? eight : oldest;
      const out: SaleRow[] = [];
      for (let off = 0; ; off += 1000) {
        let q = (supabase as any).from("sales_records").select("date,venue_id,subtotal,service_charge,guests")
          .eq("tenant_id", tenantId).gte("date", from).order("date", { ascending: true }).range(off, off + 999);
        if (scopeIds) q = q.in("venue_id", scopeIds);
        const { data, error } = await q; if (error) throw error;
        out.push(...((data ?? []) as SaleRow[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
  const { targets } = useRevenueTargets();
  const bankGl = useQuery({
    queryKey: ["landing2", "bank-gl", tenantId],
    enabled: !!tenantId,
    queryFn: async () => ((await (supabase as any).from("bank_accounts").select("linked_gl_account_id").eq("tenant_id", tenantId)).data ?? [])
      .map((b: any) => b.linked_gl_account_id).filter(Boolean) as string[],
    staleTime: 5 * 60_000,
  });
  // Six months back covers the oldest month choice plus its three-month comparison.
  // Once last month is closed, the checklist follows the month now in progress.
  const lastClosed = useQuery({
    queryKey: ["landing2", "last-closed", tenantId, lastMonth],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => ((await (supabase as any).from("finance_closed_periods").select("reopened_at").eq("tenant_id", tenantId).eq("month_start", `${lastMonth}-01`)).data ?? []).some((c: any) => !c.reopened_at),
  });
  const closeMonth = lastClosed.data ? thisMonth : lastMonth;
  // Theoretical stock: dishes' food-cost % from saved recipes, plus waste logged in the month.
  const menuPct = useQuery({
    queryKey: ["landing2", "menu-pct", tenantId],
    enabled: !!tenantId, staleTime: 5 * 60_000,
    queryFn: async () => {
      const [items, prices] = await Promise.all([
        (supabase as any).from("menu_items").select("id,theoretical_cost").eq("tenant_id", tenantId),
        (supabase as any).from("menu_item_pricing").select("menu_item_id,selling_price").eq("tenant_id", tenantId),
      ]);
      const price = new Map<string, number>(); for (const p of prices.data ?? []) if (!price.has(p.menu_item_id)) price.set(p.menu_item_id, Number(p.selling_price) || 0);
      return menuCostPercent((items.data ?? []).map((m: any) => ({ cost: Number(m.theoretical_cost) || 0, price: price.get(m.id) ?? 0 })));
    },
  });
  const homeFin = useHomeFinance(tenantId, addMonths(thisMonth, -6), closeMonth, lastClosed.isPending ? undefined : bankGl.data);
  const books = {
    entries: homeFin.data?.entries ?? [], lines: homeFin.data?.lines ?? [], accounts: homeFin.data?.accounts ?? [],
    closed: homeFin.data?.closed ?? [], checks: homeFin.data?.checks ?? [], loading: homeFin.isPending,
  };
  const facts = { data: homeFin.data, isPending: homeFin.isPending };

  // Work the team did in the last 7 days, one row per task; the same rows fill "What we did".
  const workQ = useWorkLog(tenantId);
  const handled = workQ.data?.length ?? 0;
  const [logOpen, setLogOpen] = useState(false);
  const allEntries = { entries: books.entries, lines: books.lines, accounts: books.accounts };
  const payroll = useMemo(() => (facts.data?.payroll ?? []) as any[], [facts.data]);
  const pl = (m: string) => financeProfit(allEntries.entries, allEntries.lines, allEntries.accounts, payroll, m);

  const wasteQ = useQuery({
    queryKey: ["landing2", "waste", tenantId, month],
    enabled: !!tenantId, staleTime: 5 * 60_000,
    queryFn: async () => ((await (supabase as any).from("inventory_movements_waste").select("total_value,quantity,unit_cost").eq("tenant_id", tenantId).gte("entry_date", `${month}-01`).lte("entry_date", `${month}-31`)).data ?? [])
      .reduce((a: number, w: any) => a + (w.total_value != null ? Number(w.total_value) : Number(w.quantity) * Number(w.unit_cost)), 0) as number,
  });
  // Purchases: supplier invoices by month, the month's budget, and prices that went up lately.
  const buyQ = useQuery({
    queryKey: ["landing2", "purchases", tenantId, month, scopeIds?.join(",")],
    enabled: !!tenantId && vs.ready,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const db = supabase as any;
      let iq = db.from("invoices").select("id,invoice_date,total_amount,voided_at,supplier_id,venue_id").eq("tenant_id", tenantId).gte("invoice_date", `${addMonths(month < thisMonth ? month : thisMonth, -3)}-01`).limit(5000);
      if (scopeIds?.length) iq = iq.in("venue_id", scopeIds);
      let bq = db.from("purchasing_budgets").select("amount,venue_id").eq("tenant_id", tenantId).eq("month", `${month}-01`);
      if (scopeIds?.length) bq = bq.in("venue_id", scopeIds);
      const [inv, sup, bud] = await Promise.all([iq, db.from("suppliers").select("id,name").eq("tenant_id", tenantId), bq]);
      const invoices = ((inv.data ?? []) as any[]).filter((i) => !i.voided_at);
      const since = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90));
      const recentIds = invoices.filter((i) => String(i.invoice_date) >= since).map((i) => i.id);
      const lines: any[] = [];
      for (let i = 0; i < recentIds.length; i += 100) {
        const { data } = await db.from("invoice_line_items").select("invoice_id,description,product_master_id,quantity,total").eq("tenant_id", tenantId).in("invoice_id", recentIds.slice(i, i + 100));
        lines.push(...(data ?? []));
      }
      return { invoices, lines, suppliers: new Map<string, string>(((sup.data ?? []) as any[]).map((x) => [x.id, x.name])),
        budget: ((bud.data ?? []) as any[]).reduce((a, b) => a + (Number(b.amount) || 0), 0) };
    },
  });
  // Staff: hours on the rota, costed at what each person cost per rota hour in the last payroll month.
  const rotaQ = useQuery({
    queryKey: ["landing2", "rota", tenantId, month],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const db = supabase as any;
      const from = `${addMonths(month, -3)}-01`;
      const last = `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()).padStart(2, "0")}`;
      const shifts: ShiftRow[] = [];
      for (let i = 0; ; i += 1000) {
        const { data } = await db.from("hr_shifts").select("employee_id,shift_date,start_time,end_time,break_minutes,actual_hours_worked,no_show,venue_id").eq("tenant_id", tenantId).gte("shift_date", from).lte("shift_date", last).order("id").range(i, i + 999);
        shifts.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const y = Number(addMonths(month, -3).slice(0, 4));
      const { data: pay } = await db.from("hr_payroll").select("employee_id,year,month,gross_salary,mpf_employer").eq("tenant_id", tenantId).gte("year", y).limit(5000);
      return { shifts, pay: (pay ?? []) as PayRow[] };
    },
  });
  const loading = tenantLoading || !vs.ready || salesQ.isPending || books.loading || facts.isPending;

  const k = useMemo(() => {
    const rows = salesQ.data ?? [];
    const end = isCurrent ? iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) : `${month}-31`;
    const cur = rows.filter((r) => r.date >= `${month}-01` && r.date <= end);
    const sales = cur.reduce((a, r) => a + rev(r), 0);
    const guests = cur.reduce((a, r) => a + (Number(r.guests) || 0), 0);
    const days = new Set(cur.map((r) => r.date)).size;
    const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
    const daysGone = isCurrent ? Math.max(0, now.getDate() - 1) : dim;
    const pace = isCurrent && daysGone > 0 ? (sales / daysGone) * dim : sales;
    const t = targets.find((x) => `${x.year}-${pad(x.month)}` === month);
    const target = t?.targetAmount ?? null;
    const p = pl(month);
    const prev = [1, 2, 3].map((i) => pl(addMonths(month, -i))).filter((x) => x.sales > 0);
    const avg = (f: (x: typeof p) => number) => (prev.length ? prev.reduce((a, x) => a + f(x), 0) / prev.length : null);
    const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const usualFood = avgOf(prev.filter((x) => x.food).map((x) => (x.food / x.sales) * 100));
    const usualStaff = avgOf(prev.filter((x) => x.staff).map((x) => (x.staff / x.sales) * 100));
    const usualProfit = avgOf(prev.filter((x) => x.food && x.staff).map((x) => x.profit));
    const usualCosts = avg((x) => x.food + x.staff + x.running);
    const booksSales = p.sales || sales;
    const theory = theoreticalStock(booksSales, menuPct.data ?? null, wasteQ.data ?? 0);
    const stockUsed = p.food ? p.food : theory;
    const rota = p.staff || !rotaQ.data ? null : rotaStaff(month, isCurrent ? end : `${month}-31`, rotaQ.data.shifts, rotaQ.data.pay, (s) => !scopeIds?.length || !s.venue_id || scopeIds.includes(s.venue_id));
    const staff = rota != null ? { amount: rota, basis: "rota" as const } : accruedStaff(month, p.staff || null, payroll, daysGone, dim, usualStaff, booksSales);
    const runningSoFar = isCurrent ? (p.running * Math.min(daysGone, dim)) / dim : p.running;
    const profit = accruedProfit(booksSales, stockUsed, staff.amount, runningSoFar);
    const missingDays = isCurrent ? Math.max(0, daysGone - days) : 0;
    const bankIds = new Set(bankGl.data ?? []);
    const cash = homeFin.data?.cash ?? 0;
    const money = (n: number, has: boolean) => (has ? short(n) : "—");
    const tiles: Tile[] = [
      { label: isCurrent ? "Sales so far" : "Sales", value: money(sales, days > 0), to: "/revenue",
        sub: !days ? "No sales recorded yet" : guests > 0 ? `${guests.toLocaleString("en-HK")} guests · HK$${Math.round(sales / guests)} each` : `${days} trading days`,
        ...(target ? { status: `${pace >= target ? "On track" : "Behind"} · target ${short(target)}`, tone: pace >= target ? "ok" : "amb" } as const
          : { status: isCurrent && days ? `Heading for ${short(pace)} · no target` : "No target set", tone: "quiet" } as const) },
      { label: "Stock used", value: money(stockUsed ?? 0, stockUsed != null), to: "/procurement/menu-costing", sub: stockUsed != null && booksSales ? `${pctTxt((stockUsed / booksSales) * 100)} of sales · ${p.food ? "booked" : "theoretical"}` : "No recipes or stock booked yet",
        ...(theory != null ? { status: p.food ? `Theoretical ${short(theory)}${Math.abs(p.food - theory) > theory * 0.1 ? ` · gap ${short(p.food - theory)}` : ""}` : `Booked ${short(p.food)} · from menu + waste`, tone: p.food && Math.abs(p.food - theory) > theory * 0.1 ? "amb" : "ok" } as const : { status: p.food ? `Booked ${short(p.food)}` : "Nothing to compare yet", tone: "quiet" } as const) },
      { label: "Staff cost", value: money(staff.amount ?? 0, staff.amount != null), to: "/hr/payroll", sub: staff.amount != null && booksSales ? `${pctTxt((staff.amount / booksSales) * 100)} of sales · ${staff.basis === "booked" ? "booked" : staff.basis === "rota" ? "from the rota" : "accrued so far"}` : "No payroll history yet",
        ...(usualStaff ? { status: `Usual ${pctTxt(usualStaff)}`, tone: staff.amount != null && booksSales && (staff.amount / booksSales) * 100 <= usualStaff + 1 ? "ok" : "amb" } as const : { status: "Nothing to compare yet", tone: "quiet" } as const) },
      { label: isCurrent ? "Profit so far" : "Profit", value: money(profit ?? 0, profit != null), to: "/finance/reports?view=pl", sub: profit != null && booksSales ? `${pctTxt((profit / booksSales) * 100)} of sales · accrual basis` : "Needs sales and recipes",
        ...(missingDays > 0 ? { status: `Sales missing for ${missingDays} of ${daysGone} days`, tone: "amb" } as const : usualProfit != null ? { status: `Usual ${short(isCurrent ? usualProfit * daysGone / dim : usualProfit)}${isCurrent ? " by now" : ""}`, tone: profit != null && profit >= (isCurrent ? usualProfit * daysGone / dim : usualProfit) ? "ok" : "amb" } as const : { status: "Nothing to compare yet", tone: "quiet" } as const) },
      { label: "Cash", value: bankIds.size ? short(cash) : "—", to: "/finance/cash",
        sub: overdue > 0 ? <span className="l2-amb">{short(overdue)} bills overdue</span> : "No bills overdue",
        ...(usualCosts && bankIds.size ? { status: `About ${Math.max(0, cash / usualCosts).toFixed(1)} months of costs`, tone: "ok" } as const : { status: "Bank not linked", tone: "quiet" } as const) },
    ];
    // Weekday chart: average sales per trading day over the last 8 weeks.
    const since = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 56));
    const sum = Array(7).fill(0), cnt = Array(7).fill(0);
    const byDay = new Map<string, number>();
    rows.filter((r) => r.date >= since).forEach((r) => byDay.set(r.date, (byDay.get(r.date) ?? 0) + rev(r)));
    byDay.forEach((v, d) => { const i = new Date(`${d}T00:00:00`).getDay(); sum[i] += v; cnt[i]++; });
    const week = [1, 2, 3, 4, 5, 6, 0].filter((i) => cnt[i] > 0).map((i) => ({ d: WEEKDAYS[i], full: DAYNAME[i], v: sum[i] / cnt[i] }));
    const low = week.length ? week.reduce((a, b) => (b.v < a.v ? b : a)) : null;
    const trend = [3, 2, 1].map((i) => { const m = addMonths(month, -i + (isCurrent ? 0 : 1)); const x = pl(m);
      return { m, food: x.sales && x.food ? (x.food / x.sales) * 100 : null, staff: x.sales && x.staff ? (x.staff / x.sales) * 100 : null }; })
      .filter((x) => x.food != null || x.staff != null);
    // Purchases spent: supplier invoices dated in the month.
    const inv = buyQ.data?.invoices ?? [];
    const spentIn = (m: string) => inv.filter((i) => String(i.invoice_date).slice(0, 7) === m).reduce((a, i) => a + (Number(i.total_amount) || 0), 0);
    const spent = spentIn(month);
    const salesIn = (m: string) => { const x = pl(m); return x.sales || rows.filter((r) => r.date.slice(0, 7) === m).reduce((a, r) => a + rev(r), 0); };
    const purch = [2, 1, 0].map((i) => { const m = addMonths(month, -i); const v = spentIn(m), sv = salesIn(m); return { m, amt: v, pct: sv ? (v / sv) * 100 : null }; }).filter((x) => x.amt > 0 || x.m === month);
    const budget = buyQ.data?.budget ?? 0;
    const budgetPace = budget && isCurrent ? (budget * Math.min(daysGone, dim)) / dim : budget;
    const spentPct = booksSales ? (spent / booksSales) * 100 : null;
    const lastInv = inv.filter((i) => String(i.invoice_date).slice(0, 7) === month).sort((a, b) => String(b.invoice_date).localeCompare(String(a.invoice_date)))[0];
    // Price watch: the latest price against what was usually paid in the 60 days before it.
    const dateOf = new Map(inv.map((i) => [i.id, String(i.invoice_date)]));
    const byItem = new Map<string, { name: string; d: string; q: number; t: number }[]>();
    for (const l of buyQ.data?.lines ?? []) {
      const d = dateOf.get(l.invoice_id); const q = Number(l.quantity) || 0; if (!d || q <= 0) continue;
      const key = l.product_master_id || String(l.description ?? "").trim().toLowerCase(); if (!key) continue;
      const arr = byItem.get(key) ?? []; arr.push({ name: String(l.description ?? "Item"), d, q, t: Number(l.total) || 0 }); byItem.set(key, arr);
    }
    const recent = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    const rises = [...byItem.values()].flatMap((arr) => {
      arr.sort((a, b) => a.d.localeCompare(b.d)); const last = arr[arr.length - 1]; if (last.d < recent) return [];
      const from = iso(new Date(new Date(`${last.d}T00:00:00`).getTime() - 60 * 864e5));
      const before = arr.filter((x) => x.d < last.d && x.d >= from); const bq = before.reduce((a, x) => a + x.q, 0); if (!bq) return [];
      const usual = before.reduce((a, x) => a + x.t, 0) / bq, nowP = last.t / last.q, pct = (nowP / usual - 1) * 100;
      const monthly = arr.filter((x) => x.d >= iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30))).reduce((a, x) => a + x.q, 0) * (nowP - usual);
      return pct > 5 ? [{ name: last.name, pct, monthly }] : [];
    }).sort((a, b) => b.monthly - a.monthly);
    // P&L on an accrual basis.
    const plLines = [
      { name: "Sales", v: booksSales, sign: 1 },
      { name: "Purchases", v: stockUsed, sign: -1 },
      { name: "Staff", v: staff.amount, sign: -1 },
      { name: "Running costs", v: runningSoFar, sign: -1 },
    ];
    // Performance: where each area stands and the next step.
    const lowDay = low && week.length ? { name: low.full, pct: (1 - low.v / (week.reduce((a, w) => a + w.v, 0) / week.length)) * 100 } : null;
    const perf = [
      { area: "Revenue", ok: target ? pace >= target : true,
        line: target ? (isCurrent ? `${short(sales)} of ${short(target)} target` : `${pace >= target ? "beat" : "missed"} target by ${Math.abs(Math.round(((sales - target) / target) * 100))}%`) : `${short(sales)} · no target set`,
        next: missingDays > 0 ? `Next: send sales for the ${missingDays} missing ${missingDays === 1 ? "day" : "days"}` : !target ? "Next: set a target with Bani" : lowDay && lowDay.pct > 10 ? `Next: lift ${lowDay.name}s, ${Math.round(lowDay.pct)}% below an average day` : "On track" },
      { area: "Purchasing", ok: !rises.length && !(usualFood && spentPct != null && spentPct > usualFood + 1) && !(budgetPace && spent > budgetPace),
        line: rises.length ? `${rises[0].name} up ${rises[0].pct.toFixed(1)}%` : budget ? `${short(spent)} of ${short(budget)} budget` : spentPct != null && spent ? `${pctTxt(spentPct)} of sales${usualFood ? `, usual ${pctTxt(usualFood)}` : ""}` : "No invoices this month yet",
        next: rises.length ? `Next: ask the supplier${rises[0].monthly > 0 ? `, about ${short(rises[0].monthly)} a month` : ""}` : !budget ? "Next: set a budget with Bani" : "On track" },
      { area: "Staff", ok: !(usualStaff && staff.amount != null && booksSales && (staff.amount / booksSales) * 100 > usualStaff + 1),
        line: staff.basis === "rota" && missingDays > 0 ? `${short(staff.amount)} on the rota so far` : staff.amount != null && booksSales ? `${pctTxt((staff.amount / booksSales) * 100)} of sales${usualStaff ? `, usual ${pctTxt(usualStaff)}` : ""}` : "No payroll yet",
        next: usualStaff && staff.amount != null && booksSales && (staff.amount / booksSales) * 100 > usualStaff + 1 ? "Next: check next week's rota against bookings" : "On track" },
    ];
    return { tiles, week, low, trend, hasTarget: !!target, booksSales, profit, plLines, spent, spentPct, usualFood, budget, purch, lastInv, perf, missingDays, daysGone, dim,
      cash: bankIds.size ? short(cash) : null, salesTile: tiles[0], profitTile: tiles[3] };
  }, [salesQ.data, books.entries, books.lines, books.accounts, payroll, targets, bankGl.data, overdue, month, menuPct.data, wasteQ.data, buyQ.data, rotaQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Month-end checklist for last month, until it is closed.
  const closed = books.closed.some((c: any) => c.month_start === `${closeMonth}-01` && !c.reopened_at);
  const check = books.checks.find((c) => c.month === closeMonth);
  const steps = closeRows(check, (facts.data?.bank ?? []) as any, (facts.data?.batches ?? []) as any);
  const open = steps.filter((s) => s.state === "open"), done = steps.filter((s) => s.state === "done"), skip = steps.filter((s) => s.state === "skip");
  const counted = steps.length - skip.length;

  const pills = [
    !closed ? "What's left on month-end?" : null,
    k.low ? `Why are ${k.low.full}s slow?` : null,
    "Draft next week's rota",
    !k.hasTarget ? `Set ${monthName(thisMonth)}'s sales target` : "How are we doing against target?",
  ].filter(Boolean) as string[];

  const needLine = (f: Finding) => { const fig = (f.figures ?? []).find((x: any) => Number(x.value)); return f.title + (fig?.display ? ` · ${fig.display}` : ""); };

  if (talking) return <div ref={ref} className={`ld talking ${size}`} aria-label="Conversation with Bani" />;

  const maxW = Math.max(1, ...k.week.map((w) => w.v));

  return (
    <div ref={ref} className={`ld l2 ${size}`}>
      <div className="l2-head">
        <h1 className="ld-h1">{greet}{first ? `, ${first}` : ""}</h1>
      </div>
      <div className="l2-team">
        <span className="l2-tw">
          <span className="l2-tw-w">Your finance team</span>
          <span className="l2-tw-a" aria-hidden="true">{ORDER.map((r, i) => { return <span key={r} className="l2-av" title={TEAMNAME[r]} style={{ ["--i" as any]: i, background: TEAM_CHARACTERS[r].tint }}><TeamAvatar role={r} variant="bust" px={1} /></span>; })}</span>
        </span>
        {handled > 0
          ? <button type="button" className="l2-team-btn" onClick={() => setLogOpen(true)} aria-label="See what your finance team did this week">handled <b><CountUp value={handled} storeKey={`bani-handled-${tenantId}`} /> {handled === 1 ? "thing" : "things"}</b><span className="l2-wk"> this week</span> <span className="ar" aria-hidden="true">→</span></button>
          : <span>{workQ.isPending ? "is catching up" : "has nothing new to book this week"}</span>}
      </div>
      <WorkLogDialog open={logOpen} onOpenChange={setLogOpen} rows={workQ.data ?? []} />
      {/* The chat bar sits in the page at every width, under the greeting. */}
      <div ref={askSlot} id="bani-home-slot" className="l2-askslot" />
      <div className="l2-pills">{pills.map((p) => <button key={p} onClick={() => ask(p)}>{p}</button>)}</div>

      <div className="l2-lab">{isCurrent ? `${monthName(month)} so far · day ${k.daysGone} of ${k.dim}` : monthName(month)}</div>
      {loading ? <div className="l2-snap">{[0, 1, 2].map((i) => <section key={i} className="l2-col"><Skeleton className="h-4 w-1/3 !animate-none" /><Skeleton className="h-8 w-2/3 mt-2 !animate-none" /><Skeleton className="h-[150px] w-full mt-6 !animate-none" /></section>)}</div> :
      <div className="l2-snap loading-reveal">
        <section className="l2-col">
          <Link to={k.salesTile.to} className="l2-top"><div className="k">{k.salesTile.label}</div><div className="v">{k.salesTile.value}</div><div className="d">{k.salesTile.sub}</div>
            <div className={`s ${k.salesTile.tone}`}><i />{k.salesTile.status}</div></Link>
          <div className="l2-ch"><div className="pt">Sales by weekday <span>· average a day, last 8 weeks</span></div>
            {k.week.length ? <div className="l2-bars">{k.week.map((w) => <div key={w.d}><span className="pv">{short(w.v).replace("HK$", "")}</span><span className="l2-pm-bar"><i style={{ height: w.v > 0 ? `max(4px, ${(w.v / maxW) * 100}%)` : "0px" }} className={k.low?.d === w.d ? "low" : ""} /></span><span className="pd">{w.d}</span></div>)}</div>
              : <p className="l2-empty">No sales in the last 8 weeks.</p>}</div>
        </section>
        <section className="l2-col">
          <Link to="/procurement/dashboard" className="l2-top"><div className="k">{isCurrent ? "Purchases so far" : "Purchases"}</div>
            <div className="v">{buyQ.isPending ? "…" : k.spent ? short(k.spent) : "—"}</div>
            <div className="d">{k.spent && k.spentPct != null ? `${pctTxt(k.spentPct)} of sales` : k.lastInv ? "" : "No supplier invoices yet"}</div>
            <div className={`s ${k.spentPct != null && k.usualFood && k.spentPct > k.usualFood + 1 ? "amb" : k.spent ? "ok" : "quiet"}`}><i />{k.usualFood ? `Usual ${pctTxt(k.usualFood)}` : "Nothing to compare yet"}{k.lastInv ? ` · last invoice ${new Date(`${k.lastInv.invoice_date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</div></Link>
          {k.budget ? <div className="l2-bud"><span className="cbar"><i style={{ width: `${Math.min(100, (k.spent / k.budget) * 100)}%` }} className={k.spent > k.budget ? "over" : ""} /></span><span>{short(k.spent)} of {short(k.budget)} budget</span></div>
            : <button type="button" className="l2-bud" onClick={() => ask(`Set ${monthName(month)}'s purchasing budget`)}><span>No budget set</span><b>Set one with Bani</b></button>}
          <div className="l2-ch"><div className="pt">Purchases <span>· last 3 months</span></div>
            {k.purch.some((x) => x.amt > 0) ? <div className="l2-bars l2-pm">{k.purch.map((x) => <div key={x.m}><span className="pv">{short(x.amt)}</span><span className="l2-pm-bar"><i className={x.m === month ? "" : "old"} style={{ height: x.amt > 0 ? `max(4px, ${(x.amt / Math.max(1, ...k.purch.map((y) => y.amt))) * 100}%)` : "0px" }} /></span><span className="pd"><span>{monthName(x.m).slice(0, 3)}</span><span>{x.m === month && isCurrent ? "so far" : x.pct != null ? pctTxt(x.pct) : ""}</span></span></div>)}</div>
              : <p className="l2-empty">No supplier invoices yet.</p>}</div>
        </section>
        <section className="l2-col">
          <Link to="/finance/reports?view=pl" className="l2-top"><div className="k">P&amp;L</div>
            <div className="v">{k.profit != null ? short(k.profit) : "—"}<span className="vl"> {isCurrent ? "so far" : "profit"}</span></div>
            <div className="d">Accrual basis</div>
            <div className={`s ${k.profitTile.tone}`}><i />{k.profitTile.status}</div></Link>
          <div className="l2-ch l2-pl">
            {k.plLines.map((l) => <div key={l.name}><span>{l.name}</span><b>{l.v == null ? "—" : `${l.sign < 0 ? "−" : ""}${short(l.v)}`}</b></div>)}
            <div className="tot"><span>{isCurrent ? "Profit so far" : "Profit"}</span><b>{k.profit != null ? short(k.profit) : "—"}</b></div>
          </div>
          <Link to="/finance/cash" className="l2-cash"><span>Cash {k.cash ?? "not linked"}</span>{overdue > 0 ? <span className="l2-amb">{short(overdue)} bills overdue</span> : <span>No bills overdue</span>}</Link>
        </section>
      </div>}

      {loading || (reviewQ.isPending && !mixed) ? <div className="l2-work">{[0, 1, 2].map((i) => <section key={i} className="l2-wb"><Skeleton className="h-5 w-1/2 !animate-none" /><Skeleton className="h-4 w-3/4 mt-4 !animate-none" /><Skeleton className="h-4 w-2/3 mt-2 !animate-none" /></section>)}</div> :
      <div className="l2-work loading-reveal">
        <section className="l2-wb">
          <div className="wh"><span className="wn">{total}</span><span className="wt">{total === 1 ? "thing needs you" : "things need you"}</span>
            {total > 0 && <button className="go" onClick={() => ask("Go through what needs me, one at a time")}>Go through with Bani</button>}</div>
          <div className="wl">
            {mixed ? <div>Pick one venue or all venues to see what your team found.</div>
              : <><ReceiptIntakes venueIds={scopeIds ?? null} home />{needs.length === 0 ? (intakes.rows.length ? null : <div><i className="ok" />Nothing needs you right now</div>)
              : <>{needs.slice(0, 2).map(({ f }) => <button key={f.key} className="wi" onClick={() => ask(`${f.title}: ${f.statement}`)}><i className={f.severity === "action" ? "amb" : ""} />{needLine(f)}</button>)}
                {needs.length > 2 && <div className="more">+ {needs.length - 2} more</div>}</>}</>}
          </div>
        </section>
        <section className="l2-wb">
          <Link to={`/finance/close?month=${closeMonth}`} className="wh">
            <span className="wt">Month-end checklist</span>
            {closed ? <span className="wc">{monthName(closeMonth)} closed</span> : <><span className="cbar"><i style={{ width: `${counted ? (done.length / counted) * 100 : 0}%` }} /></span><span className="wc">{done.length} of {counted}</span></>}
            <span className="ar">→</span>
          </Link>
          <div className="wl">
            {closed ? <div><i className="ok" />{monthName(closeMonth)} is closed and locked</div> : <>
              {[...open.map((s) => <div key={s.name}><i className="amb" />{s.detail.toLowerCase().startsWith(s.name.toLowerCase()) ? s.detail : `${s.name} · ${s.detail}`}</div>),
                ...(done.length ? [<div key="done"><i className="ok" />{done.map((s) => s.name.toLowerCase()).join(", ").replace(/^./, (c) => c.toUpperCase())} done</div>] : []),
                ...(skip.length ? [<div key="skip"><i className="na" />{skip.map((s) => s.name.toLowerCase()).join(" and ").replace(/^./, (c) => c.toUpperCase())} not set up</div>] : [])].slice(0, 3)}
            </>}
          </div>
        </section>
        <section className="l2-wb">
          <button type="button" className="wh" onClick={() => ask(`How is the restaurant performing in ${monthName(month)}, and what should I do to improve the P&L?`)}>
            <span className="wt">Your restaurant's performance</span><span className="ar">→</span></button>
          <div className="wl">
            {k.perf.map((x) => <button key={x.area} type="button" className="wi pf" onClick={() => ask(`${x.area}: ${x.line}. What should I do?`)}>
              <i className={x.ok ? "ok" : "amb"} /><span><b>{x.area}</b> · {x.line}<em>{x.next}</em></span></button>)}
            <Link to="/finance/reports?view=pl" className="more">+ indirect costs, other expenses</Link>
          </div>
        </section>
      </div>}
    </div>
  );
}
