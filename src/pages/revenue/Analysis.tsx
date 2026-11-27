import { useMemo } from "react";
import { useSalesData } from "@/hooks/useSalesData";
import { useVenueScope } from "@/hooks/useVenueScope";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { useScopedProjections } from "@/hooks/useScopedProjections";
import { useMonthTarget } from "@/hooks/useMonthTarget";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { TrendsView } from "@/components/trends/TrendsView";
import { RevenueEnter, useSlowLoad } from "@/components/revenue/RevenueMotion";

/** Trends: the longer picture. No period filter; each chart keeps its own window. */
export default function RevenueAnalysis() {
  const { data, loading: salesLoading } = useSalesData();
  const vs = useVenueScope();
  const scoped = useMemo(() => data.filter((r) => vs.includesName(r.venue)), [data, vs.includesName]);

  // This month's target (one flat figure), drawn faintly on Month to date when set for the venues in view.
  const access = useRevenueNavigationAccess();
  const now = new Date();
  const allNames = useMemo(() => vs.venues.filter((v) => v.is_active && v.name).map((v) => v.name).sort(), [vs.venues]);
  const scopeNames = useMemo(() => vs.selectedVenues.map((v) => v.name).sort(), [vs.selectedVenues]);
  const goal = useMonthTarget(now.getFullYear(), now.getMonth() + 1, scopeNames, allNames);
  const target = access.forecast ? goal.target : null;
  // This month's day-by-day projection, so the dotted line ends where Overview and Targets say.
  const venueIds = useMemo(() => vs.selectedVenues.map((v) => v.id), [vs.selectedVenues]);
  const proj = useScopedProjections(venueIds, now.getFullYear(), now.getMonth() + 1, access.forecast);
  const projected = useMemo(() => new Map(proj.rows.filter((r) => r.effectiveForecast != null).map((r) => [r.date, r.effectiveForecast as number])), [proj.rows]);
  // Wait for the target too, so the chart's scale never changes after it appears.
  const loading = salesLoading || !vs.ready || (access.forecast && (goal.loading || proj.loading));

  const slow = useSlowLoad(loading);
  if (loading && slow) {
    return (
      <div className="w-full mx-auto space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-80 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-4">
      <RevenuePageTop tabsAbove title="Trends" />
      {loading ? null : scoped.length === 0
        ? <div className="card-glass rounded-xl p-8 sm:p-12 text-center"><p className="text-muted-foreground">No sales recorded</p></div>
        : <RevenueEnter id="trends"><TrendsView data={scoped} target={target} projected={access.forecast ? projected : undefined} /></RevenueEnter>}
    </div>
  );
}
