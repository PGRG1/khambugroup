import { useMemo, useState } from "react";
import { useVenues } from "@/hooks/useVenues";
import { useDailyProjections } from "@/hooks/useDailyProjections";
import {
  buildProjectionRows,
  formatHkd,
  parseProjectedInput,
} from "@/utils/dailyProjections";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Standalone "New Targets" page: a manager enters a daily projected total
 * sales figure and compares it against real sales. Table-first, no analytics.
 */
export default function RevenueTargetsNew() {
  const { venues, loading: venuesLoading } = useVenues();
  const activeVenues = useMemo(
    () => venues.filter((v) => v.is_active && v.id && v.name),
    [venues],
  );
  const now = new Date();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [year, month] = ym.split("-").map(Number);

  const effectiveVenueId = venueId ?? activeVenues[0]?.id ?? null;
  const { projections, actuals, history, loading, saveProjection } = useDailyProjections(
    effectiveVenueId,
    year,
    month,
  );

  const rows = useMemo(
    () => buildProjectionRows(year, month, projections, actuals, history),
    [year, month, projections, actuals, history],
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    for (let i = -12; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [now.getFullYear(), now.getMonth()]);

  const commit = async (date: string) => {
    const raw = drafts[date];
    if (raw === undefined) return;
    const parsed = parseProjectedInput(raw);
    if (!parsed.ok) {
      setRowError((p) => ({ ...p, [date]: parsed.error ?? "Invalid value" }));
      return;
    }
    setRowError((p) => {
      const next = { ...p };
      delete next[date];
      return next;
    });
    setSavingDate(date);
    const ok = await saveProjection(date, parsed.value);
    setSavingDate(null);
    if (!ok) {
      setRowError((p) => ({ ...p, [date]: "Not saved" }));
      return;
    }
    setDrafts((p) => {
      const next = { ...p };
      delete next[date];
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-t-lg border border-border bg-card/60 px-3 py-2">
        <Select
          value={effectiveVenueId ?? undefined}
          onValueChange={(v) => setVenueId(v)}
          disabled={venuesLoading || activeVenues.length === 0}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Venue" />
          </SelectTrigger>
          <SelectContent>
            {activeVenues.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ym} onValueChange={setYm}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => {
              const [y, mo] = m.split("-").map(Number);
              return (
                <SelectItem key={m} value={m}>{`${MONTH_LABELS[mo - 1]} ${y}`}</SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="-mt-3 overflow-x-auto rounded-b-lg border border-t-0 border-border">
        <table className="w-full text-xs" data-testid="new-targets-table">
          <thead className="bg-muted/40">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Day</th>
              <th className="px-3 py-2 text-right font-medium">Forecast</th>
              <th className="px-3 py-2 text-right font-medium">Actual Sales</th>
              <th className="px-3 py-2 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const draft = drafts[r.date];
              const display = draft !== undefined
                ? draft
                : r.projectedSales === null ? "" : String(r.projectedSales);
              return (
                <tr key={r.date} className="border-t border-border/60">
                  <td className="px-3 py-1.5 td-num">{r.date}</td>
                  <td className="px-3 py-1.5">{r.day}</td>
                  <td className="px-3 py-1.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {savingDate === r.date && (
                        <span className="text-[10px] text-muted-foreground">Saving…</span>
                      )}
                      {rowError[r.date] && (
                        <span className="text-[10px] text-destructive">{rowError[r.date]}</span>
                      )}
                      <Input
                        inputMode="decimal"
                        aria-label={`Projected sales ${r.date}`}
                        className="h-7 w-28 text-right td-num"
                        value={display}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.date]: e.target.value }))}
                        onBlur={() => commit(r.date)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right td-num">
                    {r.actualSales === null ? "—" : formatHkd(r.actualSales)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right td-num ${
                      r.variance === null ? "" : r.variance < 0 ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {r.variance === null ? "—" : formatHkd(r.variance)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
