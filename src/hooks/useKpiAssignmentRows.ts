import { useMemo } from "react";
import { useKpiAssignments, useKpiCards, useKpiTargets, type KpiAssignment, type KpiCard, type KpiVisibility } from "@/hooks/useKpi";
import { useKpiPeople, type KpiPerson } from "@/hooks/useKpiPeople";
import { useVenues } from "@/hooks/useVenues";

export interface KpiAssignmentRow {
  assignment: KpiAssignment;
  card: KpiCard | null;
  owner: KpiPerson | null;
  venueId: string | null;
  venueName: string;
  visibility: KpiVisibility;
  /** Ready = named owner + active card + a usable active target */
  ready: boolean;
  missing: string[];
  hasTarget: boolean;
  scopeKey: string;
}

/**
 * Assignment readiness. An assignment is only surfaced to normal users when it
 * has a named owner, an active KPI card and a usable active target
 * (venue-specific first, all-venue as fallback).
 */
export function useKpiAssignmentRows() {
  const { assignments, loading: aLoading, reload, create, update, remove } = useKpiAssignments();
  const { cards, loading: cLoading } = useKpiCards();
  const { targets, loading: tLoading } = useKpiTargets();
  const { people, loading: pLoading, byId } = useKpiPeople();
  const { venues } = useVenues();

  const rows: KpiAssignmentRow[] = useMemo(() => {
    return assignments.map((a) => {
      const card = cards.find((c) => c.id === a.kpi_card_id) ?? null;
      const owner = byId(a.assigned_user_id);
      const venueId = a.venue_id ?? null;
      const cardTargets = targets.filter((t) => t.active && t.kpi_card_id === a.kpi_card_id);
      const hasTarget = !!(cardTargets.find((t) => t.venue_id === venueId) ?? cardTargets.find((t) => t.venue_id === null));

      const missing: string[] = [];
      if (!a.assigned_user_id) missing.push("Named owner required");
      else if (!owner) missing.push("Owner is not a member of this client");
      if (!card) missing.push("KPI card missing");
      else if (!card.active) missing.push("KPI card inactive");
      if (!hasTarget) missing.push("Target missing");

      return {
        assignment: a,
        card,
        owner,
        venueId,
        venueName: venueId ? (venues.find((v) => v.id === venueId)?.name ?? "Unknown venue") : "All Venues",
        visibility: (a.visibility_scope ?? "team") as KpiVisibility,
        ready: a.active && missing.length === 0,
        missing,
        hasTarget,
        scopeKey: `${a.kpi_card_id}__${venueId ?? ""}`,
      };
    });
  }, [assignments, cards, targets, byId, venues]);

  return {
    rows,
    people,
    loading: aLoading || cLoading || tLoading || pLoading,
    reload,
    create,
    update,
    remove,
  };
}
