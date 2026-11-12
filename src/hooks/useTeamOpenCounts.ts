import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenueScope } from "@/hooks/useVenueScope";
import { roleViews, type Review, type Role } from "@/lib/financeTeamRoles";

export type NavSection = "revenue" | "purchasing" | "people" | "finance";
const SECTION: Record<Role, NavSection> = { revenue: "revenue", procurement: "purchasing", people: "people", accountant: "finance", controller: "finance" };

/** Open finance-team findings from the same latest review the landing page reads (shared cache key). */
export function useTeamOpenCounts() {
  const { tenantId } = useActiveTenant();
  const vs = useVenueScope();
  const ids = vs.filterIds;
  const mixed = !!ids && ids.length > 1;
  const venueId = ids && ids.length === 1 ? ids[0] : null;
  const q = useQuery({
    queryKey: ["landing", "review", tenantId, venueId],
    enabled: !!tenantId && vs.ready && !mixed,
    queryFn: async (): Promise<Review | null> => {
      let r = (supabase as any).from("finance_team_reviews")
        .select("id,venue_id,venue_label,review_type,period_start,period_end,status,generated_at,specialists,synthesis")
        .eq("tenant_id", tenantId).eq("status", "completed").order("generated_at", { ascending: false }).limit(1);
      r = venueId ? r.eq("venue_id", venueId) : r.is("venue_id", null);
      const { data, error } = await r; if (error) throw error;
      return (data?.[0] ?? null) as Review | null;
    },
  });
  const counts: Record<NavSection, number> = { revenue: 0, purchasing: 0, people: 0, finance: 0 };
  let total = 0;
  if (q.data && !mixed) for (const v of roleViews(q.data)) {
    const n = v.findings.filter((f) => f.recommendation && (f.severity === "action" || f.severity === "watch")).length;
    counts[SECTION[v.role]] += n; total += n;
  }
  return { counts, total };
}
