import { useMemo, useState } from "react";
import { useVenues } from "@/hooks/useVenues";
import { useDailyProjections } from "@/hooks/useDailyProjections";
import {
  buildProjectionRows,
  formatForecastNumber,
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
          <SelectTrigger className="h-8 w-[180px] text-[13px] leading-5">
            <SelectValue placeholder="Venue" />
          </SelectTrigger>
          <SelectContent>
            {activeVenues.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ym} onValueChange={setYm}>
          <SelectTrigger className="h-8 w-[160px] text-[13px] leading-5">
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

        {loading && <span className="text-[13px] leading-5 text-muted-foreground">Loading…</span>}
      </div>

      <div className="-mt-3 overflow-x-auto rounded-b-lg border border-t-0 border-border">
        <table className="w-full min-w-[820px] table-fixed" data-testid="new-targets-table">
          <colgroup>
            <col className="w-[130px]" />
            <col className="w-[90px]" />
            <col className="w-[260px]" />
            <col className="w-[170px]" />
            <col className="w-[170px]" />
          </colgroup>
          <thead className="bg-muted/40">
            <tr className="h-9 text-left text-xs leading-4 text-muted-foreground">
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
              const effective = r.effectiveForecast;
              const display = draft !== undefined
                ? draft
                : effective === null
                  ? ""
                  : formatForecastNumber(effective);
              return (
                <tr key={r.date} className="h-[42px] border-t border-border/60 text-[13px] font-normal leading-5">
                  <td className="whitespace-nowrap px-3 py-1 td-num tabular-nums">{r.date}</td>
                  <td className="whitespace-nowrap px-3 py-1">{r.day}</td>
                  <td className="px-3 py-1 text-right tabular-nums">
                    <div className="flex h-8 items-center justify-end gap-2">
                      <span
                        className={`w-[62px] truncate text-right text-[10px] leading-4 ${rowError[r.date] ? "text-destructive" : "text-muted-foreground"}`}
                        title={rowError[r.date]}
                      >
                        {rowError[r.date] ?? (savingDate === r.date ? "Saving…" : "")}
                      </span>
                      {r.forecastSource === "none" ? (
                        <span className="flex h-5 min-w-[54px] items-center justify-end whitespace-nowrap text-[10px] leading-4 text-muted-foreground">
                          Not enough data
                        </span>
                      ) : (
                        <span className="flex h-5 min-w-[54px] items-center justify-center rounded border border-border/60 px-1.5 text-[10px] font-normal leading-4 text-muted-foreground">
                          {r.forecastSource === "manager" ? "Manager" : "Auto"}
                        </span>
                      )}
                      <Input
                        inputMode="decimal"
                        aria-label={`Forecast ${r.date}`}
                        className="h-8 w-[132px] shrink-0 px-2 text-right text-[13px] font-normal leading-5 td-num tabular-nums md:text-[13px]"
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
                  <td className="whitespace-nowrap px-3 py-1 text-right font-normal td-num tabular-nums">
                    {r.actualSales === null ? "—" : formatHkd(r.actualSales)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-3 py-1 text-right font-normal td-num tabular-nums ${
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
