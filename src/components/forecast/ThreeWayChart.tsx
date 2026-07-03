import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { SalesRecord } from "@/types/sales";
import { ForecastRecord } from "@/types/forecast";
import { formatCurrency } from "@/utils/salesUtils";
import { StatisticalDailyRow } from "@/hooks/useStatisticalRevenueTargets";

interface Props {
  year: number;
  month: number;
  selectedVenues: string[];
  salesData: SalesRecord[];
  forecasts: ForecastRecord[];
  statisticalDaily: StatisticalDailyRow[];
}


const MANAGER_COLOR = "hsl(152 76% 50%)";
const ACTUAL_COLOR = "hsl(199 90% 55%)";
const STAT_COLOR = "hsl(45 96% 60%)";


const ThreeWayChart = ({
  year,
  month,
  selectedVenues,
  salesData,
  forecasts,
  statisticalDaily,
}: Props) => {

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() + 1 === month;
  const todayDay = isCurrentMonth ? today.getDate() : null;

  const chartData = useMemo(() => {
    // Daily totals per source, restricted to selected venues.
    const dailyManager = new Map<number, number>();
    for (const f of forecasts) {
      if (!f.date.startsWith(monthStr)) continue;
      if (!selectedVenues.includes(f.venue)) continue;
      const day = parseInt(f.date.split("-")[2], 10);
      dailyManager.set(
        day,
        (dailyManager.get(day) ?? 0) + Number(f.forecastedTotalSales || 0),
      );
    }
    const dailyActual = new Map<number, number>();
    for (const s of salesData) {
      if (!s.date.startsWith(monthStr)) continue;
      if (!selectedVenues.includes(s.venue)) continue;
      const day = parseInt(s.date.split("-")[2], 10);
      dailyActual.set(
        day,
        (dailyActual.get(day) ?? 0) + Number(s.totalSales || 0),
      );
    }

    const dailyStat = new Map<number, number>();
    for (const r of statisticalDaily) {
      if (!r.targetDate.startsWith(monthStr)) continue;
      if (!selectedVenues.includes(r.venueName)) continue;
      const day = parseInt(r.targetDate.split("-")[2], 10);
      dailyStat.set(day, (dailyStat.get(day) ?? 0) + r.amount);
    }

    const hasAnyManager = dailyManager.size > 0;
    const hasAnyActual = dailyActual.size > 0;
    const hasAnyStat = dailyStat.size > 0;

    let cumMgr = 0;
    let cumAct = 0;
    let cumStat = 0;
    const rows: {
      day: number;
      label: string;
      manager: number | null;
      actual: number | null;
      statistical: number | null;
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const mgrDay = dailyManager.get(d);
      const actDay = dailyActual.get(d);
      const statDay = dailyStat.get(d);
      if (mgrDay != null) cumMgr += mgrDay;
      if (actDay != null) cumAct += actDay;
      if (statDay != null) cumStat += statDay;

      // For current month, stop actual line at today.
      const showActual =
        hasAnyActual && (todayDay == null || d <= todayDay)
          ? cumAct
          : null;
      const showManager = hasAnyManager ? cumMgr : null;
      const showStat = hasAnyStat ? cumStat : null;

      rows.push({
        day: d,
        label: String(d),
        manager: showManager,
        actual: showActual,
        statistical: showStat,
      });
    }
    return { rows, hasAnyManager, hasAnyActual, hasAnyStat };
  }, [forecasts, salesData, statisticalDaily, monthStr, selectedVenues, daysInMonth, todayDay]);

  if (!chartData.hasAnyManager && !chartData.hasAnyActual && !chartData.hasAnyStat) {

    return (
      <div className="card-glass rounded-xl p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No manager forecasts or actual revenue recorded for this month yet.
        </p>
      </div>
    );
  }

  return (
    <div className="card-glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-display font-semibold">
          Cumulative Revenue — Statistical vs Manager vs Actual
        </h3>

      </div>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart
            data={chartData.rows}
            margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : v >= 1000
                    ? `${Math.round(v / 1000)}k`
                    : String(v)
              }
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: unknown, name: string) => {
                if (value == null) return ["—", name];
                return [formatCurrency(Number(value)), name];
              }}
              labelFormatter={(l) => `Day ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {todayDay != null && (
              <ReferenceLine
                x={String(todayDay)}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{
                  value: "Today",
                  position: "top",
                  fill: "hsl(var(--muted-foreground))",
                  fontSize: 10,
                }}
              />
            )}
            {chartData.hasAnyActual && (
              <Area
                type="monotone"
                dataKey="actual"
                name="Actual (cum.)"
                stroke={ACTUAL_COLOR}
                fill={ACTUAL_COLOR}
                fillOpacity={0.18}
                strokeWidth={2}
                connectNulls={false}
                dot={false}
              />
            )}
            {chartData.hasAnyManager && (
              <Line
                type="monotone"
                dataKey="manager"
                name="Manager (cum.)"
                stroke={MANAGER_COLOR}
                strokeWidth={2}
                dot={false}
              />
            )}
            {chartData.hasAnyStat && (
              <Line
                type="monotone"
                dataKey="statistical"
                name="Statistical (cum.)"
                stroke={STAT_COLOR}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
              />
            )}

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ThreeWayChart;
