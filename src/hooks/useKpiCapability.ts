import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type KpiAuthority = "view_only" | "edit" | "admin";

/**
 * Single capability source for the KPI module.
 *  view_only : My View, read-only Team View, own manual updates
 *  edit      : + Planner and team action management for permitted venues
 *  admin     : + KPI Setup / configuration
 */
export function useKpiCapability() {
  const { user, isAdmin } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const { tenantId } = useActiveTenant();
  const { getAuthority, loading } = usePagePermissions();

  const effectiveUserId = (isPreviewActive && isAdmin ? previewUserId : user?.id) ?? null;
  const bypass = isAdmin && !isPreviewActive;

  const authority: KpiAuthority = bypass ? "admin" : ((getAuthority("kpis") as KpiAuthority) ?? "view_only");

  const canManageActions = authority === "edit" || authority === "admin";
  const canPlan = canManageActions;
  const canConfigure = authority === "admin";

  // Permitted venues. No explicit rows = all tenant venues (established convention).
  const [venueIds, setVenueIds] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!effectiveUserId || !tenantId) { setVenueIds(null); return; }
      const { data } = await supabase
        .from("user_venue_access")
        .select("venue_id")
        .eq("user_id", effectiveUserId)
        .eq("tenant_id", tenantId);
      if (cancelled) return;
      const ids = (data ?? []).map((r: any) => r.venue_id).filter(Boolean);
      setVenueIds(ids.length ? ids : null);
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId, tenantId]);

  const canSeeVenue = useMemo(
    () => (venueId: string | null) => {
      if (bypass) return true;
      if (!venueId) return true; // all-venue scope
      if (!venueIds) return true; // no explicit rows = all venues
      return venueIds.includes(venueId);
    },
    [venueIds, bypass],
  );

  return {
    userId: effectiveUserId,
    authority,
    loading,
    isGlobalAdmin: bypass,
    isPreviewActive,
    canManageActions,
    canPlan,
    canConfigure,
    permittedVenueIds: venueIds,
    canSeeVenue,
  };
}
