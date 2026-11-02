import { useRevenueFilters } from "@/components/revenue-overview/RevenueControls";

import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { AnalysisLeakage } from "@/components/revenue-overview/LegacyDaily";
import { MonthlyAverages, MonthlyMix } from "@/components/revenue-overview/LegacyMonthly";


/** Trends: month-by-month sales and venue mix, then discounts. One page, no tabs. */
export default function RevenueAnalysis() {
  const f = useRevenueFilters("last-12");
  const hideDateRange = f.isActionHidden("revenue.date_range");


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
      <RevenuePageTop
        title="Trends"
        period={!hideDateRange && (
          f.datePeriod.control
        )}
      />

      {f.filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-12 text-center">
          <p className="text-muted-foreground">No sales for this period yet.</p>
        </div>
      ) : (
        <>
          <section className="space-y-4" aria-labelledby="trends-months">
            <h2 id="trends-months" className="text-lg font-display font-semibold">Month by month</h2>
            <MonthlyAverages data={f.filtered} venue={f.venue} />
            <MonthlyMix data={f.filtered} venue={f.venue} />
          </section>
          <section className="space-y-4" aria-labelledby="trends-discounts">
            <h2 id="trends-discounts" className="text-lg font-display font-semibold">Discounts</h2>
            <AnalysisLeakage data={f.filtered} venue={f.venue} />
          </section>
        </>
      )}
    </div>
  );
}
