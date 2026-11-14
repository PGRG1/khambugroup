import { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { SalesRecord } from "@/types/sales";
import { baseSymbol } from "@/utils/money";
import { shortMoney } from "@/utils/revenueOverview";
import { fmtHKD } from "@/components/revenue-overview/utils";

/**
 * Trends: the longer picture, no period filter. Each chart keeps its own natural window:
 * this month so far, day to day (90 days), month by month (12 months), weekdays,
 * what drove it (guests and spend per guest).
 */

const PRIMARY = "hsl(var(--primary))";
const MUTED = "hsl(var(--muted-foreground))";
const GRID = { stroke: "hsl(var(--border))", strokeOpacity: 0.3, strokeDasharray: "2 4", vertical: false } as const;
const AXIS = { tick: { fontSize: 11, fill: MUTED }, axisLine: false, tickLine: false } as const;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monthKey = (s: string) => s.slice(0, 7);
const monthShort = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short" });
const daysIn = (k: string) => { const [y, m] = k.split("-").map(Number); return new Date(y, m, 0).getDate(); };
const shiftMonth = (k: string, n: number) => { const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
const pct = (a: number, b: number) => (b > 0 ? (a - b) / b : null);
const pctText = (p: number | null) => (p == null ? "" : `${p >= 0 ? "+" : "−"}${Math.abs(p * 100).toFixed(0)}%`);

/** Round axis steps with headroom. */
function niceTicks(max: number, n = 4) {
  const peak = max * 1.08 || 1;
  const raw = peak / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? raw;
  return Array.from({ length: Math.ceil(peak / step) + 1 }, (_, i) => i * step);
}

interface Day { date: string; sales: number; guests: number }

function Card({ title, note, legend, oneLine, children }: { title: string; note?: string; legend?: React.ReactNode; oneLine?: boolean; children: React.ReactNode }) {
  return (
    <section className="card-glass rounded-xl border border-border/60 p-4 min-w-0">
      <h2 className="flex items-baseline justify-between gap-2 text-[13px] font-medium">{title}{note && <span className="text-[12px] font-normal text-muted-foreground tabular-nums">{note}</span>}</h2>
      {legend && <div className={`mt-1.5 mb-2 flex items-center text-[12px] tabular-nums ${oneLine ? "flex-nowrap gap-x-3 whitespace-nowrap overflow-hidden" : "flex-wrap gap-x-4 gap-y-1"}`}>{legend}</div>}
      {children}
    </section>
  );
}

function Key({ kind, label, value, color }: { kind: "bar" | "line" | "dash" | "faint"; label: string; value?: string; color?: string }) {
  const swatch = kind === "bar" ? <rect x="0" y="0" width="10" height="10" rx="2" fill={PRIMARY} fillOpacity={0.45} />
    : kind === "faint" ? <line x1="0" x2="14" y1="5" y2="5" stroke={MUTED} strokeWidth="2" strokeOpacity={0.6} />
    : <line x1="0" x2="14" y1="5" y2="5" stroke={PRIMARY} strokeWidth="2.5" strokeDasharray={kind === "dash" ? "3 3" : undefined} />;
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width={kind === "bar" ? 10 : 14} height="10" aria-hidden="true">{swatch}</svg>
      <span className="text-muted-foreground">{label}</span>
      {value && <b className="font-semibold" style={color ? { color } : undefined}>{value}</b>}
    </span>
  );
}

const Tip = ({ rows }: { rows: [string, string][] }) => (
  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums space-y-0.5">
    {rows.map(([k, v], i) => i === 0 ? <div key={k} className="font-medium mb-1">{k}</div>
      : <div key={k} className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>)}
  </div>
);

export function TrendsView({ data, today = new Date() }: { data: SalesRecord[]; today?: Date }) {
  const m = useMemo(() => {
    // One row per date, all selected venues added together.
    const byDate = new Map<string, Day>();
    for (const r of data) {
      const d = byDate.get(r.date) ?? { date: r.date, sales: 0, guests: 0 };
      d.sales += r.totalSales || 0; d.guests += r.guests || 0;
      byDate.set(r.date, d);
    }
    const todayIso = iso(today);
    let first = "9999";
    for (const d of byDate.values()) if (d.sales > 0 && d.date < first) first = d.date;
    // Last counted day: the latest day with sales up to today, so a day not entered yet never reads as a drop.
    let last = "";
    for (const d of byDate.values()) if (d.sales > 0 && d.date <= todayIso && d.date > last) last = d.date;
    if (!last) last = todayIso;
    const sum = (from: string, to: string) => {
      let s = 0, n = 0;
      for (const d of byDate.values()) if (d.date >= from && d.date <= to && d.sales > 0) { s += d.sales; n++; }
      return { s, n };
    };

    const curKey = monthKey(todayIso); // always today's month, even before its sales are entered
    const curLast = monthKey(last) === curKey ? last : null;
    const lastD = new Date(`${last}T00:00:00`);
    const dowOf = (d: Date) => (d.getDay() + 6) % 7; // Mon = 0
    const statIn = (from: Date, to: Date, dow: number) => {
      let s = 0, n = 0;
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        if (dowOf(d) !== dow) continue;
        const v = byDate.get(iso(d))?.sales ?? 0; if (v > 0) { s += v; n++; }
      }
      return { avg: n ? s / n : null, n };
    };
    const monthStat = (k: string, dow: number) => {
      const [y, mo] = k.split("-").map(Number);
      return statIn(new Date(y, mo - 1, 1), new Date(Math.min(new Date(y, mo, 0).getTime(), lastD.getTime())), dow);
    };

    // Projection for the rest of this month: each remaining day at its weekday's average over the last 8 weeks.
    const dowAvg = Array.from({ length: 7 }, (_, dow) => statIn(addDays(lastD, -55), lastD, dow).avg ?? 0);
    const projDay = (date: string) => dowAvg[dowOf(new Date(`${date}T00:00:00`))];
    const curDays = daysIn(curKey), curDay = curLast ? Number(curLast.slice(8, 10)) : 0;
    let restTotal = 0;
    for (let d = curDay + 1; d <= curDays; d++) restTotal += projDay(`${curKey}-${String(d).padStart(2, "0")}`);
    // Project only once the month has at least one day of sales; before that it would be a pure guess.
    const canProject = curDay > 0 && dowAvg.some((v) => v > 0);

    // Monthly sales: 12 months.
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(curKey, i - 11)).map((k) => {
      const t = sum(`${k}-01`, `${k}-31`);
      const ly = sum(`${shiftMonth(k, -12)}-01`, `${shiftMonth(k, -12)}-31`);
      let g = 0;
      for (const d of byDate.values()) if (monthKey(d.date) === k) g += d.guests;
      const isCur = k === curKey;
      return {
        key: k, label: monthShort(k), actual: t.s, rest: isCur && canProject ? Math.round(restTotal) : 0, lastYear: ly.s > 0 ? ly.s : null, isCur,
        guestsPerDay: t.n ? Math.round(g / t.n) : null, spendPerGuest: g ? Math.round(t.s / g) : null,
        hasData: t.s > 0,
      };
    });

    // Month to date: every month of the past year added up day by day, this month in front
    // with a dotted projection to month end.
    const past = Array.from({ length: 12 }, (_, i) => shiftMonth(curKey, -(i + 1))).filter((k) => first <= `${k}-01`);
    const runFor = (k: string) => {
      const out: (number | null)[] = []; let c = 0;
      for (let d = 1; d <= 31; d++) {
        const date = `${k}-${String(d).padStart(2, "0")}`;
        if (d > daysIn(k) || date > last) { out.push(null); continue; }
        c += byDate.get(date)?.sales ?? 0; out.push(c);
      }
      return out;
    };
    const runs = Object.fromEntries(past.map((k) => [k, runFor(k)]));
    const cur: (number | null)[] = [], proj: (number | null)[] = [];
    let c = 0;
    for (let d = 1; d <= 31; d++) {
      const date = `${curKey}-${String(d).padStart(2, "0")}`;
      if (d > curDays) { cur.push(null); proj.push(null); continue; }
      if (d <= curDay) { c += byDate.get(date)?.sales ?? 0; cur.push(c); proj.push(d === curDay ? c : null); continue; }
      cur.push(null);
      if (canProject) { c += projDay(date); proj.push(Math.round(c)); } else proj.push(null);
    }
    const monthRun = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1, cur: cur[i], proj: proj[i], ...Object.fromEntries(past.map((k) => [k, runs[k][i]])),
    }));
    const lyKey = shiftMonth(curKey, -12);
    const monthAt = { curKey, curDay, cur: curDay ? cur[curDay - 1] : null, projEnd: canProject ? proj[curDays - 1] : null, past, lyKey, hasLy: past.includes(lyKey) };

    // Sales by weekday: each weekday's average per month for 12 months.
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const DOW_LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    const weekdays = DOW.map((name, dow) => {
      const trend = Array.from({ length: 12 }, (_, i) => {
        const k = shiftMonth(curKey, i - 11);
        const st = monthStat(k, dow);
        return { k, v: st.avg };
      });
      return { name, long: DOW_LONG[dow], trend };
    });
    return { monthRun, monthAt, weekdays, months };
  }, [data, today]);

  const [pick, setPick] = useState<[number, number] | null>(null);
  const monthTicks = niceTicks(Math.max(...m.months.map((x) => Math.max(x.actual + x.rest, x.lastYear ?? 0))));
  const green = "#15803D", amber = "#B45309";
  const tone = (p: number | null) => (p == null ? undefined : p >= 0 ? green : amber);
  const money = (v: number) => `${baseSymbol()}${fmtHKD(v)}`;

  return (
    <div className="space-y-4">
      {/* Month to date: every month of the past year, this month in front */}
      {(() => {
        const a = m.monthAt;
        const mName = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" });
        const top = niceTicks(Math.max(...m.monthRun.flatMap((r) => [r.cur, r.proj, ...a.past.map((k) => (r as Record<string, number | null>)[k])].filter((v) => v != null) as number[])));
        return (
          <Card title="Month to date" oneLine legend={<>
            {a.cur != null
              ? <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke={PRIMARY} strokeWidth="2.5" /></svg><b className="font-semibold">{shortMoney(a.cur)}</b></span>
              : <span className="text-muted-foreground">No {mName(a.curKey)} sales yet</span>}
            {a.projEnd != null && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke={PRIMARY} strokeWidth="2" strokeDasharray="2 3" /></svg><span className="text-muted-foreground">Projected</span><b className="font-semibold">{shortMoney(a.projEnd)}</b></span>}
          </>}>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <LineChart data={m.monthRun} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" type="number" domain={[1, 31]} ticks={[1, 8, 15, 22, 29]} {...AXIS} />
                  <YAxis domain={[0, top[top.length - 1]]} ticks={top} tickFormatter={(v) => fmtHKD(v as number, true)} width={48} {...AXIS} />
                  <Tooltip cursor={{ stroke: MUTED, strokeOpacity: 0.4 }} wrapperStyle={{ zIndex: 20 }} position={{ y: 0 }} content={({ active, payload, label }: { active?: boolean; payload?: { payload: Record<string, number | null> }[]; label?: number }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    const v = p.cur ?? p.proj;
                    if (v == null) return null;
                    return (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums">
                        <div className="text-muted-foreground">Day {label}</div>
                        <div className="font-semibold">{money(v)}</div>
                      </div>
                    );
                  }} />
                  {a.past.map((k) => <Line key={k} dataKey={k} type="monotone" stroke={MUTED} strokeOpacity={0.28} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />)}
                  {a.projEnd != null && <Line dataKey="proj" type="monotone" stroke={PRIMARY} strokeWidth={2.25} strokeDasharray="2 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />}
                  <Line dataKey="cur" type="monotone" stroke={PRIMARY} strokeWidth={2.75} isAnimationActive={false} connectNulls={false}
                    dot={(p: { cx: number; cy: number; index: number; payload: { day: number } }) => p.payload.day === a.curDay ? <circle key="now" cx={p.cx} cy={p.cy} r={4.5} fill={PRIMARY} stroke="#fff" strokeWidth={2} /> : <g key={p.index} />} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        );
      })()}

      {/* Month by month */}
      <Card title="Monthly sales" legend={<>
        <Key kind="bar" label="Actual" />
        <Key kind="dash" label="Projected" />
        {m.months.some((x) => x.lastYear) && <span className="inline-flex items-center gap-1.5"><svg width="16" height="10" aria-hidden="true"><rect x="0" y="0" width="16" height="10" rx="2" fill={PRIMARY} fillOpacity={0.85} /><line x1="2" x2="14" y1="5" y2="5" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" /><line x1="3" x2="13" y1="5" y2="5" stroke="hsl(var(--foreground))" strokeWidth="2" strokeLinecap="round" /></svg><span className="text-muted-foreground">Last year</span></span>}
      </>}>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <ComposedChart data={m.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" interval={0} {...AXIS} tick={{ fontSize: 10, fill: MUTED }} />
              <YAxis domain={[0, monthTicks[monthTicks.length - 1]]} ticks={monthTicks} tickFormatter={(v) => fmtHKD(v as number, true)} width={44} {...AXIS} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.4 }} content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null; const p = payload[0].payload;
                const rows: [string, string][] = [[new Date(`${p.key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), ""], [p.isCur ? "So far" : "Sales", money(p.actual)]];
                if (p.rest) rows.push(["Projected", money(p.actual + p.rest)]);
                if (p.lastYear) rows.push(["Last year", `${money(p.lastYear)} ${pctText(pct(p.isCur ? p.actual + p.rest : p.actual, p.lastYear))}`]);
                return <Tip rows={rows} />;
              }} />
              <Bar dataKey="actual" stackId="m" isAnimationActive={false}>
                {m.months.map((x) => <Cell key={x.key} fill={PRIMARY} fillOpacity={0.85} />)}
              </Bar>
              <Bar dataKey="rest" stackId="m" isAnimationActive={false} fill="hsl(var(--primary))" fillOpacity={0.08} stroke={PRIMARY} strokeDasharray="3 3" strokeWidth={1.5} />
              <Line dataKey="lastYear" stroke="none" isAnimationActive={false} connectNulls={false}
                dot={(p: any) => p.value == null ? <g key={p.index} /> : <g key={p.index}><line x1={p.cx - 10} x2={p.cx + 10} y1={p.cy} y2={p.cy} stroke="#fff" strokeWidth={5.5} strokeLinecap="round" /><line x1={p.cx - 9} x2={p.cx + 9} y1={p.cy} y2={p.cy} stroke="hsl(var(--foreground))" strokeWidth={2.5} strokeLinecap="round" /></g>}
                activeDot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Sales by weekday: tap or hover a month for its details */}
      <Card title="Sales by weekday">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 text-[12px] tabular-nums">
          <span /><span className="flex justify-between text-muted-foreground text-[11px]"><span>{monthShort(m.weekdays[0].trend[0].k)}</span><span>{monthShort(m.weekdays[0].trend[11].k)}</span></span>
          {m.weekdays.map((w, row) => {
            const vals = w.trend.map((t) => t.v).filter((v): v is number => v != null);
            const lo = Math.min(...vals), hi = Math.max(...vals);
            const act = pick && pick[0] === row ? w.trend[pick[1]] : null;
            return [
              <span key={`${w.name}n`} className="font-medium py-2 border-t border-border/50">{w.name}</span>,
              <div key={`${w.name}s`} className="relative h-10 border-t border-border/50 flex items-end gap-[2px] py-1.5" onMouseLeave={() => setPick(null)}>
                {w.trend.map((t, i) => {
                  const h = t.v == null ? 0 : hi > lo ? 25 + 75 * (t.v - lo) / (hi - lo) : 60;
                  const on = act === t;
                  return <button key={t.k} type="button" aria-label={`${w.long} ${monthShort(t.k)}`} className="flex-1 h-full flex items-end"
                    onMouseEnter={() => setPick([row, i])} onFocus={() => setPick([row, i])} onClick={() => setPick(on ? null : [row, i])}>
                    <span className="w-full rounded-[1px]" style={{ height: `${h}%`, background: PRIMARY, opacity: on ? 1 : i === 11 ? 0.9 : 0.35 }} />
                  </button>;
                })}
                {act && (
                  <div className="absolute bottom-full z-20 mb-1 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg tabular-nums whitespace-nowrap pointer-events-none"
                    style={pick![1] > 6 ? { right: 0 } : { left: 0 }}>
                    <div className="text-muted-foreground">{w.long} · {new Date(`${act.k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</div>
                    <div className="font-semibold">{act.v != null ? shortMoney(act.v) : "No sales"}</div>
                  </div>
                )}
              </div>,
            ];
          })}
        </div>
      </Card>

      {/* What drove it */}
      <div className="grid gap-4 sm:grid-cols-2">
        {([["Guests per day", "guestsPerDay", (v: number) => String(v)], ["Spend per guest", "spendPerGuest", (v: number) => `${baseSymbol()}${v}`]] as const).map(([title, key, f]) => {
          const pts = m.months.filter((x) => x[key] != null);
          const now = pts[pts.length - 1]?.[key] as number | undefined, yearAgo = pts[0]?.[key] as number | undefined;
          const ch = now != null && yearAgo ? pct(now, yearAgo) : null;
          const vals = pts.map((x) => x[key] as number);
          const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.25 || hi * 0.1 || 1;
          return (
            <Card key={key} title={title} legend={<>{now != null && <b className="font-semibold text-foreground">{f(now)}</b>}{ch != null && <span className="text-muted-foreground">vs {pts[0].label} <b className="font-semibold" style={{ color: tone(ch) }}>{pctText(ch)}</b></span>}</>}>
              <div style={{ width: "100%", height: 150 }}>
                <ResponsiveContainer>
                  <LineChart data={m.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="label" interval={1} {...AXIS} tick={{ fontSize: 10, fill: MUTED }} />
                    <YAxis domain={[Math.max(0, Math.floor(lo - pad)), Math.ceil(hi + pad)]} tickCount={3} tickFormatter={(v) => String(Math.round(v as number))} width={40} {...AXIS} />
                    <Tooltip content={({ active, payload }: any) => active && payload?.length && payload[0].value != null
                      ? <Tip rows={[[new Date(`${payload[0].payload.key}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), ""], [title, f(payload[0].value)]]} /> : null} />
                    <Line dataKey={key} type="monotone" stroke={PRIMARY} strokeWidth={2} isAnimationActive={false} connectNulls={false}
                      dot={{ r: 2.5, fill: PRIMARY, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
