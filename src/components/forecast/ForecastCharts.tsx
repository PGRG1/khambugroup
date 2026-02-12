import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { ForecastWithActuals } from "@/types/forecast";
import { formatCurrency } from "@/utils/salesUtils";
import ChartCard from "@/components/dashboard/ChartCard";

interface ForecastChartsProps {
  data: ForecastWithActuals[];
}

const COLORS = {
  forecast: "hsl(var(--primary))",
  actual: "hsl(var(--chart-2))",
  positive: "#22c55e",
  negative: "#ef4444",
};

const ForecastCharts = ({ data }: ForecastChartsProps) => {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.date.localeCompare(b.date)),
    [data]
  );

  const chartData = useMemo(
    () =>
      sorted.map((d) => ({
        date: d.date.slice(5), // MM-DD
        day: d.day,
        fcstSales: d.forecastedTotalSales,
        actSales: d.actualTotalSales,
        fcstCust: d.forecastedCustomers,
        actCust: d.actualCustomers,
        fcstAvg: d.forecastedAvgSpend,
        actAvg: d.actualAvgSpend,
        variance: d.totalSalesVariance,
        accuracy:
          d.actualTotalSales !== null && d.forecastedTotalSales > 0
            ? Math.round(
                (1 - Math.abs(d.totalSalesVariance ?? 0) / d.forecastedTotalSales) * 100
              )
            : null,
      })),
    [sorted]
  );

  const tooltipLabel = (label: string) => {
    const item = chartData.find((d) => d.date === label);
    return item ? `${label} (${item.day})` : label;
  };

  if (chartData.length === 0) {
    return (
      <div className="card-glass rounded-xl p-12 text-center">
        <p className="text-muted-foreground">No forecast data yet. Add forecasts to see charts.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Forecast vs Actual Sales */}
      <ChartCard title="Forecast vs Actual Sales" subtitle="Total sales comparison">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip labelFormatter={tooltipLabel} formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Line type="monotone" dataKey="fcstSales" name="Forecast" stroke={COLORS.forecast} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="actSales" name="Actual" stroke={COLORS.actual} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Forecast vs Actual Customers */}
      <ChartCard title="Forecast vs Actual Customers" subtitle="Customer count comparison">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip labelFormatter={tooltipLabel} formatter={(v: number) => v} />
            <Legend />
            <Line type="monotone" dataKey="fcstCust" name="Forecast" stroke={COLORS.forecast} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="actCust" name="Actual" stroke={COLORS.actual} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Forecast vs Actual Avg Spend per Customer */}
      <ChartCard title="Forecast vs Actual Avg Spend / Customer" subtitle="Per-customer spend comparison">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip labelFormatter={tooltipLabel} formatter={(v: number) => formatCurrency(v)} />
            <Legend />
            <Line type="monotone" dataKey="fcstAvg" name="Forecast" stroke={COLORS.forecast} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="actAvg" name="Actual" stroke={COLORS.actual} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Forecast Accuracy */}
      <ChartCard title="Forecast Accuracy" subtitle="How close forecasts are to actuals (%)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData.filter((d) => d.accuracy !== null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
            <Tooltip labelFormatter={tooltipLabel} formatter={(v: number) => `${v}%`} />
            <Bar dataKey="accuracy" name="Accuracy" fill={COLORS.forecast} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Daily Variance */}
      <ChartCard title="Daily Variance" subtitle="Over/under forecast (actual − forecast)" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData.filter((d) => d.variance !== null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip labelFormatter={tooltipLabel} formatter={(v: number) => formatCurrency(v)} />
            <Bar
              dataKey="variance"
              name="Variance"
              fill={COLORS.forecast}
              radius={[4, 4, 0, 0]}
              // Color bars green/red based on value
              shape={(props: any) => {
                const { x, y, width, height, value } = props;
                const fill = value >= 0 ? COLORS.positive : COLORS.negative;
                const adjustedY = value >= 0 ? y : y;
                const adjustedHeight = Math.abs(height);
                return <rect x={x} y={adjustedY} width={width} height={adjustedHeight} fill={fill} rx={4} />;
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default ForecastCharts;
