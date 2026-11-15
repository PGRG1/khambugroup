import {baseSymbol} from '@/utils/money';
import {usePlannedMonths} from '@/hooks/usePlannedMonths';
import {usePagePeriod} from '@/hooks/usePagePeriod';
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useSalesData } from "@/hooks/useSalesData";
import { shortMoney } from "@/utils/revenueOverview";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { useDailyProjections } from "@/hooks/useDailyProjections";
import {
  distributeMonthlyTarget,
  formatHkd,
  monthDates,
  parseProjectedInput,
} from "@/utils/dailyProjections";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Unified Targets page: monthly goal, pacing, chart and a light daily table. */
export default function RevenueTargetsNew() {
  const vs = useVenueScope();
  // Viewing follows the shared venue scope; editing needs exactly one venue.
  const scopeVenues = useMemo(() => vs.selectedVenues.filter((v) => v.is_active && v.id && v.name), [vs.selectedVenues]);
  const singleScope = scopeVenues.length === 1 ? scopeVenues[0] : null;
  const venuesLoading = !vs.ready;
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [venueId, setVenueId] = useState<string | null>(null);
  const plan=usePlannedMonths("targets");
  const period=usePagePeriod(plan.months.map(m=>m+"-01"),"mtd","month",{allowFuture:plan.end});
  const ym=period.month;
  const [year, month] = ym.split("-").map(Number);

  // The venue a target is saved to: the single scoped venue, or the one picked in the target box.
  const effectiveVenueId = singleScope?.id ?? (venueId && vs.venues.some((v) => v.id === venueId) ? venueId : null);
  const { history, saveProjection } = useDailyProjections(effectiveVenueId, year, month);
  const [goal, setGoal] = useState("");
  const [applying, setApplying] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const dates = useMemo(() => monthDates(year, month), [year, month]);

  // ---- Saved targets for every venue in view, with who set them ----
  const [projTick, setProjTick] = useState(0);
  const [proj, setProj] = useState<Map<string, { v: number; by: string; at: string }>>(new Map());
  const [projLoading, setProjLoading] = useState(true);
  const scopeKey = scopeVenues.map((v) => v.id).sort().join(",");
  useEffect(() => {
    const ids = scopeKey ? scopeKey.split(",") : [];
    if (!tenantId || !ids.length) { setProj(new Map()); setProjLoading(false); return; }
    let live = true;
    (async () => {
      const { data } = await supabase.from("revenue_daily_projections").select("venue_id, target_date, projected_sales, created_by, updated_at")
        .eq("tenant_id", tenantId).in("venue_id", ids).gte("target_date", dates[0]).lte("target_date", dates[dates.length - 1]);
      const who = [...new Set((data ?? []).map((r) => r.created_by).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (who.length) {
        const { data: ps } = await supabase.from("profiles").select("user_id, display_name").in("user_id", who);
        for (const p of ps ?? []) if (p.display_name) names.set(p.user_id, p.display_name);
      }
      if (live) {
        setProj(new Map((data ?? []).map((r) => [`${r.venue_id}|${r.target_date}`, { v: Number(r.projected_sales), by: (r.created_by && names.get(r.created_by)) || "a manager", at: r.updated_at }])));
        setProjLoading(false);
      }
    })();
    return () => { live = false; };
  }, [tenantId, scopeKey, dates, projTick]);
  const loading = projLoading || !vs.ready;

  const applyGoal = async () => {
    const parsed = parseProjectedInput(goal);
    if (!parsed.ok || parsed.value === null) {
      toast({ title: "Enter a monthly target", description: parsed.error, variant: "destructive" });
      return;
    }
    if (!effectiveVenueId) {
      toast({ title: "Pick a venue", description: "A target is always saved to one venue.", variant: "destructive" });
      return;
    }
    setApplying(true);
    const split = distributeMonthlyTarget(parsed.value, monthDates(year, month), history);
    let failed = 0;
    for (const [date, v] of split) if (!(await saveProjection(date, v))) failed++;
    setApplying(false);
    if (failed) toast({ title: "Some days were not saved", description: `${failed} day(s) failed. Try again.`, variant: "destructive" });
    else { toast({ title: "Monthly target set", description: `${formatHkd(parsed.value)} spread across ${split.size} days.` }); setGoal(""); }
    setProjTick((t) => t + 1);
  };

  // ---- Each venue's day: guests x spend forecast, saved target, sold ----
  // Guests: average of the last 8 same weekdays with sales. Spend per guest: those days' sales / guests.
  const { data: allSales } = useSalesData();
  const histByVenue = useMemo(() => {
    const m = new Map<string, Map<string, { sales: number; guests: number }>>();
    const names = new Set(scopeVenues.map((v) => v.name));
    for (const r of allSales) {
      if (!names.has(r.venue)) continue;
      const vm = m.get(r.venue) ?? new Map(); m.set(r.venue, vm);
      const d = vm.get(r.date) ?? { sales: 0, guests: 0 };
      d.sales += r.totalSales || 0; d.guests += r.guests || 0; vm.set(r.date, d);
    }
    return m;
  }, [allSales, scopeVenues]);

  type Line = { venueId: string; venue: string; date: string; guests: number | null; spend: number | null; target: number | null; sold: number | null; source: "Manager" | "Auto" | ""; by?: string; at?: string };
  const days = useMemo(() => dates.map((date) => {
    const dow = new Date(`${date}T00:00:00`).getDay();
    const lines: Line[] = scopeVenues.map((v) => {
      const h = histByVenue.get(v.name) ?? new Map();
      const prior = [...h.keys()].filter((d) => d < date && (h.get(d)?.guests ?? 0) > 0 && new Date(`${d}T00:00:00`).getDay() === dow).sort().slice(-8);
      let ag: number | null = null, as: number | null = null;
      if (prior.length >= 4) {
        const g = prior.reduce((a, d) => a + h.get(d)!.guests, 0), sl = prior.reduce((a, d) => a + h.get(d)!.sales, 0);
        ag = Math.round(g / prior.length); as = Math.round(sl / g);
      }
      const saved = proj.get(`${v.id}|${date}`);
      const target = saved ? saved.v : ag != null && as != null ? ag * as : null;
      const spend = saved && ag ? Math.round(saved.v / ag) : as;
      const sold = h.get(date)?.sales ?? null;
      return { venueId: v.id, venue: v.name, date, guests: ag, spend, target, sold: sold || sold === 0 && h.has(date) ? sold : null, source: saved ? "Manager" : target != null ? "Auto" : "", by: saved?.by, at: saved?.at };
    });
    const sum = (k: "guests" | "target" | "sold") => { const xs = lines.map((l) => l[k]).filter((x): x is number => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
    const guests = sum("guests"), target = sum("target");
    return { date, lines, guests, target, sold: sum("sold"), spend: guests && target ? Math.round(target / guests) : null };
  }), [dates, scopeVenues, histByVenue, proj]);

  const tTarget = days.reduce((a, d) => a + (d.target ?? 0), 0);
  const lastSold = days.filter((d) => d.sold != null).map((d) => d.date).pop() ?? null;
  const tSold = days.reduce((a, d) => a + (d.sold ?? 0), 0);
  const tToDate = lastSold ? days.filter((d) => d.date <= lastSold).reduce((a, d) => a + (d.target ?? 0), 0) : 0;
  const daysLeft = days.filter((d) => d.date > (lastSold && lastSold > todayIso ? lastSold : todayIso)).length;
  const needDay = daysLeft > 0 ? Math.max(0, tTarget - tSold) / daysLeft : null;
  const ahead = tSold - tToDate;
  const pctDone = tTarget > 0 ? tSold / tTarget : null;
  const monthName = new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" });

  // Pace: actual so far, then each remaining day at its target, against the target line.
  const pace = (() => {
    let t = 0, a = 0;
    return days.map((r) => {
      t += r.target ?? 0;
      const sold = lastSold && r.date <= lastSold;
      if (sold) a += r.sold ?? 0;
      const projV = lastSold && r.date >= lastSold ? (r.date === lastSold ? a : (a += r.target ?? 0)) : null;
      return { day: Number(r.date.slice(8)), target: Math.round(t), actual: sold ? a : null, proj: projV };
    });
  })();
  const projEnd = pace[pace.length - 1]?.proj ?? null;

  // Save one venue's day; null puts it back to auto.
  const saveLine = async (venueId: string, date: string, value: number | null) => {
    const key = `${venueId}|${date}`;
    const res = value === null
      ? await supabase.from("revenue_daily_projections").delete().eq("tenant_id", tenantId!).eq("venue_id", venueId).eq("target_date", date)
      : await supabase.from("revenue_daily_projections").upsert({ tenant_id: tenantId!, venue_id: venueId, target_date: date, projected_sales: value, created_by: user?.id ?? null }, { onConflict: "tenant_id,venue_id,target_date" });
    setRowError((p) => { const n = { ...p }; if (!res.error) delete n[key]; else n[key] = "Not saved"; return n; });
    setProjTick((t) => t + 1);
    return !res.error;
  };

  const [edit, setEdit] = useState<{ key: string; field: "guests" | "spend" | "target"; value: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);
  // What a line's target will be while it is being typed, so the day total follows along.
  const previewOf = (l: Line): number | null => {
    if (!edit || edit.key !== `${l.venueId}|${l.date}`) return null;
    const v = num(edit.value); if (v == null) return null;
    return edit.field === "target" ? v : edit.field === "guests" ? (l.spend ? v * l.spend : null) : (l.guests ? v * l.guests : null);
  };
  const num = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && v.trim() ? n : null; };
  const confirmEdit = async () => {
    if (cancelRef.current) { cancelRef.current = false; return; }
    if (!edit) return;
    const [venueId, date] = edit.key.split("|");
    const l = days.find((d) => d.date === date)?.lines.find((x) => x.venueId === venueId); const v = num(edit.value);
    setEdit(null);
    if (!l || v == null) return;
    const total = edit.field === "target" ? v : edit.field === "guests" ? (l.spend ? v * l.spend : null) : (l.guests ? v * l.guests : null);
    if (total == null || Math.round(total) === Math.round(l.target ?? -1)) return;
    if (await saveLine(venueId, date, Math.round(total)))
      toast({ title: `${scopeVenues.length > 1 ? `${l.venue} · ` : ""}${new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} target ${Math.round(total).toLocaleString("en-US")}` });
  };
  const cell = "h-11 px-2 text-right whitespace-nowrap border-b border-[var(--kit-line)]";

  return (
    <div className="space-y-4">
      <RevenuePageTop title="Targets" period={<div className="flex items-center gap-3">{period.control}{loading && <span className="text-[12px] text-muted-foreground">Loading…</span>}</div>} />

      {/* Summary */}
      <section className="card-glass rounded-xl border border-border/60 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium">{monthName} target</span>
          <span className="text-xl font-display font-semibold tabular-nums">{tTarget > 0 ? shortMoney(tTarget) : "—"}</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (pctDone ?? 0) * 100)}%` }} /></div>
        <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[12px] tabular-nums">
          <span><span className="text-muted-foreground">Actual</span> <b className="font-semibold">{shortMoney(tSold)}</b>{pctDone != null && <span className="text-muted-foreground"> · {Math.round(pctDone * 100)}%</span>}</span>
          <span className="font-medium">{
            !lastSold ? <span className="text-muted-foreground">No sales yet</span>
            : tSold >= tTarget && tTarget > 0 ? <span style={{ color: "#15803D" }}>Target reached</span>
            : ahead >= 0 ? <span style={{ color: "#15803D" }}>Ahead by {shortMoney(ahead)}</span>
            : <span style={{ color: "#B45309" }}>Behind by {shortMoney(-ahead)}{needDay ? ` · need ${shortMoney(needDay)} a day` : ""}</span>}</span>
        </div>
      </section>

      {/* Set the month */}
      <section className="card-glass rounded-xl border border-border/60 p-4">
        <div className="flex flex-wrap gap-2">
          {!singleScope && (
            <Select value={effectiveVenueId ?? undefined} onValueChange={setVenueId} disabled={venuesLoading || vs.venues.length === 0}>
              <SelectTrigger aria-label="Venue" className="h-9 w-full sm:w-[150px] text-[13px]"><SelectValue placeholder="Venue" /></SelectTrigger>
              <SelectContent>{vs.venues.filter((v) => v.id && v.name).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Input inputMode="decimal" placeholder={`${monthName} target`} aria-label="Monthly target" className="h-9 flex-1 min-w-0 text-right td-num"
            value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyGoal(); }} />
          <Button size="sm" className="h-9" onClick={applyGoal} disabled={applying || !effectiveVenueId || !goal.trim()}>{applying ? "Setting…" : "Set"}</Button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Spread across the days by weekday pattern.</p>
      </section>

      {/* Pace */}
      <section className="card-glass rounded-xl border border-border/60 p-4">
        <h2 className="text-[13px] font-medium">Pace</h2>
        <div className="mt-1.5 mb-2 flex flex-nowrap items-center gap-x-3 whitespace-nowrap overflow-hidden text-[12px] tabular-nums">
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--primary))" strokeWidth="2.5" /></svg><span className="text-muted-foreground">Actual</span></span>
          {projEnd != null && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="2 3" /></svg><span className="text-muted-foreground">Projected</span><b className="font-semibold">{shortMoney(projEnd)}</b></span>}
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--muted-foreground))" strokeWidth="2" strokeDasharray="5 3" /></svg><span className="text-muted-foreground">Target</span></span>
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pace} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" />
              <XAxis dataKey="day" ticks={[1, 8, 15, 22, 29]} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={(v) => shortMoney(v as number).replace(baseSymbol(), "")} tickLine={false} axisLine={false} fontSize={11} width={40} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={({ active, payload, label }: { active?: boolean; payload?: { payload: { actual: number | null; proj: number | null; target: number } }[]; label?: number }) => {
                if (!active || !payload?.length) return null; const p = payload[0].payload; const v = p.actual ?? p.proj;
                return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums"><div className="text-muted-foreground">Day {label}</div>{v != null && <div className="font-semibold">{shortMoney(v)}</div>}<div className="text-muted-foreground">Target {shortMoney(p.target)}</div></div>;
              }} />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 4" dot={false} strokeWidth={1.75} isAnimationActive={false} />
              <Line type="monotone" dataKey="proj" stroke="hsl(var(--primary))" strokeDasharray="2 4" dot={false} strokeWidth={2.25} connectNulls={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" dot={false} strokeWidth={2.75} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Day by day */}
      <div className="kit overflow-x-auto overscroll-x-contain rounded-xl border border-border/60" style={{ background: "#fff", ["--kit-line" as string]: "#ECEAE3" }}>
        <table className="w-full min-w-[560px] text-[13px] tabular-nums border-separate border-spacing-0" data-testid="new-targets-table">
          <colgroup><col className="w-[84px]" /><col className="w-[76px]" /><col className="w-[84px]" /><col className="w-[110px]" /><col className="w-[92px]" /><col className="w-[86px]" /></colgroup>
          <thead>
            <tr className="text-[11px] text-muted-foreground [&>th]:border-b [&>th]:border-[var(--kit-line)]">
              <th className="sticky left-0 z-[2] h-9 px-3 text-left font-medium" style={{ background: "#fff" }}>Date</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Guests</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Spend</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Target</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Actual</th>
              <th className="px-3 text-left font-medium" style={{ background: "#fff" }}>Source</th>
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
              const pill = (src: string) => src === "Manager"
                ? <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground" style={{ background: "#E4E6E3" }}>Manager</span>
                : src ? <span className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground" style={{ background: "#F1F2F0" }}>Auto</span> : null;

              // One venue's line; editable on today and future days.
              const lineRow = (l: Line, sub: boolean) => {
                const key = `${l.venueId}|${l.date}`;
                const can = !past;
                const open = openRow === key, editingThis = edit?.key === key;
                const numCell = (field: "guests" | "spend" | "target", value: number | null, bold = false) => {
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
                    <td className={`sticky left-0 z-[1] h-11 whitespace-nowrap border-b border-[var(--kit-line)] text-left ${sub ? "pl-6 pr-3 text-[12px] text-muted-foreground" : `px-3 ${isToday ? "font-semibold" : ""} ${past ? "text-muted-foreground" : ""}`}`} style={{ background: "#fff" }}>{sub ? l.venue : label}</td>
                    <td className={cell}>{numCell("guests", l.guests)}</td>
                    <td className={cell}>{numCell("spend", l.spend)}</td>
                    <td className={cell}>{numCell("target", l.target, true)}{rowError[key] && <p className="text-[10px] text-destructive">{rowError[key]}</p>}</td>
                    <td className={cell} style={soldStyle(l.sold, l.target)}>{l.sold == null ? <span className="text-muted-foreground">—</span> : fmt(l.sold)}</td>
                    <td className="h-11 px-3 whitespace-nowrap border-b border-[var(--kit-line)]">{pill(l.source)}</td>
                  </tr>,
                  open && !editingThis && (
                    <tr key={`${key}-more`} className="bg-white">
                      <td colSpan={6} className="p-0 border-b border-[var(--kit-line)]" style={{ background: "#FAFCFB" }}>
                        <div className="sticky left-0 px-3 py-2 text-[12px] text-muted-foreground" style={{ width: "min(100%, calc(100vw - 64px))" }}>
                          {l.source === "Manager"
                            ? <span>Set by <b className="font-medium text-foreground">{l.by ?? "a manager"}</b>{l.at ? ` · ${new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                                {can && <> · <button type="button" className="underline" onClick={(ev) => { ev.stopPropagation(); saveLine(l.venueId, l.date, null); setOpenRow(null); }}>Back to auto</button></>}</span>
                            : l.source === "Auto" ? <span>Bani: {l.guests ?? "—"} guests × {baseSymbol()}{l.spend ?? "—"}, from recent {d.toLocaleDateString("en-GB", { weekday: "long" })}s</span> : null}
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
                  <td className={`sticky left-0 z-[1] h-11 px-3 text-left whitespace-nowrap border-b border-[var(--kit-line)] ${isToday ? "font-semibold" : ""} ${past ? "text-muted-foreground" : ""}`} style={{ background: dayOpen ? "#F7F8F6" : "#fff" }}>
                    <span className="inline-flex items-center gap-1">{label}<ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${dayOpen ? "rotate-180" : ""}`} /></span></td>
                  <td className={cell}>{fmt(day.guests)}</td>
                  <td className={cell}>{fmt(day.spend)}</td>
                  <td className={`${cell} font-semibold`}>{fmt(day.lines.some((l) => previewOf(l) != null) ? day.lines.reduce((a, l) => a + (previewOf(l) ?? l.target ?? 0), 0) : day.target)}</td>
                  <td className={cell} style={soldStyle(day.sold, day.target)}>{day.sold == null ? <span className="text-muted-foreground">—</span> : fmt(day.sold)}</td>
                  <td className="h-11 px-3 border-b border-[var(--kit-line)] text-[11px] text-muted-foreground whitespace-nowrap">{day.lines.filter((l) => l.source === "Manager").length ? `${day.lines.filter((l) => l.source === "Manager").length} set` : ""}</td>
                </tr>,
                ...(dayOpen ? day.lines.flatMap((l) => lineRow(l, true)) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
