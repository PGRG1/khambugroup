import { useMemo, useRef, useState, useEffect } from "react";
import { toPng } from "html-to-image";
import { Camera, Copy, Check, AlertTriangle } from "lucide-react";
import { SalesRecord } from "@/types/sales";
import { formatCurrency } from "@/utils/salesUtils";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  buildForecastTableData,
  ForecastTableRow,
  ForecastVenue,
} from "@/utils/forecastTableData";

interface ForecastTableViewProps {
  salesData: SalesRecord[];
  monthlyTarget: number;
  allVenues: ForecastVenue[];
  targetVenues?: ForecastVenue[];
  defaultVenue?: ForecastVenue;
  defaultVenues?: ForecastVenue[];
  initialYear?: number;
  initialMonth?: number;
}

const fmtDateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
};

const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });

const sameSet = (a: ForecastVenue[], b: ForecastVenue[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

const ForecastTableView = ({
  salesData,
  monthlyTarget,
  targetVenues,
  defaultVenue,
  defaultVenues,
  initialYear,
  initialMonth,
}: ForecastTableViewProps) => {
  const today = new Date();
  const [year, setYear] = useState(initialYear ?? today.getFullYear());
  const [month, setMonth] = useState(initialMonth ?? today.getMonth() + 1);
  const [selectedVenues, setSelectedVenues] = useState<ForecastVenue[]>(
    defaultVenues && defaultVenues.length > 0
      ? defaultVenues
      : defaultVenue
      ? [defaultVenue]
      : ALL_VENUES,
  );
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const monthOptions = useMemo(() => {
    const opts: { y: number; m: number; label: string }[] = [];
    const d = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    for (let i = 0; i < 18; i++) {
      opts.push({ y: d.getFullYear(), m: d.getMonth() + 1, label: `${monthName(d.getMonth() + 1)} ${d.getFullYear()}` });
      d.setMonth(d.getMonth() + 1);
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Order venues canonically (so labels are stable)
  const orderedSelection = useMemo(
    () => ALL_VENUES.filter((v) => selectedVenues.includes(v)),
    [selectedVenues],
  );

  const effectiveTargetVenues = useMemo<ForecastVenue[]>(
    () => (targetVenues && targetVenues.length > 0 ? targetVenues : ALL_VENUES),
    [targetVenues],
  );

  const data = useMemo(
    () =>
      buildForecastTableData({
        year,
        month,
        venues: orderedSelection,
        salesData,
        monthlyTarget,
        targetVenues: effectiveTargetVenues,
      }),
    [year, month, salesData, monthlyTarget, orderedSelection, effectiveTargetVenues],
  );

  useEffect(() => {
    setFrom("");
    setTo("");
  }, [year, month]);

  const filteredRows = useMemo(
    () =>
      data.rows.filter((r) => {
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
        return true;
      }),
    [data.rows, from, to],
  );

  const setQuickRange = (preset: "today" | "week" | "month" | "all") => {
    if (preset === "all") {
      setFrom(""); setTo(""); return;
    }
    const t = new Date();
    const iso = (d: Date) => {
      const y = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${mm}-${dd}`;
    };
    if (preset === "today") {
      const v = iso(t); setFrom(v); setTo(v);
    } else if (preset === "week") {
      const start = new Date(t); start.setDate(t.getDate() - t.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 6);
      setFrom(iso(start)); setTo(iso(end));
    } else {
      setFrom(iso(new Date(year, month - 1, 1)));
      setTo(iso(new Date(year, month, 0)));
    }
  };

  const toggleVenue = (v: ForecastVenue) => {
    setSelectedVenues((prev) => {
      if (prev.includes(v)) {
        // don't allow deselecting the last one
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== v);
      }
      return [...prev, v];
    });
  };

  const isAllSelected = sameSet(orderedSelection, ALL_VENUES);

  const titleLabel = isAllSelected
    ? "All Venues"
    : orderedSelection.join(" + ");

  return (
    <div className="card-glass rounded-xl p-5 space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">Month</label>
            <select
              value={`${year}-${month}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split("-").map(Number);
                setYear(y); setMonth(m);
              }}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {monthOptions.map((o) => (
                <option key={`${o.y}-${o.m}`} value={`${o.y}-${o.m}`}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-1">
            {(["today", "week", "month", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setQuickRange(p)}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-border bg-secondary hover:bg-muted transition-colors capitalize"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Venue multi-select chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setSelectedVenues(ALL_VENUES)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
              isAllSelected
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-secondary text-muted-foreground hover:bg-muted"
            }`}
          >
            All Venues
          </button>
          <span className="mx-1 text-muted-foreground/50 text-xs">|</span>
          {ALL_VENUES.map((v) => {
            const active = selectedVenues.includes(v);
            return (
              <button
                key={v}
                onClick={() => toggleVenue(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  active && !isAllSelected
                    ? "border-primary bg-primary/15 text-primary"
                    : active && isAllSelected
                    ? "border-border bg-secondary text-foreground hover:bg-muted"
                    : "border-border bg-secondary text-muted-foreground hover:bg-muted"
                }`}
              >
                {v}
              </button>
            );
          })}
          <span className="ml-2 text-[11px] text-muted-foreground">
            Tip: click multiple venues to combine them
          </span>
        </div>
      </div>

      {monthlyTarget <= 0 && (
        <div className="flex items-center gap-2 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-600/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          No revenue target set for {monthName(month)} {year}. Set a target in the Monthly Revenue Target panel above to see distributed forecasts.
        </div>
      )}

      {monthlyTarget > 0 && data.unallocatedVenues.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-600/30 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5" />
          Target set for {effectiveTargetVenues.join(" + ")} — {data.unallocatedVenues.join(", ")} {data.unallocatedVenues.length === 1 ? "has" : "have"} no allocated target.
        </div>
      )}

      <ScreenshotTable
        title={titleLabel}
        rows={filteredRows}
        venueTarget={data.scopedTarget}
        flatSpend={data.flatSpend}
        noHistory={!data.hasHistory && monthlyTarget > 0}
        month={month}
        year={year}
        from={from}
        to={to}
      />

    </div>
  );
};

// ---------- Screenshot-friendly table ----------

interface ScreenshotTableProps {
  title: string;
  rows: ForecastTableRow[];
  venueTarget: number;
  flatSpend: number;
  noHistory?: boolean;
  month: number;
  year: number;
  from: string;
  to: string;
}

const ScreenshotTable = ({ title, rows, venueTarget, flatSpend, noHistory, month, year, from, to }: ScreenshotTableProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (r.isActual) {
          acc.actualGuests += r.guests;
          acc.actualSales += r.totalSales;
        } else {
          acc.fcstGuests += r.guests;
          acc.fcstSales += r.totalSales;
        }
        return acc;
      },
      { fcstGuests: 0, fcstSales: 0, actualGuests: 0, actualSales: 0 },
    );
  }, [rows]);

  const variance = totals.actualSales - totals.fcstSales;

  const exportPng = async () => {
    if (!ref.current) return;
    try {
      const dataUrl = await toPng(ref.current, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
      const link = document.createElement("a");
      const range = from && to ? `_${from}_to_${to}` : "";
      link.download = `${title.replace(/\s+/g, "_")}_forecast_${year}-${String(month).padStart(2, "0")}${range}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Image downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const copyPng = async () => {
    if (!ref.current) return;
    try {
      const dataUrl = await toPng(ref.current, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Image copied to clipboard" });
    } catch {
      toast({ title: "Copy failed — try Download instead", variant: "destructive" });
    }
  };

  const monthLabel = `${new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long" })} ${year}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <button onClick={copyPng} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary hover:bg-muted transition-colors">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={exportPng} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Camera className="h-3.5 w-3.5" /> Download PNG
        </button>
      </div>

      <div ref={ref} className="bg-card rounded-lg border border-border/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Forecast Plan</div>
              <h3 className="text-lg font-display font-semibold text-foreground">
                {title} <span className="text-muted-foreground font-normal">— {monthLabel}</span>
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {flatSpend > 0 && (
                <Badge variant="outline" className="text-[10px]">Avg Spend Target: {formatCurrency(flatSpend)}/guest</Badge>
              )}
              {venueTarget > 0 && (
                <Badge variant="outline" className="text-[10px]">Target: {formatCurrency(Math.round(venueTarget))}</Badge>
              )}
              {noHistory && (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-600/40 bg-amber-500/10">
                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />No history
                </Badge>
              )}
              {from && to && (
                <Badge variant="outline" className="text-[10px]">
                  {fmtDateLabel(from)} → {fmtDateLabel(to)}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-2 py-2.5 font-medium">Day</th>
                <th className="text-left px-2 py-2.5 font-medium">Status</th>
                <th className="text-right px-2 py-2.5 font-medium border-l border-border/40">Fcst/Tgt Guests</th>
                <th className="text-right px-2 py-2.5 font-medium">AVG SPEND/GUEST TGT</th>
                <th className="text-right px-2 py-2.5 font-medium">Fcst Sales</th>
                <th className="text-right px-2 py-2.5 font-medium border-l border-border/40">Act Guests</th>
                <th className="text-right px-2 py-2.5 font-medium">Act Spend</th>
                <th className="text-right px-2 py-2.5 font-medium">Act Sales</th>
                <th className="text-right px-2 py-2.5 font-medium border-l border-border/40">Variance</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                    No rows in this date range.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => {
                  const variance = r.isActual ? r.totalSales - (r.targetSpend * r.guests * 1.1) : null;
                  return (
                    <tr key={r.date} className={`border-t border-border/40 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}>
                      <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{fmtDateLabel(r.date)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.day}</td>
                      <td className="px-2 py-2">
                        {r.isActual ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-700 bg-emerald-500/10 border border-emerald-600/30">Actual</span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-primary bg-primary/10 border border-primary/30">Forecast</span>
                        )}
                      </td>
                      {/* Forecast group */}
                      <td className="px-2 py-2 text-right font-mono tabular-nums border-l border-border/40">
                        {r.isActual ? <span className="text-muted-foreground">—</span> : r.guests}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {r.targetSpend > 0 ? formatCurrency(r.targetSpend) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                        {r.isActual ? <span className="text-muted-foreground">—</span> : formatCurrency(r.totalSales)}
                      </td>
                      {/* Actual group */}
                      <td className="px-2 py-2 text-right font-mono tabular-nums border-l border-border/40">
                        {r.isActual ? r.guests : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {r.isActual && r.avgSpend > 0 ? formatCurrency(r.avgSpend) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums font-medium">
                        {r.isActual ? formatCurrency(r.totalSales) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono tabular-nums border-l border-border/40 ${
                        variance === null ? "text-muted-foreground" : variance >= 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"
                      }`}>
                        {variance === null ? "—" : `${variance >= 0 ? "+" : ""}${formatCurrency(Math.round(variance))}`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-primary/5 font-semibold">
                  <td className="px-4 py-2.5 text-foreground" colSpan={3}>
                    Total ({rows.length} day{rows.length !== 1 ? "s" : ""})
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums border-l border-border/40">{totals.fcstGuests || "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{flatSpend > 0 ? formatCurrency(flatSpend) : "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{formatCurrency(totals.fcstSales)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums border-l border-border/40">{totals.actualGuests || "—"}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {totals.actualGuests > 0 ? formatCurrency(Math.round(totals.actualSales / 1.1 / totals.actualGuests)) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {totals.actualSales > 0 ? formatCurrency(totals.actualSales) : "—"}
                  </td>
                  <td className={`px-2 py-2.5 text-right font-mono tabular-nums border-l border-border/40 ${
                    totals.actualSales === 0 ? "text-muted-foreground" : variance >= 0 ? "text-emerald-600" : "text-red-500"
                  }`}>
                    {totals.actualSales === 0 ? "—" : `${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="px-5 py-2 border-t border-border/60 bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>KHAMBU · {title} Forecast</span>
          <span>Generated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>
    </div>
  );
};

export default ForecastTableView;
