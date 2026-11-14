import {baseSymbol} from '@/utils/money';
import {usePlannedMonths} from '@/hooks/usePlannedMonths';
import {usePagePeriod} from '@/hooks/usePagePeriod';
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useSalesData } from "@/hooks/useSalesData";
import { shortMoney } from "@/utils/revenueOverview";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useScopedProjections } from "@/hooks/useScopedProjections";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { useDailyProjections } from "@/hooks/useDailyProjections";
import {
  buildProjectionRows,
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
  const { projections, actuals, history, loading: editLoading, saveProjection } = useDailyProjections(effectiveVenueId, year, month);
  const scopeIds = useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]);
  const scoped = useScopedProjections(scopeIds, year, month, !singleScope);
  const singleRows = useMemo(
    () => buildProjectionRows(year, month, projections, actuals, history),
    [year, month, projections, actuals, history],
  );
  const rows = singleScope ? singleRows : scoped.rows;
  const loading = singleScope ? editLoading : scoped.loading;

  const [goal, setGoal] = useState("");
  const [applying, setApplying] = useState(false);
  const [rowError, setRowError] = useState<Record<string, string>>({});




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
    if (!singleScope) scoped.reload();
  };


  // ---- Guests x spend: the auto target for each day ----
  // Guests: average of the last 8 same weekdays with sales. Spend per guest: those days' sales / guests.
  const { data: allSales } = useSalesData();
  const scopeNames = useMemo(() => new Set(scopeVenues.map((v) => v.name)), [scopeVenues]);
  const dayHist = useMemo(() => {
    const m = new Map<string, { sales: number; guests: number }>();
    for (const r of allSales) {
      if (!scopeNames.has(r.venue)) continue;
      const d = m.get(r.date) ?? { sales: 0, guests: 0 };
      d.sales += r.totalSales || 0; d.guests += r.guests || 0; m.set(r.date, d);
    }
    return m;
  }, [allSales, scopeNames]);
  const autoGS = useMemo(() => {
    const dates = [...dayHist.keys()].filter((d) => (dayHist.get(d)?.guests ?? 0) > 0).sort();
    const out = new Map<string, { guests: number; spend: number }>();
    for (const r of rows) {
      const dow = new Date(`${r.date}T00:00:00`).getDay();
      const same = dates.filter((d) => d < r.date && new Date(`${d}T00:00:00`).getDay() === dow).slice(-8);
      if (same.length < 4) continue;
      const g = same.reduce((a, d) => a + dayHist.get(d)!.guests, 0), sl = same.reduce((a, d) => a + dayHist.get(d)!.sales, 0);
      out.set(r.date, { guests: Math.round(g / same.length), spend: Math.round(sl / g) });
    }
    return out;
  }, [rows, dayHist]);

  // One row per day: guests, spend, target, sold and where the target came from.
  const table = rows.map((r) => {
    const auto = autoGS.get(r.date);
    const manager = r.projectedSales !== null;
    const target = manager ? r.projectedSales! : auto ? auto.guests * auto.spend : r.effectiveForecast;
    const guests = auto?.guests ?? null;
    const spend = manager && guests ? Math.round(r.projectedSales! / guests) : auto?.spend ?? null;
    return { ...r, guests, spend, target, source: manager ? "Manager" : target != null ? "Auto" : "" };
  });
  const tTarget = table.reduce((a, r) => a + (r.target ?? 0), 0);
  const lastSold = table.filter((r) => r.actualSales !== null).map((r) => r.date).pop() ?? null;
  const tSold = table.reduce((a, r) => a + (r.actualSales ?? 0), 0);
  const tToDate = lastSold ? table.filter((r) => r.date <= lastSold).reduce((a, r) => a + (r.target ?? 0), 0) : 0;
  const daysLeft = table.filter((r) => r.date > (lastSold && lastSold > todayIso ? lastSold : todayIso)).length;
  const needDay = daysLeft > 0 ? Math.max(0, tTarget - tSold) / daysLeft : null;
  const ahead = tSold - tToDate;
  const pctDone = tTarget > 0 ? tSold / tTarget : null;
  const monthName = new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" });

  // Pace: sold so far, then each remaining day at its target, against the target line.
  const pace = (() => {
    let t = 0, a = 0;
    return table.map((r) => {
      t += r.target ?? 0;
      const sold = lastSold && r.date <= lastSold;
      if (sold) a += r.actualSales ?? 0;
      const proj = lastSold && r.date >= lastSold ? (r.date === lastSold ? a : (a += r.target ?? 0)) : null;
      return { day: Number(r.date.slice(8)), target: Math.round(t), actual: sold ? a : null, proj };
    });
  })();
  const projEnd = pace[pace.length - 1]?.proj ?? null;

  const saveDay = async (date: string, value: number | null) => {
    const ok = await saveProjection(date, value);
    setRowError((p) => { const n = { ...p }; if (ok) delete n[date]; else n[date] = "Not saved"; return n; });
  };
  // Who last set each day, shown when a Manager row is tapped.
  const [metaTick, setMetaTick] = useState(0);
  const [meta, setMeta] = useState<Map<string, { by: string; at: string }>>(new Map());
  useEffect(() => {
    if (!effectiveVenueId) { setMeta(new Map()); return; }
    let live = true;
    const from = `${ym}-01`, to = `${ym}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    (async () => {
      const { data } = await supabase.from("revenue_daily_projections").select("target_date, created_by, updated_at")
        .eq("venue_id", effectiveVenueId).gte("target_date", from).lte("target_date", to);
      const ids = [...new Set((data ?? []).map((r) => r.created_by).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
        for (const p of ps ?? []) if (p.display_name) names.set(p.user_id, p.display_name);
      }
      if (live) setMeta(new Map((data ?? []).map((r) => [r.target_date, { by: (r.created_by && names.get(r.created_by)) || "a manager", at: r.updated_at }])));
    })();
    return () => { live = false; };
  }, [effectiveVenueId, ym, year, month, metaTick]);

  const [edit, setEdit] = useState<{ date: string; field: "guests" | "spend" | "target"; value: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const confirmEdit = async () => {
    if (cancelRef.current) { cancelRef.current = false; return; }
    if (!edit) return;
    const r = table.find((x) => x.date === edit.date); const v = num(edit.value);
    setEdit(null);
    if (!r || v == null) return;
    const total = edit.field === "target" ? v : edit.field === "guests" ? (r.spend ? v * r.spend : null) : (r.guests ? v * r.guests : null);
    if (total == null || Math.round(total) === Math.round(r.target ?? -1)) return;
    await saveDay(r.date, Math.round(total)); setMetaTick((t) => t + 1);
    toast({ title: `${new Date(`${r.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} target ${Math.round(total).toLocaleString("en-US")}` });
  };
  const num = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && v.trim() ? n : null; };
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
          <span><span className="text-muted-foreground">Sold</span> <b className="font-semibold">{shortMoney(tSold)}</b>{pctDone != null && <span className="text-muted-foreground"> · {Math.round(pctDone * 100)}%</span>}</span>
          <span className="font-medium">{
            !lastSold ? <span className="text-muted-foreground">No sales yet</span>
            : tSold >= tTarget && tTarget > 0 ? <span style={{ color: "#15803D" }}>Target reached</span>
            : ahead >= 0 ? <span style={{ color: "#15803D" }}>Ahead by {shortMoney(ahead)}</span>
            : <span style={{ color: "#B45309" }}>Behind by {shortMoney(-ahead)}{needDay ? ` · need ${shortMoney(needDay)} a day` : ""}</span>}</span>
        </div>
      </section>

      {/* Set the month */}
      <section className="card-glass rounded-xl border border-border/60 p-4">
        <div className="flex gap-2">
          {!singleScope && (
            <Select value={effectiveVenueId ?? undefined} onValueChange={setVenueId} disabled={venuesLoading || vs.venues.length === 0}>
              <SelectTrigger aria-label="Venue" className="h-9 w-[150px] text-[13px]"><SelectValue placeholder="Venue" /></SelectTrigger>
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
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke="hsl(var(--primary))" strokeWidth="2.5" /></svg><span className="text-muted-foreground">Sold</span></span>
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
      {!singleScope && <p className="text-[12px] text-muted-foreground px-1">Pick one venue in the top bar to edit days.</p>}
      <div className="kit overflow-x-auto overscroll-x-contain rounded-xl border border-border/60" style={{ background: "#fff", ["--kit-line" as string]: "#ECEAE3" }}>
        <table className="w-full min-w-[560px] text-[13px] tabular-nums border-separate border-spacing-0" data-testid="new-targets-table">
          <colgroup><col className="w-[84px]" /><col className="w-[76px]" /><col className="w-[84px]" /><col className="w-[110px]" /><col className="w-[92px]" /><col className="w-[86px]" /></colgroup>
          <thead>
            <tr className="text-[11px] text-muted-foreground [&>th]:border-b [&>th]:border-[var(--kit-line)]">
              <th className="sticky left-0 z-[2] h-9 px-3 text-left font-medium" style={{ background: "#fff" }}>Date</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Guests</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Spend</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Target</th>
              <th className="px-2 text-right font-medium" style={{ background: "#fff" }}>Sold</th>
              <th className="px-3 text-left font-medium" style={{ background: "#fff" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => {
              const d = new Date(`${r.date}T00:00:00`);
              const label = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
              const isToday = r.date === todayIso;
              const can = !!singleScope && r.date >= todayIso; // only today and future days change
              const info = meta.get(r.date);
              const open = openRow === r.date;
              const numCell = (field: "guests" | "spend" | "target", value: number | null, bold = false) => {
                const on = edit && edit.date === r.date && edit.field === field;
                if (on) return (
                  <input autoFocus inputMode="numeric" enterKeyHint="done" aria-label={`${field} ${r.date}`} value={edit!.value}
                    onClick={(ev) => ev.stopPropagation()} onFocus={(ev) => ev.target.select()}
                    onChange={(ev) => setEdit({ ...edit!, value: ev.target.value })}
                    onBlur={() => confirmEdit()}
                    onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") { cancelRef.current = true; setEdit(null); } }}
                    className={`ml-auto block h-8 w-[5.5rem] max-w-full rounded-md px-1.5 -mr-1.5 text-right tabular-nums outline-none ${bold ? "font-semibold" : ""}`}
                    style={{ background: "#EEF0EE", border: "none", caretColor: "hsl(var(--foreground))" }} />
                );
                // While guests or spend is being changed, the target shows what it will become.
                const live = field === "target" && edit && edit.date === r.date && edit.field !== "target" ? (() => { const v = num(edit.value); return edit.field === "guests" ? (v != null && r.spend ? v * r.spend : null) : (v != null && r.guests ? v * r.guests : null); })() : null;
                if (live != null) return <span className="font-semibold tabular-nums">{Math.round(live).toLocaleString("en-US")}</span>;
                const text = value == null ? "—" : Math.round(value).toLocaleString("en-US");
                return can
                  ? <button type="button" className={`tabular-nums rounded px-1 -mx-1 hover:bg-[#F3F4F2] ${bold ? "font-semibold" : ""}`} aria-label={`Change ${field} ${r.date}`}
                      onClick={(e) => { e.stopPropagation(); setOpenRow(null); setEdit({ date: r.date, field, value: value == null ? "" : String(Math.round(value)) }); }}>{text}</button>
                  : <span className={bold ? "font-semibold" : ""}>{text}</span>;
              };
              const editingThis = edit?.date === r.date;
              return [
                <tr key={r.date} className="bg-white cursor-pointer" onClick={() => setOpenRow(open ? null : r.date)}>
                  <td className={`sticky left-0 z-[1] h-11 px-3 text-left whitespace-nowrap border-b border-[var(--kit-line)] ${isToday ? "font-semibold" : ""} ${r.date < todayIso ? "text-muted-foreground" : ""}`} style={{ background: "#fff" }}>{label}</td>
                  <td className={cell}>{numCell("guests", r.guests)}</td>
                  <td className={cell}>{numCell("spend", r.spend)}</td>
                  <td className={cell}>{numCell("target", r.target, true)}{rowError[r.date] && <p className="text-[10px] text-destructive">{rowError[r.date]}</p>}</td>
                  <td className={cell} style={r.actualSales != null && r.target != null ? { color: r.actualSales >= r.target ? "#15803D" : "#B45309", fontWeight: 600 } : undefined}>{r.actualSales == null ? <span className="text-muted-foreground">—</span> : Math.round(r.actualSales).toLocaleString("en-US")}</td>
                  <td className="h-11 px-3 whitespace-nowrap border-b border-[var(--kit-line)]">
                    {r.source === "Manager"
                      ? <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-foreground" style={{ background: "#E4E6E3" }}>Manager</span>
                      : r.source ? <span className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground" style={{ background: "#F1F2F0" }}>Auto</span> : null}
                  </td>
                </tr>,
                open && !editingThis && (
                  <tr key={`${r.date}-more`} className="bg-white">
                    <td colSpan={6} className="p-0 border-b border-[var(--kit-line)]" style={{ background: "#FAFCFB" }}>
                      <div className="sticky left-0 px-3 py-2 text-[12px] text-muted-foreground" style={{ width: "min(100%, calc(100vw - 64px))" }}>
                        {r.source === "Manager"
                          ? <span>Set by <b className="font-medium text-foreground">{info?.by ?? "a manager"}</b>{info?.at ? ` · ${new Date(info.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                              {can && <> · <button type="button" className="underline" onClick={(ev) => { ev.stopPropagation(); saveDay(r.date, null).then(() => setMetaTick((t) => t + 1)); setOpenRow(null); }}>Back to auto</button></>}</span>
                          : r.source === "Auto" ? <span>Bani: {r.guests ?? "—"} guests × {baseSymbol()}{r.spend ?? "—"}, from recent {d.toLocaleDateString("en-GB", { weekday: "long" })}s</span> : null}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
