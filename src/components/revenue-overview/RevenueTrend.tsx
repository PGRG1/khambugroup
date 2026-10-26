import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  Cell,
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

function MarkLabel({ viewBox, text, color }: { viewBox?: { x: number; y: number }; text: string; color: string }) {
  if (!viewBox) return null;
  const w = text.length * 6.2 + 12;
  const x = Math.max(4, viewBox.x - w / 2);
  const y = Math.max(2, viewBox.y - 24);
  return (
    <g>
      <rect x={x} y={y} width={w} height={18} rx={5} fill="hsl(var(--card))" stroke={color} strokeOpacity={0.5} />
      <text x={x + w / 2} y={y + 12.5} textAnchor="middle" fontSize={11} fontWeight={600} fill={color}>{text}</text>
    </g>
  );
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
          label: new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
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
    return { best: bw.best, worst: bw.worst, bestText: `Best · ${text(bw.best)}`, worstText: `Worst · ${text(bw.worst)}` };
  }, [markBestWorst, view, chartData]);

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
          <span className="text-right text-foreground">HK${fmtHKD(point.revenue)}</span>
          {point.forecast !== null && (
            <>
              <span className="text-muted-foreground">Forecast</span>
              <span className="text-right text-foreground">HK${fmtHKD(point.forecast)}</span>
              <span className="text-muted-foreground">Variance</span>
              <span className={`text-right ${variance !== null && variance < 0 ? "text-destructive" : "text-primary"}`}>
                {variance !== null && variance < 0 ? "−" : "+"}HK${fmtHKD(Math.abs(variance ?? 0))}
                {variancePct !== null ? ` (${variancePct >= 0 ? "+" : "−"}${Math.abs(variancePct).toFixed(1)}%)` : ""}
              </span>
            </>
          )}
        </div>
        {point.guests > 0 && (
          <div className="mt-1.5 text-muted-foreground">
            {fmtNum(point.guests)} covers · HK${fmtHKD(point.avgPerGuest)}/guest
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
            <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted-foreground" />Forecast</span>
          </div>
        )}
      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 24, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={30}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmtHKD(v as number, true)}
              width={48}
            />
            <Tooltip content={tooltipContent} />
            <Bar dataKey="revenue" fill="hsl(var(--primary))" fillOpacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={40}>
              {chartData.map((d) => (
                <Cell key={d.key} fill={marks && d.key === marks.worst.key ? "hsl(var(--warning))" : "hsl(var(--primary))"} />
              ))}
            </Bar>
            {marks && (
              <ReferenceDot x={marks.best.label} y={marks.best.revenue} r={0} ifOverflow="extendDomain"
                label={(props: any) => <MarkLabel {...props} text={marks.bestText} color="hsl(var(--foreground))" />} />
            )}
            {marks && (
              <ReferenceDot x={marks.worst.label} y={marks.worst.revenue} r={0} ifOverflow="extendDomain"
                label={(props: any) => <MarkLabel {...props} text={marks.worstText} color="hsl(var(--warning))" />} />
            )}
            {showForecast && (
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3 }}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

