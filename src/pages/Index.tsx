import { useState, useMemo, useCallback } from "react";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import DateFilter from "@/components/dashboard/DateFilter";
import KPICards from "@/components/dashboard/KPICards";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import { generateMTDReport } from "@/utils/generateReport";
import { FileDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const venues: VenueFilter[] = ["All Venues", "Assembly", "Caliente"];

const Index = () => {
  const { data, loading } = useSalesData();
  const { isAdmin } = useAuth();
  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [view, setView] = useState<"daily" | "monthly">("daily");

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") {
      setFrom(undefined);
      setTo(undefined);
      return;
    }
    if (period === "Custom") return;
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };

  const filtered = useMemo(() => filterData(data, venue, from, to), [data, venue, from, to]);

  const kpi = useMemo(() => {
    const totalSales = filtered.reduce((s, r) => s + r.totalSales, 0);
    const totalGuests = filtered.reduce((s, r) => s + r.guests, 0);
    const totalOrders = filtered.reduce((s, r) => s + r.orders, 0);
    const totalDiscount = filtered.reduce((s, r) => s + r.discount, 0);
    return {
      totalSales,
      totalGuests,
      totalOrders,
      avgPerGuest: totalGuests ? Math.round(totalSales / totalGuests) : 0,
      avgPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      totalDiscount,
    };
  }, [filtered]);

  const currentMonthLabel = useMemo(() => {
    if (from) {
      const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
      return getMonthLabel(key);
    }
    // Default to latest month in data
    if (months.length > 0) return months[months.length - 1].label;
    return new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [from, months]);

  const handleGenerateReport = useCallback(() => {
    if (filtered.length === 0) {
      toast({ title: "No data to report", description: "Select a period with data first.", variant: "destructive" });
      return;
    }

    generateMTDReport({
      data: filtered,
      venue,
      monthLabel: currentMonthLabel,
    });

    toast({ title: "Report downloaded!", description: `${currentMonthLabel} MTD report saved.` });
  }, [filtered, venue, currentMonthLabel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">Revenue</span>
          <span className="text-muted-foreground ml-2 text-base font-normal">Overview</span>
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            {venues.map((v) => (
              <button
                key={v}
                onClick={() => setVenue(v)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  venue === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button
              onClick={handleGenerateReport}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              <FileDown className="h-4 w-4" />
              Generate Report
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DateFilter
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          months={months.map((m) => m.label)}
          onPeriodSelect={handlePeriodSelect}
        />
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setView("daily")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === "daily"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setView("monthly")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === "monthly"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
        </div>
      </div>

      <KPICards {...kpi} />

      {filtered.length > 0 ? (
        <DashboardCharts data={filtered} view={view} />
      ) : (
        <div className="card-glass rounded-xl p-12 text-center">
          <p className="text-muted-foreground">No data for the selected filters.</p>
        </div>
      )}
    </div>
  );
};

export default Index;
