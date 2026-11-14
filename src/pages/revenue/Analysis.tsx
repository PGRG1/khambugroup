import { useMemo } from "react";
import { useSalesData } from "@/hooks/useSalesData";
import { useVenueScope } from "@/hooks/useVenueScope";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { TrendsView } from "@/components/trends/TrendsView";

/** Trends: the longer picture. No period filter; each chart keeps its own window. */
export default function RevenueAnalysis() {
  const { data, loading } = useSalesData();
  const vs = useVenueScope();
  const scoped = useMemo(() => data.filter((r) => vs.includesName(r.venue)), [data, vs.includesName]);

  if (loading) {
    return (
      <div className="w-full mx-auto space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-80 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-4">
      <RevenuePageTop title="Trends" />
      {scoped.length === 0
        ? <div className="card-glass rounded-xl p-12 text-center"><p className="text-muted-foreground">No sales recorded</p></div>
        : <TrendsView data={scoped} />}
    </div>
  );
}
