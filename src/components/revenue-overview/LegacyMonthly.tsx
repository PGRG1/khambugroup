import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { SalesRecord } from "@/types/sales";
import { formatCurrency, getMonthKey, getMonthLabel, getPaymentBreakdown, getVenueComparison } from "@/utils/salesUtils";
import { SectionHeader } from "./SectionHeader";
import { ChartShell } from "./ChartShell";
import {
  chartAxis,
  chartGrid,
  chartTooltipContentStyle,
  compactHK,
  PRIMARY,
} from "./chartTheme";
import VenuePerformanceChart from "@/components/dashboard/VenuePerformanceChart";
import PaymentBreakdownChart from "@/components/dashboard/PaymentBreakdownChart";

interface Props {
  data: SalesRecord[];
  venue: string;
}

export function LegacyMonthly({ data, venue }: Props) {
  const monthlyAverages = useMemo(() => {
    const monthKeys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return monthKeys.map((key) => {
      const records = data.filter((r) => getMonthKey(r.date) === key);
      const dailyMap = new Map<string, { sales: number; guests: number; orders: number }>();
      records.forEach((r) => {
        const ex = dailyMap.get(r.date);
        if (ex) {
          ex.sales += r.totalSales;
          ex.guests += r.guests;
          ex.orders += r.orders;
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
        guestsPerDay: Math.round(totalGuests / days),
        ordersPerDay: Math.round(totalOrders / days),
        guestsPerOrder: totalOrders ? parseFloat((totalGuests / totalOrders).toFixed(1)) : 0,
        spendPerGuest: totalGuests ? Math.round(totalSales / totalGuests) : 0,
        spendPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      };
    });
  }, [data]);

  const paymentData = useMemo(() => getPaymentBreakdown(data), [data]);
  const venueData = useMemo(() => getVenueComparison(data), [data]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Monthly Averages" description="Per-day averages within each month of the selected range" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MiniPanel title="Avg Revenue / Day" data={monthlyAverages} dataKey="revenuePerDay" tickFmt={(v) => `$${compactHK(v)}`} tipFmt={(v) => `$${formatCurrency(v)}`} />
        <MiniPanel title="Avg Guests / Day" data={monthlyAverages} dataKey="guestsPerDay" tickFmt={(v) => `${v}`} tipFmt={(v) => formatCurrency(v)} />
        <MiniPanel title="Avg Orders / Day" data={monthlyAverages} dataKey="ordersPerDay" tickFmt={(v) => `${v}`} tipFmt={(v) => formatCurrency(v)} />
        <MiniPanel title="Guests / Order" data={monthlyAverages} dataKey="guestsPerOrder" tickFmt={(v) => `${v}`} tipFmt={(v) => `${v}`} />
        <MiniPanel title="Spend / Guest" data={monthlyAverages} dataKey="spendPerGuest" tickFmt={(v) => `$${v}`} tipFmt={(v) => `$${formatCurrency(v)}`} />
        <MiniPanel title="Spend / Order" data={monthlyAverages} dataKey="spendPerOrder" tickFmt={(v) => `$${v}`} tipFmt={(v) => `$${formatCurrency(v)}`} />
      </div>

      <SectionHeader title="Mix" description="Where the revenue comes from" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VenuePerformanceChart data={venueData} venue={venue} />
        <PaymentBreakdownChart data={paymentData} />
      </div>
    </div>
  );
}

interface MiniProps {
  title: string;
  data: any[];
  dataKey: string;
  tickFmt: (v: number) => string;
  tipFmt: (v: number) => string;
}

function MiniPanel({ title, data, dataKey, tickFmt, tipFmt }: MiniProps) {
  return (
    <ChartShell title={title}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="month" {...chartAxis} />
          <YAxis {...chartAxis} tickFormatter={(v) => tickFmt(v as number)} width={44} />
          <Tooltip
            contentStyle={chartTooltipContentStyle}
            formatter={(v: number) => [tipFmt(v), title]}
          />
          <Bar dataKey={dataKey} fill={PRIMARY} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
