import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend, ReferenceLine } from "recharts";
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
  view: "daily" | "monthly";
}

const DashboardCharts = ({ data, view }: ChartsProps) => {
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

  // Average daily sales and guests for reference lines
  const avgDailySales = dailySales.length ? Math.round(dailySales.reduce((s, d) => s + d.totalSales, 0) / dailySales.length) : 0;
  const avgDailyGuests = dailySales.length ? Math.round(dailySales.reduce((s, d) => s + d.guests, 0) / dailySales.length) : 0;
  const avgPerGuest = spendData.length ? Math.round(spendData.reduce((s, d) => s + d.perGuest, 0) / spendData.length) : 0;
  const avgPerOrder = spendData.length ? Math.round(spendData.reduce((s, d) => s + d.perOrder, 0) / spendData.length) : 0;

  const { data: dayStats, months } = getDayOfWeekStats(data);
  const paymentData = getPaymentBreakdown(data);
  const venueData = getVenueComparison(data);

  // Monthly revenue & averages
  const monthKeys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
  const monthlyRevenue = monthKeys.map((key) => {
    const records = data.filter((r) => getMonthKey(r.date) === key);
    return {
      month: getMonthLabel(key),
      revenue: records.reduce((s, r) => s + r.totalSales, 0),
    };
  });

  const monthlyAverages = monthKeys.map((key) => {
    const records = data.filter((r) => getMonthKey(r.date) === key);
    // Group by date to get unique days
    const dailyMap = new Map<string, { sales: number; guests: number; orders: number }>();
    records.forEach((r) => {
      const existing = dailyMap.get(r.date);
      if (existing) {
        existing.sales += r.totalSales;
        existing.guests += r.guests;
        existing.orders += r.orders;
      } else {
        dailyMap.set(r.date, { sales: r.totalSales, guests: r.guests, orders: r.orders });
      }
    });
    const days = dailyMap.size || 1;
    const totalSales = records.reduce((s, r) => s + r.totalSales, 0);
    const totalGuests = records.reduce((s, r) => s + r.guests, 0);
    const totalOrders = records.reduce((s, r) => s + r.orders, 0);
    return {
      month: getMonthLabel(key),
      revenuePerDay: Math.round(totalSales / days),
      customersPerDay: Math.round(totalGuests / days),
      ordersPerDay: Math.round(totalOrders / days),
      customersPerOrder: totalOrders ? parseFloat((totalGuests / totalOrders).toFixed(1)) : 0,
      spendPerCustomer: totalGuests ? Math.round(totalSales / totalGuests) : 0,
      spendPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
    };
  });

  const discountData = data
    .reduce((acc, r) => {
      const existing = acc.find((a) => a.date === r.date);
      const totalRevenue = r.subtotal + r.serviceCharge;
      if (existing) {
        existing.discount += Math.abs(r.discount);
        existing.totalRevenue += totalRevenue;
      } else {
        acc.push({ date: r.date, day: r.day, discount: Math.abs(r.discount), totalRevenue });
      }
      return acc;
    }, [] as { date: string; day: string; discount: number; totalRevenue: number }[])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, pct: d.totalRevenue ? parseFloat(((d.discount / d.totalRevenue) * 100).toFixed(1)) : 0 }));

  // Average discount % of total revenue for reference line
  const totalDiscountAll = discountData.reduce((s, d) => s + d.discount, 0);
  const totalRevenueAll = discountData.reduce((s, d) => s + d.totalRevenue, 0);
  const avgDiscountPct = totalRevenueAll ? parseFloat(((totalDiscountAll / totalRevenueAll) * 100).toFixed(1)) : 0;

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
    <div className="space-y-5">
      {view === "daily" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Daily Sales">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs text-muted-foreground">
                Avg Daily Sales <span className="text-foreground font-semibold">${formatCurrency(avgDailySales)}</span>
              </p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
                <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const sales = payload[0]?.value as number;
                  return (
                    <div style={tooltipStyle.contentStyle} className="p-2">
                      <p className="font-medium">{dayTooltipLabel(label)}</p>
                      <p>Sales: ${formatCurrency(sales)}</p>
                      <p style={{ color: "hsl(25, 10%, 50%)" }}>Avg: ${formatCurrency(avgDailySales)}</p>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="totalSales" stroke="hsl(24, 80%, 50%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Daily Number of Customers">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs text-muted-foreground">
                Avg Daily Customers <span className="text-foreground font-semibold">{avgDailyGuests}</span>
              </p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
                <YAxis tick={axisStyle} />
                <Tooltip {...tooltipStyle} content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const guests = payload[0]?.value as number;
                  return (
                    <div style={tooltipStyle.contentStyle} className="p-2">
                      <p className="font-medium">{dayTooltipLabel(label)}</p>
                      <p>Guests: {guests}</p>
                      <p style={{ color: "hsl(25, 10%, 50%)" }}>Avg: {avgDailyGuests}</p>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="guests" stroke="hsl(175, 55%, 42%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Average Spend Per Customer">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs text-muted-foreground">
                Avg Spend/Customer <span className="text-foreground font-semibold">${avgPerGuest}</span>
              </p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
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
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs text-muted-foreground">
                Avg Spend/Order <span className="text-foreground font-semibold">${avgPerOrder}</span>
              </p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={spendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
                <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Per Order"]} labelFormatter={dayTooltipLabel} />
                <Bar dataKey="perOrder" fill="hsl(14, 70%, 52%)" radius={[4, 4, 0, 0]} />
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
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs text-muted-foreground">
                Avg Discount % of Total Sales <span className="text-foreground font-semibold">{avgDiscountPct}%</span>
              </p>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={discountData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
                <YAxis yAxisId="left" tick={axisStyle} tickFormatter={(v) => `$${v}`} />
                <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickFormatter={(v) => `${v}%`} width={45} />
                <Tooltip {...tooltipStyle} labelFormatter={dayTooltipLabel} />
                <Bar yAxisId="left" dataKey="discount" name="Discount ($)" fill="hsl(0, 65%, 50%)" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="pct" name="Discount % of Total Sales" stroke="hsl(24, 80%, 50%)" strokeWidth={2} dot={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ChartCard title="Monthly Revenue" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={axisStyle} />
                <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${formatCurrency(v)}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="hsl(24, 80%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Monthly Averages" className="lg:col-span-2">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Avg Revenue/Day</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${formatCurrency(v)}`, "Rev/Day"]} />
                    <Bar dataKey="revenuePerDay" fill="hsl(24, 80%, 50%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Avg Customers/Day</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Customers/Day"]} />
                    <Bar dataKey="customersPerDay" fill="hsl(175, 55%, 42%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Avg Orders/Day</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Orders/Day"]} />
                    <Bar dataKey="ordersPerDay" fill="hsl(14, 70%, 52%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Avg Customers/Order</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Customers/Order"]} />
                    <Bar dataKey="customersPerOrder" fill="hsl(258, 50%, 55%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Avg Spend/Customer</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Spend/Customer"]} />
                    <Bar dataKey="spendPerCustomer" fill="hsl(24, 80%, 50%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1 font-medium">Avg Spend/Order</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyAverages}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="month" tick={axisStyle} />
                    <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Spend/Order"]} />
                    <Bar dataKey="spendPerOrder" fill="hsl(14, 70%, 52%)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ChartCard>
        </div>
      )}
    </div>
  );
};

export default DashboardCharts;
