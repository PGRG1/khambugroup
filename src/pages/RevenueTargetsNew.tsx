import {baseSymbol} from '@/utils/money';
import {usePlannedMonths} from '@/hooks/usePlannedMonths';
import {usePagePeriod} from '@/hooks/usePagePeriod';
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { useSalesData } from "@/hooks/useSalesData";
import { shortMoney } from "@/utils/revenueOverview";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { ChevronDown } from "lucide-react";
import { RevenueEnter, lineBuild } from "@/components/revenue/RevenueMotion";
import { Num } from "@/components/home/HomeMotion";
import { useMonthTarget } from "@/hooks/useMonthTarget";
import { useAuth } from "@/hooks/useAuth";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import {
  monthDates,
} from "@/utils/dailyProjections";
import { toast } from "@/hooks/use-toast";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { dailyHistory, lineKey, venueDayLines, type HistRow, type SavedLine, type TargetLine } from "@/utils/targetLines";

/** Targets: one monthly target figure, the projected month (actual + remaining days), pace and the daily projection table. */
export default function RevenueTargetsNew() {
  const vs = useVenueScope();
  // Follows the shared venue scope; with several venues each day splits into one line per venue.
  const scopeVenues = useMemo(() => vs.selectedVenues.filter((v) => v.is_active && v.id && v.name), [vs.selectedVenues]);
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const plan=usePlannedMonths("targets");
  const period=usePagePeriod(plan.months.map(m=>m+"-01"),"mtd","month",{allowFuture:plan.end});
  const ym=period.month;
  const [year, month] = ym.split("-").map(Number);

  const [rowError, setRowError] = useState<Record<string, string>>({});
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const dates = useMemo(() => monthDates(year, month), [year, month]);

  // ---- The month's target: one figure for the venues it covers (revenue_targets) ----
  // The target applies when the venues in view are exactly the venues it covers (none listed = all venues).
  const allNames = useMemo(() => vs.venues.filter((v) => v.is_active && v.name).map((v) => v.name).sort(), [vs.venues]);
  const scopeNames = useMemo(() => scopeVenues.map((v) => v.name).sort(), [scopeVenues]);
  const goal = useMonthTarget(year, month, scopeNames, allNames);
  const target = goal.target;
  const targetLoading = goal.loading;
  const goalElsewhere = !!goal.elsewhere; // set, but for a different set of venues
  const goalNames = goal.elsewhere ?? [];
  const [goalEdit, setGoalEdit] = useState<string | null>(null);
  const saveGoal = async (raw: string) => {
    setGoalEdit(null);
    const v = Number(raw.replace(/[^0-9.]/g, ""));
    if (!raw.trim() || !Number.isFinite(v) || v <= 0 || !tenantId) return;
    if (goalElsewhere) return;
    const { ok } = await goal.save(v);
    if (!ok) toast({ title: "Target not saved", description: "Only owners and managers can set targets.", variant: "destructive" });
    else toast({ title: `${monthName} target ${shortMoney(Math.round(v))}` });
  };

  // ---- Saved projections for every venue in view, with who set them ----
  const [projTick, setProjTick] = useState(0);
  const [proj, setProj] = useState<SavedLine[]>([]);
  const scopeKey = scopeVenues.map((v) => v.id).sort().join(",");
  // Loading is "the rows in hand are not for what is in view", so no render ever shows a
  // new month or venue with the old (or no) projections. Saves reload without counting as loading.
  const projWant = `${tenantId}|${scopeKey}|${dates[0]}`;
  const [projHave, setProjHave] = useState<string | null>(null);
  const projLoading = projHave !== projWant;
  useEffect(() => {
    const ids = scopeKey ? scopeKey.split(",") : [];
    if (!tenantId || !ids.length) { setProj([]); setProjHave(projWant); return; }
    let live = true;
    (async () => {
      const { data } = await supabase.from("revenue_daily_projections").select("venue_id, target_date, line_kind, service_period_id, label, projected_sales, projected_guests, projected_spend, source, created_by, updated_at")
        .eq("tenant_id", tenantId).in("venue_id", ids).gte("target_date", dates[0]).lte("target_date", dates[dates.length - 1]);
      const who = [...new Set((data ?? []).map((r) => r.created_by).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (who.length) {
        const { data: ps } = await supabase.from("profiles").select("user_id, display_name").in("user_id", who);
        for (const p of ps ?? []) if (p.display_name) names.set(p.user_id, p.display_name);
      }
      if (live) {
        setProj((data ?? []).map((r) => ({ venueId: r.venue_id, date: r.target_date, kind: (r.line_kind ?? "day") as SavedLine["kind"], periodId: r.service_period_id ?? null, label: r.label ?? null,
          sales: Number(r.projected_sales), guests: r.projected_guests == null ? null : Number(r.projected_guests), spend: r.projected_spend == null ? null : Number(r.projected_spend),
          bani: r.source === "bani", by: (r.created_by && names.get(r.created_by)) || undefined, at: r.updated_at })));
        setProjHave(projWant);
      }
    })();
    return () => { live = false; };
  }, [tenantId, scopeKey, dates, projTick, projWant]);
  const periodsQ = useVenueServicePeriods(useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]));
  const loading = projLoading || targetLoading || !vs.ready || !period.settled || plan.isLoading || periodsQ.loading; // the saved month first, so only that month loads


  // ---- Each venue's day, line by line (its periods, delivery, events): saved where set, otherwise auto ----
  const { data: allSales, loading: salesLoading } = useSalesData();
  const ready = !loading && !salesLoading; // forecasts need the sales history: enter only when both are in
  const histByVenue = useMemo(() => {
    const rows = new Map<string, HistRow[]>();
    const names = new Set(scopeVenues.map((v) => v.name));
    for (const r of allSales) {
      if (!names.has(r.venue)) continue;
      const a = rows.get(r.venue) ?? []; rows.set(r.venue, a);
      a.push({ date: r.date, periodId: r.servicePeriodId ?? null, sales: r.totalSales || 0, guests: r.guests || 0, delivery: (r.deliveroo || 0) + (r.foodpanda || 0) + (r.keeta || 0) });
    }
    return new Map([...rows].map(([v, a]) => [v, dailyHistory(a)]));
  }, [allSales, scopeVenues]);

  type Line = TargetLine & { venue: string; key: string };
  const days = useMemo(() => dates.map((date) => {
    const lines: Line[] = scopeVenues.flatMap((v) => venueDayLines({ venueId: v.id, date, periods: periodsQ.rows, saved: proj, hist: histByVenue.get(v.name) ?? new Map() })
      .map((l) => ({ ...l, venue: v.name, key: `${v.id}|${date}|${lineKey(l.kind, l.periodId, l.label)}` })));
    // A day's actual is everything sold that day, even when sales are not split by line.
    const soldV = scopeVenues.map((v) => histByVenue.get(v.name)?.get(date)?.sales).filter((x): x is number => x != null);
    const sum = (k: "guests" | "target") => { const xs = lines.map((l) => l[k]).filter((x): x is number => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
    const guests = sum("guests"), target = sum("target");
    const dineIn = lines.filter((l) => l.guests != null).reduce((a, l) => a + (l.target ?? 0), 0);
    return { date, lines, guests, target, sold: soldV.length ? soldV.reduce((a, b) => a + b, 0) : null, spend: guests ? Math.round(dineIn / guests) : null };
  }), [dates, scopeVenues, histByVenue, proj, periodsQ.rows]);

  // Projected month = actual where a day has sales, the projection where it does not yet.
  const tSold = days.reduce((a, d) => a + (d.sold ?? 0), 0);
  const tProjected = days.reduce((a, d) => a + (d.sold ?? d.target ?? 0), 0);
  const lastSold = days.filter((d) => d.sold != null).map((d) => d.date).pop() ?? null;
  // Remaining days: today onward with no sales yet. Only these can change.
  const remaining = days.filter((d) => d.date >= todayIso && d.sold == null);
  const remainingProj = remaining.reduce((a, d) => a + (d.target ?? 0), 0);
  const gap = target != null ? tProjected - target : null;
  const needDay = target != null && remaining.length ? Math.max(0, target - (tProjected - remainingProj)) / remaining.length : null;
  const projDay = remaining.length ? remainingProj / remaining.length : null;
  const monthName = new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" });

  // Pace: actual so far (solid), then projected to month end (dotted); the target is one flat line.
  const pace = (() => {
    let a = 0;
    return days.map((r) => {
      a += r.sold ?? r.target ?? 0;
      const isActual = !!lastSold && r.date <= lastSold;
      return { day: Number(r.date.slice(8)), actual: isActual ? Math.round(a) : null, proj: !lastSold || r.date >= lastSold ? Math.round(a) : null };
    });
  })();
  const projEnd = pace[pace.length - 1]?.proj ?? null;
  // Round y-axis steps with headroom above the higher of projection and target.
  const paceTicks = (() => {
    const peak = Math.max(projEnd ?? 0, ...pace.map((p) => p.actual ?? 0), target ?? 0) * 1.08 || 1;
    const raw = peak / 4, mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= raw) ?? raw;
    return Array.from({ length: Math.ceil(peak / step) + 1 }, (_, i) => i * step);
  })();

  // Save one line of a venue's day. The venue's other lines on that day are saved with it at what they show
  // (an auto figure is kept as Bani's), so every screen that adds up saved lines sees the whole day.
  // null puts the venue's day back to auto. Tenant, venue and period are checked again by the database.
  const saveLine = async (l: Line, value: number | null, guests: number | null = null, spend: number | null = null) => {
    const base = supabase.from("revenue_daily_projections");
    const row = (x: Line, v: number, g: number | null, sp: number | null, mine: boolean) => ({ tenant_id: tenantId!, venue_id: x.venueId, target_date: x.date, line_kind: x.kind, service_period_id: x.periodId, label: x.label,
      projected_sales: v, projected_guests: x.kind === "delivery" ? null : g, projected_spend: x.kind === "delivery" ? null : sp, source: mine ? "manager" : "bani", created_by: user?.id ?? null });
    let error: unknown = null;
    if (value === null) {
      ({ error } = await base.delete().eq("tenant_id", tenantId!).eq("venue_id", l.venueId).eq("target_date", l.date).neq("line_kind", "event"));
    } else {
      const sameDay = days.find((d) => d.date === l.date)?.lines.filter((x) => x.venueId === l.venueId && x.kind !== "event") ?? [];
      const rows = sameDay.filter((x) => x.key === l.key || (x.source === "Auto" && x.target != null))
        .map((x) => x.key === l.key ? row(x, value, guests, spend, true) : row(x, x.target!, x.guests, x.spend, false));
      if (l.kind === "event" && !rows.length) rows.push(row(l, value, guests, spend, true));
      ({ error } = await base.upsert(rows, { onConflict: "tenant_id,venue_id,target_date,line_key" }));
      // Planned by period now: an older whole-day figure for that day would count twice.
      if (!error && l.kind === "period") ({ error } = await base.delete().eq("tenant_id", tenantId!).eq("venue_id", l.venueId).eq("target_date", l.date).eq("line_kind", "day"));
    }
    setRowError((p) => { const n = { ...p }; if (!error) delete n[l.key]; else n[l.key] = "Not saved"; return n; });
    setProjTick((t) => t + 1);
    return !error;
  };

  const [edit, setEdit] = useState<{ key: string; field: "guests" | "spend" | "target"; value: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);
  // What a line's target will be while it is being typed, so the day total follows along.
  const previewOf = (l: Line): number | null => {
    if (!edit || edit.key !== l.key) return null;
    const v = num(edit.value); if (v == null) return null;
    return edit.field === "target" ? v : edit.field === "guests" ? (l.spend ? v * l.spend : null) : (l.guests ? v * l.guests : null);
  };
  const num = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && v.trim() ? n : null; };
  const confirmEdit = async () => {
    if (cancelRef.current) { cancelRef.current = false; return; }
    if (!edit) return;
    const date = edit.key.split("|")[1];
    const l = days.find((d) => d.date === date)?.lines.find((x) => x.key === edit.key); const v = num(edit.value);
    setEdit(null);
    if (!l || v == null) return;
    const total = edit.field === "target" ? v : edit.field === "guests" ? (l.spend ? v * l.spend : null) : (l.guests ? v * l.guests : null);
    if (total == null || Math.round(total) === Math.round(l.target ?? -1)) return;
    // Keep what was typed: guests and spend stay a pair that makes the total.
    const g = edit.field === "guests" ? Math.round(v) : l.guests;
    const sp = edit.field === "spend" ? v : edit.field === "guests" ? l.spend : g ? Math.round(v / g) : null;
    if (await saveLine(l, Math.round(total), g, sp))
      toast({ title: `${scopeVenues.length > 1 ? `${l.venue} · ` : ""}${l.name} · ${new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} projected ${Math.round(total).toLocaleString("en-US")}` });
  };
  const cell = "h-11 px-2 text-right whitespace-nowrap border-b border-[var(--kit-line)]";

  return (
    <div className="space-y-4 max-sm:space-y-3" data-phone-compact>
      <RevenuePageTop tabsAbove title="Targets" period={<div className="flex items-center gap-3">{period.control}{loading && <span className="text-[12px] text-muted-foreground">Loading…</span>}</div>} />

      <RevenueEnter id="targets" ready={ready} className="space-y-4 max-sm:space-y-3">
        {(play, count) => (<>
      {/* Summary: one target figure, the projected month, and the gap */}
      <section className="card-glass rounded-xl border border-border/60 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium">{monthName} target</span>
          {goalEdit != null ? (
            <input autoFocus inputMode="numeric" enterKeyHint="done" aria-label="Monthly target" value={goalEdit}
              onFocus={(e) => e.target.select()} onChange={(e) => setGoalEdit(e.target.value)} onBlur={(e) => saveGoal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setGoalEdit(null); }}
              className="h-9 w-36 rounded-md px-2 text-right text-xl font-display font-semibold tabular-nums outline-none" style={{ background: "#EEF0EE", border: "none" }} />
          ) : target != null ? (
            <button type="button" aria-label="Change target" onClick={() => setGoalEdit(String(target))}
              className="rounded px-1 -mx-1 text-xl font-display font-semibold tabular-nums hover:bg-[#F3F4F2]">{shortMoney(target!)}</button>
          ) : goalElsewhere ? (
            <span className="text-[12px] text-muted-foreground text-right">Set for {goalNames.join(" + ")}</span>
          ) : (
            <button type="button" onClick={() => setGoalEdit("")} className="text-[13px] font-medium text-primary hover:underline">Set target</button>
          )}
        </div>
        {target != null && (
          <div className="mt-3 relative h-2 rounded-full bg-muted overflow-hidden" role="img"
            aria-label={`Actual ${shortMoney(tSold)}, projected ${shortMoney(tProjected)} of ${shortMoney(target)} target`}>
            <div className="rv-fill absolute inset-y-0 left-0 rounded-full bg-primary/25" style={{ width: `${Math.min(100, (tProjected / target) * 100)}%` , ["--fd" as string]: ".8s" }} />
            <div className="rv-fill absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(100, (tSold / target) * 100)}%` }} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] tabular-nums">
          <span><span className="text-muted-foreground">Actual</span> <b className="font-semibold"><Num value={tSold} format={shortMoney} play={count} /></b>
            <span className="text-muted-foreground"> · Projected</span> <b className="font-semibold"><Num value={tProjected} format={shortMoney} play={count} /></b></span>
          {gap != null && (gap >= 0
            ? <span className="font-medium" style={{ color: "#15803D" }}>{tSold >= target! ? "Target reached" : `On track · ${shortMoney(gap)} over`}</span>
            : <span className="font-medium" style={{ color: "#B45309" }}>Short by {shortMoney(-gap)}</span>)}
        </div>
        {gap != null && gap < 0 && needDay != null && projDay != null && (
          <p className="mt-1 text-[12px] text-muted-foreground tabular-nums">Need {shortMoney(needDay)} a day · projected {shortMoney(projDay)}</p>
        )}
      </section>

      {/* Pace: actual, projected, and the target as one flat line */}
      <section className="card-glass rounded-xl border border-border/60 p-4">
        <h2 className="text-[13px] font-medium">Pace</h2>
        <div className="mt-1.5 mb-2 flex flex-nowrap items-center gap-x-3 whitespace-nowrap overflow-hidden text-[12px] tabular-nums">
          {lastSold && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--primary))" strokeWidth="2.5" /></svg><span className="text-muted-foreground">Actual</span></span>}
          {projEnd != null && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="2 3" /></svg><span className="text-muted-foreground">Projected</span><b className="font-semibold">{shortMoney(projEnd)}</b></span>}
          {target != null && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="5 3" /></svg><span className="text-muted-foreground">Target</span></span>}
        </div>
        <div className="h-52 max-sm:h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pace} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" />
              <XAxis dataKey="day" ticks={[1, 8, 15, 22, 29]} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, paceTicks[paceTicks.length - 1]]} ticks={paceTicks} tickFormatter={(v) => shortMoney(v as number).replace(baseSymbol(), "")} tickLine={false} axisLine={false} fontSize={11} width={40} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={({ active, payload, label }: { active?: boolean; payload?: { payload: { actual: number | null; proj: number | null } }[]; label?: number }) => {
                if (!active || !payload?.length) return null; const p = payload[0].payload; const v = p.actual ?? p.proj; if (v == null) return null;
                return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums"><div className="text-muted-foreground">Day {label}{p.actual == null ? " · projected" : ""}</div><div className="font-semibold">{shortMoney(v)}</div></div>;
              }} />
              {target != null && <ReferenceLine y={target} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `Target ${shortMoney(target)}`, position: "insideTopLeft", fontSize: 11, fill: "hsl(var(--muted-foreground))", offset: 6 }} />}
              <Line type="monotone" dataKey="proj" stroke="hsl(var(--primary))" strokeDasharray="2 4" dot={false} strokeWidth={2.25} connectNulls={false} {...lineBuild(play, 1, true)} />
              <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" dot={false} strokeWidth={2.75} connectNulls={false} {...lineBuild(play, 1)} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Day by day */}
      <div data-rv className="kit overflow-x-auto overscroll-x-contain rounded-xl border border-border/60" style={{ background: "#fff", ["--kit-line" as string]: "#ECEAE3" }}>
        <table className="w-full min-w-[560px] max-sm:min-w-0 max-sm:text-[12px] text-[13px] tabular-nums border-separate border-spacing-0" data-testid="new-targets-table">
          <colgroup><col className="w-[84px] max-sm:w-[76px]" /><col className="w-[76px] max-sm:w-[52px]" /><col className="w-[84px] max-sm:w-[56px]" /><col className="w-[110px] max-sm:w-[78px]" /><col className="w-[92px] max-sm:w-[70px]" /><col className="w-[86px] max-sm:hidden" /></colgroup>
          <thead>
            <tr className="text-[11px] text-muted-foreground [&>th]:border-b [&>th]:border-[var(--kit-line)]">
              <th className="sticky left-0 z-[2] h-9 px-3 max-sm:px-2 text-left font-medium" style={{ background: "#fff" }}>Date</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Guests</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Spend</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Projected</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Actual</th>
              <th className="px-3 text-left font-medium max-sm:hidden" style={{ background: "#fff" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const d = new Date(`${day.date}T00:00:00`);
              const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
              const isToday = day.date === todayIso, past = day.date < todayIso;
              const many = day.lines.length > 1;
              const fmt = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("en-US"));
              const soldStyle = (sold: number | null, target: number | null) => sold != null && target != null ? { color: sold >= target ? "#15803D" : "#B45309", fontWeight: 600 } : undefined;
              const pill = (src: string) => src === "Manager" || src === "Bani plan"
                ? <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground whitespace-nowrap" style={{ background: "#E4E6E3" }}>{src}</span>
                : src ? <span className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground" style={{ background: "#F1F2F0" }}>Auto</span> : null;

              // One venue's line; editable on today and future days.
              const lineRow = (l: Line, sub: boolean) => {
                const key = l.key;
                const can = l.date >= todayIso && day.sold == null; // remaining days only: today onward, no sales yet
                const open = openRow === key, editingThis = edit?.key === key;
                const numCell = (field: "guests" | "spend" | "target", value: number | null, bold = false) => {
                  if (l.kind === "delivery" && field !== "target") return null; // delivery is money only
                  if (edit && edit.key === key && edit.field === field) return (
                    <input autoFocus inputMode="numeric" enterKeyHint="done" aria-label={`${field} ${l.venue} ${l.date}`} value={edit.value}
                      onClick={(ev) => ev.stopPropagation()} onFocus={(ev) => ev.target.select()}
                      onChange={(ev) => setEdit({ ...edit, value: ev.target.value })}
                      onBlur={() => confirmEdit()}
                      onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") { cancelRef.current = true; setEdit(null); } }}
                      className={`ml-auto block h-8 w-[5.5rem] max-w-full rounded-md px-1.5 -mr-1.5 text-right tabular-nums outline-none ${bold ? "font-semibold" : ""}`}
                      style={{ background: "#EEF0EE", border: "none", caretColor: "hsl(var(--foreground))" }} />
                  );
                  if (field === "target" && edit && edit.key === key && edit.field !== "target") {
                    const v = num(edit.value); const pv = edit.field === "guests" ? (v != null && l.spend ? v * l.spend : null) : (v != null && l.guests ? v * l.guests : null);
                    if (pv != null) return <span className="font-semibold tabular-nums">{fmt(pv)}</span>;
                  }
                  return can
                    ? <button type="button" className={`tabular-nums rounded px-1 -mx-1 hover:bg-[#F3F4F2] ${bold ? "font-semibold" : ""}`} aria-label={`Change ${field} ${l.venue} ${l.date}`}
                        onClick={(e) => { e.stopPropagation(); setOpenRow(null); setEdit({ key, field, value: value == null ? "" : String(Math.round(value)) }); }}>{fmt(value)}</button>
                    : <span className={bold ? "font-semibold" : ""}>{fmt(value)}</span>;
                };
                return [
                  <tr key={key} className="bg-white cursor-pointer" onClick={() => setOpenRow(open ? null : key)}>
                    <td className={`sticky left-0 z-[1] h-11 whitespace-nowrap border-b border-[var(--kit-line)] text-left ${sub ? "pl-6 pr-3 text-[12px] text-muted-foreground" : `px-3 max-sm:px-2 ${isToday ? "font-semibold" : ""} ${past ? "text-muted-foreground" : ""}`}`} style={{ background: "#fff" }}>{sub ? <>{scopeVenues.length > 1 ? `${l.venue} · ` : ""}{l.name}{l.label && l.kind !== "event" ? ` · ${l.label}` : ""}</> : label}</td>
                    <td className={cell}>{numCell("guests", l.guests)}</td>
                    <td className={cell}>{numCell("spend", l.spend)}</td>
                    <td className={cell}>{numCell("target", l.target, true)}{rowError[key] && <p className="text-[10px] text-destructive">{rowError[key]}</p>}</td>
                    <td className={cell} style={soldStyle(l.sold, l.target)}>{l.sold == null ? <span className="text-muted-foreground">—</span> : fmt(l.sold)}</td>
                    <td className="h-11 px-3 whitespace-nowrap border-b border-[var(--kit-line)] max-sm:hidden">{pill(l.source)}</td>
                  </tr>,
                  open && !editingThis && (
                    <tr key={`${key}-more`} className="bg-white">
                      <td colSpan={6} className="p-0 border-b border-[var(--kit-line)]" style={{ background: "#FAFCFB" }}>
                        <div className="sticky left-0 px-3 py-2 text-[12px] text-muted-foreground" style={{ width: "min(100%, calc(100vw - 64px))" }}>
                          {l.source === "Manager" || l.source === "Bani plan"
                            ? <span>{l.source === "Bani plan" ? "Bani plan, approved by" : "Set by"} <b className="font-medium text-foreground">{l.by ?? "a manager"}</b>{l.at ? ` · ${new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                                {can && l.kind !== "event" && <> · <button type="button" className="underline" onClick={(ev) => { ev.stopPropagation(); saveLine(l, null); setOpenRow(null); }}>Day back to auto</button></>}</span>
                            : l.source === "Auto" ? <span>Bani: {l.kind === "delivery" ? "average delivery" : <>{l.guests ?? "—"} guests × {baseSymbol()}{l.spend ?? "—"}</>}, from recent {d.toLocaleDateString("en-GB", { weekday: "long" })}s</span>
                            : <span>No {l.name} sales recorded yet. Set guests and spend.</span>}
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              };

              if (!day.lines.length) return null;
              if (!many) return lineRow(day.lines[0], false);
              // Several venues: the day's total, then one line per venue.
              const dayOpen = openDays.has(day.date);
              const toggleDay = () => setOpenDays((o) => { const n = new Set(o); if (n.has(day.date)) n.delete(day.date); else n.add(day.date); return n; });
              return [
                <tr key={day.date} className="cursor-pointer" style={{ background: dayOpen ? "#F7F8F6" : "#fff" }} onClick={toggleDay} aria-expanded={dayOpen}>
                  <td className={`sticky left-0 z-[1] h-11 px-3 max-sm:px-2 text-left whitespace-nowrap border-b border-[var(--kit-line)] ${isToday ? "font-semibold" : ""} ${past ? "text-muted-foreground" : ""}`} style={{ background: dayOpen ? "#F7F8F6" : "#fff" }}>
                    <span className="inline-flex items-center gap-1">{label}<ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${dayOpen ? "rotate-180" : ""}`} /></span></td>
                  <td className={cell}>{fmt(day.guests)}</td>
                  <td className={cell}>{fmt(day.spend)}</td>
                  <td className={`${cell} font-semibold`}>{fmt(day.lines.some((l) => previewOf(l) != null) ? day.lines.reduce((a, l) => a + (previewOf(l) ?? l.target ?? 0), 0) : day.target)}</td>
                  <td className={cell} style={soldStyle(day.sold, day.target)}>{day.sold == null ? <span className="text-muted-foreground">—</span> : fmt(day.sold)}</td>
                  <td className="h-11 px-3 border-b border-[var(--kit-line)] text-[11px] text-muted-foreground whitespace-nowrap max-sm:hidden">{(() => { const n = day.lines.filter((l) => l.source === "Manager" || l.source === "Bani plan").length; return n ? `${n} set` : ""; })()}</td>
                </tr>,
                ...(dayOpen ? day.lines.flatMap((l) => lineRow(l, true)) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
        </>)}
      </RevenueEnter>
    </div>
  );
}
