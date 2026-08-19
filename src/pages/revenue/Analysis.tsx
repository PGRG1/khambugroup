import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RevenueControls, useRevenueFilters } from "@/components/revenue-overview/RevenueControls";
import {
  AnalysisTrends,
  AnalysisWeekdays,
  AnalysisVenueMix,
  AnalysisLeakage,
} from "@/components/revenue-overview/LegacyDaily";
import { MonthlyAverages, MonthlyMix } from "@/components/revenue-overview/LegacyMonthly";

type TabKey = "trends" | "weekdays" | "mix" | "leakage";

export default function RevenueAnalysis() {
  const f = useRevenueFilters();
  const [tab, setTab] = useState<TabKey>("trends");

  const hideDateRange = f.isActionHidden("revenue.date_range");
  const hideVenueFilter = f.isActionHidden("revenue.venue_filter");
  const hideViewToggle = f.isActionHidden("revenue.view_toggle");

  if (f.loading) {
    return (
      <div className="w-full mx-auto space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-80 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">
            <span className="text-gradient-gold">Revenue</span>
            <span className="text-muted-foreground ml-2 text-[13px] font-normal">Analysis</span>
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Explore trends, patterns and revenue drivers
          </p>
        </div>

        <RevenueControls
          venues={f.venues}
          venue={f.venue}
          setVenue={f.setVenue}
          from={f.from}
          to={f.to}
          setFrom={f.setFrom}
          setTo={f.setTo}
          months={f.months}
          onPeriodSelect={f.onPeriodSelect}
          view={f.view}
          setView={f.setView}
          hideVenueFilter={hideVenueFilter}
          hideDateRange={hideDateRange}
          hideViewToggle={hideViewToggle}
        />
      </div>

      {f.filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-12 text-center">
          <p className="text-muted-foreground">No data for the selected filters.</p>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="weekdays">Weekdays</TabsTrigger>
            <TabsTrigger value="mix">Venue &amp; Mix</TabsTrigger>
            <TabsTrigger value="leakage">Leakage</TabsTrigger>
          </TabsList>

          {/* Only the active tab mounts its charts. */}
          <TabsContent value="trends" className="mt-4">
            {tab === "trends" && (
              f.view === "daily"
                ? <AnalysisTrends data={f.filtered} venue={f.venue} />
                : <MonthlyAverages data={f.filtered} venue={f.venue} />
            )}
          </TabsContent>

          <TabsContent value="weekdays" className="mt-4">
            {tab === "weekdays" && <AnalysisWeekdays data={f.filtered} venue={f.venue} />}
          </TabsContent>

          <TabsContent value="mix" className="mt-4">
            {tab === "mix" && (
              f.view === "daily"
                ? <AnalysisVenueMix data={f.filtered} venue={f.venue} />
                : <MonthlyMix data={f.filtered} venue={f.venue} />
            )}
          </TabsContent>

          <TabsContent value="leakage" className="mt-4">
            {tab === "leakage" && <AnalysisLeakage data={f.filtered} venue={f.venue} />}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
