import { useVenueScope } from "@/hooks/useVenueScope";
import { useMemo, useState } from "react";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useSalesData } from "@/hooks/useSalesData";
import { usePagePeriod } from "@/hooks/usePagePeriod";
import { mtdRange } from "@/components/revenue-overview/utils";


/**
 * Shared Revenue filter state (venue chips + date range + daily/monthly view).
 * Used by the Revenue Analysis page so it behaves identically to Overview
 * without duplicating any calculation logic.
 */
export function useRevenueFilters(initial = "mtd") {
  const { data, loading } = useSalesData();
  const { venues: dbVenues } = useVenues();
  const { isActionHidden } = usePagePermissions();

  const venues: VenueFilter[] = [
    "All Venues" as VenueFilter,
    ...dbVenues.filter((v) => v.is_active).map((v) => v.name as VenueFilter),
  ];

  const vs = useVenueScope();
  const venue: VenueFilter = vs.selectedVenues.length === 1 ? vs.selectedVenues[0].name as VenueFilter : "All Venues";
  const datePeriod = usePagePeriod(data.map(r => r.date), initial);
  const { from, to } = datePeriod;
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const filtered = useMemo(() => filterData(data.filter((r) => vs.includesName(r.venue)), "All Venues", from, to), [data, vs.includesName, from, to]);

  return {
    data, loading, venues, venue, from, to, datePeriod,
    view, setView, filtered, isActionHidden,
  };
}

interface ControlsProps {
  venues: VenueFilter[];
  venue: VenueFilter;
  from?: Date;
  to?: Date;
  setFrom: (d: Date | undefined) => void;
  setTo: (d: Date | undefined) => void;
  months: { key: string; label: string }[];
  onPeriodSelect: (p: string) => void;
  view: "daily" | "monthly";
  setView: (v: "daily" | "monthly") => void;
  hideVenueFilter?: boolean;
  hideDateRange?: boolean;
  hideViewToggle?: boolean;
}

export function RevenueControls({
  venues, venue, from, to, setFrom, setTo, months, onPeriodSelect,
  view, setView, hideVenueFilter, hideDateRange, hideViewToggle,
}: ControlsProps) {
  const datePeriod = usePagePeriod(months.map(m => m.key + "-01"));
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {!hideDateRange && (
          datePeriod.control
        )}
        {!hideViewToggle && (
          <div className="flex gap-[3px] p-[3px] bg-muted rounded-md">
            {(["daily", "monthly"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 h-7 text-[12px] font-medium rounded-[3px] transition-colors ${
                  view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "daily" ? "Daily" : "Monthly"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
