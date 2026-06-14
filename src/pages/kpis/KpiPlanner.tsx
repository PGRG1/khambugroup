import { useEffect, useMemo, useState } from "react";
import { useKpiCards, useKpiTargets, useKpiActuals } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableHead, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { computeRecovery, RECOVERY_STATUS_TONE, type DowBaselines } from "@/utils/kpiRecovery";
import { computeAutoActualRange, isAutoKpiType, type AutoKpiType } from "@/utils/kpiAutoActual";

const DOW_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALL = "__all__";
const TONE: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  info: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  warn: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  danger: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  neutral: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

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

  // Resolve monthly target + DOW baselines
  const monthlyTarget = useMemo(() => {
    if (!card) return 0;
    const t = targets.find(t =>
      t.active && t.kpi_card_id === card.id &&
      (t.venue_id ?? null) === venueIdNorm &&
      t.target_period === "month"
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
        if (t.day_of_week !== null && t.day_of_week !== undefined) {
          dow[t.day_of_week] = t.target_value;
        } else {
          def = t.target_value;
        }
      }
    }
    return { dowBaselines: dow, defaultBaseline: def };
  }, [card, targets, venueIdNorm]);

  // Period info
  const [y, m] = yyyymm.split("-").map(Number);
  const monthStart = `${yyyymm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthEnd = `${yyyymm}-${String(lastDay).padStart(2, "0")}`;
  const todayStr = (() => {
    const t = new Date();
    if (t.getFullYear() === y && t.getMonth() === m - 1) {
      return `${yyyymm}-${String(t.getDate()).padStart(2, "0")}`;
    }
    return monthEnd; // viewing past/future month → treat last day as "today" for math
  })();

  // Build actuals map: prefer kpi_actuals, else auto-pull from sales_records
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
      map[a.period_date] = a.actual_value; // manual overrides auto
    }
    return map;
  }, [autoActuals, actuals, card, venueIdNorm, monthStart, monthEnd]);

  const recovery = useMemo(() => {
    if (!card || monthlyTarget <= 0 || (defaultBaseline <= 0 && Object.keys(dowBaselines).length === 0)) return null;
    return computeRecovery({
      monthlyTarget,
      dowBaselines,
      defaultBaseline,
      actualsByDate,
      today: todayStr,
    });
  }, [card, monthlyTarget, dowBaselines, defaultBaseline, actualsByDate, todayStr]);

  const unit = card?.unit ?? "currency";

  // Month picker options
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -6; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-display tracking-tight">KPI Planner</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monthly target drives daily minimums. Minimums rise when behind, but never relax below the original baseline.
        </p>
      </header>

      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">KPI</Label>
          <Select value={cardId} onValueChange={setCardId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select KPI" /></SelectTrigger>
            <SelectContent>
              {activeCards.map(c => <SelectItem key={c.id} value={c.id}>{c.kpi_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Venue</Label>
          <Select value={venueId} onValueChange={setVenueId}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All Venues</SelectItem>
              {venues.filter(v => v.is_active).map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Month</Label>
          <Select value={yyyymm} onValueChange={setYyyymm}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {!recovery && (
        <Card className="p-8 text-center text-muted-foreground">
          Set a <strong>monthly</strong> target and at least one <strong>daily</strong> baseline for this KPI on the KPI Targets page.
        </Card>
      )}

      {recovery && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Monthly Target" value={fmt(recovery.monthlyTarget, unit)} />
            <StatTile label="MTD Target" value={fmt(recovery.mtdTarget, unit)} />
            <StatTile label="MTD Actual" value={fmt(recovery.mtdActual, unit)} />
            <StatTile
              label={recovery.mtdGap > 0 ? "MTD Gap (behind)" : "MTD Surplus"}
              value={fmt(Math.abs(recovery.mtdGap), unit)}
              tone={recovery.mtdGap > 0 ? "danger" : "success"}
            />
            <StatTile label="Today's Baseline" value={fmt(recovery.baselineToday, unit)} />
            <StatTile
              label="Today's Adjusted Minimum"
              value={fmt(recovery.adjustedMinimum, unit)}
              tone={recovery.recoveryAddOn > 0 ? "warn" : "neutral"}
            />
            <StatTile
              label="Recovery Add-on"
              value={recovery.recoveryAddOn > 0 ? `+${fmt(recovery.recoveryAddOn, unit)}` : "—"}
              tone={recovery.recoveryAddOn > 0 ? "warn" : "neutral"}
            />
            <StatTile
              label="Status"
              value={recovery.statusLabel}
              tone={RECOVERY_STATUS_TONE[recovery.status]}
            />
          </div>

          <Card>
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
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
                    <TableRow key={d.date} className={d.isToday ? "bg-emerald-500/5" : ""}>
                      <TableCell className="font-mono text-xs">
                        {d.date.slice(8)}
                        {d.isToday && <Badge variant="outline" className="ml-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[9px]">today</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{DOW_LABEL[d.dow]}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(d.baseline, unit)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(d.adjustedMinimum, unit)}</TableCell>
                      <TableCell className="text-right font-mono text-amber-400">{recovery$ > 0 && !d.isPast ? `+${fmt(recovery$, unit)}` : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{d.actual !== null ? fmt(d.actual, unit) : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className={`text-right font-mono ${vs === null ? "" : vs >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {vs === null ? "—" : `${vs >= 0 ? "+" : ""}${fmt(vs, unit)}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "info" | "warn" | "danger" | "neutral" }) {
  return (
    <div className={`rounded-lg border p-3 ${TONE[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-lg font-mono mt-1">{value}</div>
    </div>
  );
}
