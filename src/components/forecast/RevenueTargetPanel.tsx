import { useEffect, useMemo, useState } from "react";
import { Target, Save, Sparkles, AlertTriangle, Check } from "lucide-react";
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
import { computeDowMedians, distributeMonthlyTarget, DistributedDay } from "@/utils/forecastDistribution";

const ALL_VENUES = ["Assembly", "Caliente", "Hanabi", "Events"] as const;
type Venue = (typeof ALL_VENUES)[number];

interface RevenueTargetPanelProps {
  salesData: SalesRecord[];
  allForecasts: ForecastRecord[];
}

const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });

const RevenueTargetPanel = ({ salesData, allForecasts }: RevenueTargetPanelProps) => {
  const { user } = useAuth();
  const { getTarget, upsertTarget } = useRevenueTargets();
  const { addForecast, updateForecast } = useForecastData();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [selectedVenues, setSelectedVenues] = useState<Venue[]>(["Assembly", "Caliente"]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<DistributedDay[]>([]);
  const [applying, setApplying] = useState(false);

  // Sync with stored target when month/year changes
  useEffect(() => {
    const existing = getTarget(year, month);
    if (existing) {
      setTargetAmount(existing.targetAmount);
      const v = existing.venues.filter((x): x is Venue => (ALL_VENUES as readonly string[]).includes(x));
      if (v.length) setSelectedVenues(v);
    } else {
      setTargetAmount(0);
    }
  }, [year, month, getTarget]);

  const monthOptions = useMemo(() => {
    const opts: { year: number; month: number; label: string }[] = [];
    const d = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    for (let i = 0; i < 18; i++) {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      opts.push({ year: y, month: m, label: `${monthName(m)} ${y}` });
      d.setMonth(d.getMonth() + 1);
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Currently forecasted total for selected month + venues
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
    if (targetAmount <= 0) {
      toast({ title: "Enter a target amount", variant: "destructive" });
      return;
    }
    if (selectedVenues.length === 0) {
      toast({ title: "Select at least one venue", variant: "destructive" });
      return;
    }
    const ok = await upsertTarget({
      year,
      month,
      targetAmount,
      venues: selectedVenues,
      userId: user?.id,
    });
    toast({
      title: ok ? "Revenue target saved" : "Failed to save target",
      variant: ok ? "default" : "destructive",
    });
  };

  const handleGeneratePreview = () => {
    if (targetAmount <= 0) {
      toast({ title: "Enter a target amount", variant: "destructive" });
      return;
    }
    if (selectedVenues.length === 0) {
      toast({ title: "Select at least one venue", variant: "destructive" });
      return;
    }
    const medians = computeDowMedians(salesData, selectedVenues, 3);
    const distributed = distributeMonthlyTarget({ year, month, monthlyTarget: targetAmount, medians });
    setPreview(distributed);
    setPreviewOpen(true);
  };

  const handleApply = async () => {
    if (!user || preview.length === 0) return;
    setApplying(true);

    // Split each day's target across selected venues by their historical share of the day.
    // For simplicity: split evenly across venues per day.
    const venueShare = 1 / selectedVenues.length;

    let written = 0;
    let failed = 0;

    for (const day of preview) {
      for (const venue of selectedVenues) {
        if (venue === "Events") continue; // Events isn't a forecast venue
        const v = venue as "Assembly" | "Caliente" | "Hanabi";
        const guests = Math.round(day.guests * venueShare);
        const avgSpend = day.avgSpend;
        const grossSales = guests * avgSpend;
        const serviceCharge = Math.round(grossSales * 0.1);
        const totalSales = grossSales + serviceCharge;

        const existing = allForecasts.find((f) => f.date === day.date && f.venue === v);
        const payload = {
          forecastedCustomers: guests,
          forecastedAvgSpend: avgSpend,
          forecastedGrossSales: grossSales,
          forecastedServiceCharge: serviceCharge,
          forecastedTotalSales: totalSales,
        };

        if (existing) {
          const ok = await updateForecast(existing.id, payload);
          ok ? written++ : failed++;
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

    // Persist target as well
    await upsertTarget({ year, month, targetAmount, venues: selectedVenues, userId: user?.id });

    setApplying(false);
    setPreviewOpen(false);
    toast({
      title: `Applied to ${written} forecast entries`,
      description: failed > 0 ? `${failed} entries failed (check permissions)` : undefined,
      variant: failed > 0 ? "destructive" : "default",
    });
  };

  const previewTotal = preview.reduce((s, d) => s + d.totalSales, 0);
  const previewGuests = preview.reduce((s, d) => s + d.guests, 0);
  const anyFallback = preview.some((d) => d.fallback);

  return (
    <>
      <div className="card-glass rounded-xl p-5 animate-fade-in">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-display font-semibold">Monthly Revenue Target</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Distribute target across days using day-of-week medians (guests × avg spend)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Month */}
          <div className="md:col-span-3">
            <label className="text-xs text-muted-foreground block mb-1">Month</label>
            <select
              value={`${year}-${month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y);
                setMonth(m);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {monthOptions.map((o) => (
                <option key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Target */}
          <div className="md:col-span-3">
            <label className="text-xs text-muted-foreground block mb-1">Target (HK$)</label>
            <input
              type="number"
              min={0}
              step={1000}
              value={targetAmount || ""}
              placeholder="e.g. 800000"
              onChange={(e) => setTargetAmount(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Venues */}
          <div className="md:col-span-4">
            <label className="text-xs text-muted-foreground block mb-1">Responsible Venues</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_VENUES.map((v) => {
                const active = selectedVenues.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => toggleVenue(v)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                      active
                        ? "border-primary bg-primary/15 text-primary font-medium"
                        : "border-border bg-secondary text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {v}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="md:col-span-2 flex items-end gap-2">
            <button
              onClick={handleSaveTarget}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
              title="Save target"
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              onClick={handleGeneratePreview}
              className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              title="Generate daily distribution"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Distribute
            </button>
          </div>
        </div>

        {/* Progress */}
        {targetAmount > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-muted-foreground">
                Currently forecasted ({selectedVenues.join(", ") || "no venues"}):{" "}
                <span className="font-semibold text-foreground">{formatCurrency(currentlyForecasted)}</span>
              </span>
              <span
                className={`font-semibold ${
                  gap <= 0 ? "text-emerald-600" : progressPct >= 80 ? "text-amber-500" : "text-destructive"
                }`}
              >
                {progressPct}% of {formatCurrency(targetAmount)}
                {gap > 0 ? ` · Gap ${formatCurrency(gap)}` : ` · ${formatCurrency(-gap)} above target`}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full transition-all ${
                  gap <= 0 ? "bg-emerald-500" : progressPct >= 80 ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Daily Distribution Preview — {monthName(month)} {year}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-3 text-xs px-1">
            <Badge variant="outline">Target: {formatCurrency(targetAmount)}</Badge>
            <Badge variant="outline">Distributed: {formatCurrency(previewTotal)}</Badge>
            <Badge variant="outline">{previewGuests.toLocaleString()} total guests</Badge>
            <Badge variant="outline">Venues: {selectedVenues.join(", ")}</Badge>
            {anyFallback && (
              <Badge variant="outline" className="text-amber-600 border-amber-600/40 bg-amber-500/10">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Some days use fallback (no historical data)
              </Badge>
            )}
          </div>

          <div className="overflow-auto rounded-lg border border-border mt-2">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[60px]">Day</TableHead>
                  <TableHead className="text-right">Guests</TableHead>
                  <TableHead className="text-right">Avg Spend</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                  <TableHead className="text-right">% of Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((d) => {
                  const pct = targetAmount > 0 ? (d.totalSales / targetAmount) * 100 : 0;
                  const isWeekend = d.day === "Fri" || d.day === "Sat" || d.day === "Sun";
                  return (
                    <TableRow key={d.date} className={isWeekend ? "bg-primary/5" : ""}>
                      <TableCell className="font-mono text-xs">{d.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${isWeekend ? "border-primary/40 text-primary" : ""}`}>
                          {d.day}
                        </Badge>
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
          </div>

          <p className="text-[11px] text-muted-foreground px-1">
            Each day's sales target = scaled (median guests × median avg spend) for that weekday so monthly total matches target.
            Applying will create or overwrite <span className="font-medium">draft</span> forecasts for{" "}
            {selectedVenues.filter((v) => v !== "Events").join(", ")} — Events excluded from forecast writes.
          </p>

          <DialogFooter>
            <button
              onClick={() => setPreviewOpen(false)}
              className="px-4 py-2 text-sm rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {applying ? "Applying..." : "Confirm & Save Forecasts"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RevenueTargetPanel;
