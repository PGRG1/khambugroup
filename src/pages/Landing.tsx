import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { PixelAvatar } from "@/components/team/PixelAvatar";
import "@/components/team/team.css";
import { useBaniTopic, useFloatingBaniOpen } from "@/components/assistant/FloatingBaniContext";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useFinanceBooks } from "@/hooks/useFinanceBooks";
import { useFinanceOverviewData } from "@/hooks/useFinanceOverviewData";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { closeRows, financeProfit } from "@/utils/financeOverview";
import { ROLES, roleViews, type Review, type Role } from "./YourTeam";
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
  const openTopic = useBaniTopic();
  const [talking] = useFloatingBaniOpen();
  const [ref, width, left] = useWidth();
  const askSlot = useRef<HTMLDivElement>(null);
  const [play, setPlay] = useState(0); // replays the team motion on hover
  const size = width >= 1100 ? "wide" : width >= 700 ? "tab" : "ph";

  // Bani's typing box is rendered inside the ask slot (see FloatingBani); these centre the conversation when it opens.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--home-mid", `${left + width / 2}px`);
    root.style.setProperty("--home-w", `${Math.max(0, width - 32)}px`);
    return () => { root.style.removeProperty("--home-mid"); root.style.removeProperty("--home-w"); };
  }, [left, width, talking]);

  const now = new Date();
  const thisMonth = ym(now);
  const lastMonth = addMonths(thisMonth, -1);
  // Early in the month there is too little to judge: open on last month until a week has passed.
  const [picked, setPeriod] = useState<"this" | "last" | null>(null);
  const [autoPeriod, setAutoPeriod] = useState<"this" | "last">("last");
  const period = picked ?? autoPeriod;
  const month = period === "this" ? thisMonth : lastMonth;
  const isCurrent = month === thisMonth;
  const scopeIds = vs.filterIds;
  const venueId = scopeIds && scopeIds.length === 1 ? scopeIds[0] : null;
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
      const all = (await fetchAllRows("sales_records", "date,venue_id,subtotal,service_charge,guests", { col: "date", asc: true }, tenantId, true)) as SaleRow[];
      return all.filter((r) => !scopeIds || scopeIds.includes(r.venue_id as string));
    },
  });
  useEffect(() => {
    if (!salesQ.data) return;
    const days = new Set(salesQ.data.filter((r) => r.date >= `${thisMonth}-01`).map((r) => r.date)).size;
    setAutoPeriod(days >= 7 ? "this" : "last");
  }, [salesQ.data, thisMonth]);
  const books = useFinanceBooks(Number(month.slice(0, 4))); // loads the whole books window
  const facts = useFinanceOverviewData();
  const { targets } = useRevenueTargets();
  const bankGl = useQuery({
    queryKey: ["landing2", "bank-gl", tenantId],
    enabled: !!tenantId,
    queryFn: async () => ((await (supabase as any).from("bank_accounts").select("linked_gl_account_id").eq("tenant_id", tenantId)).data ?? [])
      .map((b: any) => b.linked_gl_account_id).filter(Boolean) as string[],
  });

  // Work the team did in the last 7 days: entries booked and bank lines matched.
  const workQ = useQuery({
    queryKey: ["landing2", "work", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const n = async (t: string, col: string, extra?: (q: any) => any) => {
        let q = (supabase as any).from(t).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte(col, since);
        if (extra) q = extra(q);
        const { count } = await q; return count ?? 0;
      };
      // Everything the team booked into the books (invoices, sales, payroll, bills) plus bank lines it matched.
      const [booked, bank] = await Promise.all([n("journal_entries", "created_at", (q) => q.eq("status", "posted")),
        n("bank_transactions", "updated_at", (q) => q.in("status", ["matched", "cleared", "posted"]))]);
      return booked + bank;
    },
  });
  const handled = workQ.data ?? 0;
  const allEntries = { entries: books.entries, lines: books.lines, accounts: books.accounts };
  const payroll = useMemo(() => (facts.data?.payroll ?? []) as any[], [facts.data]);
  const pl = (m: string) => financeProfit(allEntries.entries, allEntries.lines, allEntries.accounts, payroll, m);

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
    const foodPct = booksSales ? (p.food / booksSales) * 100 : null, staffPct = booksSales ? (p.staff / booksSales) * 100 : null;
    const bankIds = new Set(bankGl.data ?? []);
    const posted = new Set(allEntries.entries.filter((e) => e.status === "posted").map((e) => e.id));
    let cash = 0;
    for (const l of allEntries.lines as any[]) if (bankIds.has(l.account_id) && posted.has(l.entry_id)) cash += Number(l.debit) - Number(l.credit);
    const money = (n: number, has: boolean) => (has ? short(n) : "—");
    const booked = p.food !== 0 || p.staff !== 0 || p.sales !== 0;
    const tiles: Tile[] = [
      { label: isCurrent ? "Sales so far" : "Sales", value: money(sales, days > 0), to: "/revenue",
        sub: !days ? "No sales recorded yet" : guests > 0 ? `${guests.toLocaleString("en-HK")} guests · HK$${Math.round(sales / guests)} each` : `${days} trading days`,
        ...(target ? { status: `${pace >= target ? "On track" : "Behind"} · target ${short(target)}`, tone: pace >= target ? "ok" : "amb" } as const
          : { status: isCurrent && days ? `Heading for ${short(pace)} · no target` : "No target set", tone: "quiet" } as const) },
      { label: "Stock bought", value: money(p.food, p.food !== 0), to: "/procurement", sub: foodPct != null && p.food !== 0 ? `${pctTxt(foodPct)} of sales` : "Not booked yet",
        ...(foodPct != null && p.food !== 0 && usualFood ? { status: `Usual ${pctTxt(usualFood)}`, tone: foodPct <= usualFood + 1 ? "ok" : "amb" } as const : { status: "Nothing to compare yet", tone: "quiet" } as const) },
      { label: "Staff cost", value: money(p.staff, p.staff !== 0), to: "/hr/payroll", sub: staffPct != null && p.staff !== 0 ? `${pctTxt(staffPct)} of sales` : "Payroll not booked yet",
        ...(staffPct != null && p.staff !== 0 && usualStaff ? { status: `Usual ${pctTxt(usualStaff)}`, tone: staffPct <= usualStaff + 1 ? "ok" : "amb" } as const : { status: "Nothing to compare yet", tone: "quiet" } as const) },
      { label: isCurrent ? "Profit so far" : "Profit", value: money(p.profit, booked), to: "/finance/reports?view=pl", sub: booked && booksSales ? `${pctTxt((p.profit / booksSales) * 100)} of sales` : "Not booked yet",
        ...(usualProfit != null && !isCurrent ? { status: `Usual ${short(usualProfit)}`, tone: p.profit >= usualProfit ? "ok" : "amb" } as const : { status: isCurrent ? "Books still filling in" : "Nothing to compare yet", tone: "quiet" } as const) },
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
    return { tiles, week, low, trend, hasTarget: !!target };
  }, [salesQ.data, books.entries, books.lines, books.accounts, payroll, targets, bankGl.data, overdue, month]); // eslint-disable-line react-hooks/exhaustive-deps

  // Month-end checklist for last month, until it is closed.
  const closeMonth = lastMonth;
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

  const ask = (t: string) => openTopic(t);
  const needLine = (f: Finding) => { const fig = (f.figures ?? []).find((x: any) => Number(x.value)); return f.title + (fig?.display ? ` · ${fig.display}` : ""); };

  if (talking) return <div ref={ref} className={`ld talking ${size}`} aria-label="Conversation with Bani" />;

  const maxW = Math.max(1, ...k.week.map((w) => w.v));
  const tr = k.trend; const vals = tr.flatMap((x) => [x.food, x.staff]).filter((v): v is number => v != null);
  const lo = Math.min(...vals, 100) - 3, hi = Math.max(...vals, 0) + 3;
  const ty = (v: number) => 92 - ((v - lo) / Math.max(1, hi - lo)) * 80;
  const tx = (i: number) => (tr.length > 1 ? 24 + (i * 252) / (tr.length - 1) : 150);
  const hasStaff = tr.some((x) => x.staff != null), hasFood = tr.some((x) => x.food != null);
  const line = (key: "food" | "staff") => tr.map((x, i) => (x[key] != null ? `${tx(i)},${ty(x[key]!)}` : "")).filter(Boolean).join(" ");

  return (
    <div ref={ref} className={`ld l2 ${size}`}>
      <div className="l2-head">
        <h1 className="ld-h1">{greet}{first ? `, ${first}` : ""}</h1>
        <div className="l2-per" role="group" aria-label="Period">
          <button className={period === "this" ? "on" : ""} onClick={() => setPeriod("this")}>This month</button>
          <button className={period === "last" ? "on" : ""} onClick={() => setPeriod("last")}>{monthName(lastMonth)}</button>
        </div>
      </div>
      <div className="l2-team">
        <span className="l2-avs" aria-hidden="true" onMouseEnter={() => setPlay((n) => n + 1)}>{ORDER.map((r, i) => { const m = ROLES.find((x) => x.key === r)!; return <span key={`${r}-${play}`} className="l2-av" style={{ ["--i" as any]: i }}><PixelAvatar seed={m.seed} palette={m.pal} size={22} /></span>; })}</span>
        <span className="l2-word" key={`w-${play}`} aria-label="Your finance team">
          <span className="w0">Your finance team</span>
          {ORDER.map((r, i) => <span key={r} className="wn" style={{ ["--i" as any]: i }} aria-hidden="true">{TEAMNAME[r]} team</span>)}
          <span className="w1" aria-hidden="true">Your finance team</span>
        </span>
        <span>{handled > 0 ? <>handled <b>{handled} things</b> this week</> : workQ.isPending ? "is catching up" : "has nothing new to book this week"}</span>
      </div>
      <div ref={askSlot} id="bani-home-slot" className="l2-askslot" />
      <div className="l2-pills">{pills.map((p) => <button key={p} onClick={() => ask(p)}>{p}</button>)}</div>

      <div className="l2-kpis">
        {loading ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="l2-kpi"><Skeleton className="h-4 w-2/3 !animate-none" /><Skeleton className="h-7 w-3/4 mt-2 !animate-none" /><Skeleton className="h-4 w-1/2 mt-2 !animate-none" /></div>)
          : k.tiles.map((t) => (
            <Link key={t.label} to={t.to} className="l2-kpi loading-reveal">
              <div className="k">{t.label}</div><div className="v">{t.value}</div><div className="d">{t.sub}</div>
              <div className={`s ${t.tone}`}><i />{t.status}</div>
            </Link>))}
      </div>

      <h2 className="ld-h2 l2-h2">Performance</h2>
      <div className="l2-perf">
        <section className="l2-pc">
          <div className="pt">Sales by weekday</div><div className="ps">Average a day, last 8 weeks</div>
          {k.week.length ? <div className="l2-bars">{k.week.map((w) => <div key={w.d}><span className="pv">{short(w.v).replace("HK$", "")}</span><i style={{ height: `${(w.v / maxW) * 80}px` }} className={k.low?.d === w.d ? "low" : ""} /><span className="pd">{w.d}</span></div>)}</div>
            : <p className="l2-empty">No sales in the last 8 weeks.</p>}
        </section>
        <section className="l2-pc">
          <div className="pt">Stock bought and staff cost, % of sales</div><div className="ps">Last {tr.length || 3} months</div>
          {tr.length ? <svg viewBox="0 0 300 110" className="l2-line" role="img" aria-label="Stock bought and staff cost trend">
            {hasStaff && <polyline points={line("staff")} fill="none" stroke="#2F6B4F" strokeWidth="2.5" />}
            {hasFood && <polyline points={line("food")} fill="none" stroke="#7FD3A8" strokeWidth="2.5" />}
            {tr.map((x, i) => <g key={x.m}>
              {x.staff != null && <><circle cx={tx(i)} cy={ty(x.staff)} r="3.5" fill="#2F6B4F" /><text x={tx(i)} y={ty(x.staff) - 8} textAnchor="middle">{pctTxt(x.staff)}</text></>}
              {x.food != null && <><circle cx={tx(i)} cy={ty(x.food)} r="3.5" fill="#7FD3A8" /><text x={tx(i)} y={ty(x.food) + (x.staff != null && Math.abs(ty(x.food) - ty(x.staff)) < 18 ? 16 : -8)} textAnchor="middle">{pctTxt(x.food)}</text></>}
              <text x={tx(i)} y="108" textAnchor="middle" className="m">{monthName(x.m).slice(0, 3)}</text></g>)}
          </svg> : <p className="l2-empty">No booked months to compare yet.</p>}
          {tr.length > 0 && <div className="l2-lg">{hasStaff ? <span><i style={{ background: "#2F6B4F" }} />Staff</span> : <span>Staff cost not booked</span>}{hasFood && <span><i style={{ background: "#7FD3A8" }} />Stock bought</span>}</div>}
        </section>
      </div>

      <div className="l2-work">
        <section className="l2-wb">
          <div className="wh"><span className="wn">{needs.length}</span><span className="wt">{needs.length === 1 ? "thing needs you" : "things need you"}</span>
            {needs.length > 0 && <button className="go" onClick={() => ask("Go through what needs me, one at a time")}>Go through them with Bani</button>}</div>
          <div className="wl">
            {mixed ? <div>Pick one venue or all venues to see what your team found.</div>
              : needs.length === 0 ? <div><i className="ok" />Nothing needs you right now</div>
              : <>{needs.slice(0, 3).map(({ f }) => <button key={f.key} className="wi" onClick={() => ask(`${f.title}: ${f.statement}`)}><i className={f.severity === "action" ? "amb" : ""} />{needLine(f)}</button>)}
                {needs.length > 3 && <div className="more">+ {needs.length - 3} more</div>}</>}
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
              {open.slice(0, 2).map((s) => <div key={s.name}><i className="amb" />{s.detail.toLowerCase().startsWith(s.name.toLowerCase()) ? s.detail : `${s.name} · ${s.detail}`}</div>)}
              {done.length > 0 && <div><i className="ok" />{done.map((s) => s.name.toLowerCase()).join(", ").replace(/^./, (c) => c.toUpperCase())} done</div>}
              {skip.length > 0 && <div><i className="na" />{skip.map((s) => s.name.toLowerCase()).join(" and ").replace(/^./, (c) => c.toUpperCase())} not set up</div>}
            </>}
          </div>
        </section>
      </div>
    </div>
  );
}
