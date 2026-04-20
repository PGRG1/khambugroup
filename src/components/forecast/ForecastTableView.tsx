import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Camera, Copy, Check } from "lucide-react";
import { ForecastWithActuals } from "@/types/forecast";
import { formatCurrency } from "@/utils/salesUtils";
import { toast } from "@/hooks/use-toast";

interface ForecastTableViewProps {
  data: ForecastWithActuals[];
  venueName: string;
}

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const fmtDateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
};

const ForecastTableView = ({ data, venueName }: ForecastTableViewProps) => {
  const tableRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Default range = full data range
  const allDates = useMemo(() => data.map((d) => d.date).sort(), [data]);
  const defaultFrom = allDates[0] ?? "";
  const defaultTo = allDates[allDates.length - 1] ?? "";

  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>(defaultTo);

  // Keep range synced if data range changes (when parent filter changes)
  useMemo(() => {
    if (defaultFrom && (from < defaultFrom || from > defaultTo)) setFrom(defaultFrom);
    if (defaultTo && (to > defaultTo || to < defaultFrom)) setTo(defaultTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultFrom, defaultTo]);

  const filtered = useMemo(() => {
    return data
      .filter((d) => {
        if (from && d.date < from) return false;
        if (to && d.date > to) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data, from, to]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.fcstSales += r.forecastedTotalSales || 0;
        acc.actSales += r.actualTotalSales || 0;
        acc.fcstCust += r.forecastedCustomers || 0;
        acc.actCust += r.actualCustomers || 0;
        if (r.actualTotalSales !== null) acc.actDays += 1;
        return acc;
      },
      { fcstSales: 0, actSales: 0, fcstCust: 0, actCust: 0, actDays: 0 }
    );
  }, [filtered]);

  const variance = totals.actSales - totals.fcstSales;

  const setQuickRange = (preset: "today" | "week" | "month" | "all") => {
    const now = new Date();
    if (preset === "today") {
      const t = toISO(now);
      setFrom(t);
      setTo(t);
    } else if (preset === "week") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      setFrom(toISO(start));
      setTo(toISO(end));
    } else if (preset === "month") {
      setFrom(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else {
      setFrom(defaultFrom);
      setTo(defaultTo);
    }
  };

  const exportPng = async () => {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toPng(tableRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `${venueName}_forecast_${from}_to_${to}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Image downloaded" });
    } catch (e) {
      toast({ title: "Export failed", variant: "destructive" });
    }
  };

  const copyPng = async () => {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toPng(tableRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Image copied to clipboard" });
    } catch (e) {
      toast({ title: "Copy failed — try Download instead", variant: "destructive" });
    }
  };

  return (
    <div className="card-glass rounded-xl p-5 space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
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
        <div className="flex gap-2">
          <button
            onClick={copyPng}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-secondary hover:bg-muted transition-colors"
            title="Copy table as image to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={exportPng}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            title="Download table as PNG"
          >
            <Camera className="h-3.5 w-3.5" />
            Download PNG
          </button>
        </div>
      </div>

      {/* Captured area */}
      <div ref={tableRef} className="bg-card rounded-lg border border-border/60 overflow-hidden">
        {/* Branded header (visible in screenshot) */}
        <div className="px-5 py-3 border-b border-border/60 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Forecast Plan</div>
              <h3 className="text-lg font-display font-semibold text-foreground">
                {venueName} <span className="text-muted-foreground font-normal">— Targets vs Actuals</span>
              </h3>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</div>
              <div className="text-sm font-medium text-foreground">
                {from ? fmtDateLabel(from) : "—"} → {to ? fmtDateLabel(to) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-2 py-2.5 font-medium">Day</th>
                <th className="text-right px-2 py-2.5 font-medium">Fcst Sales</th>
                <th className="text-right px-2 py-2.5 font-medium">Actual Sales</th>
                <th className="text-right px-2 py-2.5 font-medium">Variance</th>
                <th className="text-right px-2 py-2.5 font-medium">Fcst Guests</th>
                <th className="text-right px-2 py-2.5 font-medium">Actual Guests</th>
                <th className="text-left px-4 py-2.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                    No forecast rows in this date range.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const v = r.totalSalesVariance;
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border/40 ${idx % 2 === 1 ? "bg-muted/20" : ""}`}
                    >
                      <td className="px-4 py-2 font-medium text-foreground whitespace-nowrap">{fmtDateLabel(r.date)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{r.day}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{formatCurrency(r.forecastedTotalSales)}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {r.actualTotalSales !== null ? formatCurrency(r.actualTotalSales) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono tabular-nums font-medium ${v === null ? "text-muted-foreground" : v >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {v === null ? "—" : `${v >= 0 ? "+" : ""}${formatCurrency(v)}`}
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">{r.forecastedCustomers}</td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums">
                        {r.actualCustomers !== null ? r.actualCustomers : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[260px] truncate" title={r.forecastNotes || r.postEventNotes || ""}>
                        {r.forecastNotes || r.postEventNotes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-primary/5 font-semibold">
                  <td className="px-4 py-2.5 text-foreground" colSpan={2}>
                    Total ({filtered.length} day{filtered.length !== 1 ? "s" : ""})
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{formatCurrency(totals.fcstSales)}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {totals.actDays > 0 ? formatCurrency(totals.actSales) : <span className="text-muted-foreground font-normal">—</span>}
                  </td>
                  <td className={`px-2 py-2.5 text-right font-mono tabular-nums ${totals.actDays === 0 ? "text-muted-foreground" : variance >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {totals.actDays === 0 ? "—" : `${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                  </td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{totals.fcstCust}</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                    {totals.actDays > 0 ? totals.actCust : <span className="text-muted-foreground font-normal">—</span>}
                  </td>
                  <td className="px-4 py-2.5"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer caption (visible in screenshot) */}
        <div className="px-5 py-2 border-t border-border/60 bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>KHAMBU · {venueName} Forecast</span>
          <span>Generated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>
    </div>
  );
};

export default ForecastTableView;
