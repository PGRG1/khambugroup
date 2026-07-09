import { useMemo, useState } from "react";
import { VenueFilter } from "@/types/sales";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useVenues } from "@/hooks/useVenues";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import DateFilter from "@/components/dashboard/DateFilter";
import { generateMTDReport } from "@/utils/generateReport";
import { toast } from "@/hooks/use-toast";
import MTDTextReport from "@/components/dashboard/MTDTextReport";
import VenueSeatingEditor from "@/components/dashboard/VenueSeatingEditor";
import { FileDown, FileText, Armchair } from "lucide-react";

import { HeroBand } from "@/components/revenue-overview/HeroBand";
import { KpiRow } from "@/components/revenue-overview/KpiRow";
import { RevenueTrend } from "@/components/revenue-overview/RevenueTrend";
import { VenueContribution } from "@/components/revenue-overview/VenueContribution";
import { DowPattern } from "@/components/revenue-overview/DowPattern";
import { BestWorstStrip } from "@/components/revenue-overview/BestWorstStrip";
import { aggregate, priorRange, toDaily } from "@/components/revenue-overview/utils";

const Index = () => {
  const { data, loading } = useSalesData();
  const { venues: dbVenues } = useVenues();
  const { targets } = useRevenueTargets();
  const venues: VenueFilter[] = ["All Venues" as VenueFilter, ...dbVenues.filter((v) => v.is_active).map((v) => v.name as VenueFilter)];
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();

  const [venue, setVenue] = useState<VenueFilter>("All Venues");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [view, setView] = useState<"daily" | "monthly">("daily");
  const [showMTDText, setShowMTDText] = useState(false);
  const [showSeatingEditor, setShowSeatingEditor] = useState(false);
  const [seatingKey, setSeatingKey] = useState(0);

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "All Time") { setFrom(undefined); setTo(undefined); return; }
    if (period === "Custom") return;
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
  };

  const filtered = useMemo(() => filterData(data, venue, from, to), [data, venue, from, to]);

  // Prior comparable
  const prior = priorRange(from, to);
  const priorFiltered = useMemo(
    () => (prior ? filterData(data, venue, prior.from, prior.to) : []),
    [data, venue, prior?.from, prior?.to]
  );

  // 90-day sparkline (venue-scoped, unfiltered by date)
  const sparkline90 = useMemo(() => {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const scoped = data.filter((r) => {
      if (venue !== "All Venues" && r.venue !== venue) return false;
      const d = new Date(r.date);
      return d >= cutoff && d <= now;
    });
    return toDaily(scoped);
  }, [data, venue]);

  // Month target (if from/to inside a single month)
  const monthContext = useMemo(() => {
    if (!from) return null;
    const y = from.getFullYear();
    const m = from.getMonth() + 1;
    if (to) {
      if (to.getFullYear() !== y || to.getMonth() + 1 !== m) return null;
    }
    return { y, m };
  }, [from, to]);

  const targetForMonth = useMemo(() => {
    if (!monthContext) return null;
    const t = targets.find((t) => t.year === monthContext.y && t.month === monthContext.m);
    if (!t) return null;
    // If venues array set on target, ensure current venue is in scope; else applies to all
    if (venue !== "All Venues" && t.venues.length && !t.venues.includes(venue)) return null;
    return t.targetAmount;
  }, [targets, monthContext, venue]);

  const cur = useMemo(() => aggregate(filtered), [filtered]);
  const prev = useMemo(() => (priorFiltered.length ? aggregate(priorFiltered) : null), [priorFiltered]);
  const dailyCurrent = useMemo(() => toDaily(filtered), [filtered]);

  const monthMeta = useMemo(() => {
    if (!monthContext) return { daysInMonth: null as number | null, monthLabel: null as string | null, monthProrated: null as number | null, monthActualMTD: null as number | null, targetPerDay: null as number | null };
    const daysInMonth = new Date(monthContext.y, monthContext.m, 0).getDate();
    const monthLabel = getMonthLabel(`${monthContext.y}-${String(monthContext.m).padStart(2, "0")}`);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === monthContext.y && today.getMonth() + 1 === monthContext.m;
    const dayOfMonth = isCurrentMonth ? today.getDate() : daysInMonth;
    const targetPerDay = targetForMonth ? targetForMonth / daysInMonth : null;
    const monthProrated = targetPerDay ? targetPerDay * dayOfMonth : null;
    const monthActualMTD = cur.revenue;
    return { daysInMonth, monthLabel, monthProrated, monthActualMTD, targetPerDay };
  }, [monthContext, targetForMonth, cur.revenue]);

  const currentMonthLabel = useMemo(() => {
    if (from) return getMonthLabel(`${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`);
    if (months.length > 0) return months[months.length - 1].label;
    return new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }, [from, months]);

  const handleGenerateReport = () => {
    if (filtered.length === 0) {
      toast({ title: "No data to report", description: "Select a period with data first.", variant: "destructive" });
      return;
    }
    generateMTDReport({ data: filtered, venue, monthLabel: currentMonthLabel });
    toast({ title: "Report downloaded", description: `${currentMonthLabel} MTD report saved.` });
  };

  const hideGenerateReport = isActionHidden("revenue.generate_report");
  const hideDateRange = isActionHidden("revenue.date_range");
  const hideVenueFilter = isActionHidden("revenue.venue_filter");
  const hideViewToggle = isActionHidden("revenue.view_toggle");

  if (loading) {
    return (
      <div className="w-full mx-auto space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted/60 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-32 bg-muted/60 rounded-xl animate-pulse" />)}
        </div>
        <div className="h-80 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  const btnGhost = "inline-flex items-center gap-1.5 h-8 px-2.5 text-[13px] font-medium rounded-md border border-border/60 bg-transparent text-foreground/80 hover:bg-muted transition-colors";

  return (
    <div className="w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">
            <span className="text-gradient-gold">Revenue</span>
            <span className="text-muted-foreground ml-2 text-[13px] font-normal">Overview</span>
          </h1>
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <button onClick={() => setShowSeatingEditor(true)} className={btnGhost}>
                <Armchair className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Seats</span>
              </button>
            )}
            {isAdmin && !hideGenerateReport && (
              <>
                <button onClick={() => setShowMTDText(true)} className={btnGhost}>
                  <FileText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">MTD Summary</span>
                </button>
                <button onClick={handleGenerateReport} className={btnGhost}>
                  <FileDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Report</span>
                </button>
              </>
            )}
          </div>
        </div>

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
                onPeriodSelect={handlePeriodSelect}
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
      </div>

      {filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-12 text-center">
          <p className="text-muted-foreground">No data for the selected filters.</p>
        </div>
      ) : (
        <>
          <HeroBand
            cur={cur}
            prev={prev}
            sparkline90={sparkline90}
            target={targetForMonth}
            monthProrated={monthMeta.monthProrated}
            monthActualMTD={monthMeta.monthActualMTD}
            daysInMonth={monthMeta.daysInMonth}
            monthLabel={monthMeta.monthLabel}
          />

          <KpiRow cur={cur} prev={prev} dailyCurrent={dailyCurrent} />

          <RevenueTrend data={filtered} view={view} targetPerDay={monthMeta.targetPerDay} />

          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
            <VenueContribution data={filtered} prevData={priorFiltered} venue={venue} seatingKey={seatingKey} />
            <DowPattern data={filtered} />
          </div>

          <BestWorstStrip data={filtered} />
        </>
      )}

      <MTDTextReport open={showMTDText} onOpenChange={setShowMTDText} data={filtered} from={from} to={to} />
      <VenueSeatingEditor
        open={showSeatingEditor}
        onOpenChange={setShowSeatingEditor}
        venues={venues as string[]}
        onSave={() => setSeatingKey((k) => k + 1)}
      />
    </div>
  );
};

export default Index;
