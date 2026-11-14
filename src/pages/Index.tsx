import { useVenueScope } from "@/hooks/useVenueScope";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingLines } from "@/components/kit/LoadingSlots";
import { useMemo, useState } from "react";
import { filterData, getMonthKey, getMonthLabel } from "@/utils/salesUtils";
import { useSalesData } from "@/hooks/useSalesData";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useRevenueForecastOverview } from "@/hooks/useRevenueForecastOverview";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { useScopedProjections } from "@/hooks/useScopedProjections";
import { usePagePeriod } from "@/hooks/usePagePeriod";
import MTDTextReport from "@/components/dashboard/MTDTextReport";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { SoFarCard } from "@/components/revenue-overview/SoFarCard";
import { RevenueTrend } from "@/components/revenue-overview/RevenueTrend";
import { VenueContribution } from "@/components/revenue-overview/VenueContribution";
import { DowPattern } from "@/components/revenue-overview/DowPattern";
import { CumulativeSales, type CumulativeDay } from "@/components/revenue-overview/CumulativeSales";
import { aggregate, mtdRange } from "@/components/revenue-overview/utils";
import { MONTHS, comparisonWindow, iso, monthSoFarLabel, targetPace } from "@/utils/revenueOverview";

/** "Aug" when the comparison covers the whole month; "1–13 Oct" when it covers part of it; "Sep 2025" / "last year" for a year back. */
function compareLabel(c: { from: string; to: string; kind: "last-year" | "last-month" }, singleMonth: boolean): string {
  const f = new Date(`${c.from}T00:00:00`), t = new Date(`${c.to}T00:00:00`);
  const monthEnd = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate();
  const whole = f.getDate() === 1 && t.getMonth() === f.getMonth() && t.getDate() === monthEnd;
  const mon = f.toLocaleDateString("en-GB", { month: "short" });
  const yr = c.kind === "last-year" ? ` ${f.getFullYear()}` : "";
  if (c.kind === "last-year" && !singleMonth) return "last year";
  return whole ? `${mon}${yr}` : `${f.getDate()}–${t.getDate()} ${mon}${yr}`;
}

const Index = () => {
  const { data, loading, error, refetch } = useSalesData(true);
  const { isAdmin } = useAuth();
  const { isActionHidden } = usePagePermissions();
  const access = useRevenueNavigationAccess();

  const vs = useVenueScope();
  const venue = vs.selectedVenues.length === 1 ? vs.selectedVenues[0].name : "All Venues";
  const scopedData = useMemo(() => data.filter((r) => vs.includesName(r.venue)), [data, vs.includesName]);
  const datePeriod = usePagePeriod(data.map(r => r.date));
  const { from, to, label: periodName } = datePeriod;
  const [showMTDText, setShowMTDText] = useState(false);

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

  // Running total for a single month: each day's sales, plus each remaining day's projection
  // (from the same month projection rows as the target bar; without them, current pace is used).
  const running = useMemo(() => {
    if (!singleMonth || !from) return null;
    const y = from.getFullYear(), m = from.getMonth();
    const end = new Date(y, m + 1, 0).getDate();
    const sold = new Map<string, number>();
    for (const r of filtered) sold.set(r.date, (sold.get(r.date) ?? 0) + r.totalSales);
    const proj = new Map(targets.rows.map((r) => [r.date, r.effectiveForecast]));
    const days: CumulativeDay[] = Array.from({ length: end }, (_, i) => {
      const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
      return { date, actual: sold.get(date) ?? null, forecast: proj.get(date) ?? null };
    });
    const monthEnd = days[days.length - 1].date;
    if (days[0].date > todayIso) return null;
    const lastCounted = monthEnd < todayIso ? monthEnd : sold.has(todayIso) ? todayIso : iso(new Date(Date.now() - 864e5));
    if (lastCounted < days[0].date) return null;
    return { days, lastCounted };
  }, [singleMonth, from, filtered, targets.rows, todayIso]);

  const { summary: forecastSummary } = useRevenueForecastOverview({
    sales: data,
    venues: vs.selectedVenues,
    selectedVenue: venue,
    from,
    to,
  });

  const hideDateRange = isActionHidden("revenue.date_range");

  return (
    <div className="w-full mx-auto space-y-5">
      <RevenuePageTop
        title="Revenue overview"
        period={!hideDateRange && (
          datePeriod.control
        )}
        actions={isAdmin && (
          <Button variant="outline" size="sm" className="h-10" onClick={() => setShowMTDText(true)}>
            <FileText className="h-4 w-4" /> Text summary
          </Button>
        )}
      />

      {error && <p role="alert" className="text-sm text-destructive">Sales could not be loaded. <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button></p>}
      {loading || !vs.ready ? <div role="status" aria-label="Loading revenue" className="space-y-5">
        <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4">
          <p className="text-[13px] font-medium text-muted-foreground">{periodName}</p><Skeleton className="h-10 w-52 !animate-none" /><Skeleton className="h-4 w-3/4 !animate-none" />
          <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>{['Guests','Per guest','Average day'].map(l => <div key={l}><p className="text-[11px] text-muted-foreground">{l}</p><Skeleton className="h-5 w-20 max-w-full mt-1 !animate-none" /></div>)}</div>
        </section>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-stretch">
          <section className="card-glass rounded-xl border border-border/60 p-4"><div className="mb-3"><p className="text-[13px] font-medium">Daily sales</p><p className="text-[11px] text-muted-foreground">Each trading day</p></div><Skeleton className="h-[320px] w-full !animate-none" /></section>
          <section className="card-glass rounded-xl border border-border/60 p-4 flex flex-col"><div className="mb-3"><p className="text-[13px] font-medium">Sales by weekday</p><p className="text-[11px] text-muted-foreground">Average a day · share of sales</p></div><div className="flex-1 flex flex-col justify-around gap-2">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} className="flex items-center gap-2 px-1 min-h-8"><span className="text-[11px] w-8 text-muted-foreground">{d}</span><Skeleton className="h-3 flex-1 !animate-none" /><Skeleton className="h-6 w-24 !animate-none" /></div>)}</div></section>
        </div>
        <section className="card-glass rounded-xl border border-border/60 p-4"><LoadingLines rows={3} /></section>
      </div> : error && !data.length ? null : filtered.length === 0 ? (
        <div className="card-glass rounded-xl p-8 sm:p-12 text-center max-w-xl mx-auto">
          <p className="font-display text-lg text-foreground">No sales recorded</p>
        </div>
      ) : (
        <div className="space-y-5 loading-reveal">
          <SoFarCard
            label={periodName}
            revenue={cur.revenue}
            compare={compare && prev && prev.revenue > 0 ? {
              // Name exactly what is compared: the whole month ("Aug"), or the same stretch of it ("1–13 Oct").
              short: compareLabel(compare, singleMonth),
              revenue: prev.revenue,
              guests: prev.guests,
              spendPerGuest: prev.guests ? prev.revenue / prev.guests : null,
              averageDay: prev.days ? prev.revenue / prev.days : 0,
            } : null}
            target={singleMonth && access.forecast && !targets.loading ? {
              monthName: MONTHS[tMonth - 1],
              pace,
              hasTarget: targets.hasManagerTarget,
              canSet: access.forecast,
              ended: !!to && to < new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()),
            } : null}
            targetLoading={singleMonth && access.forecast && targets.loading}
            guests={cur.guests}
            spendPerGuest={cur.guests ? cur.revenue / cur.guests : null}
            averageDay={cur.days ? cur.revenue / cur.days : 0}
          />

          {running && <CumulativeSales days={running.days} lastCounted={running.lastCounted} target={targets.hasManagerTarget && pace ? pace.target : null} />}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-stretch">
            <div className="min-w-0">
              <RevenueTrend data={filtered} view="daily" forecastDaily={forecastSummary.daily} markBestWorst />
            </div>
            <div className="min-w-0">
              <DowPattern data={filtered} />
            </div>
          </div>

          <VenueContribution data={filtered} prevData={priorFiltered} venue={venue} />
        </div>
      )}

      <MTDTextReport open={showMTDText} onOpenChange={setShowMTDText} data={filtered} from={from} to={to} />
    </div>
  );
};

export default Index;
