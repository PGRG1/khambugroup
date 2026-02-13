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
}

const VenuePerformanceChart = ({ data }: VenuePerformanceChartProps) => {
  const totalSales = data.reduce((s, d) => s + d.totalSales, 0);
  const a = data.find((d) => d.venue === "Assembly");
  const c = data.find((d) => d.venue === "Caliente");
  const aPct = totalSales && a ? Math.round((a.totalSales / totalSales) * 100) : 0;
  const cPct = 100 - aPct;

  const guestsPerOrderA = a && a.totalOrders ? (a.totalGuests / a.totalOrders).toFixed(1) : "-";
  const guestsPerOrderC = c && c.totalOrders ? (c.totalGuests / c.totalOrders).toFixed(1) : "-";

  const rows = [
    { label: "Total Sales", aVal: a ? `$${formatCurrency(a.totalSales)}` : "-", cVal: c ? `$${formatCurrency(c.totalSales)}` : "-" },
    { label: "Total Guests", aVal: a ? formatCurrency(a.totalGuests) : "-", cVal: c ? formatCurrency(c.totalGuests) : "-" },
    { label: "Total Orders", aVal: a ? formatCurrency(a.totalOrders) : "-", cVal: c ? formatCurrency(c.totalOrders) : "-" },
    { label: "Guests/Order", aVal: guestsPerOrderA, cVal: guestsPerOrderC },
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
