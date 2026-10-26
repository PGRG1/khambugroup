import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useScopedProjections } from "@/hooks/useScopedProjections";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { useDailyProjections } from "@/hooks/useDailyProjections";
import {
  buildProjectionRows,
  distributeMonthlyTarget,
  formatForecastNumber,
  formatHkd,
  monthDates,
  parseProjectedInput,
  summarizeTargets,
} from "@/utils/dailyProjections";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const shortHkd = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `HK$ ${(v / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `HK$ ${Math.round(v / 1_000)}k`;
  return `HK$ ${Math.round(v)}`;
};

/** Unified Targets page: monthly goal, pacing, chart and a light daily table. */
export default function RevenueTargetsNew() {
  const vs = useVenueScope();
  // Viewing follows the shared venue scope; editing needs exactly one venue.
  const scopeVenues = useMemo(() => vs.selectedVenues.filter((v) => v.is_active && v.id && v.name), [vs.selectedVenues]);
  const singleScope = scopeVenues.length === 1 ? scopeVenues[0] : null;
  const venuesLoading = !vs.ready;
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [venueId, setVenueId] = useState<string | null>(null);
  const [ym, setYm] = useState(todayIso.slice(0, 7));
  const [year, month] = ym.split("-").map(Number);

  // The venue a target is saved to: the single scoped venue, or the one picked in the target box.
  const effectiveVenueId = singleScope?.id ?? (venueId && vs.venues.some((v) => v.id === venueId) ? venueId : null);
  const { projections, actuals, history, loading: editLoading, saveProjection } = useDailyProjections(effectiveVenueId, year, month);
  const scopeIds = useMemo(() => scopeVenues.map((v) => v.id), [scopeVenues]);
  const scoped = useScopedProjections(scopeIds, year, month, !singleScope);
  const singleRows = useMemo(
    () => buildProjectionRows(year, month, projections, actuals, history),
    [year, month, projections, actuals, history],
  );
  const rows = singleScope ? singleRows : scoped.rows;
  const loading = singleScope ? editLoading : scoped.loading;
  const summary = useMemo(() => summarizeTargets(rows, todayIso), [rows, todayIso]);

  const [goal, setGoal] = useState("");
  const [applying, setApplying] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const monthOptions = useMemo(() => {
    const out: string[] = [];
    for (let i = -12; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return out;
  }, [now.getFullYear(), now.getMonth()]);

  const chartData = useMemo(() => {
    let t = 0;
    let a = 0;
    return rows.map((r) => {
      t += r.effectiveForecast ?? 0;
      if (r.actualSales !== null) a += r.actualSales;
      return { day: Number(r.date.slice(8)), target: t, actual: r.actualSales !== null || r.date <= todayIso ? a : null };
    });
  }, [rows, todayIso]);

  const applyGoal = async () => {
    const parsed = parseProjectedInput(goal);
    if (!parsed.ok || parsed.value === null) {
      toast({ title: "Enter a monthly target", description: parsed.error, variant: "destructive" });
      return;
    }
    if (!effectiveVenueId) {
      toast({ title: "Pick a venue", description: "A target is always saved to one venue.", variant: "destructive" });
      return;
    }
    setApplying(true);
    const split = distributeMonthlyTarget(parsed.value, monthDates(year, month), history);
    let failed = 0;
    for (const [date, v] of split) if (!(await saveProjection(date, v))) failed++;
    setApplying(false);
    if (failed) toast({ title: "Some days were not saved", description: `${failed} day(s) failed. Try again.`, variant: "destructive" });
    else { toast({ title: "Monthly target set", description: `${formatHkd(parsed.value)} spread across ${split.size} days.` }); setGoal(""); }
    if (!singleScope) scoped.reload();
  };

  const commit = async (date: string) => {
    setEditing(null);
    if (!singleScope) return;
    const raw = drafts[date];
    if (raw === undefined) return;
    const parsed = parseProjectedInput(raw);
    if (!parsed.ok) { setRowError((p) => ({ ...p, [date]: parsed.error ?? "Invalid" })); return; }
    const ok = await saveProjection(date, parsed.value);
    setRowError((p) => { const n = { ...p }; if (ok) delete n[date]; else n[date] = "Not saved"; return n; });
    if (ok) setDrafts((p) => { const n = { ...p }; delete n[date]; return n; });
  };

  const pct = summary.target > 0 ? (summary.actual / summary.target) * 100 : null;
  const kpis = [
    { label: "Monthly target", value: summary.target > 0 ? formatHkd(summary.target) : "—", sub: `${MONTH_LABELS[month - 1]} ${year}` },
    { label: "Sold so far", value: formatHkd(summary.actual), sub: pct === null ? "No target yet" : `${pct.toFixed(1)}% of target` },
    {
      label: "Ahead or behind",
      value: summary.targetToDate > 0 ? `${summary.pace >= 0 ? "+" : ""}${formatHkd(summary.pace)}` : "—",
      sub: summary.targetToDate > 0 ? (summary.pace >= 0 ? "Ahead of target" : "Behind target") : "No sales yet",
      tone: summary.targetToDate > 0 ? (summary.pace >= 0 ? "text-primary" : "text-destructive") : "",
    },
    {
      label: "Needed per day",
      value: summary.runRateNeeded === null ? "—" : formatHkd(summary.runRateNeeded),
      sub: summary.remainingDays > 0 ? `${summary.remainingDays} days left` : "Month finished",
    },
  ];

  return (
    <div className="space-y-4">
      <RevenuePageTop
        title="Targets"
        period={
          <div className="flex items-center gap-3">
            <span id="targets-period" className="text-[12px] font-medium text-muted-foreground">Period</span>
            <Select value={ym} onValueChange={setYm}>
              <SelectTrigger aria-labelledby="targets-period" className="h-10 w-[170px] text-sm"><SelectValue placeholder="Month" /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => {
                  const [y, mo] = m.split("-").map(Number);
                  return <SelectItem key={m} value={m}>{`${MONTH_LABELS[mo - 1]} ${y}`}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {loading && <span className="text-[12px] text-muted-foreground">Loading…</span>}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card-glass min-w-0 rounded-xl p-3">
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
            <p className={`truncate text-base font-semibold td-num tabular-nums sm:text-lg ${k.tone ?? ""}`}>{k.value}</p>
            <p className="truncate text-[11px] text-muted-foreground">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="card-glass rounded-xl p-3">
        <p className="text-[13px] font-medium">Set the monthly target</p>
        <p className="mb-2 text-[12px] text-muted-foreground">
          {singleScope
            ? `Saved to ${singleScope.name}. Bani spreads it across the days using this venue's usual weekday pattern. You can still adjust any single day below.`
            : "A target belongs to one venue. Pick the venue first, then Bani spreads it across the days using that venue's usual weekday pattern."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!singleScope && (
            <Select value={effectiveVenueId ?? undefined} onValueChange={setVenueId} disabled={venuesLoading || vs.venues.length === 0}>
              <SelectTrigger aria-label="Venue" aria-required="true" className="h-9 w-[180px] text-[13px]"><SelectValue placeholder="Venue (required)" /></SelectTrigger>
              <SelectContent>
                {vs.venues.filter((v) => v.id && v.name).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input
            inputMode="decimal"
            placeholder="e.g. 850,000"
            aria-label="Monthly target"
            className="h-9 w-[180px] text-right td-num"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyGoal(); }}
          />
          <Button size="sm" className="h-9" onClick={applyGoal} disabled={applying || !effectiveVenueId || !goal.trim()}>
            {applying ? "Setting…" : "Set target"}
          </Button>
        </div>
      </div>

      <div className="card-glass rounded-xl p-3">
        <p className="mb-2 text-[13px] font-medium">Target and sales, day by day so far</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={shortHkd} tickLine={false} axisLine={false} fontSize={11} width={64} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number, n: string) => [formatHkd(v), n === "target" ? "Target" : "Actual"]} labelFormatter={(d) => `Day ${d}`} />
              <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="actual" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!singleScope && (
        <p className="text-[12px] text-muted-foreground">Pick one venue in the top bar to adjust single days.</p>
      )}
      <div className="card-glass overflow-x-auto rounded-xl">
        <table className="w-full min-w-[520px] text-[13px]" data-testid="new-targets-table">
          <thead>
            <tr className="h-9 text-left text-[11px] text-muted-foreground">
              <th className="px-3 font-medium">Date</th>
              <th className="px-3 text-right font-medium">Target</th>
              <th className="px-3 text-right font-medium">Sold</th>
              <th className="px-3 text-right font-medium">Difference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editing === r.date;
              return (
                <tr key={r.date} className="h-10">
                  <td className="whitespace-nowrap px-3 td-num"><span className="text-muted-foreground">{r.day}</span> {r.date.slice(8)}</td>
                  <td className="px-3 text-right td-num tabular-nums">
                    {!singleScope ? (
                      r.effectiveForecast === null ? <span className="text-muted-foreground">—</span> : formatHkd(r.effectiveForecast)
                    ) : isEditing ? (
                      <Input
                        autoFocus
                        inputMode="decimal"
                        aria-label={`Target ${r.date}`}
                        className="ml-auto h-8 w-[130px] text-right td-num"
                        value={drafts[r.date] ?? formatForecastNumber(r.effectiveForecast)}
                        onChange={(e) => setDrafts((p) => ({ ...p, [r.date]: e.target.value }))}
                        onBlur={() => commit(r.date)}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      />
                    ) : (
                      <button className="rounded px-1 hover:bg-muted/60" onClick={() => setEditing(r.date)} title="Adjust this day">
                        {r.effectiveForecast === null ? <span className="text-muted-foreground">Set</span> : formatHkd(r.effectiveForecast)}
                      </button>
                    )}
                    {rowError[r.date] && <p className="text-[10px] text-destructive">{rowError[r.date]}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 text-right td-num tabular-nums">{r.actualSales === null ? "—" : formatHkd(r.actualSales)}</td>
                  <td className={`whitespace-nowrap px-3 text-right td-num tabular-nums ${r.variance === null ? "text-muted-foreground" : r.variance < 0 ? "text-destructive" : "text-primary"}`}>
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
