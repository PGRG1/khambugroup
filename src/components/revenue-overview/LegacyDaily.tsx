import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
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
  PRIMARY,
  CHART_CURRENT,
  CHART_COMPARISON,
  CHART_EXCEPTION,
  withRolling,
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

/** Small inline legend: Daily / 7-day average / Significant low */
function MiniLegend({ dailyColor, avgColor }: { dailyColor: string; avgColor: string }) {
  const Item = ({ color, label, faint }: { color: string; label: string; faint?: boolean }) => (
    <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <span
        className="inline-block h-[2px] w-4 rounded-full"
        style={{ background: color, opacity: faint ? 0.35 : 1 }}
      />
      {label}
    </span>
  );
  return (
    <div className="flex items-center justify-end gap-3 flex-wrap mt-1.5">
      <Item color={dailyColor} label="Daily" faint />
      <Item color={avgColor} label="7-day average" />
      <Item color={CHART_EXCEPTION} label="Significant low" />
    </div>
  );
}

/** Dot renderer that only marks genuine significant lows. */
function makeLowDot(flagKey: string) {
  return (props: any) => {
    const { cx, cy, payload, index } = props;
    if (!payload?.[flagKey] || cx == null || cy == null) return <g key={`nd-${index}`} />;
    return <circle key={`ld-${index}`} cx={cx} cy={cy} r={3} fill={CHART_EXCEPTION} stroke="none" />;
  };
}


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

  // Rolling 7-trading-day averages + significant-low flags (shared helper, no duplicated logic)
  const dailyRolled = useMemo(
    () => withRolling(withRolling(daily, "totalSales"), "guests") as any[],
    [daily]
  );
  const spendRolled = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => withRolling(withRolling(spendData, "perGuest"), "perOrder") as any[],
    [daily]
  );

  // Weekday deep dive: latest month vs one selected comparison month
  const latestMonth = months.length ? months[months.length - 1] : null;
  const defaultComparison = months.length > 1 ? months[months.length - 2] : null;
  const [dowComparisonOverride, setDowComparisonOverride] = useState<string | null>(null);
  const dowComparison =
    dowComparisonOverride && months.includes(dowComparisonOverride) && dowComparisonOverride !== latestMonth
      ? dowComparisonOverride
      : defaultComparison;


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

  const seriesLabel: Record<string, string> = {
    totalSales: "Sales",
    totalSalesAvg: "7-day average",
    guests: "Guests",
    guestsAvg: "7-day average",
    perGuest: "Per Guest",
    perGuestAvg: "7-day average",
    perOrder: "Per Order",
    perOrderAvg: "7-day average",
  };

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
            <LineChart data={dailyRolled}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${compactHK(v as number)}`} width={48} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number, n: string) => [`$${formatCurrency(v)}`, seriesLabel[n] ?? n]}
                labelFormatter={dayTooltipLabel}
              />
              <Line
                type="monotone"
                dataKey="totalSales"
                stroke={CHART_CURRENT}
                strokeWidth={1.5}
                strokeOpacity={0.28}
                dot={makeLowDot("totalSalesLow")}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="totalSalesAvg"
                stroke={CHART_CURRENT}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <MiniLegend dailyColor={CHART_CURRENT} avgColor={CHART_CURRENT} />
        </ChartShell>

        <ChartShell
          title="Daily Guests"
          subtitle="Guest count per day"
          headerRight={<>Avg <span className="text-foreground font-medium">{avgDailyGuests}</span></>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyRolled}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} width={40} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number, n: string) => [formatCurrency(v), seriesLabel[n] ?? n]}
                labelFormatter={dayTooltipLabel}
              />
              <Line
                type="monotone"
                dataKey="guests"
                stroke={CHART_COMPARISON}
                strokeWidth={1.5}
                strokeOpacity={0.28}
                dot={makeLowDot("guestsLow")}
                activeDot={{ r: 3 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="guestsAvg"
                stroke={CHART_COMPARISON}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <MiniLegend dailyColor={CHART_COMPARISON} avgColor={CHART_COMPARISON} />
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
            <ComposedChart data={spendRolled}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${v}`} width={40} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number, n: string) => [`$${formatCurrency(v)}`, seriesLabel[n] ?? n]}
                labelFormatter={dayTooltipLabel}
              />
              <Bar dataKey="perGuest" fill={CHART_CURRENT} fillOpacity={0.22} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="perGuestAvg"
                stroke={CHART_CURRENT}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="perGuest"
                stroke="none"
                strokeWidth={0}
                legendType="none"
                dot={makeLowDot("perGuestLow")}
                activeDot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <MiniLegend dailyColor={CHART_CURRENT} avgColor={CHART_CURRENT} />
        </ChartShell>

        <ChartShell
          title="Avg Spend / Order"
          subtitle="Total sales ÷ orders, per day"
          headerRight={<>Avg <span className="text-foreground font-medium">${avgPerOrder}</span></>}
        >
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={spendRolled}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="date" tickFormatter={formatShortDate} {...chartAxis} minTickGap={30} />
              <YAxis {...chartAxis} tickFormatter={(v) => `$${v}`} width={40} />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                formatter={(v: number, n: string) => [`$${formatCurrency(v)}`, seriesLabel[n] ?? n]}
                labelFormatter={dayTooltipLabel}
              />
              <Bar dataKey="perOrder" fill={CHART_CURRENT} fillOpacity={0.22} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              <Line
                type="monotone"
                dataKey="perOrderAvg"
                stroke={CHART_CURRENT}
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="perOrder"
                stroke="none"
                strokeWidth={0}
                legendType="none"
                dot={makeLowDot("perOrderLow")}
                activeDot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <MiniLegend dailyColor={CHART_CURRENT} avgColor={CHART_CURRENT} />
        </ChartShell>
      </div>

      {/* ================= Weekday Deep Dive ================= */}
      <SectionHeader title="Weekday Deep Dive" description="Latest month compared with one selected month" />
      {latestMonth && months.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-muted-foreground font-medium">Compare to</span>
          {months
            .filter((m) => m !== latestMonth)
            .map((m) => {
              const active = m === dowComparison;
              return (
                <button
                  key={m}
                  onClick={() => setDowComparisonOverride(m)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
                    active
                      ? "border-[hsl(var(--chart-2))] bg-[hsl(var(--chart-2)/0.12)] text-foreground"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {getMonthLabel(m)}
                </button>
              );
            })}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DowChart title="Avg Sales by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="sales" fmt={(v) => `$${compactHK(v)}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
        <DowChart title="Avg Guests by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="guests" fmt={(v) => `${v}`} fmtTooltip={(v) => formatCurrency(v)} />
        <DowChart title="Avg Spend / Guest by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="spendPerGuest" fmt={(v) => `$${v}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
        <DowChart title="Avg Spend / Order by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="spendPerOrder" fmt={(v) => `$${v}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
        {hasSeats && (
          <>
            <DowChart title="Avg Rev / Seat by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="revPerSeat" fmt={(v) => `$${v}`} fmtTooltip={(v) => `$${formatCurrency(v)}`} />
            <DowChart title="Avg Seat Turnover by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="seatTurnover" fmt={(v) => `${v}x`} fmtTooltip={(v) => `${v}x`} />
            <DowChart title="Avg Occupancy % by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="occupancy" fmt={(v) => `${v}%`} fmtTooltip={(v) => `${v}%`} />
            <DowChart title="Avg Orders by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="orders" fmt={(v) => `${v}`} fmtTooltip={(v) => formatCurrency(v)} />
          </>
        )}
        {!hasSeats && (
          <DowChart title="Avg Orders by Day of Week" data={dayStats} latestMonth={latestMonth} comparisonMonth={dowComparison} prefix="orders" fmt={(v) => `${v}`} fmtTooltip={(v) => formatCurrency(v)} />
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

/* ------------- Latest vs one comparison month, by day of week ------------- */

interface DowChartProps {
  title: string;
  data: any[];
  latestMonth: string | null;
  comparisonMonth: string | null;
  prefix: string;
  fmt: (v: number) => string;
  fmtTooltip: (v: number) => string;
}

function DowChart({ title, data, latestMonth, comparisonMonth, prefix, fmt, fmtTooltip }: DowChartProps) {
  if (!latestMonth) return null;
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
          {comparisonMonth && (
            <Bar
              key={comparisonMonth}
              dataKey={`${prefix}_${comparisonMonth}`}
              name={getMonthLabel(comparisonMonth)}
              fill={CHART_COMPARISON}
              fillOpacity={0.75}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          )}
          <Bar
            key={latestMonth}
            dataKey={`${prefix}_${latestMonth}`}
            name={getMonthLabel(latestMonth)}
            fill={CHART_CURRENT}
            fillOpacity={0.95}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

