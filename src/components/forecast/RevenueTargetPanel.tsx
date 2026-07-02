import { useEffect, useMemo, useRef, useState } from "react";
import { Target, Save, Sparkles, AlertTriangle, Check, Camera, Download } from "lucide-react";
import { toPng } from "html-to-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { useForecastData } from "@/hooks/useForecastData";
import { SalesRecord } from "@/types/sales";
import { ForecastRecord } from "@/types/forecast";
import { formatCurrency } from "@/utils/salesUtils";
import {
  computeDowMedians,
  computeVenueWeights,
  distributeMonthlyTarget,
  aggregateActualsByVenue,
  DistributedDay,
  DistributionResult,
} from "@/utils/forecastDistribution";

type Venue = string;

interface RevenueTargetPanelProps {
  salesData: SalesRecord[];
  allForecasts: ForecastRecord[];
  allVenues: string[];
}

const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });

interface VenueDistribution {
  venue: Venue;
  result: DistributionResult;
  venueTarget: number;
  weightPct: number;
  noHistory: boolean;
}

const RevenueTargetPanel = ({ salesData, allForecasts, allVenues }: RevenueTargetPanelProps) => {
  const { user } = useAuth();
  const { getTarget, upsertTarget } = useRevenueTargets();
  const { addForecast, updateForecast } = useForecastData();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [selectedVenues, setSelectedVenues] = useState<Venue[]>(allVenues);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [perVenue, setPerVenue] = useState<VenueDistribution[]>([]);
  const [applying, setApplying] = useState(false);
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");

  useEffect(() => {
    const existing = getTarget(year, month);
    if (existing) {
      setTargetAmount(existing.targetAmount);
      const v = existing.venues.filter((x) => allVenues.includes(x));
      setSelectedVenues(v.length ? v : allVenues);
    } else {
      setTargetAmount(0);
      setSelectedVenues(allVenues);
    }
  }, [year, month, getTarget, allVenues]);

  const monthOptions = useMemo(() => {
    const opts: { year: number; month: number; label: string }[] = [];
    const d = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    for (let i = 0; i < 18; i++) {
      opts.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${monthName(d.getMonth() + 1)} ${d.getFullYear()}` });
      d.setMonth(d.getMonth() + 1);
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentlyForecasted = useMemo(() => {
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    return allForecasts
      .filter((f) => f.date.startsWith(monthStr) && selectedVenues.includes(f.venue as Venue))
      .reduce((sum, f) => sum + f.forecastedTotalSales, 0);
  }, [allForecasts, year, month, selectedVenues]);

  const progressPct = targetAmount > 0 ? Math.min(100, Math.round((currentlyForecasted / targetAmount) * 100)) : 0;
  const gap = targetAmount - currentlyForecasted;

  const toggleVenue = (v: Venue) => {
    setSelectedVenues((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  };

  const handleSaveTarget = async () => {
    if (targetAmount <= 0) return toast({ title: "Enter a target amount", variant: "destructive" });
    if (selectedVenues.length === 0) return toast({ title: "Select at least one venue", variant: "destructive" });
    const ok = await upsertTarget({ year, month, targetAmount, venues: selectedVenues, userId: user?.id });
    toast({ title: ok ? "Revenue target saved" : "Failed to save target", variant: ok ? "default" : "destructive" });
  };

  const handleGeneratePreview = () => {
    if (targetAmount <= 0) return toast({ title: "Enter a target amount", variant: "destructive" });
    if (selectedVenues.length === 0) return toast({ title: "Select at least one venue", variant: "destructive" });

    // Allocate target across venues based on each venue's last-3-month revenue share.
    // Venues with zero history get 0 share unless ALL venues lack history (then equal split).
    const { weights, venuesWithoutHistory, allMissing } = computeVenueWeights(salesData, selectedVenues, 3);

    const distributions: VenueDistribution[] = selectedVenues.map((venue) => {
      const weight = weights[venue] ?? 0;
      const venueTarget = targetAmount * weight;
      const medians = computeDowMedians(salesData, [venue], 3);
      const actuals = aggregateActualsByVenue(salesData, venue, year, month);
      const result = distributeMonthlyTarget({
        year,
        month,
        monthlyTarget: venueTarget,
        medians,
        actuals,
      });
      return {
        venue,
        result,
        venueTarget,
        weightPct: Math.round(weight * 1000) / 10,
        noHistory: !allMissing && venuesWithoutHistory.includes(venue),
      };
    });

    setPerVenue(distributions);
    setPreviewOpen(true);
  };

  const handleApply = async () => {
    if (!user || perVenue.length === 0) return;
    setApplying(true);

    let written = 0;
    let failed = 0;

    for (const { venue, result } of perVenue) {
      const v = venue;


      for (const day of result.rows) {
        if (day.isActual) continue; // Don't overwrite actual days

        const grossSales = day.guests * day.avgSpend;
        const serviceCharge = Math.round(grossSales * 0.1);
        const totalSales = grossSales + serviceCharge;

        const existing = allForecasts.find((f) => f.date === day.date && f.venue === v);
        const payload = {
          forecastedCustomers: day.guests,
          forecastedAvgSpend: day.avgSpend,
          forecastedGrossSales: grossSales,
          forecastedServiceCharge: serviceCharge,
          forecastedTotalSales: totalSales,
        };

        if (existing) {
          (await updateForecast(existing.id, payload)) ? written++ : failed++;
        } else {
          const ok = await addForecast({
            date: day.date,
            day: day.day,
            venue: v,
            ...payload,
            comment: "",
            forecastNotes: `Auto-generated from ${monthName(month)} ${year} target ${formatCurrency(targetAmount)}`,
            postEventNotes: "",
            pendingPostEventNotes: null,
            status: "draft",
            submittedBy: user.id,
          });
          ok ? written++ : failed++;
        }
      }
    }

    await upsertTarget({ year, month, targetAmount, venues: selectedVenues, userId: user?.id });
    setApplying(false);
    setPreviewOpen(false);
    toast({
      title: `Applied to ${written} forecast entries`,
      description: failed > 0 ? `${failed} failed (check permissions)` : undefined,
      variant: failed > 0 ? "destructive" : "default",
    });
  };

  // Combined view: aggregate all per-venue results by date
  const combined = useMemo(() => {
    if (perVenue.length === 0) return null;
    const byDate = new Map<string, DistributedDay & { venuesActual: number; venuesForecast: number }>();
    for (const { result } of perVenue) {
      for (const r of result.rows) {
        const cur = byDate.get(r.date);
        if (!cur) {
          byDate.set(r.date, { ...r, venuesActual: r.isActual ? 1 : 0, venuesForecast: r.isActual ? 0 : 1 });
        } else {
          cur.guests += r.guests;
          cur.totalSales += r.totalSales;
          cur.venuesActual += r.isActual ? 1 : 0;
          cur.venuesForecast += r.isActual ? 0 : 1;
          // weighted avg spend
          cur.avgSpend = cur.guests > 0 ? Math.round((cur.totalSales / 1.1) / cur.guests) : 0;
          if (!r.isActual && cur.isActual) cur.isActual = false; // mixed → mark forecast
        }
      }
    }
    const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const actualSoFar = perVenue.reduce((s, p) => s + p.result.actualSoFar, 0);
    const forecastTotal = perVenue.reduce((s, p) => s + p.result.forecastTotal, 0);
    return {
      rows,
      actualSoFar,
      forecastTotal,
      combinedTotal: actualSoFar + forecastTotal,
      remainingTarget: targetAmount - actualSoFar,
    };
  }, [perVenue, targetAmount]);

  return (
    <>
      {/* Settings card */}
      <div className="card-glass rounded-xl p-5 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-display font-semibold">Monthly Revenue Target</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Subtracts actuals already recorded, distributes the gap across remaining days using DOW medians
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3">
            <label className="text-xs text-muted-foreground block mb-1">Month</label>
            <select
              value={`${year}-${month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y); setMonth(m);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {monthOptions.map((o) => (
                <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-muted-foreground block mb-1">Target (HK$)</label>
            <input
              type="number" min={0} step={1000}
              value={targetAmount || ""} placeholder="e.g. 800000"
              onChange={(e) => setTargetAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="md:col-span-4">
            <label className="text-xs text-muted-foreground block mb-1">Responsible Venues</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_VENUES.map((v) => {
                const active = selectedVenues.includes(v);
                return (
                  <button
                    key={v} type="button" onClick={() => toggleVenue(v)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                      active ? "border-primary bg-primary/15 text-primary font-medium" : "border-border bg-secondary text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}{v}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 flex items-end gap-2">
            <button onClick={handleSaveTarget} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-secondary hover:bg-muted transition-colors">
              <Save className="h-3.5 w-3.5" />Save
            </button>
            <button onClick={handleGeneratePreview} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Sparkles className="h-3.5 w-3.5" />Distribute
            </button>
          </div>
        </div>

        {targetAmount > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-muted-foreground">
                Currently forecasted ({selectedVenues.join(", ") || "no venues"}):{" "}
                <span className="font-semibold text-foreground">{formatCurrency(currentlyForecasted)}</span>
              </span>
              <span className={`font-semibold ${gap <= 0 ? "text-emerald-600" : progressPct >= 80 ? "text-amber-500" : "text-destructive"}`}>
                {progressPct}% of {formatCurrency(targetAmount)}
                {gap > 0 ? ` · Gap ${formatCurrency(gap)}` : ` · ${formatCurrency(-gap)} above target`}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full transition-all ${gap <= 0 ? "bg-emerald-500" : progressPct >= 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Daily Distribution — {monthName(month)} {year}
            </DialogTitle>
          </DialogHeader>

          {combined && (
            <div className="flex flex-wrap gap-2 px-1">
              <Badge variant="outline">Target: {formatCurrency(targetAmount)}</Badge>
              <Badge variant="outline" className="text-emerald-700 border-emerald-600/40 bg-emerald-500/10">
                Actuals so far: {formatCurrency(combined.actualSoFar)}
              </Badge>
              <Badge variant="outline" className="text-primary border-primary/40 bg-primary/10">
                Required from remaining days: {formatCurrency(Math.max(0, combined.remainingTarget))}
              </Badge>
              <Badge variant="outline">Projected total: {formatCurrency(combined.combinedTotal)}</Badge>
            </div>
          )}

          <div className="overflow-auto space-y-6 mt-2 pr-1">
            {perVenue.length > 1 && (
              <p className="text-[11px] text-muted-foreground px-1">
                Targets allocated by each venue's last 3-month revenue share. Within each venue, days are weighted by day-of-week median guests × avg spend.
              </p>
            )}
            {/* Per-venue tables */}
            {perVenue.map((vd) => (
              <VenueTable
                key={vd.venue}
                title={vd.venue}
                result={vd.result}
                venueTarget={vd.venueTarget}
                weightPct={vd.weightPct}
                noHistory={vd.noHistory}
              />
            ))}

            {/* Combined table — only show if more than one venue */}
            {perVenue.length > 1 && combined && (
              <CombinedTable
                rows={combined.rows}
                actualSoFar={combined.actualSoFar}
                forecastTotal={combined.forecastTotal}
                target={targetAmount}
              />
            )}
          </div>

          <DialogFooter className="border-t border-border pt-3 mt-2">
            <button onClick={() => setPreviewOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-border bg-secondary hover:bg-muted transition-colors">
              Cancel
            </button>
            <button onClick={handleApply} disabled={applying} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
              {applying ? "Applying..." : "Confirm & Save Forecasts"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ---------- Sub-components ----------

const VenueTable = ({
  title,
  result,
  venueTarget,
  weightPct,
  noHistory,
}: {
  title: string;
  result: DistributionResult;
  venueTarget: number;
  weightPct?: number;
  noHistory?: boolean;
}) => {
  const anyFallback = result.rows.some((r) => !r.isActual && r.fallback);
  return (
    <section className="rounded-lg border border-border overflow-hidden">
      <header className="bg-muted/50 px-4 py-2.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-display font-semibold">{title}</h4>
          {weightPct !== undefined && (
            <Badge variant="outline" className="text-[10px]">{weightPct}% share</Badge>
          )}
          <Badge variant="outline" className="text-[10px]">Target: {formatCurrency(Math.round(venueTarget))}</Badge>
          {noHistory && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/40 bg-amber-500/10">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />No history — 0 share
            </Badge>
          )}
          {anyFallback && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/40 bg-amber-500/10">
              <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Fallback used
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-emerald-700">Actual: <span className="font-semibold">{formatCurrency(result.actualSoFar)}</span></span>
          <span className="text-muted-foreground">·</span>
          <span className="text-primary">Forecast: <span className="font-semibold">{formatCurrency(result.forecastTotal)}</span></span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">Total: {formatCurrency(result.combinedTotal)}</span>
        </div>
      </header>
      <DistributionTable rows={result.rows} target={venueTarget} />
    </section>
  );
};

const CombinedTable = ({
  rows,
  actualSoFar,
  forecastTotal,
  target,
}: {
  rows: (DistributedDay & { venuesActual: number; venuesForecast: number })[];
  actualSoFar: number;
  forecastTotal: number;
  target: number;
}) => (
  <section className="rounded-lg border-2 border-primary/30 overflow-hidden">
    <header className="bg-primary/10 px-4 py-2.5 flex items-center justify-between border-b border-primary/30">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-display font-semibold text-primary">Combined (All Selected Venues)</h4>
        <Badge variant="outline" className="text-[10px]">Target: {formatCurrency(target)}</Badge>
      </div>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-emerald-700">Actual: <span className="font-semibold">{formatCurrency(actualSoFar)}</span></span>
        <span className="text-muted-foreground">·</span>
        <span className="text-primary">Forecast: <span className="font-semibold">{formatCurrency(forecastTotal)}</span></span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold">Total: {formatCurrency(actualSoFar + forecastTotal)}</span>
      </div>
    </header>
    <DistributionTable rows={rows} target={target} />
  </section>
);

const DistributionTable = ({ rows, target }: { rows: DistributedDay[]; target: number }) => (
  <Table>
    <TableHeader className="bg-background sticky top-0">
      <TableRow>
        <TableHead className="w-[110px]">Date</TableHead>
        <TableHead className="w-[60px]">Day</TableHead>
        <TableHead className="w-[90px]">Status</TableHead>
        <TableHead className="text-right">Guests</TableHead>
        <TableHead className="text-right">Avg Spend</TableHead>
        <TableHead className="text-right">Total Sales</TableHead>
        <TableHead className="text-right w-[90px]">% of Target</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((d) => {
        const pct = target > 0 ? (d.totalSales / target) * 100 : 0;
        const isWeekend = d.day === "Fri" || d.day === "Sat" || d.day === "Sun";
        return (
          <TableRow
            key={d.date}
            className={d.isActual ? "bg-emerald-500/5" : isWeekend ? "bg-primary/5" : ""}
          >
            <TableCell className="font-mono text-xs">{d.date}</TableCell>
            <TableCell>
              <Badge variant="outline" className={`text-[10px] ${isWeekend ? "border-primary/40 text-primary" : ""}`}>
                {d.day}
              </Badge>
            </TableCell>
            <TableCell>
              {d.isActual ? (
                <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-600/40 bg-emerald-500/10">Actual</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">Forecast</Badge>
              )}
            </TableCell>
            <TableCell className="text-right">{d.guests.toLocaleString()}</TableCell>
            <TableCell className="text-right">{formatCurrency(d.avgSpend)}</TableCell>
            <TableCell className="text-right font-medium">{formatCurrency(d.totalSales)}</TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">{pct.toFixed(1)}%</TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

export default RevenueTargetPanel;
