import { useVenueScope } from "@/hooks/useVenueScope";
import { useMemo, useState } from "react";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useRevenueForecastOverview } from "@/hooks/useRevenueForecastOverview";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { useScopedProjections } from "@/hooks/useScopedProjections";
import DateFilter from "@/components/dashboard/DateFilter";
import MTDTextReport from "@/components/dashboard/MTDTextReport";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { SoFarCard } from "@/components/revenue-overview/SoFarCard";
import { RevenueTrend } from "@/components/revenue-overview/RevenueTrend";
import { VenueContribution } from "@/components/revenue-overview/VenueContribution";
import { DowPattern } from "@/components/revenue-overview/DowPattern";
import { aggregate, mtdRange } from "@/components/revenue-overview/utils";
import { MONTHS, comparisonSentence, comparisonWindow, iso, monthSoFarLabel, targetPace } from "@/utils/revenueOverview";

const Index = () => {
  const { data, loading } = useSalesData();
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();
  const access = useRevenueNavigationAccess();

  const vs = useVenueScope();
  const venue = vs.selectedVenues.length === 1 ? vs.selectedVenues[0].name : "All Venues";
  const scopedData = useMemo(() => data.filter((r) => vs.includesName(r.venue)), [data, vs.includesName]);
  const [from, setFrom] = useState<Date | undefined>(() => mtdRange().from);
  const [to, setTo] = useState<Date | undefined>(() => mtdRange().to);
  const [periodName, setPeriodName] = useState(() => monthSoFarLabel());
  const [showMTDText, setShowMTDText] = useState(false);

  const months = useMemo(() => {
    const keys = [...new Set(data.map((r) => getMonthKey(r.date)))].sort();
    return keys.map((k) => ({ key: k, label: getMonthLabel(k) }));
  }, [data]);

  const handlePeriodSelect = (period: string) => {
    if (period === "MTD") { const r = mtdRange(); setFrom(r.from); setTo(r.to); setPeriodName(monthSoFarLabel()); return; }
    if (period === "All Time") { setFrom(undefined); setTo(undefined); setPeriodName("All time"); return; }
    if (period === "Custom") { setPeriodName("Selected dates"); return; }
    const month = months.find((m) => m.label === period);
    if (!month) return;
    const [y, m] = month.key.split("-");
    setFrom(new Date(parseInt(y), parseInt(m) - 1, 1));
    setTo(new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999));
    setPeriodName(period);
  };

  const filtered = useMemo(() => filterData(scopedData, "All Venues", from, to), [scopedData, from, to]);
  const cur = useMemo(() => aggregate(filtered), [filtered]);

  // Comparison: same elapsed days last year, else last month.
  const todayIso = iso(new Date());
  const compare = useMemo(() => {
    if (!from || !to) return null;
    const dates = scopedData.map((r) => r.date).sort();
    return comparisonWindow(iso(from), iso(to), todayIso, dates[0] ?? null, dates[dates.length - 1] ?? null);
  }, [from, to, scopedData, todayIso]);
  const priorFiltered = useMemo(
    () => (compare ? scopedData.filter((r) => r.date >= compare.from && r.date <= compare.to) : []),
    [scopedData, compare],
  );
  const prev = useMemo(() => (priorFiltered.length ? aggregate(priorFiltered) : null), [priorFiltered]);

  // Target bar: only for a single month.
  const singleMonth = !!from && !!to && from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  const tYear = from?.getFullYear() ?? 0;
  const tMonth = (from?.getMonth() ?? 0) + 1;
  const venueIds = useMemo(() => vs.selectedVenues.map((v) => v.id), [vs.selectedVenues]);
  const targets = useScopedProjections(venueIds, tYear, tMonth, singleMonth && access.forecast);
  const pace = useMemo(() => targetPace(targets.rows, todayIso), [targets.rows, todayIso]);

  const { summary: forecastSummary } = useRevenueForecastOverview({
    sales: data,
    venues: vs.selectedVenues,
    selectedVenue: venue,
    from,
    to,
  });

  const hideDateRange = isActionHidden("revenue.date_range");

  if (loading) {
    return (
      <div className="w-full mx-auto space-y-6">
        <div className="h-8 w-40 bg-muted rounded animate-pulse" />
        <div className="h-32 bg-muted/60 rounded-xl animate-pulse" />
        <div className="h-80 bg-muted/60 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="w-full mx-auto space-y-5">
      <RevenuePageTop
        title="Revenue overview"
        period={!hideDateRange && (
          <DateFilter
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            months={months.map((m) => m.label)}
            onPeriodSelect={handlePeriodSelect}
            includeMtd
            initialPeriod="MTD"
            labelled
          />
        )}
        actions={isAdmin && (
          <Button variant="outline" size="sm" className="h-10" onClick={() => setShowMTDText(true)}>
            <FileText className="h-4 w-4" /> Text summary
          </Button>
        )}
      />

      {filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-3">
          <p className="font-display text-lg text-foreground">There is no trading history for this period yet.</p>
          <p className="text-sm text-muted-foreground">
            Bani needs at least 7–14 trading days of sales records before trends, pacing and forecasts are reliable. Until then, any projection would be a guess.
          </p>
          <p className="text-sm text-foreground">
            Next step: scan the Z-reports for these days in Sales records, or set a target from your budget.
          </p>
        </div>
      ) : (
        <>
          <SoFarCard
            label={periodName}
            revenue={cur.revenue}
            comparison={compare && prev ? comparisonSentence(cur.revenue, prev.revenue, compare) : null}
            target={singleMonth && access.forecast && !targets.loading ? {
              monthName: MONTHS[tMonth - 1],
              pace,
              hasTarget: targets.hasManagerTarget,
              canSet: access.forecast,
            } : null}
            guests={cur.guests}
            spendPerGuest={cur.guests ? cur.revenue / cur.guests : null}
            prevSpendPerGuest={compare && prev?.guests ? { value: prev.revenue / prev.guests, name: compare.name } : null}
            averageDay={cur.days ? cur.revenue / cur.days : 0}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-stretch">
            <div className="min-w-0">
              <RevenueTrend data={filtered} view="daily" forecastDaily={forecastSummary.daily} markBestWorst />
            </div>
            <div className="min-w-0">
              <DowPattern data={filtered} />
            </div>
          </div>

          <VenueContribution data={filtered} prevData={priorFiltered} venue={venue} />
        </>
      )}

      <MTDTextReport open={showMTDText} onOpenChange={setShowMTDText} data={filtered} from={from} to={to} />
    </div>
  );
};

export default Index;
