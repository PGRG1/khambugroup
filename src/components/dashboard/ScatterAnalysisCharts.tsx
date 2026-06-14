import { useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";

const MONTH_COLORS = [
  "hsl(24, 80%, 50%)",
  "hsl(14, 70%, 52%)",
  "hsl(175, 55%, 42%)",
  "hsl(258, 50%, 55%)",
  "hsl(340, 60%, 50%)",
  "hsl(200, 60%, 45%)",
  "hsl(45, 70%, 50%)",
  "hsl(120, 40%, 45%)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(35, 25%, 95%)",
    border: "1px solid hsl(30, 15%, 85%)",
    borderRadius: "8px",
    color: "hsl(25, 20%, 15%)",
    fontSize: "12px",
  },
};

const axisStyle = { fontSize: 11, fill: "hsl(25, 10%, 50%)" };
const gridColor = "hsl(30, 15%, 85%)";

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface ScatterPoint {
  date: string;
  day: string;
  dayOfMonth: number;
  month: string;
  totalSales: number;
  guests: number;
  spendPerGuest: number;
}

interface Props {
  data: SalesRecord[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function median(sorted: number[]): number {
  return percentile(sorted, 50);
}

function calcStats(values: number[]) {
  if (values.length === 0) return { avg: 0, med: 0, p25: 0, p75: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  return {
    avg,
    med: Math.round(median(sorted)),
    p25: Math.round(percentile(sorted, 25)),
    p75: Math.round(percentile(sorted, 75)),
  };
}

const refLineStyle = {
  avg: { stroke: "hsl(24, 70%, 45%)", strokeDasharray: "6 3", strokeWidth: 1.5 },
  med: { stroke: "hsl(175, 50%, 40%)", strokeDasharray: "0", strokeWidth: 1.5 },
  p75: { stroke: "hsl(258, 40%, 55%)", strokeDasharray: "3 3", strokeWidth: 1 },
  p25: { stroke: "hsl(258, 40%, 55%)", strokeDasharray: "3 3", strokeWidth: 1 },
};

export default function ScatterAnalysisCharts({ data }: Props) {
  const [selectedDays, setSelectedDays] = useState<string[]>([...DAYS_OF_WEEK]);
  const [activeMonths, setActiveMonths] = useState<string[]>([]);

  const allMonths = useMemo(() => {
    return [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
  }, [data]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    allMonths.forEach((mk, i) => map.set(mk, MONTH_COLORS[i % MONTH_COLORS.length]));
    return map;
  }, [allMonths]);

  const toggleDay = useCallback((day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }, []);

  const toggleMonth = useCallback((mk: string) => {
    setActiveMonths((prev) =>
      prev.includes(mk) ? prev.filter((m) => m !== mk) : [...prev, mk]
    );
  }, []);

  const isMonthVisible = useCallback(
    (mk: string) => activeMonths.length === 0 || activeMonths.includes(mk),
    [activeMonths]
  );

  // Build scatter points aggregated by date
  const allPoints = useMemo(() => {
    const dateMap = new Map<string, { date: string; day: string; totalSales: number; guests: number; orders: number }>();
    data.forEach((r) => {
      const existing = dateMap.get(r.date);
      if (existing) {
        existing.totalSales += r.totalSales;
        existing.guests += r.guests;
        existing.orders += r.orders;
      } else {
        dateMap.set(r.date, { date: r.date, day: r.day, totalSales: r.totalSales, guests: r.guests, orders: r.orders });
      }
    });

    return Array.from(dateMap.values()).map((d): ScatterPoint => ({
      date: d.date,
      day: d.day,
      dayOfMonth: new Date(d.date).getDate(),
      month: getMonthKey(d.date),
      totalSales: d.totalSales,
      guests: d.guests,
      spendPerGuest: d.guests ? Math.round(d.totalSales / d.guests) : 0,
    }));
  }, [data]);

  // Filter by selected days and months
  const filteredPoints = useMemo(() => {
    return allPoints.filter(
      (p) => selectedDays.includes(p.day) && isMonthVisible(p.month)
    );
  }, [allPoints, selectedDays, isMonthVisible]);

  const revenueStats = useMemo(() => calcStats(filteredPoints.map((p) => p.totalSales)), [filteredPoints]);
  const guestStats = useMemo(() => calcStats(filteredPoints.map((p) => p.guests)), [filteredPoints]);
  const spendStats = useMemo(() => calcStats(filteredPoints.map((p) => p.spendPerGuest)), [filteredPoints]);

  if (allMonths.length === 0) return null;

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formatDateLabel = (d: string) => {
    const parts = d.split("-");
    return `${MONTH_NAMES[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}`;
  };

  const CustomTooltip = ({ active, payload, metric }: any) => {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload as ScatterPoint;
    if (!p) return null;

    let valueStr = "";
    if (metric === "revenue") valueStr = `$${formatCurrency(p.totalSales)}`;
    else if (metric === "guests") valueStr = `${p.guests}`;
    else valueStr = `$${p.spendPerGuest}`;

    return (
      <div style={tooltipStyle.contentStyle} className="p-2">
        <p className="font-medium">{formatDateLabel(p.date)} ({p.day})</p>
        <p className="text-muted-foreground text-[11px]">{getMonthLabel(p.month)}</p>
        <p className="font-semibold mt-0.5">{valueStr}</p>
      </div>
    );
  };

  const renderRefLines = (stats: { avg: number; med: number; p25: number; p75: number }, isCurrency: boolean) => {
    const fmt = (v: number) => isCurrency ? `$${formatCurrency(v)}` : v.toLocaleString();
    return (
      <>
        <ReferenceLine y={stats.avg} {...refLineStyle.avg} label={{ value: `Avg ${fmt(stats.avg)}`, position: "right", fontSize: 10, fill: refLineStyle.avg.stroke }} />
        <ReferenceLine y={stats.med} {...refLineStyle.med} label={{ value: `Med ${fmt(stats.med)}`, position: "right", fontSize: 10, fill: refLineStyle.med.stroke }} />
        <ReferenceLine y={stats.p75} {...refLineStyle.p75} label={{ value: `P75 ${fmt(stats.p75)}`, position: "right", fontSize: 10, fill: refLineStyle.p75.stroke }} />
        <ReferenceLine y={stats.p25} {...refLineStyle.p25} label={{ value: `P25 ${fmt(stats.p25)}`, position: "right", fontSize: 10, fill: refLineStyle.p25.stroke }} />
      </>
    );
  };

  return (
    <>
      {/* Section header */}
      <div className="lg:col-span-2 mt-2 mb-1">
        <h3 className="text-sm font-semibold text-foreground">Daily Distribution Analysis</h3>
        <p className="text-xs text-muted-foreground">Individual data points by day of month, color-coded by period</p>
      </div>

      {/* Shared filters — full width */}
      <div className="lg:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Day-of-week filter */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-medium mr-1">Days</span>
          {DAYS_OF_WEEK.map((day) => {
            const active = selectedDays.includes(day);
            return (
              <button
                key={day}
                onClick={() => toggleDay(day)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>

        {/* Month legend */}
        <div className="flex items-center gap-2 flex-wrap">
          {allMonths.map((mk) => {
            const visible = isMonthVisible(mk);
            const color = colorMap.get(mk)!;
            return (
              <button
                key={mk}
                onClick={() => toggleMonth(mk)}
                className="flex items-center gap-1 text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity"
                style={{ opacity: visible ? 1 : 0.35 }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color, opacity: visible ? 1 : 0.4 }}
                />
                <span
                  style={{
                    color: visible ? color : "hsl(25, 10%, 50%)",
                    textDecoration: visible ? "none" : "line-through",
                  }}
                >
                  {getMonthLabel(mk)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart 1: Daily Revenue */}
      <ChartCard title="Daily Revenue">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 60, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="dayOfMonth"
              type="number"
              domain={[0, 31]}
              ticks={[0, 5, 10, 15, 20, 25, 30]}
              tick={axisStyle}
              label={{ value: "Day of Month", position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "hsl(25, 10%, 50%)" } }}
            />
            <YAxis
              dataKey="totalSales"
              type="number"
              tick={axisStyle}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip metric="revenue" />} />
            {renderRefLines(revenueStats, true)}
            <Scatter data={filteredPoints} isAnimationActive={false}>
              {filteredPoints.map((p, i) => (
                <Cell key={`r-${i}`} fill={colorMap.get(p.month) || MONTH_COLORS[0]} fillOpacity={0.75} r={4} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart 2: No. of Guests */}
      <ChartCard title="No. of Guests">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 60, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="dayOfMonth"
              type="number"
              domain={[0, 31]}
              ticks={[0, 5, 10, 15, 20, 25, 30]}
              tick={axisStyle}
              label={{ value: "Day of Month", position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "hsl(25, 10%, 50%)" } }}
            />
            <YAxis
              dataKey="guests"
              type="number"
              tick={axisStyle}
            />
            <Tooltip content={<CustomTooltip metric="guests" />} />
            {renderRefLines(guestStats, false)}
            <Scatter data={filteredPoints} isAnimationActive={false}>
              {filteredPoints.map((p, i) => (
                <Cell key={`g-${i}`} fill={colorMap.get(p.month) || MONTH_COLORS[0]} fillOpacity={0.75} r={4} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart 3: Spend per Guest */}
      <ChartCard title="Spend / Guest">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 60, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="dayOfMonth"
              type="number"
              domain={[1, 31]}
              tick={axisStyle}
              tickFormatter={(v) => String(Number(v) - 1)}
              label={{ value: "Day of Month", position: "insideBottom", offset: -5, style: { fontSize: 10, fill: "hsl(25, 10%, 50%)" } }}
            />
            <YAxis
              dataKey="spendPerGuest"
              type="number"
              tick={axisStyle}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip content={<CustomTooltip metric="spend" />} />
            {renderRefLines(spendStats, true)}
            <Scatter data={filteredPoints} isAnimationActive={false}>
              {filteredPoints.map((p, i) => (
                <Cell key={`s-${i}`} fill={colorMap.get(p.month) || MONTH_COLORS[0]} fillOpacity={0.75} r={4} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}
