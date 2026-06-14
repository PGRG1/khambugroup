import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useKpiCards, useKpiTargets, useKpiAssignments, useKpiActuals, useKpiActions } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { computeKpiStatus } from "@/utils/kpiStatus";
import { computeAutoActual, computeAutoActualRange, isAutoKpiType, type AutoKpiType } from "@/utils/kpiAutoActual";
import { computeRecovery, RECOVERY_STATUS_TONE, type DowBaselines } from "@/utils/kpiRecovery";
import { computeMonthlyCostActual, computeMonthlyRevenue, costCategoryFor, isCostKpiType, monthRange, type CostKpiType } from "@/utils/kpiCostActual";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Clock, RefreshCw } from "lucide-react";

const TONE_CLASS: Record<string, string> = {
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

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentPeriodDate(kpi_type: string): string {
  const now = new Date();
  if (kpi_type === "mtd_revenue") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  }
  return todayStr();
}

export default function MyKpis() {
  const { user, isAdmin } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const uid = isPreviewActive && isAdmin ? previewUserId : user?.id;

  const { cards } = useKpiCards();
  const { targets } = useKpiTargets();
  const { assignments } = useKpiAssignments();
  const { actuals, upsert } = useKpiActuals();
  const { actions } = useKpiActions();
  const { venues } = useVenues();

  const [editing, setEditing] = useState<null | { cardId: string; venueId: string | null; periodDate: string; current?: number }>(null);
  const [actualInput, setActualInput] = useState("");
  const [notes, setNotes] = useState("");

  const venueName = (id: string | null) => venues.find((v) => v.id === id)?.name ?? "All Venues";
  const cardById = (id: string) => cards.find((c) => c.id === id);

  const tiles = useMemo(() => {
    const myAssignments = isAdmin && !isPreviewActive
      ? assignments.filter((a) => a.active)
      : assignments.filter((a) => a.active && (a.assigned_user_id === uid || a.assigned_user_id === null));
    const grouped = new Map<string, { cardId: string; venueId: string | null }>();
    for (const a of myAssignments) {
      const key = `${a.kpi_card_id}__${a.venue_id ?? ""}`;
      if (!grouped.has(key)) grouped.set(key, { cardId: a.kpi_card_id, venueId: a.venue_id });
    }
    return Array.from(grouped.values());
  }, [assignments, uid, isAdmin, isPreviewActive]);

  const handleSave = async () => {
    if (!editing) return;
    const val = parseFloat(actualInput);
    if (Number.isNaN(val)) return;
    const ok = await upsert({
      kpi_card_id: editing.cardId,
      venue_id: editing.venueId,
      period_date: editing.periodDate,
      actual_value: val,
      notes,
    });
    if (ok) { setEditing(null); setActualInput(""); setNotes(""); }
  };

  const refreshAutoActual = async (cardId: string, venueId: string | null, periodDate: string) => {
    const card = cardById(cardId);
    if (!card || !isAutoKpiType(card.kpi_type)) return;
    const vName = venueId ? venues.find((v) => v.id === venueId)?.name ?? null : null;
    try {
      const val = await computeAutoActual(card.kpi_type, vName, periodDate);
      await upsert({ kpi_card_id: cardId, venue_id: venueId, period_date: periodDate, actual_value: val, actual_source: "sales_data_auto" });
    } catch {}
  };

  useEffect(() => {
    if (!tiles.length || !cards.length) return;
    tiles.forEach(({ cardId, venueId }) => {
      const card = cardById(cardId);
      if (!card || !isAutoKpiType(card.kpi_type)) return;
      const periodDate = currentPeriodDate(card.kpi_type);
      const existing = actuals.find(
        (a) => a.kpi_card_id === cardId && (a.venue_id ?? null) === venueId && a.period_date === periodDate,
      );
      const stale = !existing || (Date.now() - new Date(existing.updated_at).getTime() > 30 * 60 * 1000);
      if (stale) refreshAutoActual(cardId, venueId, periodDate);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.length, cards.length]);

  // ---- MTD auto-actuals cache: per (cardId, venueId) → date→value map ----
  const [mtdAutoMap, setMtdAutoMap] = useState<Record<string, Record<string, number>>>({});
  const monthBounds = useMemo(() => {
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }, []);
  useEffect(() => {
    if (!tiles.length || !cards.length) return;
    (async () => {
      const next: Record<string, Record<string, number>> = {};
      await Promise.all(tiles.map(async ({ cardId, venueId }) => {
        const card = cardById(cardId);
        if (!card || !isAutoKpiType(card.kpi_type)) return;
        const vName = venueId ? venues.find(v => v.id === venueId)?.name ?? null : null;
        try {
          const map = await computeAutoActualRange(card.kpi_type as AutoKpiType, vName, monthBounds.start, monthBounds.end);
          next[`${cardId}__${venueId ?? ""}`] = map;
        } catch {}
      }));
      setMtdAutoMap(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.length, cards.length, monthBounds.start]);

  // ---- Cost actuals cache: per (cardId, venueId) → { mtdCost, mtdRevenue } ----
  const [costMap, setCostMap] = useState<Record<string, { mtdCost: number; mtdRevenue: number }>>({});
  const loadCostFor = async (cardId: string, venueId: string | null, kpiType: CostKpiType) => {
    const vName = venueId ? venues.find(v => v.id === venueId)?.name ?? null : null;
    const today = todayStr();
    const cat = costCategoryFor(kpiType);
    try {
      const [mtdCost, mtdRevenue] = await Promise.all([
        computeMonthlyCostActual(cat, vName, monthBounds.start, today),
        computeMonthlyRevenue(vName, monthBounds.start, today),
      ]);
      setCostMap(m => ({ ...m, [`${cardId}__${venueId ?? ""}`]: { mtdCost, mtdRevenue } }));
    } catch {}
  };
  useEffect(() => {
    if (!tiles.length || !cards.length) return;
    tiles.forEach(({ cardId, venueId }) => {
      const card = cardById(cardId);
      if (!card || !isCostKpiType(card.kpi_type)) return;
      loadCostFor(cardId, venueId, card.kpi_type as CostKpiType);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.length, cards.length, monthBounds.start]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-display tracking-tight">My KPI Cards</h1>
        <p className="text-sm text-muted-foreground mt-1">
          You are responsible for {tiles.length} KPI {tiles.length === 1 ? "card" : "cards"}.
        </p>
      </header>

      {tiles.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">
          No KPI cards assigned to you yet. Ask an admin to assign cards in <strong>KPI Management → Assignment</strong>.
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map(({ cardId, venueId }) => {
          const card = cardById(cardId);
          if (!card) return null;
          const periodDate = currentPeriodDate(card.kpi_type);

          // Collect this card's targets
          const cardTargets = targets.filter(
            (t) => t.active && t.kpi_card_id === cardId && (t.venue_id === venueId || t.venue_id === null),
          );

          // Monthly target + DOW baselines (preferring venue-specific over null-venue)
          const pickV = <T extends { venue_id: string | null }>(arr: T[]) =>
            arr.find(t => t.venue_id === venueId) ?? arr.find(t => t.venue_id === null);
          const monthlyT = pickV(cardTargets.filter(t => t.target_period === "month"));

          // ----- Cost KPI branch (Food / Beverage / Supplies) -----
          if (isCostKpiType(card.kpi_type)) {
            const cKey = `${cardId}__${venueId ?? ""}`;
            const cstate = costMap[cKey] ?? { mtdCost: 0, mtdRevenue: 0 };
            const { start, daysInMonth, dayOfMonth } = monthRange();
            const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
            const mode = (monthlyT?.target_mode ?? "absolute");
            // Project monthly revenue to derive ceiling when ratio mode
            const projectedMonthRev = dayOfMonth > 0 ? cstate.mtdRevenue / dayOfMonth * daysInMonth : 0;
            const ceiling = !monthlyT
              ? null
              : mode === "ratio_of_revenue"
                ? (monthlyT.target_value / 100) * projectedMonthRev
                : monthlyT.target_value;
            const mtdCeiling = ceiling !== null ? ceiling * (dayOfMonth / daysInMonth) : null;
            const dailyBudgetRemaining = ceiling !== null && daysLeft > 0
              ? Math.max(0, (ceiling - cstate.mtdCost) / daysLeft)
              : null;
            let tone = "neutral", label = "No Target";
            if (ceiling !== null) {
              if (cstate.mtdCost > ceiling) { tone = "danger"; label = "Over Budget"; }
              else if (mtdCeiling !== null && cstate.mtdCost > mtdCeiling * 1.1) { tone = "warn"; label = "Pacing Hot"; }
              else if (mtdCeiling !== null && cstate.mtdCost > mtdCeiling) { tone = "info"; label = "Slightly Over Pace"; }
              else { tone = "success"; label = "On Budget"; }
            }
            const ratioPct = cstate.mtdRevenue > 0 ? (cstate.mtdCost / cstate.mtdRevenue) * 100 : null;

            const spendPct = ceiling && ceiling > 0 ? Math.min(100, (cstate.mtdCost / ceiling) * 100) : 0;
            const barColor = tone === "danger" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : tone === "info" ? "bg-sky-500" : "bg-emerald-500";
            return (
              <CleanCard
                key={`${cardId}-${venueId ?? "all"}`}
                venue={venueName(venueId)}
                title={card.kpi_name}
                periodLabel={new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                autoLabel="auto · invoices"
                statusTone={tone}
                statusLabel={label}
                heroLabel="MTD Spend"
                heroValue={fmt(cstate.mtdCost, "currency")}
                heroSub={ceiling !== null ? `of ${fmt(ceiling, "currency")} ceiling` : "no ceiling set"}
                progressPct={spendPct}
                progressColor={barColor}
                rows={[
                  { label: mode === "ratio_of_revenue" ? "Projected Ceiling" : "Monthly Ceiling", value: ceiling !== null ? fmt(ceiling, "currency") : "—" },
                  { label: `Daily Budget · ${daysLeft}d left`, value: dailyBudgetRemaining !== null ? fmt(dailyBudgetRemaining, "currency") : "—" },
                  { label: "MTD Revenue", value: fmt(cstate.mtdRevenue, "currency") },
                  { label: "Cost Ratio", value: ratioPct !== null ? `${ratioPct.toFixed(1)}%` : "—" },
                ]}
                footerLeft={`Day ${dayOfMonth} of ${daysInMonth}`}
                footerAction={
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => loadCostFor(cardId, venueId, card.kpi_type as CostKpiType)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                }
                notice={!monthlyT
                  ? { tone: "warn", text: "No monthly target set. Add one in KPI Targets." }
                  : mode === "ratio_of_revenue"
                    ? { tone: "info", text: `Target: keep cost ≤ ${monthlyT.target_value}% of revenue.` }
                    : null
                }
              />
            );
          }

          const dayTargets = cardTargets.filter(t => t.target_period === "day");
          const dowBaselines: DowBaselines = {};
          let defaultBaseline = 0;
          for (const t of dayTargets) {
            if (t.day_of_week !== null && t.day_of_week !== undefined) dowBaselines[t.day_of_week] = t.target_value;
            else if ((t.venue_id ?? null) === venueId || defaultBaseline === 0) defaultBaseline = t.target_value;
          }

          // Build actuals map merged from store + auto map
          const monthActuals: Record<string, number> = {};
          const autoKey = `${cardId}__${venueId ?? ""}`;
          if (mtdAutoMap[autoKey]) Object.assign(monthActuals, mtdAutoMap[autoKey]);
          for (const a of actuals) {
            if (a.kpi_card_id !== cardId || (a.venue_id ?? null) !== venueId) continue;
            if (a.period_date < monthBounds.start || a.period_date > monthBounds.end) continue;
            monthActuals[a.period_date] = a.actual_value;
          }

          const useRecovery = !!monthlyT && (defaultBaseline > 0 || Object.keys(dowBaselines).length > 0);

          if (useRecovery) {
            const recovery = computeRecovery({
              monthlyTarget: monthlyT!.target_value,
              dowBaselines,
              defaultBaseline,
              actualsByDate: monthActuals,
              today: todayStr(),
              criticalPct: monthlyT!.critical_threshold_pct ?? 20,
            });

            const auto = isAutoKpiType(card.kpi_type);
            const actualRow = actuals.find(a => a.kpi_card_id === cardId && (a.venue_id ?? null) === venueId && a.period_date === periodDate);

            return (
              <Card key={`${cardId}-${venueId ?? "all"}`} className="p-5 space-y-4 border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <span>{venueName(venueId)}</span>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="normal-case tracking-normal">
                        {new Date(periodDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                      {auto && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/15 text-sky-300 border border-sky-500/30 normal-case tracking-normal">auto</span>
                      )}
                    </div>
                    <h3 className="text-base font-semibold truncate">{card.kpi_name}</h3>
                  </div>
                  <Badge variant="outline" className={TONE_CLASS[RECOVERY_STATUS_TONE[recovery.status]]}>
                    {recovery.statusLabel}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="Original" value={fmt(recovery.baselineToday, card.unit)} />
                  <MiniStat
                    label="Minimum"
                    value={fmt(recovery.adjustedMinimum, card.unit)}
                    tone={recovery.recoveryAddOn > 0 ? "warn" : "neutral"}
                  />
                  <MiniStat
                    label="Recovery"
                    value={recovery.recoveryAddOn > 0 ? `+${fmt(recovery.recoveryAddOn, card.unit)}` : "—"}
                    tone={recovery.recoveryAddOn > 0 ? "warn" : "neutral"}
                  />
                  <MiniStat label="Actual today" value={recovery.actualToday !== null ? fmt(recovery.actualToday, card.unit) : "—"} />
                  <MiniStat label="MTD Target" value={fmt(recovery.mtdTarget, card.unit)} />
                  <MiniStat label="MTD Actual" value={fmt(recovery.mtdActual, card.unit)} />
                </div>

                <div className={`rounded-md border px-3 py-2 text-xs ${recovery.mtdGap > 0 ? "border-rose-500/30 bg-rose-500/5 text-rose-300" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"}`}>
                  {recovery.mtdGap > 0
                    ? <>Behind by <span className="font-mono">{fmt(recovery.mtdGap, card.unit)}</span> — minimum lifted to recover by month end.</>
                    : <>Ahead by <span className="font-mono">{fmt(-recovery.mtdGap, card.unit)}</span> — original minimum protected.</>
                  }
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {actualRow ? `Updated ${relTime(actualRow.updated_at)}` : "Awaiting today's update"}
                  </div>
                  {auto ? (
                    <Button size="sm" variant="outline" onClick={() => refreshAutoActual(cardId, venueId, periodDate)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => {
                      setEditing({ cardId, venueId, periodDate, current: actualRow?.actual_value });
                      setActualInput(actualRow ? String(actualRow.actual_value) : "");
                      setNotes(actualRow?.notes ?? "");
                    }}>Update Actual</Button>
                  )}
                </div>
              </Card>
            );
          }

          // ----- Fallback: legacy single-target tile -----
          const today = new Date();
          const dow = today.getDay();
          const target =
            cardTargets.find((t) => t.calculation_method === "day_of_week" && t.day_of_week === dow && t.venue_id === venueId)
            ?? cardTargets.find((t) => t.venue_id === venueId)
            ?? cardTargets[0];

          const actual = actuals.find((a) => a.kpi_card_id === cardId && (a.venue_id ?? null) === venueId && a.period_date === periodDate);
          const targetValue = target?.target_value ?? 0;
          const status = computeKpiStatus({
            target: targetValue,
            actual: actual ? actual.actual_value : null,
            warningPct: target?.warning_threshold_pct ?? 10,
            criticalPct: target?.critical_threshold_pct ?? 20,
            higherIsBetter: true,
          });
          const openAction = actions.find((ac) => ac.kpi_card_id === cardId && (ac.venue_id ?? null) === venueId && ac.action_status !== "done");
          const remaining = actual && targetValue > 0 ? Math.max(0, targetValue - actual.actual_value) : null;
          const progressPct = actual && targetValue > 0 ? Math.min(100, (actual.actual_value / targetValue) * 100) : 0;

          return (
            <Card key={`${cardId}-${venueId ?? "all"}`} className="p-5 space-y-4 border-zinc-800 bg-gradient-to-br from-zinc-900/80 to-zinc-950/80">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <span>{venueName(venueId)}</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="normal-case tracking-normal">
                      {new Date(periodDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                    {isAutoKpiType(card.kpi_type) && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/15 text-sky-300 border border-sky-500/30 normal-case tracking-normal">auto</span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold truncate">{card.kpi_name}</h3>
                </div>
                <Badge variant="outline" className={TONE_CLASS[status.tone]}>{status.label}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</div>
                  <div className="text-lg font-mono">{fmt(targetValue, card.unit)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Actual</div>
                  <div className="text-lg font-mono">
                    {actual ? fmt(actual.actual_value, card.unit) : <span className="text-muted-foreground italic text-sm">Not updated yet</span>}
                  </div>
                </div>
              </div>

              {actual && targetValue > 0 && (
                <div className="space-y-1">
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{progressPct.toFixed(0)}% of target</span>
                    {remaining !== null && remaining > 0 && <span>{fmt(remaining, card.unit)} to go</span>}
                  </div>
                </div>
              )}

              {status.variance !== null && (
                <div className="flex items-center gap-2 text-sm">
                  {status.variance > 0 ? <TrendingUp className="h-4 w-4 text-emerald-400" /> :
                    status.variance < 0 ? <TrendingDown className="h-4 w-4 text-rose-400" /> :
                    <Minus className="h-4 w-4 text-muted-foreground" />}
                  <span className={status.variance >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {status.variance >= 0 ? "+" : ""}{fmt(status.variance, card.unit)}
                    {status.variancePct !== null && ` (${status.variancePct >= 0 ? "+" : ""}${status.variancePct.toFixed(1)}%)`}
                  </span>
                </div>
              )}

              {openAction && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                  <div className="font-semibold text-amber-400">Action required</div>
                  <div className="text-muted-foreground mt-0.5">{openAction.action_required}</div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {actual ? `Updated ${relTime(actual.updated_at)}` : "Awaiting first update"}
                </div>
                {isAutoKpiType(card.kpi_type) ? (
                  <Button size="sm" variant="outline" onClick={() => refreshAutoActual(cardId, venueId, periodDate)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh from Sales
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditing({ cardId, venueId, periodDate, current: actual?.actual_value });
                    setActualInput(actual ? String(actual.actual_value) : "");
                    setNotes(actual?.notes ?? "");
                  }}>Update Actual</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update Actual Value</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {cardById(editing.cardId)?.kpi_name} — {venueName(editing.venueId)} — {editing.periodDate}
              </div>
              <div>
                <Label>Actual value</Label>
                <Input type="number" step="0.01" value={actualInput} onChange={(e) => setActualInput(e.target.value)} />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "info" | "warn" | "danger" | "neutral" }) {
  return (
    <div className={`rounded border px-2 py-1.5 ${TONE_CLASS[tone]}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-sm font-mono mt-0.5">{value}</div>
    </div>
  );
}
