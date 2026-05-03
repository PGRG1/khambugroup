import { formatCurrency } from "@/utils/salesUtils";
import { getVenueSeats } from "@/constants/venueSeating";
import ChartCard from "./ChartCard";

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
}

const VenuePerformanceChart = ({ data, venue = "All Venues" }: VenuePerformanceChartProps) => {
  const activeVenues = data.filter((d) => d.totalSales > 0);
  const isSingleVenue = venue !== "All Venues";
  const singleVenueData = isSingleVenue ? data.find((d) => d.venue === venue) : null;

  if (isSingleVenue && singleVenueData) {
    const d = singleVenueData;
    const seats = getVenueSeats(venue);
    const avgSalesPerDay = d.days ? Math.round(d.totalSales / d.days) : 0;
    const avgGuestsPerDay = d.days ? Math.round(d.totalGuests / d.days) : 0;
    const avgOrdersPerDay = d.days ? Math.round(d.totalOrders / d.days) : 0;
    const guestsPerOrder = d.totalOrders ? (d.totalGuests / d.totalOrders).toFixed(1) : "-";

    const rows = [
      { label: "Total Sales", val: `${formatCurrency(d.totalSales)}` },
      { label: "Total Guests", val: formatCurrency(d.totalGuests) },
      { label: "Total Orders", val: formatCurrency(d.totalOrders) },
      { label: "Guests/Order", val: guestsPerOrder },
      { label: "Avg Sales/Day", val: `${formatCurrency(avgSalesPerDay)}` },
      { label: "Avg Guests/Day", val: formatCurrency(avgGuestsPerDay) },
      { label: "Avg Orders/Day", val: formatCurrency(avgOrdersPerDay) },
      { label: "Avg/Guest", val: `${formatCurrency(d.avgPerGuest)}` },
      { label: "Avg/Order", val: `${formatCurrency(d.avgPerOrder)}` },
      ...(seats ? [
        { label: `Seats`, val: String(seats) },
        { label: "Rev/Seat/Day", val: `$${d.days ? formatCurrency(Math.round(d.totalSales / seats / d.days)) : 0}` },
        { label: "Turnover/Day", val: `${d.days ? (d.totalGuests / seats / d.days).toFixed(1) : 0}x` },
        { label: "Occupancy %", val: `${d.days ? Math.round((d.totalGuests / (seats * d.days)) * 100) : 0}%` },
      ] : []),
    ];

    return (
      <ChartCard title="Venue Performance" subtitle={venue}>
        <div className="space-y-3 py-2">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-foreground">{row.val}</span>
            </div>
          ))}
        </div>
      </ChartCard>
    );
  }

  // All Venues — dynamic comparison
  const totalSales = activeVenues.reduce((s, d) => s + d.totalSales, 0);

  const COLORS = [
    "hsl(24, 80%, 50%)",
    "hsl(210, 65%, 55%)",
    "hsl(175, 55%, 42%)",
    "hsl(258, 50%, 55%)",
    "hsl(14, 70%, 52%)",
  ];

  const venuePercentages = activeVenues.map((v) => ({
    venue: v.venue,
    pct: totalSales ? Math.round((v.totalSales / totalSales) * 100) : 0,
  }));

  const hasAnySeats = activeVenues.some((v) => getVenueSeats(v.venue) !== null);

  const metricRows = [
    { label: "Total Sales", getValue: (d: VenueData) => `${formatCurrency(d.totalSales)}` },
    { label: "Total Guests", getValue: (d: VenueData) => formatCurrency(d.totalGuests) },
    { label: "Total Orders", getValue: (d: VenueData) => formatCurrency(d.totalOrders) },
    { label: "Guests/Order", getValue: (d: VenueData) => d.totalOrders ? (d.totalGuests / d.totalOrders).toFixed(1) : "-" },
    { label: "Avg Sales/Day", getValue: (d: VenueData) => d.days ? `${formatCurrency(Math.round(d.totalSales / d.days))}` : "-" },
    { label: "Avg Guests/Day", getValue: (d: VenueData) => d.days ? formatCurrency(Math.round(d.totalGuests / d.days)) : "-" },
    { label: "Avg Orders/Day", getValue: (d: VenueData) => d.days ? formatCurrency(Math.round(d.totalOrders / d.days)) : "-" },
    { label: "Avg/Guest", getValue: (d: VenueData) => `${formatCurrency(d.avgPerGuest)}` },
    { label: "Avg/Order", getValue: (d: VenueData) => `${formatCurrency(d.avgPerOrder)}` },
    ...(hasAnySeats ? [
      { label: "Seats", getValue: (d: VenueData) => { const s = getVenueSeats(d.venue); return s ? String(s) : "-"; } },
      { label: "Rev/Seat/Day", getValue: (d: VenueData) => { const s = getVenueSeats(d.venue); return s && d.days ? `${formatCurrency(Math.round(d.totalSales / s / d.days))}` : "-"; } },
      { label: "Turnover/Day", getValue: (d: VenueData) => { const s = getVenueSeats(d.venue); return s && d.days ? `${(d.totalGuests / s / d.days).toFixed(1)}x` : "-"; } },
      { label: "Occupancy", getValue: (d: VenueData) => { const s = getVenueSeats(d.venue); return s && d.days ? `${Math.round((d.totalGuests / (s * d.days)) * 100)}%` : "-"; } },
    ] : []),
  ];

  const subtitle = activeVenues.map((v) => v.venue).join(" vs ");

  return (
    <ChartCard title="Venue Performance" subtitle={subtitle}>
      <div className="space-y-4 py-2">
        {/* Stacked bar */}
        <div>
          <div className="flex h-4 rounded-full overflow-hidden">
            {venuePercentages.map((v, i) => (
              <div key={v.venue} className="transition-all duration-500" style={{ width: `${v.pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            {venuePercentages.map((v) => (
              <span key={v.venue} className="text-xs text-muted-foreground">{v.venue} {v.pct}%</span>
            ))}
          </div>
        </div>

        {/* Comparison table */}
        <div className="space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="w-24">&nbsp;</span>
            {activeVenues.map((v) => (
              <span key={v.venue} className="text-right w-24">{v.venue}</span>
            ))}
          </div>
          {metricRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground w-24">{row.label}</span>
              {activeVenues.map((v) => (
                <span key={v.venue} className="font-medium text-foreground text-right w-24">{row.getValue(v)}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
};

export default VenuePerformanceChart;
