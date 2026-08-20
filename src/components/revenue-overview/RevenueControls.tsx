import { useMemo, useState } from "react";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useVenues } from "@/hooks/useVenues";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useSalesData } from "@/hooks/useSalesData";
import DateFilter from "@/components/dashboard/DateFilter";
import { mtdRange } from "@/components/revenue-overview/utils";


/**
 * Shared Revenue filter state (venue chips + date range + daily/monthly view).
 * Used by the Revenue Analysis page so it behaves identically to Overview
 * without duplicating any calculation logic.
 */
export function useRevenueFilters() {
  const { data, loading } = useSalesData();
  const { venues: dbVenues } = useVenues();
  const { isActionHidden } = usePagePermissions();

  const venues: VenueFilter[] = [
    "All Venues" as VenueFilter,
    ...dbVenues.filter((v) => v.is_active).map((v) => v.name as VenueFilter),
  ];

  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [from, setFrom] = useState<Date | undefined>(() => mtdRange().from);
  const [to, setTo] = useState<Date | undefined>(() => mtdRange().to);
  const [view, setView] = useState<"daily" | "monthly">("daily");

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const onPeriodSelect = (period: string) => {
    if (period === "MTD") { const r = mtdRange(); setFrom(r.from); setTo(r.to); return; }
    if (period === "All Time") { setFrom(undefined); setTo(undefined); return; }
    if (period === "Custom") return;
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };


  const filtered = useMemo(() => filterData(data, venue, from, to), [data, venue, from, to]);

  return {
    data, loading, venues, venue, setVenue, from, setFrom, to, setTo,
    view, setView, months, onPeriodSelect, filtered, isActionHidden,
  };
}

interface ControlsProps {
  venues: VenueFilter[];
  venue: VenueFilter;
  setVenue: (v: VenueFilter) => void;
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
  venues, venue, setVenue, from, to, setFrom, setTo, months, onPeriodSelect,
  view, setView, hideVenueFilter, hideDateRange, hideViewToggle,
}: ControlsProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {!hideVenueFilter && (
        <div className="flex items-center gap-1 flex-wrap">
          {venues.map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={`px-2.5 h-8 text-[12px] font-medium rounded-md border transition-colors ${
                venue === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-transparent text-foreground/70 hover:bg-muted"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap ml-auto">
        {!hideDateRange && (
          <DateFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            months={months.map((m) => m.label)}
            onPeriodSelect={onPeriodSelect}
          />
        )}
        {!hideViewToggle && (
          <div className="flex gap-0.5 p-0.5 bg-muted rounded-md">
            {(["daily", "monthly"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 h-7 text-[12px] font-medium rounded transition-colors ${
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
