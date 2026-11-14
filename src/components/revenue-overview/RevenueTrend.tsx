import {baseSymbol} from '@/utils/money';
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  Cell,
  Customized,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SalesRecord } from "@/types/sales";
import { fmtHKD, fmtNum, toDaily } from "./utils";
import { getMonthKey as gm } from "@/utils/salesUtils";
import type { ForecastOverviewDay } from "@/utils/revenueForecastOverview";
import { bestWorst, shortMoney } from "@/utils/revenueOverview";

interface Props {
  data: SalesRecord[];
  view: "daily" | "monthly";
  forecastDaily?: ForecastOverviewDay[];
  /** Label the best and worst trading day on the chart. */
  markBestWorst?: boolean;
}

const PROJECTION = "hsl(var(--foreground))";
const BEST = "#16A34A";
const WORST = "#E07B1A";

/**
 * Best and worst day, labelled on the chart: each label sits in the strip above the plot, over its
 * own bar where possible (kept inside the chart and apart from the other label), with a thin line
 * down to the bar. Labels never sit on top of other bars or run off the edge.
 */
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string) {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 6.6;
  measureCtx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
  return measureCtx.measureText(text).width;
}

function BestWorstMarks(props: any) {
  const { marks, offset } = props;
  const bars = (props.formattedGraphicalItems ?? []).find((g: any) => g?.item?.props?.dataKey === "revenue")?.props?.data ?? [];
  if (!offset || !bars.length) return null;
  const left = offset.left, right = offset.left + offset.width, top = offset.top;
  const chip = (key: string, text: string, color: string) => {
    const b = bars.find((x: any) => x?.payload?.key === key);
    if (!b) return null;
    const w = textWidth(text) + 18;
    return { cx: b.x + b.width / 2, barTop: b.y, w, text, color, x: 0 };
  };
  const items = [chip(marks.best.key, marks.bestText, BEST), chip(marks.worst.key, marks.worstText, WORST)].filter(Boolean) as any[];
  const h = 20, gap = 6;
  for (const it of items) { it.x = Math.min(Math.max(it.cx - it.w / 2, left), right - it.w); it.row = 0; }
  if (items.length === 2) {
    const [a, b] = [...items].sort((p, q) => p.x - q.x);
    const overlap = a.x + a.w + gap - b.x;
    if (overlap > 0) {
      if (a.w + b.w + gap <= right - left) {
        // Room for both on one line: push them apart, kept inside the chart.
        a.x = Math.max(left, a.x - overlap / 2); b.x = a.x + a.w + gap;
        if (b.x + b.w > right) { b.x = right - b.w; a.x = Math.max(left, b.x - gap - a.w); }
      } else {
        // Not enough room (phones): the worst day's label drops to a second row.
        const low = items.find((i: any) => i.color === WORST); if (low) low.row = 1;
      }
    }
  }
  const rows = Math.max(...items.map((i: any) => i.row)) + 1;
  return <g>{items.map((it: any) => {
    const y = top - 8 - (rows - it.row) * (h + 6) + 6;
    const lineX = Math.min(Math.max(it.cx, it.x + 8), it.x + it.w - 8);
    return <g key={it.text}>
      <polyline points={`${it.cx},${it.barTop - 2} ${it.cx},${y + h + 4} ${lineX},${y + h + 4} ${lineX},${y + h}`} fill="none" stroke={it.color} strokeWidth={1.25} strokeDasharray="2 2" />
      <rect x={it.x} y={y} width={it.w} height={h} rx={6} fill={it.color} />
      <text x={it.x + it.w / 2} y={y + 13.5} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">{it.text}</text>
    </g>;
  })}</g>;
}

export function RevenueTrend({ data, view, forecastDaily = [], markBestWorst }: Props) {
  const showForecast = view === "daily" && forecastDaily.some((day) => day.forecast !== null);
  const chartData = useMemo(() => {
    if (view === "daily") {
      const daily = toDaily(data);
      const actualByDate = new Map(daily.map((d) => [d.date, d]));
      const forecastByDate = new Map(forecastDaily.map((d) => [d.date, d]));
      const dates = [...new Set([...actualByDate.keys(), ...forecastByDate.keys()])].sort();
      return dates.map((date) => {
        const d = actualByDate.get(date);
        const forecast = forecastByDate.get(date);
        const revenue = forecast?.actual ?? d?.revenue ?? 0;
        const guests = d?.guests ?? 0;
        return {
          key: date,
          label: new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
          revenue,
          forecast: forecast?.forecast ?? null,
          variance: forecast?.variance ?? null,
          variancePct: forecast?.variancePct ?? null,
          guests,
          orders: d?.orders ?? 0,
          avgPerGuest: guests ? revenue / guests : 0,
        };
      });
    }
    // monthly
    const map = new Map<string, { revenue: number; guests: number; orders: number }>();
    for (const r of data) {
      const k = gm(r.date);
      const cur = map.get(k) ?? { revenue: 0, guests: 0, orders: 0 };
      cur.revenue += r.totalSales;
      cur.guests += r.guests;
      cur.orders += r.orders;
      map.set(k, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => ({
        key: k,
        label: k,
        revenue: v.revenue,
        forecast: null,
        variance: null,
        variancePct: null,
        guests: v.guests,
        orders: v.orders,
        avgPerGuest: v.guests ? v.revenue / v.guests : 0,
      }));
  }, [data, view, forecastDaily]);

  const marks = useMemo(() => {
    if (!markBestWorst || view !== "daily") return null;
    const traded = chartData.filter((d) => d.revenue > 0).map((d) => ({ ...d, date: d.key }));
    const bw = bestWorst(traded);
    if (!bw) return null;
    const text = (p: { key: string; revenue: number }) => {
      const dt = new Date(`${p.key}T00:00:00`);
      return `${dt.toLocaleDateString("en-GB", { weekday: "short" })} ${dt.getDate()} · ${shortMoney(p.revenue)}`;
    };
    return { best: bw.best, worst: bw.worst, bestText: `Best ${text(bw.best)}`, worstText: `Worst ${text(bw.worst)}` };
  }, [markBestWorst, view, chartData]);

  // Weekly date marks (1, 8, 15, 22, 29) so the axis is evenly spaced on every screen size.
  const ticks = useMemo(() => view === "daily"
    ? chartData.filter((d) => [1, 8, 15, 22, 29].includes(Number(d.key.slice(8, 10)))).map((d) => d.label)
    : undefined, [view, chartData]);

  // Flat benchmark: average of days that actually traded (matches "Average day").
  const avgDay = useMemo(() => {
    if (view !== "daily") return 0;
    const traded = chartData.filter((d) => d.revenue > 0);
    return traded.length ? traded.reduce((s, d) => s + d.revenue, 0) / traded.length : 0;
  }, [view, chartData]);

  // Narrow charts (phones) leave room for the best and worst labels on two rows.
  const [narrow, setNarrow] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 460)); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tooltipContent = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    const variance = point.variance as number | null;
    const variancePct = point.variancePct as number | null;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
        <div className="mb-1.5 font-medium text-foreground">{label}</div>
        <div className="grid grid-cols-[auto_auto] gap-x-5 gap-y-1 tabular-nums">
          <span className="text-muted-foreground">Actual</span>
          <span className="text-right text-foreground">{baseSymbol()}{fmtHKD(point.revenue)}</span>
          {point.forecast !== null && (
            <>
              <span className="text-muted-foreground">Forecast</span>
              <span className="text-right text-foreground">{baseSymbol()}{fmtHKD(point.forecast)}</span>
              <span className="text-muted-foreground">Variance</span>
              <span className={`text-right ${variance !== null && variance < 0 ? "text-destructive" : "text-primary"}`}>
                {variance !== null && variance < 0 ? "−" : "+"}{baseSymbol()}{fmtHKD(Math.abs(variance ?? 0))}
                {variancePct !== null ? ` (${variancePct >= 0 ? "+" : "−"}${Math.abs(variancePct).toFixed(1)}%)` : ""}
              </span>
            </>
          )}
        </div>
        {point.guests > 0 && (
          <div className="mt-1.5 text-muted-foreground">
            {fmtNum(point.guests)} covers · {baseSymbol()}{fmtHKD(point.avgPerGuest)}/guest
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card-glass rounded-xl border border-border/60 p-4 h-full">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <div className="text-[13px] font-medium">Daily sales</div>
          <div className="text-[11px] text-muted-foreground">
            {view === "daily" ? "Each trading day" : "Each month"}
          </div>
        </div>
        {showForecast && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />Actual</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t-2" style={{ borderColor: PROJECTION }} />Projection</span>
          </div>
        )}
      </div>
      <div ref={boxRef} style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: marks ? (narrow ? 60 : 34) : 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              {...(ticks ? { ticks, interval: 0 } : { interval: "preserveStartEnd" as const, minTickGap: 30 })}
            />

            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtHKD(v as number, true)}
              width={48}
            />
            <Tooltip content={tooltipContent} />
            <Bar dataKey="revenue" isAnimationActive={false} fill="hsl(var(--primary))" fillOpacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={40}>
              {chartData.map((d) => (
                <Cell key={d.key} fill={marks && d.key === marks.best.key ? BEST : marks && d.key === marks.worst.key ? WORST : "hsl(var(--primary))"} fillOpacity={marks && (d.key === marks.best.key || d.key === marks.worst.key) ? 1 : 0.85} />
              ))}
            </Bar>
            {marks && <Customized component={(props: any) => <BestWorstMarks {...props} marks={marks} />} />}
            {showForecast && (
              // Each projection mark is drawn from its own day's bar (same x and width), so it always sits exactly on it.
              <Customized component={(props: any) => {
                const bars = (props.formattedGraphicalItems ?? []).find((g: any) => g?.item?.props?.dataKey === "revenue")?.props?.data ?? [];
                const yAxis: any = Object.values(props.yAxisMap ?? {})[0];
                if (!yAxis?.scale) return null;
                return <g>{bars.map((b: any) => b?.payload?.forecast == null ? null : (
                  // A thin light edge keeps the mark readable where it crosses a dark bar.
                  <g key={b.payload.key}>
                    <line x1={b.x - 1} x2={b.x + b.width + 1} y1={yAxis.scale(b.payload.forecast)} y2={yAxis.scale(b.payload.forecast)} stroke="#fff" strokeOpacity={0.9} strokeWidth={4} />
                    <line x1={b.x} x2={b.x + b.width} y1={yAxis.scale(b.payload.forecast)} y2={yAxis.scale(b.payload.forecast)} stroke={PROJECTION} strokeWidth={2.5} />
                  </g>
                ))}</g>;
              }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

