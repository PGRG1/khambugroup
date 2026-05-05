import { useState, useMemo, useCallback } from "react";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import DateFilter from "@/components/dashboard/DateFilter";
import KPICards from "@/components/dashboard/KPICards";
import DashboardCharts from "@/components/dashboard/DashboardCharts";
import VenueSeatingEditor from "@/components/dashboard/VenueSeatingEditor";
import { generateMTDReport } from "@/utils/generateReport";
import { FileDown, FileText, Armchair } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import MTDTextReport from "@/components/dashboard/MTDTextReport";
import { getVenueSeats } from "@/constants/venueSeating";
import { useVenues } from "@/hooks/useVenues";

const Index = () => {
  const { data, loading } = useSalesData();
  const { venues: dbVenues } = useVenues();
  const venues: VenueFilter[] = ["All Venues" as VenueFilter, ...dbVenues.filter(v => v.is_active).map(v => v.name as VenueFilter)];
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();
  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [view, setView] = useState<"daily" | "monthly">("daily");

  const [showMTDText, setShowMTDText] = useState(false);
  const [showSeatingEditor, setShowSeatingEditor] = useState(false);
  const [seatingKey, setSeatingKey] = useState(0);

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") { setFrom(undefined); setTo(undefined); return; }
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
    const uniqueDays = new Set(filtered.map((r) => r.date)).size || 1;
    return {
      totalSales, totalGuests, totalOrders,
      avgPerGuest: totalGuests ? Math.round(totalSales / totalGuests) : 0,
      avgPerOrder: totalOrders ? Math.round(totalSales / totalOrders) : 0,
      totalDiscount,
      salesPerDay: Math.round(totalSales / uniqueDays),
      guestsPerDay: Math.round(totalGuests / uniqueDays),
    };
  }, [filtered]);

  const currentMonthLabel = useMemo(() => {
    if (from) {
      const key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
      return getMonthLabel(key);
    }
    if (months.length > 0) return months[months.length - 1].label;
    return new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [from, months]);

  const handleGenerateReport = useCallback(() => {
    if (filtered.length === 0) {
      toast({ title: "No data to report", description: "Select a period with data first.", variant: "destructive" });
      return;
    }
    generateMTDReport({ data: filtered, venue, monthLabel: currentMonthLabel });
    toast({ title: "Report downloaded!", description: `${currentMonthLabel} MTD report saved.` });
  }, [filtered, venue, currentMonthLabel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading data...</p>
      </div>
    );
  }

  const hideGenerateReport = isActionHidden("revenue.generate_report");
  const hideDateRange = isActionHidden("revenue.date_range");
  const hideVenueFilter = isActionHidden("revenue.venue_filter");
  const hideViewToggle = isActionHidden("revenue.view_toggle");

  return (
    <div className="w-full mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Revenue"
        subtitle="Overview of sales performance across venues"
        actions={
          isAdmin ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowSeatingEditor(true)}>
                <Armchair className="h-4 w-4" />
                <span className="hidden sm:inline">Seats</span>
              </Button>
              {!hideGenerateReport && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setShowMTDText(true)}>
                    <FileText className="h-4 w-4" />
                    <span className="hidden sm:inline">MTD </span>Summary
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleGenerateReport}>
                    <FileDown className="h-4 w-4" />
                    Report
                  </Button>
                </>
              )}
            </>
          ) : null
        }
      />

      {!hideVenueFilter && (
        <div className="flex items-center gap-1 flex-wrap">
          {venues.map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-md border transition-colors ${
                venue === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          {!hideDateRange && (
            <DateFilter
              from={from}
              to={to}
              onFromChange={setFrom}
              onToChange={setTo}
              months={months.map((m) => m.label)}
              onPeriodSelect={handlePeriodSelect}
            />
          )}
          {!hideViewToggle && (
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
          )}
        </div>

        <KPICards key={seatingKey} {...kpi} venue={venue} uniqueDays={new Set(filtered.map((r) => r.date)).size || 1} />

        {filtered.length > 0 ? (
          <DashboardCharts data={filtered} view={view} venue={venue} seats={venue !== "All Venues" ? getVenueSeats(venue) : null} seatingKey={seatingKey} />
        ) : (
          <div className="card-glass rounded-xl p-12 text-center">
            <p className="text-muted-foreground">No data for the selected filters.</p>
          </div>
        )}
      </div>

      <MTDTextReport open={showMTDText} onOpenChange={setShowMTDText} data={filtered} from={from} to={to} />
      <VenueSeatingEditor
        open={showSeatingEditor}
        onOpenChange={setShowSeatingEditor}
        venues={venues as string[]}
        onSave={() => setSeatingKey(k => k + 1)}
      />
    </div>
  );
};

export default Index;
