import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { SalesRecord } from "@/types/sales";
import { getDayOfWeekStats, getPaymentBreakdown, getVenueComparison, formatCurrency, getMonthLabel, getMonthKey } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";
import PaymentBreakdownChart from "./PaymentBreakdownChart";
import VenuePerformanceChart from "./VenuePerformanceChart";

const MONTH_COLORS = [
  "hsl(24, 80%, 50%)",
  "hsl(14, 70%, 52%)",
  "hsl(175, 55%, 42%)",
  "hsl(258, 50%, 55%)",
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

interface ChartsProps {
  data: SalesRecord[];
}

const DashboardCharts = ({ data }: ChartsProps) => {
  const dailySales = data
    .reduce((acc, r) => {
      const existing = acc.find((a) => a.date === r.date);
      if (existing) {
        existing.totalSales += r.totalSales;
        existing.guests += r.guests;
        existing.orders += r.orders;
      } else {
        acc.push({ date: r.date, day: r.day, totalSales: r.totalSales, guests: r.guests, orders: r.orders });
      }
      return acc;
    }, [] as { date: string; day: string; totalSales: number; guests: number; orders: number }[])
    .sort((a, b) => a.date.localeCompare(b.date));

  const spendData = dailySales.map((d) => ({
    date: d.date,
    day: d.day,
    perGuest: d.guests ? Math.round(d.totalSales / d.guests) : 0,
    perOrder: d.orders ? Math.round(d.totalSales / d.orders) : 0,
  }));

  const { data: dayStats, months } = getDayOfWeekStats(data);
  const paymentData = getPaymentBreakdown(data);
  const venueData = getVenueComparison(data);

  // Monthly revenue
  const monthlyRevenue = [...new Set(data.map((r) => getMonthKey(r.date)))]
    .sort()
    .map((key) => {
      const records = data.filter((r) => getMonthKey(r.date) === key);
      return {
        month: getMonthLabel(key),
        revenue: records.reduce((s, r) => s + r.totalSales, 0),
      };
    });

  const discountData = data
    .reduce((acc, r) => {
      const existing = acc.find((a) => a.date === r.date);
      if (existing) {
        existing.discount += Math.abs(r.discount);
        existing.subtotal += r.subtotal;
      } else {
        acc.push({ date: r.date, day: r.day, discount: Math.abs(r.discount), subtotal: r.subtotal });
      }
      return acc;
    }, [] as { date: string; day: string; discount: number; subtotal: number }[])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, pct: d.subtotal ? ((d.discount / d.subtotal) * 100).toFixed(1) : "0" }));

  const formatDate = (d: string) => {
    const parts = d.split("-");
    return `${parts[1]}/${parts[2]}`;
  };

  const dayTooltipLabel = (d: string) => {
    const rec = dailySales.find((r) => r.date === d) || spendData.find((r) => r.date === d) || discountData.find((r) => r.date === d);
    const day = rec ? (rec as any).day : "";
    return `${formatDate(d)} (${day})`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <ChartCard title="Daily Sales">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dailySales}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${formatCurrency(v)}`, "Sales"]} labelFormatter={dayTooltipLabel} />
            <Line type="monotone" dataKey="totalSales" stroke="hsl(24, 80%, 50%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Daily Number of Customers">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dailySales}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Guests"]} labelFormatter={dayTooltipLabel} />
            <Line type="monotone" dataKey="guests" stroke="hsl(175, 55%, 42%)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Average Spend Per Customer">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={spendData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Per Guest"]} labelFormatter={dayTooltipLabel} />
            <Bar dataKey="perGuest" fill="hsl(24, 80%, 50%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Average Spend Per Order">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={spendData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Per Order"]} labelFormatter={dayTooltipLabel} />
            <Bar dataKey="perOrder" fill="hsl(14, 70%, 52%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Monthly Revenue">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyRevenue}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="month" tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${formatCurrency(v)}`, "Revenue"]} />
            <Bar dataKey="revenue" fill="hsl(24, 80%, 50%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Avg Customers by Day of Week (MoM)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayStats}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="day" tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {months.map((m, i) => (
              <Bar key={m} dataKey={`guests_${m}`} name={getMonthLabel(m)} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Avg Spend/Customer by Day of Week (MoM)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayStats}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="day" tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {months.map((m, i) => (
              <Bar key={m} dataKey={`spendPerGuest_${m}`} name={getMonthLabel(m)} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Avg Spend/Order by Day of Week (MoM)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayStats}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="day" tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {months.map((m, i) => (
              <Bar key={m} dataKey={`spendPerOrder_${m}`} name={getMonthLabel(m)} fill={MONTH_COLORS[i % MONTH_COLORS.length]} radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <VenuePerformanceChart data={venueData} />

      <PaymentBreakdownChart data={paymentData} />

      <ChartCard title="Discount Report">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={discountData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis yAxisId="left" tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...tooltipStyle} labelFormatter={dayTooltipLabel} />
            <Bar yAxisId="left" dataKey="discount" name="Discount ($)" fill="hsl(0, 65%, 50%)" radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="pct" name="Discount %" stroke="hsl(24, 80%, 50%)" strokeWidth={2} dot={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default DashboardCharts;
