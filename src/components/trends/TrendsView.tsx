import { useMemo } from "react";
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

    // Month by month: 12 months, current one projected from its average day so far.
    const curKey = monthKey(last);
    const months = Array.from({ length: 12 }, (_, i) => shiftMonth(curKey, i - 11)).map((k) => {
      const t = sum(`${k}-01`, `${k}-31`);
      const ly = sum(`${shiftMonth(k, -12)}-01`, `${shiftMonth(k, -12)}-31`);
      let g = 0;
      for (const d of byDate.values()) if (monthKey(d.date) === k) g += d.guests;
      const isCur = k === curKey;
      const elapsed = isCur ? Number(last.slice(8, 10)) : daysIn(k);
      const projectedRest = isCur && t.n ? Math.round((t.s / t.n) * (daysIn(k) - elapsed)) : 0;
      return {
        key: k, label: monthShort(k), actual: t.s, rest: projectedRest, lastYear: ly.s > 0 ? ly.s : null, isCur,
        guestsPerDay: t.n ? Math.round(g / t.n) : null, spendPerGuest: g ? Math.round(t.s / g) : null,
        hasData: t.s > 0,
      };
    });

    // Each month added up day by day: this month, last month, same month last year, plus earlier months faintly.
    const runFor = (k: string) => {
      const out: (number | null)[] = []; let c = 0;
      for (let d = 1; d <= 31; d++) {
        const date = `${k}-${String(d).padStart(2, "0")}`;
        if (d > daysIn(k) || date > last || date < first) { out.push(date < first && d <= daysIn(k) && date <= last ? null : null); continue; }
        c += byDate.get(date)?.sales ?? 0; out.push(c);
      }
      return out;
    };
    const lyKey = shiftMonth(curKey, -12), pmKey = shiftMonth(curKey, -1);
    const covers = (k: string) => first <= `${k}-01`;
    const others = [2, 3, 4, 5].map((n) => shiftMonth(curKey, -n)).filter(covers);
    const series = { cur: runFor(curKey), prev: covers(pmKey) ? runFor(pmKey) : null, ly: covers(lyKey) ? runFor(lyKey) : null, others: others.map(runFor) };
    const dayNow = Number(last.slice(8, 10));
    const monthRun = Array.from({ length: 31 }, (_, i) => ({
      day: i + 1, cur: series.cur[i], prev: series.prev?.[i] ?? null, ly: series.ly?.[i] ?? null,
      ...Object.fromEntries(series.others.map((o, j) => [`o${j}`, o[i]])),
    }));
    const monthAt = { day: dayNow, cur: series.cur[dayNow - 1] ?? 0, prev: series.prev?.[dayNow - 1] ?? null, ly: series.ly?.[dayNow - 1] ?? null, curKey, pmKey, lyKey, others };

    // Each weekday: monthly average over 12 months, the last 8 weeks, and the same 8 weeks a year ago.
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const lastD = new Date(`${last}T00:00:00`);
    const avgIn = (from: Date, to: Date, dow: number) => {
      let s = 0, n = 0;
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        if ((d.getDay() + 6) % 7 !== dow) continue;
        const v = byDate.get(iso(d))?.sales ?? 0; if (v > 0) { s += v; n++; }
      }
      return n ? s / n : null;
    };
    const weekdays = DOW.map((name, dow) => {
      const now = avgIn(addDays(lastD, -55), lastD, dow);
      const fromLy = addDays(lastD, -364 - 55);
      const yearAgo = iso(fromLy) >= first ? avgIn(fromLy, addDays(lastD, -364), dow) : null;
      const trend = Array.from({ length: 12 }, (_, i) => {
        const k = shiftMonth(curKey, i - 11);
        const [y, mo] = k.split("-").map(Number);
        return { k, v: avgIn(new Date(y, mo - 1, 1), new Date(Math.min(new Date(y, mo, 0).getTime(), lastD.getTime())), dow) };
      });
      return { name, now, yearAgo, change: now != null && yearAgo ? pct(now, yearAgo) : null, trend };
    });
    return { monthRun, monthAt, weekdays, months };
  }, [data, today]);

  const monthTicks = niceTicks(Math.max(...m.months.map((x) => Math.max(x.actual + x.rest, x.lastYear ?? 0))));
  const green = "#15803D", amber = "#B45309";
  const tone = (p: number | null) => (p == null ? undefined : p >= 0 ? green : amber);
  const money = (v: number) => `${baseSymbol()}${fmtHKD(v)}`;

  return (
    <div className="space-y-4">
      {/* This month, added up day by day */}
      {(() => {
        const a = m.monthAt;
        const mName = (k: string, year = false) => new Date(`${k}-01T00:00:00`).toLocaleDateString("en-GB", year ? { month: "short", year: "numeric" } : { month: "long" });
        const top = niceTicks(Math.max(...m.monthRun.flatMap((r: any) => [r.cur, r.prev, r.ly, ...a.others.map((_, j) => r[`o${j}`])].filter((v) => v != null) as number[])));
        const vsPrev = a.prev != null ? pct(a.cur, a.prev) : null, vsLy = a.ly != null ? pct(a.cur, a.ly) : null;
        return (
          <Card title="Month to date" note={`${a.day} ${mName(a.curKey).slice(0, 3)}`} oneLine legend={<>
            <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke={PRIMARY} strokeWidth="2.5" /></svg><b className="font-semibold">{shortMoney(a.cur)}</b></span>
            {a.prev != null && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke={MUTED} strokeWidth="2" strokeOpacity={0.7} /></svg><span className="text-muted-foreground">{mName(a.pmKey).slice(0, 3)}</span><b className="font-semibold" style={{ color: tone(vsPrev) }}>{pctText(vsPrev)}</b></span>}
            {a.ly != null && <span className="inline-flex items-center gap-1.5"><svg width="12" height="10" aria-hidden="true"><line x1="0" x2="12" y1="5" y2="5" stroke={MUTED} strokeWidth="2" strokeDasharray="3 3" /></svg><span className="text-muted-foreground">{`${mName(a.lyKey).slice(0, 3)} \u2019${a.lyKey.slice(2, 4)}`}</span><b className="font-semibold" style={{ color: tone(vsLy) }}>{pctText(vsLy)}</b></span>}
          </>}>
            <div style={{ width: "100%", height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={m.monthRun} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" type="number" domain={[1, 31]} ticks={[1, 8, 15, 22, 29]} {...AXIS} />
                  <YAxis domain={[0, top[top.length - 1]]} ticks={top} tickFormatter={(v) => fmtHKD(v as number, true)} width={48} {...AXIS} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null; const p = payload[0].payload;
                    const rows: [string, string][] = [[`Day ${label}`, ""]];
                    if (p.cur != null) rows.push([mName(a.curKey).slice(0, 3), money(p.cur)]);
                    if (p.prev != null) rows.push([mName(a.pmKey).slice(0, 3), money(p.prev)]);
                    if (p.ly != null) rows.push([mName(a.lyKey, true), money(p.ly)]);
                    return <Tip rows={rows} />;
                  }} />
                  {a.others.map((_, j) => <Line key={j} dataKey={`o${j}`} type="monotone" stroke={MUTED} strokeOpacity={0.18} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />)}
                  {a.ly != null && <Line dataKey="ly" type="monotone" stroke={MUTED} strokeOpacity={0.8} strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} connectNulls={false} />}
                  {a.prev != null && <Line dataKey="prev" type="monotone" stroke={MUTED} strokeOpacity={0.7} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />}
                  <Line dataKey="cur" type="monotone" stroke={PRIMARY} strokeWidth={2.75} isAnimationActive={false} connectNulls={false}
                    dot={(p: any) => p.payload.day === a.day ? <circle key="now" cx={p.cx} cy={p.cy} r={4.5} fill={PRIMARY} stroke="#fff" strokeWidth={2} /> : <g key={p.index} />} />
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

      {/* Each weekday */}
      <Card title="Sales by weekday">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_3.5rem] items-center gap-x-3 text-[12px] tabular-nums">
          <span /><span className="flex justify-between text-muted-foreground text-[11px]"><span>{monthShort(m.weekdays[0].trend[0].k)}</span><span>{monthShort(m.weekdays[0].trend[11].k)}</span></span>
          <span className="text-muted-foreground text-[11px] text-right">Last 8 wks</span>
          <span className="text-muted-foreground text-[11px] text-right">{m.weekdays.some((w) => w.change != null) ? "Last year" : ""}</span>
          {m.weekdays.map((w) => {
            const vals = w.trend.map((t) => t.v).filter((v): v is number => v != null);
            const lo = Math.min(...vals), hi = Math.max(...vals);
            return [
              <span key={`${w.name}n`} className="font-medium py-2 border-t border-border/50">{w.name}</span>,
              <div key={`${w.name}s`} className="h-9 border-t border-border/50 flex items-end gap-[2px] pb-1.5 pt-1.5">
                {w.trend.map((t, i) => {
                  const h = t.v == null ? 0 : hi > lo ? 25 + 75 * (t.v - lo) / (hi - lo) : 60;
                  const label = `${new Date(`${t.k}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}: ${t.v != null ? shortMoney(t.v) : "no sales"}`;
                  return <span key={t.k} title={label} aria-label={label} className="flex-1 rounded-[1px]"
                    style={{ height: `${h}%`, background: PRIMARY, opacity: i === 11 ? 0.95 : 0.35 }} />;
                })}
              </div>,
              <span key={`${w.name}v`} className="text-right py-2 border-t border-border/50 font-semibold">{w.now != null ? shortMoney(w.now) : "—"}</span>,
              <span key={`${w.name}c`} className="text-right py-2 border-t border-border/50 font-semibold" style={{ color: tone(w.change) }}>{pctText(w.change)}</span>,
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
