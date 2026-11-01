import { useQuery } from "@tanstack/react-query";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useFloatingBaniStore } from "@/components/assistant/FloatingBaniContext";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { makeClosedLookup, type VenueClosure, type VenueClosureRule } from "@/utils/venueClosures";
import { revenuePageWork } from "@/utils/baniPageWork";
import { tenantToday } from "@/utils/salesRecordChecks";

/** Read-only facts for Revenue; other pages publish the counts they already calculated. */
export function useBaniPageWork(path: string, enabled: boolean) {
  const { tenantId } = useActiveTenant(), scope = useVenueScope(), store = useFloatingBaniStore();
  const revenue = /^\/(revenue|sales-data|forecast|kpis)/.test(path);
  const q = useQuery({
    queryKey: ["bani-page-work", tenantId, scope.selectedNames, tenantToday()],
    enabled: enabled && revenue && !!tenantId && scope.ready && scope.selectedVenues.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [sales, closures, rules, tenant] = await Promise.all([
        fetchAllRows("sales_records", "date,venue,total_sales", { col: "date", asc: true }, tenantId, true),
        fetchAllRows("venue_closures", "*", { col: "id", asc: true }, tenantId, true),
        fetchAllRows("venue_closure_rules", "*", { col: "id", asc: true }, tenantId, true),
        fetchAllRows("tenants", "id,timezone", { col: "id", asc: true }, null, true),
      ]);
      const today = tenantToday(tenant.find(t => t.id === tenantId)?.timezone || "Asia/Hong_Kong");
      return { today, items: revenuePageWork(sales.filter(r => scope.selectedNames.includes(r.venue)).map(r => ({ date: r.date, venue: r.venue, totalSales: Number(r.total_sales) })), scope.selectedVenues, today, makeClosedLookup(closures as VenueClosure[], rules as VenueClosureRule[])) };
    },
  });
  const published = store?.work[0];
  return { today: q.data?.today ?? tenantToday(), items: revenue ? q.data?.items ?? [] : published?.path === path ? published.items : [], loading: revenue && q.isLoading, error: revenue && q.isError };
}