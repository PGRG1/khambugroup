import { useVenueScope } from "@/hooks/useVenueScope";
import { formatCurrency } from "@/utils/salesUtils";
import { useSeatHistory } from "@/hooks/useSeatHistory";
import { seatTotals, type SeatTotals } from "@/utils/seatHistory";
import type { SalesRecord } from "@/types/sales";
import { ChartShell } from "@/components/revenue-overview/ChartShell";
import { monthOpacity } from "@/components/revenue-overview/chartTheme";

interface VenueData {
  venue: string;
  totalSales: number;
  totalGuests: number;
  totalOrders: number;
  avgPerGuest: number;
  avgPerOrder: number;
  days: number;
}

interface VenuePerformanceChartProps {
  data: VenueData[];
  venue?: string;
  /** Raw records so each day uses the seat count that applied on that day. */
  records?: SalesRecord[];
}

const VenuePerformanceChart = ({ data, venue = "All Venues", records = [] }: VenuePerformanceChartProps) => {
  const vs = useVenueScope();
  const seatHist = useSeatHistory();
  const idByName = new Map(vs.venues.map((v) => [v.name, v.id]));
  const seatFor = (name: string): SeatTotals | null => {
    const t = seatTotals(records.filter((r) => r.venue === name), seatHist.rows, idByName);
    return t.seatDays > 0 ? t : null;
  };
  const activeVenues = data.filter((d) => vs.includesName(d.venue) && d.totalSales > 0);
  const isSingleVenue = venue !== "All Venues";
  const singleVenueData = isSingleVenue ? data.find((d) => d.venue === venue) : null;

  if (isSingleVenue && singleVenueData) {
    const d = singleVenueData;
    const st = seatFor(venue);
    const avgSalesPerDay = d.days ? Math.round(d.totalSales / d.days) : 0;
    const avgGuestsPerDay = d.days ? Math.round(d.totalGuests / d.days) : 0;
    const avgOrdersPerDay = d.days ? Math.round(d.totalOrders / d.days) : 0;
    const guestsPerOrder = d.totalOrders ? (d.totalGuests / d.totalOrders).toFixed(1) : "-";

    const rows = [
      { label: "Total Sales", val: `$${formatCurrency(d.totalSales)}` },
      { label: "Total Guests", val: formatCurrency(d.totalGuests) },
      { label: "Total Orders", val: formatCurrency(d.totalOrders) },
      { label: "Guests/Order", val: guestsPerOrder },
      { label: "Avg Sales/Day", val: `$${formatCurrency(avgSalesPerDay)}` },
      { label: "Avg Guests/Day", val: formatCurrency(avgGuestsPerDay) },
      { label: "Avg Orders/Day", val: formatCurrency(avgOrdersPerDay) },
      { label: "Avg/Guest", val: `$${formatCurrency(d.avgPerGuest)}` },
      { label: "Avg/Order", val: `$${formatCurrency(d.avgPerOrder)}` },
      ...(st
        ? [
            { label: `Seats`, val: String(st.latestSeats) },
            { label: "Sales per seat per day", val: `$${formatCurrency(Math.round(st.revenue / st.seatDays))}` },
            { label: "Guests per seat per day", val: `${(st.guests / st.seatDays).toFixed(1)}x` },
            { label: "Seats filled", val: `${Math.round((st.guests / st.seatDays) * 100)}%` },
          ]
        : [{ label: "Seats", val: "Seats not set" }]),
    ];

    return (
      <ChartShell title="Venue Performance" subtitle={venue}>
        <div className="divide-y divide-border/50">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-[13px] py-1.5">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-foreground tabular-nums">{row.val}</span>
            </div>
          ))}
        </div>
      </ChartShell>
    );
  }

  const totalSales = activeVenues.reduce((s, d) => s + d.totalSales, 0);
  const venuePercentages = activeVenues.map((v, i) => ({
    venue: v.venue,
    pct: totalSales ? Math.round((v.totalSales / totalSales) * 100) : 0,
    opacity: monthOpacity(i),
  }));

  const seatMap = new Map(activeVenues.map((v) => [v.venue, seatFor(v.venue)]));
  const hasAnySeats = [...seatMap.values()].some(Boolean);

  const metricRows = [
    { label: "Total Sales", getValue: (d: VenueData) => `$${formatCurrency(d.totalSales)}` },
    { label: "Total Guests", getValue: (d: VenueData) => formatCurrency(d.totalGuests) },
    { label: "Total Orders", getValue: (d: VenueData) => formatCurrency(d.totalOrders) },
    { label: "Guests/Order", getValue: (d: VenueData) => (d.totalOrders ? (d.totalGuests / d.totalOrders).toFixed(1) : "-") },
    { label: "Avg Sales/Day", getValue: (d: VenueData) => (d.days ? `$${formatCurrency(Math.round(d.totalSales / d.days))}` : "-") },
    { label: "Avg Guests/Day", getValue: (d: VenueData) => (d.days ? formatCurrency(Math.round(d.totalGuests / d.days)) : "-") },
    { label: "Avg Orders/Day", getValue: (d: VenueData) => (d.days ? formatCurrency(Math.round(d.totalOrders / d.days)) : "-") },
    { label: "Avg/Guest", getValue: (d: VenueData) => `$${formatCurrency(d.avgPerGuest)}` },
    { label: "Avg/Order", getValue: (d: VenueData) => `$${formatCurrency(d.avgPerOrder)}` },
    ...(hasAnySeats
      ? [
          { label: "Seats", getValue: (d: VenueData) => { const s = seatMap.get(d.venue); return s ? String(s.latestSeats) : "Seats not set"; } },
          { label: "Sales per seat per day", getValue: (d: VenueData) => { const s = seatMap.get(d.venue); return s ? `$${formatCurrency(Math.round(s.revenue / s.seatDays))}` : "-"; } },
          { label: "Guests per seat per day", getValue: (d: VenueData) => { const s = seatMap.get(d.venue); return s ? `${(s.guests / s.seatDays).toFixed(1)}x` : "-"; } },
          { label: "Seats filled", getValue: (d: VenueData) => { const s = seatMap.get(d.venue); return s ? `${Math.round((s.guests / s.seatDays) * 100)}%` : "-"; } },
        ]
      : []),
  ];

  const subtitle = activeVenues.map((v) => v.venue).join(" · ");

  return (
    <ChartShell title="Venue Performance" subtitle={subtitle}>
      <div className="space-y-4">
        <div>
          <div className="flex h-3 rounded-full overflow-hidden">
            {venuePercentages.map((v) => (
              <div
                key={v.venue}
                className="transition-all duration-500"
                style={{ width: `${v.pct}%`, backgroundColor: "hsl(var(--primary))", opacity: v.opacity }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {venuePercentages.map((v) => (
              <span key={v.venue} className="text-[11px] text-muted-foreground tabular-nums">
                {v.venue} {v.pct}%
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pb-1 border-b border-border/50">
            <span className="w-24">&nbsp;</span>
            {activeVenues.map((v) => (
              <span key={v.venue} className="text-right w-24">{v.venue}</span>
            ))}
          </div>
          {metricRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-[13px] py-1 border-b border-border/30 last:border-0">
              <span className="text-muted-foreground w-24">{row.label}</span>
              {activeVenues.map((v) => (
                <span key={v.venue} className="font-medium text-foreground text-right w-24 tabular-nums">{row.getValue(v)}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ChartShell>
  );
};

export default VenuePerformanceChart;
