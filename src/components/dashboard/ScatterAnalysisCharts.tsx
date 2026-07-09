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
} from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import {
  chartAxis,
  chartGrid,
  chartTooltipContentStyle,
  compactHK,
  PRIMARY,
  MUTED_FG,
  FG,
} from "@/components/revenue-overview/chartTheme";

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
const median = (sorted: number[]) => percentile(sorted, 50);

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

export default function ScatterAnalysisCharts({ data }: Props) {
  const [selectedDays, setSelectedDays] = useState<string[]>([...DAYS_OF_WEEK]);
  const [activeMonths, setActiveMonths] = useState<string[]>([]);

  const allMonths = useMemo(() => [...new Set(data.map((r) => getMonthKey(r.date)))].sort(), [data]);

  const toggleDay = useCallback((day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }, []);
  const toggleMonth = useCallback((mk: string) => {
    setActiveMonths((prev) => (prev.includes(mk) ? prev.filter((m) => m !== mk) : [...prev, mk]));
  }, []);
  const isMonthVisible = useCallback(
    (mk: string) => activeMonths.length === 0 || activeMonths.includes(mk),
    [activeMonths]
  );

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

  const filteredPoints = useMemo(
    () => allPoints.filter((p) => selectedDays.includes(p.day) && isMonthVisible(p.month)),
    [allPoints, selectedDays, isMonthVisible]
  );

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
      <div style={chartTooltipContentStyle} className="p-2">
        <p className="font-medium">{formatDateLabel(p.date)} ({p.day})</p>
        <p className="text-muted-foreground text-[11px]">{getMonthLabel(p.month)}</p>
        <p className="font-semibold mt-0.5">{valueStr}</p>
      </div>
    );
  };

  const renderRefLines = (stats: { avg: number; med: number; p25: number; p75: number }, isCurrency: boolean) => {
    const fmt = (v: number) => (isCurrency ? `$${formatCurrency(v)}` : v.toLocaleString());
    return (
      <>
        <ReferenceLine y={stats.avg} stroke={FG} strokeOpacity={0.7} strokeDasharray="6 3" label={{ value: `Avg ${fmt(stats.avg)}`, position: "right", fontSize: 10, fill: MUTED_FG }} />
        <ReferenceLine y={stats.med} stroke={MUTED_FG} strokeOpacity={0.6} label={{ value: `Med ${fmt(stats.med)}`, position: "right", fontSize: 10, fill: MUTED_FG }} />
        <ReferenceLine y={stats.p75} stroke={MUTED_FG} strokeOpacity={0.35} strokeDasharray="3 3" label={{ value: `P75 ${fmt(stats.p75)}`, position: "right", fontSize: 10, fill: MUTED_FG }} />
        <ReferenceLine y={stats.p25} stroke={MUTED_FG} strokeOpacity={0.35} strokeDasharray="3 3" label={{ value: `P25 ${fmt(stats.p25)}`, position: "right", fontSize: 10, fill: MUTED_FG }} />
      </>
    );
  };

  return (
    <div className="lg:col-span-2 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-medium mr-1">Months</span>
          {allMonths.map((mk) => {
            const visible = isMonthVisible(mk);
            return (
              <button
                key={mk}
                onClick={() => toggleMonth(mk)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
                  visible
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:bg-muted line-through"
                }`}
              >
                {getMonthLabel(mk)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartShell title="Daily Revenue" subtitle="Distribution by day of month">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 60, bottom: 10, left: 0 }}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="dayOfMonth" type="number" domain={[0, 31]} ticks={[0, 5, 10, 15, 20, 25, 30]} {...chartAxis} />
              <YAxis dataKey="totalSales" type="number" {...chartAxis} tickFormatter={(v) => `$${compactHK(v as number)}`} width={48} />
              <Tooltip content={<CustomTooltip metric="revenue" />} />
              {renderRefLines(revenueStats, true)}
              <Scatter data={filteredPoints} fill={PRIMARY} fillOpacity={0.6} shape="circle" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell title="No. of Guests" subtitle="Distribution by day of month">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 60, bottom: 10, left: 0 }}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="dayOfMonth" type="number" domain={[0, 31]} ticks={[0, 5, 10, 15, 20, 25, 30]} {...chartAxis} />
              <YAxis dataKey="guests" type="number" {...chartAxis} width={40} />
              <Tooltip content={<CustomTooltip metric="guests" />} />
              {renderRefLines(guestStats, false)}
              <Scatter data={filteredPoints} fill={PRIMARY} fillOpacity={0.6} shape="circle" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell title="Spend / Guest" subtitle="Distribution by day of month" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 10, right: 60, bottom: 10, left: 0 }}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="dayOfMonth" type="number" domain={[0, 31]} ticks={[0, 5, 10, 15, 20, 25, 30]} {...chartAxis} />
              <YAxis dataKey="spendPerGuest" type="number" {...chartAxis} tickFormatter={(v) => `$${v}`} width={44} />
              <Tooltip content={<CustomTooltip metric="spend" />} />
              {renderRefLines(spendStats, true)}
              <Scatter data={filteredPoints} fill={PRIMARY} fillOpacity={0.6} shape="circle" isAnimationActive={false} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>
    </div>
  );
}
