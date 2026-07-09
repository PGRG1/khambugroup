import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { SalesRecord } from "@/types/sales";
import {
  formatCurrency,
  getDayOfWeekStats,
  getMonthLabel,
  getPaymentBreakdown,
  getVenueComparison,
} from "@/utils/salesUtils";
import { getVenueSeats } from "@/constants/venueSeating";
import { SectionHeader } from "./SectionHeader";
import { ChartShell } from "./ChartShell";
import {
  chartAxis,
  chartGrid,
  chartLegendStyle,
  chartTooltipContentStyle,
  compactHK,
  DESTRUCTIVE,
  monthOpacity,
  PRIMARY,
} from "./chartTheme";
import CumulativeSalesChart from "@/components/dashboard/CumulativeSalesChart";
import ScatterAnalysisCharts from "@/components/dashboard/ScatterAnalysisCharts";
import VenuePerformanceChart from "@/components/dashboard/VenuePerformanceChart";
import PaymentBreakdownChart from "@/components/dashboard/PaymentBreakdownChart";

interface Props {
  data: SalesRecord[];
  venue: string;
  seatingKey?: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatShortDate = (d: string) => {
  const parts = d.split("-");
  return `${MONTH_NAMES[parseInt(parts[1]) - 1]} ${parseInt(parts[2])}`;
};

function useDaily(data: SalesRecord[]) {
  return useMemo(() => {
    const arr = data
      .reduce((acc, r) => {
        const existing = acc.find((a) => a.date === r.date);
        if (existing) {
          existing.totalSales += r.totalSales;
          existing.guests += r.guests;
          existing.orders += r.orders;
          existing.discount += Math.abs(r.discount);
          existing.totalRevenue += r.subtotal + r.serviceCharge;
        } else {
          acc.push({
            date: r.date,
            day: r.day,
            totalSales: r.totalSales,
            guests: r.guests,
            orders: r.orders,
            discount: Math.abs(r.discount),
            totalRevenue: r.subtotal + r.serviceCharge,
          });
        }
        return acc;
      }, [] as { date: string; day: string; totalSales: number; guests: number; orders: number; discount: number; totalRevenue: number }[])
      .sort((a, b) => a.date.localeCompare(b.date));
    return arr;
  }, [data]);
}

export function LegacyDaily({ data, venue, seatingKey }: Props) {
  const daily = useDaily(data);
  const seats = venue !== "All Venues" ? getVenueSeats(venue) : null;
  // seatingKey forces recompute on seat edits (via getDayOfWeekStats reading current config)
  const { data: dayStats, months } = useMemo(
    () => getDayOfWeekStats(data, seats),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, seats, seatingKey]
  );
  const hasSeats = seats !== null && seats > 0;

  const paymentData = useMemo(() => getPaymentBreakdown(data), [data]);
  const venueData = useMemo(() => getVenueComparison(data), [data]);

  // Averages for header stats
  const avgDailySales = daily.length ? Math.round(daily.reduce((s, d) => s + d.totalSales, 0) / daily.length) : 0;
  const avgDailyGuests = daily.length ? Math.round(daily.reduce((s, d) => s + d.guests, 0) / daily.length) : 0;
  const totalSalesAll = daily.reduce((s, d) => s + d.totalSales, 0);
  const totalGuestsAll = daily.reduce((s, d) => s + d.guests, 0);
  const totalOrdersAll = daily.reduce((s, d) => s + d.orders, 0);
  const avgPerGuest = totalGuestsAll ? Math.round(totalSalesAll / totalGuestsAll) : 0;
  const avgPerOrder = totalOrdersAll ? Math.round(totalSalesAll / totalOrdersAll) : 0;

  const spendData = daily.map((d) => ({
    date: d.date,
    day: d.day,
    perGuest: d.guests ? Math.round(d.totalSales / d.guests) : 0,
    perOrder: d.orders ? Math.round(d.totalSales / d.orders) : 0,
  }));

  const discountData = daily.map((d) => ({
    date: d.date,
    day: d.day,
    discount: d.discount,
    pct: d.totalRevenue ? parseFloat(((d.discount / d.totalRevenue) * 100).toFixed(1)) : 0,
  }));
  const totalDiscountAll = discountData.reduce((s, d) => s + d.discount, 0);
  const totalRevenueAll = daily.reduce((s, d) => s + d.totalRevenue, 0);
  const avgDiscountPct = totalRevenueAll ? ((totalDiscountAll / totalRevenueAll) * 100).toFixed(1) : "0.0";

  // Per-venue Top/Bottom
  const venueDailySales = useMemo(() => {
    const map = new Map<string, { date: string; day: string; venue: string; totalSales: number }>();
    data.forEach((r) => {
      const key = `${r.date}-${r.venue}`;
      const ex = map.get(key);
      if (ex) ex.totalSales += r.totalSales;
      else map.set(key, { date: r.date, day: r.day, venue: r.venue, totalSales: r.totalSales });
    });
    return Array.from(map.values());
  }, [data]);
  const venueList = useMemo(() => [...new Set(data.map((r) => r.venue))].sort(), [data]);
  const getTopBottom = (vName: string) => {
    const rows = venueDailySales.filter((d) => d.venue === vName).sort((a, b) => b.totalSales - a.totalSales);
    return {
      top5: rows.slice(0, 5),
      bottom5: rows.length > 5 ? rows.slice(-5).reverse() : rows.slice().reverse().slice(0, 5),
    };
  };

  const dayTooltipLabel = (d: string) => {
    const rec = daily.find((r) => r.date === d);
    return rec ? `${formatShortDate(d)} (${rec.day})` : formatShortDate(d);
  };

  // Legend swatch — force primary color visualization at series opacity
  const legendPayload = months.map((m, i) => ({
    value: getMonthLabel(m),
    type: "square" as const,
    id: m,
    color: `hsl(var(--primary))`,
  }));

  return (
    <div className="space-y-4">
      {/* ================= Momentum ================= */}
      <SectionHeader title="Momentum" description="How the period is building day over day" />
      <CumulativeSalesChart data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartShell
          title="Daily Sales"
          subtitle="Total revenue per day"
          headerRight={<>Avg <span className="text-foreground font-medium">${formatCurrency(avgDailySales)}</span></>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={daily}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${compactHK(v as number)}`} width={48} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number) => [`$${formatCurrency(v)}`, "Sales"]}
                labelFormatter={dayTooltipLabel}
              />
              <Line type="monotone" dataKey="totalSales" stroke={PRIMARY} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell
          title="Daily Guests"
          subtitle="Guest count per day"
          headerRight={<>Avg <span className="text-foreground font-medium">{avgDailyGuests}</span></>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={daily}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} width={40} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number) => [formatCurrency(v), "Guests"]}
                labelFormatter={dayTooltipLabel}
              />
              <Line type="monotone" dataKey="guests" stroke={PRIMARY} strokeWidth={2} dot={false} strokeOpacity={0.7} />
            </LineChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      {/* ================= Spend ================= */}
      <SectionHeader title="Spend" description="Ticket size trends across the period" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartShell
          title="Avg Spend / Guest"
          subtitle="Total sales ÷ guests, per day"
          headerRight={<>Avg <span className="text-foreground font-medium">${avgPerGuest}</span></>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={spendData}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${v}`} width={40} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number) => [`$${formatCurrency(v)}`, "Per Guest"]}
                labelFormatter={dayTooltipLabel}
              />
              <Bar dataKey="perGuest" fill={PRIMARY} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell
          title="Avg Spend / Order"
          subtitle="Total sales ÷ orders, per day"
          headerRight={<>Avg <span className="text-foreground font-medium">${avgPerOrder}</span></>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={spendData}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${v}`} width={40} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number) => [`$${formatCurrency(v)}`, "Per Order"]}
                labelFormatter={dayTooltipLabel}
              />
              <Bar dataKey="perOrder" fill={PRIMARY} fillOpacity={0.85} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartShell>
      </div>

      {/* ================= Weekday Deep Dive ================= */}
      <SectionHeader title="Weekday Deep Dive" description="Performance broken down by day of week, per month" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DowChart title="Avg Sales by Day of Week" data={dayStats} months={months} prefix="sales" fmt={(v) => `$${compactHK(v)}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
        <DowChart title="Avg Guests by Day of Week" data={dayStats} months={months} prefix="guests" fmt={(v) => `${v}`} fmtTooltip={(v) => formatCurrency(v)} />
        <DowChart title="Avg Spend / Guest by Day of Week" data={dayStats} months={months} prefix="spendPerGuest" fmt={(v) => `$${v}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
        <DowChart title="Avg Spend / Order by Day of Week" data={dayStats} months={months} prefix="spendPerOrder" fmt={(v) => `$${v}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
        {hasSeats && (
          <>
            <DowChart title="Avg Rev / Seat by Day of Week" data={dayStats} months={months} prefix="revPerSeat" fmt={(v) => `$${v}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
            <DowChart title="Avg Seat Turnover by Day of Week" data={dayStats} months={months} prefix="seatTurnover" fmt={(v) => `${v}x`} fmtTooltip={(v) => `${v}x`} />
            <DowChart title="Avg Occupancy % by Day of Week" data={dayStats} months={months} prefix="occupancy" fmt={(v) => `${v}%`} fmtTooltip={(v) => `${v}%`} />
            <DowChart title="Avg Orders by Day of Week" data={dayStats} months={months} prefix="orders" fmt={(v) => `${v}`} fmtTooltip={(v) => formatCurrency(v)} />
          </>
        )}
        {!hasSeats && (
          <DowChart title="Avg Orders by Day of Week" data={dayStats} months={months} prefix="orders" fmt={(v) => `${v}`} fmtTooltip={(v) => formatCurrency(v)} />
        )}
      </div>

      {/* ================= Mix ================= */}
      <SectionHeader title="Mix" description="Where the revenue comes from" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VenuePerformanceChart data={venueData} venue={venue} />
        <PaymentBreakdownChart data={paymentData} />
      </div>

      {/* ================= Distribution ================= */}
      <SectionHeader title="Distribution" description="Individual data points by day of month" />
      <ScatterAnalysisCharts data={data} />

      {/* ================= Records & Leakage ================= */}
      <SectionHeader title="Records & Leakage" description="Best/worst days per venue and discount trends" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {venueList.map((v) => {
          const { top5, bottom5 } = getTopBottom(v);
          if (top5.length === 0) return null;
          return (
            <ChartShell key={v} title={v} subtitle="Top & bottom sales days">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Top 5</div>
                  <div className="divide-y divide-border/40">
                    {top5.map((d, i) => (
                      <div key={d.date} className="flex items-center justify-between text-[13px] py-1">
                        <span className="text-muted-foreground truncate">{i + 1}. {formatShortDate(d.date)} <span className="text-[11px]">({d.day})</span></span>
                        <span className="font-medium text-foreground tabular-nums">${formatCurrency(d.totalSales)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Bottom 5</div>
                  <div className="divide-y divide-border/40">
                    {bottom5.map((d, i) => (
                      <div key={d.date} className="flex items-center justify-between text-[13px] py-1">
                        <span className="text-muted-foreground truncate">{i + 1}. {formatShortDate(d.date)} <span className="text-[11px]">({d.day})</span></span>
                        <span className="font-medium text-foreground tabular-nums">${formatCurrency(d.totalSales)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ChartShell>
          );
        })}
      </div>

      <ChartShell
        title="Discount Trend"
        subtitle="Absolute discount dollars per day"
        headerRight={<>Avg discount <span className="text-foreground font-medium">{avgDiscountPct}%</span></>}
      >
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={discountData}>
            <CartesianGrid {...chartGrid} />
            <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
            <YAxis {...chartAxis} tickFormatter={(v) => `$${compactHK(v as number)}`} width={48} />
            <Tooltip
              contentStyle={chartTooltipContentStyle}
              formatter={(v: number) => [`$${formatCurrency(v)}`, "Discount"]}
              labelFormatter={dayTooltipLabel}
            />
            <Bar dataKey="discount" fill={DESTRUCTIVE} fillOpacity={0.8} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartShell>
    </div>
  );
}

/* ------------- Small grouped-by-month DoW chart ------------- */

interface DowChartProps {
  title: string;
  data: any[];
  months: string[];
  prefix: string;
  fmt: (v: number) => string;
  fmtTooltip: (v: number) => string;
}

function DowChart({ title, data, months, prefix, fmt, fmtTooltip }: DowChartProps) {
  return (
    <ChartShell title={title}>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid {...chartGrid} />
          <XAxis dataKey="day" {...chartAxis} />
          <YAxis {...chartAxis} tickFormatter={(v) => fmt(v as number)} width={44} />
          <Tooltip
            contentStyle={chartTooltipContentStyle}
            formatter={(v: number, name: string) => [fmtTooltip(v), name]}
          />
          <Legend wrapperStyle={chartLegendStyle} align="right" verticalAlign="top" iconSize={8} iconType="square" />
          {months.map((m, i) => (
            <Bar
              key={m}
              dataKey={`${prefix}_${m}`}
              name={getMonthLabel(m)}
              fill={PRIMARY}
              fillOpacity={monthOpacity(i)}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
