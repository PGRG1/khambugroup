import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { Venue } from "@/hooks/useVenues";
import type { SalesRecord } from "@/types/sales";
import {
  computeForecastOverview,
  emptySummary,
  resolveComparisonWindow,
  type ForecastOverviewSummary,
  type ForecastVenueInput,
} from "@/utils/revenueForecastOverview";

/**
 * Revenue Overview forecast summary. Uses the same daily forecast logic as the
 * New Targets page: one query for manager overrides in the selected month,
 * plus the already-loaded sales history grouped per venue.
 */
export function useRevenueForecastOverview(args: {
  sales: SalesRecord[];
  venues: Venue[];
  selectedVenue: string;
  from: Date | undefined;
  to: Date | undefined;
}): { summary: ForecastOverviewSummary; loading: boolean } {
  const { sales, venues, selectedVenue, from, to } = args;
  const { tenantId, loading: tenantLoading } = useActiveTenant();

  const today = useMemo(() => new Date(), []);
  const win = useMemo(() => resolveComparisonWindow(from, to, today), [from, to, today]);

  const scopedVenues = useMemo(
    () =>
      venues.filter(
        (v) =>
          v.is_active &&
          v.id &&
          v.name &&
          (selectedVenue === "All Venues" || v.name === selectedVenue),
      ),
    [venues, selectedVenue],
  );

  const monthStart = win.ok ? `${win.year}-${String(win.month).padStart(2, "0")}-01` : "";
  const monthKey = monthStart.slice(0, 7);
  const venueIdsKey = scopedVenues.map((v) => v.id).sort().join(",");

  const [projectionsByVenue, setProjectionsByVenue] = useState<Map<string, Map<string, number>>>(
    new Map(),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (tenantLoading || !tenantId || !win.ok || scopedVenues.length === 0) {
      setProjectionsByVenue(new Map());
      return;
    }
    const monthEnd = `${monthKey}-${String(new Date(win.year, win.month, 0).getDate()).padStart(2, "0")}`;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("revenue_daily_projections")
        .select("venue_id, target_date, projected_sales")
        .eq("tenant_id", tenantId)
        .in("venue_id", venueIdsKey.split(","))
        .gte("target_date", monthStart)
        .lte("target_date", monthEnd);
      if (cancelled) return;
      const out = new Map<string, Map<string, number>>();
      for (const r of data ?? []) {
        const vid = String((r as any).venue_id);
        if (!out.has(vid)) out.set(vid, new Map());
        out
          .get(vid)!
          .set(String((r as any).target_date).slice(0, 10), Number((r as any).projected_sales ?? 0));
      }
      setProjectionsByVenue(out);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantLoading, win.ok, monthKey, monthStart, venueIdsKey, win.year, win.month]);

  const salesByVenueName = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const r of sales) {
      if (!r?.date || !r?.venue) continue;
      const date = String(r.date).slice(0, 10);
      if (!out.has(r.venue)) out.set(r.venue, new Map());
      const m = out.get(r.venue)!;
      m.set(date, (m.get(date) ?? 0) + Number(r.totalSales ?? 0));
    }
    return out;
  }, [sales]);

  const summary = useMemo(() => {
    if (!win.ok) return emptySummary("unavailable", win.reason);
    const inputs: ForecastVenueInput[] = scopedVenues.map((v) => ({
      venueId: v.id,
      venueName: v.name,
      salesByDate: salesByVenueName.get(v.name) ?? new Map(),
      projections: projectionsByVenue.get(v.id) ?? new Map(),
    }));
    return computeForecastOverview({ venues: inputs, from, to, today });
  }, [win.ok, win.reason, scopedVenues, salesByVenueName, projectionsByVenue, from, to, today]);

  return { summary, loading };
}
