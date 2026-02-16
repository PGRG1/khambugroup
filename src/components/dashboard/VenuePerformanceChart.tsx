import { formatCurrency } from "@/utils/salesUtils";
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
  const a = data.find((d) => d.venue === "Assembly");
  const c = data.find((d) => d.venue === "Caliente");

  const isSingleVenue = venue === "Assembly" || venue === "Caliente";
  const singleVenueData = venue === "Assembly" ? a : venue === "Caliente" ? c : null;

  // Per-day averages
  const avgSalesPerDayA = a && a.days ? Math.round(a.totalSales / a.days) : 0;
  const avgSalesPerDayC = c && c.days ? Math.round(c.totalSales / c.days) : 0;
  const avgGuestsPerDayA = a && a.days ? Math.round(a.totalGuests / a.days) : 0;
  const avgGuestsPerDayC = c && c.days ? Math.round(c.totalGuests / c.days) : 0;
  const avgOrdersPerDayA = a && a.days ? Math.round(a.totalOrders / a.days) : 0;
  const avgOrdersPerDayC = c && c.days ? Math.round(c.totalOrders / c.days) : 0;

  const guestsPerOrderA = a && a.totalOrders ? (a.totalGuests / a.totalOrders).toFixed(1) : "-";
  const guestsPerOrderC = c && c.totalOrders ? (c.totalGuests / c.totalOrders).toFixed(1) : "-";

  if (isSingleVenue && singleVenueData) {
    const d = singleVenueData;
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

  // All Venues — comparison mode
  const totalSales = data.reduce((s, d) => s + d.totalSales, 0);
  const aPct = totalSales && a ? Math.round((a.totalSales / totalSales) * 100) : 0;
  const cPct = 100 - aPct;

  const rows = [
    { label: "Total Sales", aVal: a ? `$${formatCurrency(a.totalSales)}` : "-", cVal: c ? `$${formatCurrency(c.totalSales)}` : "-" },
    { label: "Total Guests", aVal: a ? formatCurrency(a.totalGuests) : "-", cVal: c ? formatCurrency(c.totalGuests) : "-" },
    { label: "Total Orders", aVal: a ? formatCurrency(a.totalOrders) : "-", cVal: c ? formatCurrency(c.totalOrders) : "-" },
    { label: "Guests/Order", aVal: guestsPerOrderA, cVal: guestsPerOrderC },
    { label: "Avg Sales/Day", aVal: `$${formatCurrency(avgSalesPerDayA)}`, cVal: `$${formatCurrency(avgSalesPerDayC)}` },
    { label: "Avg Guests/Day", aVal: formatCurrency(avgGuestsPerDayA), cVal: formatCurrency(avgGuestsPerDayC) },
    { label: "Avg Orders/Day", aVal: formatCurrency(avgOrdersPerDayA), cVal: formatCurrency(avgOrdersPerDayC) },
    { label: "Avg/Guest", aVal: a ? `$${formatCurrency(a.avgPerGuest)}` : "-", cVal: c ? `$${formatCurrency(c.avgPerGuest)}` : "-" },
    { label: "Avg/Order", aVal: a ? `$${formatCurrency(a.avgPerOrder)}` : "-", cVal: c ? `$${formatCurrency(c.avgPerOrder)}` : "-" },
  ];

  return (
    <ChartCard title="Venue Performance" subtitle="Assembly vs Caliente">
      <div className="space-y-4 py-2">
        {/* Stacked bar */}
        <div>
          <div className="flex h-4 rounded-full overflow-hidden">
            <div className="transition-all duration-500" style={{ width: `${aPct}%`, backgroundColor: "hsl(24, 80%, 50%)" }} />
            <div className="transition-all duration-500" style={{ width: `${cPct}%`, backgroundColor: "hsl(210, 65%, 55%)" }} />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-muted-foreground">Assembly {aPct}%</span>
            <span className="text-xs text-muted-foreground">Caliente {cPct}%</span>
          </div>
        </div>

        {/* Comparison table */}
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground w-24">{row.label}</span>
              <span className="font-medium text-foreground text-right w-24">{row.aVal}</span>
              <span className="font-medium text-foreground text-right w-24">{row.cVal}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
};

export default VenuePerformanceChart;
