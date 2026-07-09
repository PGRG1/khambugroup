import { useEffect, useMemo, useRef, useState } from "react";
import { useKpiCards, useKpiTargets, useKpiActuals } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { computeRecovery, RECOVERY_STATUS_TONE, type DowBaselines } from "@/utils/kpiRecovery";
import { computeAutoActualRange, isAutoKpiType, type AutoKpiType } from "@/utils/kpiAutoActual";
import { toneTile, toneTileLabel, toneText, asTone, type Tone } from "@/components/kpi/toneStyles";
import { cn } from "@/lib/utils";

const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL = "__all__";

function fmt(v: number | null, unit: string) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (unit === "currency") return `HK$ ${Math.round(v).toLocaleString()}`;
  if (unit === "percent") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}
function thisMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function KpiPlanner() {
  const { cards } = useKpiCards();
  const { targets } = useKpiTargets();
  const { actuals } = useKpiActuals();
  const { venues } = useVenues();

  const [cardId, setCardId] = useState<string>("");
  const [venueId, setVenueId] = useState<string>(ALL);
  const [yyyymm, setYyyymm] = useState<string>(thisMonthStr());
  const [autoActuals, setAutoActuals] = useState<Record<string, number>>({});

  const activeCards = useMemo(() => cards.filter(c => c.active), [cards]);
  useEffect(() => { if (!cardId && activeCards[0]) setCardId(activeCards[0].id); }, [activeCards, cardId]);

  const card = activeCards.find(c => c.id === cardId);
  const venueIdNorm = venueId === ALL ? null : venueId;
  const venueName = venueIdNorm ? venues.find(v => v.id === venueIdNorm)?.name ?? null : null;

  const monthlyTarget = useMemo(() => {
    if (!card) return 0;
    const t = targets.find(t =>
      t.active && t.kpi_card_id === card.id && (t.venue_id ?? null) === venueIdNorm && t.target_period === "month",
    );
    return t?.target_value ?? 0;
  }, [card, targets, venueIdNorm]);

  const { dowBaselines, defaultBaseline } = useMemo(() => {
    const dow: DowBaselines = {};
    let def = 0;
    if (card) {
      for (const t of targets) {
        if (!t.active || t.kpi_card_id !== card.id) continue;
        if ((t.venue_id ?? null) !== venueIdNorm) continue;
        if (t.target_period !== "day") continue;
        if (t.day_of_week !== null && t.day_of_week !== undefined) dow[t.day_of_week] = t.target_value;
        else def = t.target_value;
      }
    }
    return { dowBaselines: dow, defaultBaseline: def };
  }, [card, targets, venueIdNorm]);

  const [y, m] = yyyymm.split("-").map(Number);
  const monthStart = `${yyyymm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${yyyymm}-${String(lastDay).padStart(2, "0")}`;
  const todayStr = (() => {
    const t = new Date();
    if (t.getFullYear() === y && t.getMonth() === m - 1) {
      return `${yyyymm}-${String(t.getDate()).padStart(2, "0")}`;
    }
    return monthEnd;
  })();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!card || !isAutoKpiType(card.kpi_type)) { setAutoActuals({}); return; }
      try {
        const map = await computeAutoActualRange(card.kpi_type as AutoKpiType, venueName, monthStart, monthEnd);
        if (!cancelled) setAutoActuals(map);
      } catch { if (!cancelled) setAutoActuals({}); }
    })();
    return () => { cancelled = true; };
  }, [card?.id, card?.kpi_type, venueName, monthStart, monthEnd]);

  const actualsByDate = useMemo(() => {
    const map: Record<string, number> = { ...autoActuals };
    for (const a of actuals) {
      if (!card || a.kpi_card_id !== card.id) continue;
      if ((a.venue_id ?? null) !== venueIdNorm) continue;
      if (a.period_date < monthStart || a.period_date > monthEnd) continue;
      map[a.period_date] = a.actual_value;
    }
    return map;
  }, [autoActuals, actuals, card, venueIdNorm, monthStart, monthEnd]);

  const recovery = useMemo(() => {
    if (!card || monthlyTarget <= 0 || (defaultBaseline <= 0 && Object.keys(dowBaselines).length === 0)) return null;
    return computeRecovery({
      monthlyTarget, dowBaselines, defaultBaseline,
      actualsByDate, today: todayStr,
    });
  }, [card, monthlyTarget, dowBaselines, defaultBaseline, actualsByDate, todayStr]);

  const unit = card?.unit ?? "currency";

  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  const todayRowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (recovery && todayRowRef.current) {
      todayRowRef.current.scrollIntoView({ behavior: "auto", block: "center" });
    }
  }, [recovery?.remainingTradingDays, cardId, venueId, yyyymm]);

  const perDayRequired = recovery && recovery.remainingTradingDays > 0
    ? Math.max(0, recovery.monthlyTarget - recovery.mtdActual) / recovery.remainingTradingDays
    : 0;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold font-display tracking-tight">KPI Planner</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Monthly target drives daily minimums. Minimums rise when behind, but never relax below the original baseline.
        </p>
      </header>

      <Card className="p-3 sm:p-4 card-glass border-border/60">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">KPI</Label>
            <Select value={cardId} onValueChange={setCardId}>
              <SelectTrigger className="w-full h-10"><SelectValue placeholder="Select KPI" /></SelectTrigger>
              <SelectContent>
                {activeCards.map(c => <SelectItem key={c.id} value={c.id}>{c.kpi_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Venue</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All Venues</SelectItem>
                {venues.filter(v => v.is_active).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Month</Label>
            <Select value={yyyymm} onValueChange={setYyyymm}>
              <SelectTrigger className="w-full h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {!recovery && (
        <Card className="p-8 text-center text-muted-foreground card-glass border-border/60">
          Set a <strong>monthly</strong> target and at least one <strong>daily</strong> baseline for this KPI on the KPI Targets page.
        </Card>
      )}

      {recovery && (
        <>
          {/* Plain-language verdict */}
          <div className="rounded-lg border border-primary/25 bg-primary/[0.05] px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">You need </span>
            <span className="font-semibold tabular-nums text-foreground">{fmt(perDayRequired, unit)}</span>
            <span className="text-muted-foreground"> per day for the remaining </span>
            <span className="font-semibold tabular-nums">{recovery.remainingTradingDays}</span>
            <span className="text-muted-foreground"> day{recovery.remainingTradingDays === 1 ? "" : "s"} to hit target.</span>
          </div>

          {/* Stat tiles — decision-relevant order */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <StatTile label="Status" value={recovery.statusLabel} tone={asTone(RECOVERY_STATUS_TONE[recovery.status])} />
            <StatTile label="Today's Adjusted Minimum" value={fmt(recovery.adjustedMinimum, unit)} tone={recovery.recoveryAddOn > 0 ? "warn" : "neutral"} />
            <StatTile
              label={recovery.mtdGap > 0 ? "MTD Gap (behind)" : "MTD Surplus"}
              value={fmt(Math.abs(recovery.mtdGap), unit)}
              tone={recovery.mtdGap > 0 ? "danger" : "success"}
            />
            <StatTile label="Recovery Add-on"
              value={recovery.recoveryAddOn > 0 ? `+${fmt(recovery.recoveryAddOn, unit)}` : "—"}
              tone={recovery.recoveryAddOn > 0 ? "warn" : "neutral"} />
            <StatTile label="Monthly Target" value={fmt(recovery.monthlyTarget, unit)} />
            <StatTile label="MTD Target" value={fmt(recovery.mtdTarget, unit)} />
            <StatTile label="MTD Actual" value={fmt(recovery.mtdActual, unit)} />
            <StatTile label="Today's Baseline" value={fmt(recovery.baselineToday, unit)} />
          </div>

          {/* Desktop table */}
          <Card className="hidden md:block card-glass border-border/60">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider">Monthly Planner</h2>
              <span className="text-xs text-muted-foreground">
                {recovery.remainingTradingDays} of {recovery.totalTradingDays} days remaining
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="w-16">DOW</TableHead>
                  <TableHead className="text-right">Baseline</TableHead>
                  <TableHead className="text-right">Adjusted Min</TableHead>
                  <TableHead className="text-right">Recovery</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">vs Min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recovery.perDay.map(d => {
                  const recovery$ = Math.max(0, d.adjustedMinimum - d.baseline);
                  const vs = d.actual !== null ? d.actual - d.adjustedMinimum : null;
                  return (
                    <TableRow key={d.date} className={d.isToday ? "bg-primary/[0.06]" : ""}>
                      <TableCell className="tabular-nums text-xs">
                        {d.date.slice(8)}
                        {d.isToday && (
                          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-primary/15 text-primary ring-1 ring-primary/30">today</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{DOW_LABEL[d.dow]}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(d.baseline, unit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(d.adjustedMinimum, unit)}</TableCell>
                      <TableCell className="text-right tabular-nums text-warning">
                        {recovery$ > 0 && !d.isPast ? `+${fmt(recovery$, unit)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {d.actual !== null ? fmt(d.actual, unit) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", vs === null ? "" : vs >= 0 ? "text-primary" : "text-destructive")}>
                        {vs === null ? "—" : `${vs >= 0 ? "+" : ""}${fmt(vs, unit)}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile day list */}
          <div className="md:hidden rounded-xl border border-border/60 card-glass overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider">Monthly Planner</h2>
              <span className="text-[11px] text-muted-foreground">
                {recovery.remainingTradingDays}/{recovery.totalTradingDays} left
              </span>
            </div>
            <div className="divide-y divide-border/50">
              {recovery.perDay.map(d => {
                const recovery$ = Math.max(0, d.adjustedMinimum - d.baseline);
                const vs = d.actual !== null ? d.actual - d.adjustedMinimum : null;
                const row = (
                  <div className={cn(
                    "flex items-center justify-between gap-3 px-3 py-2.5",
                    d.isToday && "bg-primary/[0.07]",
                  )}>
                    <div className="min-w-0">
                      <div className="text-xs font-medium tabular-nums flex items-center gap-1.5">
                        {d.date.slice(8)} <span className="text-muted-foreground font-normal">{DOW_LABEL[d.dow]}</span>
                        {d.isToday && <span className="px-1 py-0.5 rounded text-[8px] font-semibold uppercase bg-primary/15 text-primary ring-1 ring-primary/30">today</span>}
                        {recovery$ > 0 && !d.isPast && (
                          <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-warning/10 text-warning ring-1 ring-warning/25 tabular-nums">
                            +{fmt(recovery$, unit)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Baseline {fmt(d.baseline, unit)}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold tabular-nums">{fmt(d.adjustedMinimum, unit)}</div>
                      <div className="text-[11px] tabular-nums">
                        {d.actual !== null ? (
                          <>
                            <span className="text-muted-foreground">{fmt(d.actual, unit)} </span>
                            {vs !== null && (
                              <span className={vs >= 0 ? "text-primary" : "text-destructive"}>
                                {vs >= 0 ? "+" : ""}{fmt(vs, unit)}
                              </span>
                            )}
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </div>
                  </div>
                );
                return d.isToday
                  ? <div key={d.date} ref={todayRowRef}>{row}</div>
                  : <div key={d.date}>{row}</div>;
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className={cn("rounded-lg border p-3", toneTile[tone])}>
      <div className={cn("text-[10px] uppercase tracking-wider", toneTileLabel[tone])}>{label}</div>
      <div className={cn("text-lg mt-1 tabular-nums font-semibold", tone !== "neutral" && toneText[tone])}>{value}</div>
    </div>
  );
}
