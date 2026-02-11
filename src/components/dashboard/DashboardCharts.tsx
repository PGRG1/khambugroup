import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend } from "recharts";
import { SalesRecord } from "@/types/sales";
import { getDayOfWeekStats, getPaymentBreakdown, getVenueComparison, formatCurrency, getMonthLabel } from "@/utils/salesUtils";
import ChartCard from "./ChartCard";

const COLORS = [
  "hsl(38, 92%, 55%)",
  "hsl(16, 80%, 55%)",
  "hsl(180, 60%, 50%)",
  "hsl(260, 60%, 60%)",
  "hsl(120, 50%, 50%)",
  "hsl(330, 70%, 55%)",
  "hsl(50, 80%, 50%)",
];

const MONTH_COLORS = [
  "hsl(38, 92%, 55%)",
  "hsl(16, 80%, 55%)",
  "hsl(180, 60%, 50%)",
  "hsl(260, 60%, 60%)",
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "hsl(220, 18%, 12%)",
    border: "1px solid hsl(220, 14%, 18%)",
    borderRadius: "8px",
    color: "hsl(40, 20%, 95%)",
    fontSize: "12px",
  },
};

const axisStyle = { fontSize: 11, fill: "hsl(220, 10%, 55%)" };

interface ChartsProps {
  data: SalesRecord[];
}

const DashboardCharts = ({ data }: ChartsProps) => {
  // Daily sales
  const dailySales = data
    .reduce((acc, r) => {
      const existing = acc.find((a) => a.date === r.date);
      if (existing) {
        existing.totalSales += r.totalSales;
        existing.guests += r.guests;
        existing.orders += r.orders;
      } else {
        acc.push({ date: r.date, totalSales: r.totalSales, guests: r.guests, orders: r.orders });
      }
      return acc;
    }, [] as { date: string; totalSales: number; guests: number; orders: number }[])
    .sort((a, b) => a.date.localeCompare(b.date));

  const spendData = dailySales.map((d) => ({
    date: d.date,
    perGuest: d.guests ? Math.round(d.totalSales / d.guests) : 0,
    perOrder: d.orders ? Math.round(d.totalSales / d.orders) : 0,
  }));

  const { data: dayStats, months } = getDayOfWeekStats(data);
  const paymentData = getPaymentBreakdown(data);
  const venueData = getVenueComparison(data);

  const discountData = data
    .reduce((acc, r) => {
      const existing = acc.find((a) => a.date === r.date);
      if (existing) {
        existing.discount += Math.abs(r.discount);
        existing.subtotal += r.subtotal;
      } else {
        acc.push({ date: r.date, discount: Math.abs(r.discount), subtotal: r.subtotal });
      }
      return acc;
    }, [] as { date: string; discount: number; subtotal: number }[])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, pct: d.subtotal ? ((d.discount / d.subtotal) * 100).toFixed(1) : "0" }));

  const formatDate = (d: string) => {
    const parts = d.split("-");
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* 1. Daily Sales */}
      <ChartCard title="Daily Sales">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dailySales}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${formatCurrency(v)}`, "Sales"]} labelFormatter={formatDate} />
            <Line type="monotone" dataKey="totalSales" stroke="hsl(38, 92%, 55%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(38, 92%, 55%)" }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 2. Daily Customers */}
      <ChartCard title="Daily Number of Customers">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={dailySales}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [v, "Guests"]} labelFormatter={formatDate} />
            <Line type="monotone" dataKey="guests" stroke="hsl(180, 60%, 50%)" strokeWidth={2} dot={{ r: 3, fill: "hsl(180, 60%, 50%)" }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 3. Avg Spend Per Customer */}
      <ChartCard title="Average Spend Per Customer">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={spendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Per Guest"]} labelFormatter={formatDate} />
            <Bar dataKey="perGuest" fill="hsl(38, 92%, 55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 4. Avg Spend Per Order */}
      <ChartCard title="Average Spend Per Order">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={spendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${v}`, "Per Order"]} labelFormatter={formatDate} />
            <Bar dataKey="perOrder" fill="hsl(16, 80%, 55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 5. Avg Customers by Day of Week (MoM) */}
      <ChartCard title="Avg Customers by Day of Week (MoM)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
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

      {/* 6. Avg Spend Per Customer by Day of Week (MoM) */}
      <ChartCard title="Avg Spend/Customer by Day of Week (MoM)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
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

      {/* 7. Avg Spend Per Order by Day of Week (MoM) */}
      <ChartCard title="Avg Spend/Order by Day of Week (MoM)">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dayStats}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
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

      {/* 8. Venue Comparative Performance */}
      <ChartCard title="Venue Comparative Performance">
        <div className="grid grid-cols-2 gap-4">
          {venueData.map((v) => (
            <div key={v.venue} className="rounded-lg bg-secondary/50 p-4">
              <h4 className="font-display font-semibold text-foreground mb-3">{v.venue}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Sales</span>
                  <span className="text-foreground font-medium">${formatCurrency(v.totalSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Guests</span>
                  <span className="text-foreground font-medium">{formatCurrency(v.totalGuests)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Orders</span>
                  <span className="text-foreground font-medium">{formatCurrency(v.totalOrders)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg / Guest</span>
                  <span className="text-primary font-medium">${formatCurrency(v.avgPerGuest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg / Order</span>
                  <span className="text-primary font-medium">${formatCurrency(v.avgPerOrder)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ChartCard>

      {/* 9. Payment Method Breakdown */}
      <ChartCard title="Payment Method Breakdown">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={paymentData} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
              {paymentData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`$${formatCurrency(v)}`, "Amount"]} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 10. Discount Report */}
      <ChartCard title="Discount Report">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={discountData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={axisStyle} />
            <YAxis yAxisId="left" tick={axisStyle} tickFormatter={(v) => `$${v}`} />
            <YAxis yAxisId="right" orientation="right" tick={axisStyle} tickFormatter={(v) => `${v}%`} />
            <Tooltip {...tooltipStyle} />
            <Bar yAxisId="left" dataKey="discount" name="Discount ($)" fill="hsl(0, 72%, 51%)" radius={[3, 3, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="pct" name="Discount %" stroke="hsl(38, 92%, 55%)" strokeWidth={2} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

export default DashboardCharts;
