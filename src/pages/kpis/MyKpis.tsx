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
import { Clock, RefreshCw } from "lucide-react";


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
  }, [tiles.length, cards.length, venues.length, monthBounds.start]);

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
  }, [tiles.length, cards.length, venues.length, monthBounds.start]);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
            const heroVal = recovery.actualToday !== null ? recovery.actualToday : 0;
            const minVal = recovery.adjustedMinimum || 1;
            const heroPct = Math.min(100, (heroVal / minVal) * 100);
            const tone = RECOVERY_STATUS_TONE[recovery.status];
            const barColor = tone === "danger" ? "bg-rose-500" : tone === "warn" ? "bg-amber-500" : tone === "info" ? "bg-sky-500" : "bg-emerald-500";

            return (
              <CleanCard
                key={`${cardId}-${venueId ?? "all"}`}
                venue={venueName(venueId)}
                title={card.kpi_name}
                periodLabel={new Date(periodDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                autoLabel={auto ? "auto" : undefined}
                statusTone={tone}
                statusLabel={recovery.statusLabel}
                heroLabel="Actual today"
                heroValue={recovery.actualToday !== null ? fmt(recovery.actualToday, card.unit) : "—"}
                heroSub={`Minimum ${fmt(recovery.adjustedMinimum, card.unit)}${recovery.recoveryAddOn > 0 ? `  ·  +${fmt(recovery.recoveryAddOn, card.unit)} recovery` : ""}`}
                progressPct={heroPct}
                progressColor={barColor}
                rows={[
                  { label: "Original Expectation", value: fmt(recovery.baselineToday, card.unit) },
                  { label: "Minimum Required", value: fmt(recovery.adjustedMinimum, card.unit), highlight: recovery.recoveryAddOn > 0 },
                  { label: "MTD Target", value: fmt(recovery.mtdTarget, card.unit) },
                  { label: "MTD Actual", value: fmt(recovery.mtdActual, card.unit) },
                ]}
                notice={recovery.mtdGap > 0
                  ? { tone: "danger", text: `Behind by ${fmt(recovery.mtdGap, card.unit)} — minimum lifted to recover by month end.` }
                  : { tone: "success", text: `Ahead by ${fmt(-recovery.mtdGap, card.unit)} — original minimum protected.` }
                }
                footerLeft={actualRow ? `Updated ${relTime(actualRow.updated_at)}` : "Awaiting today's update"}
                footerAction={auto ? (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => refreshAutoActual(cardId, venueId, periodDate)}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                  </Button>
                ) : (
                  <Button size="sm" className="h-7 px-3 text-xs" onClick={() => {
                    setEditing({ cardId, venueId, periodDate, current: actualRow?.actual_value });
                    setActualInput(actualRow ? String(actualRow.actual_value) : "");
                    setNotes(actualRow?.notes ?? "");
                  }}>Update</Button>
                )}
              />
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

          const auto = isAutoKpiType(card.kpi_type);
          return (
            <CleanCard
              key={`${cardId}-${venueId ?? "all"}`}
              venue={venueName(venueId)}
              title={card.kpi_name}
              periodLabel={new Date(periodDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              autoLabel={auto ? "auto" : undefined}
              statusTone={status.tone}
              statusLabel={status.label}
              heroLabel="Actual"
              heroValue={actual ? fmt(actual.actual_value, card.unit) : "—"}
              heroSub={`Target ${fmt(targetValue, card.unit)}`}
              progressPct={progressPct}
              progressColor="bg-emerald-500"
              rows={[
                { label: "Target", value: fmt(targetValue, card.unit) },
                { label: "Remaining", value: remaining !== null && remaining > 0 ? fmt(remaining, card.unit) : "—" },
              ]}
              notice={openAction ? { tone: "warn", text: `Action: ${openAction.action_required}` } : null}
              footerLeft={actual ? `Updated ${relTime(actual.updated_at)}` : "Awaiting first update"}
              footerAction={auto ? (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => refreshAutoActual(cardId, venueId, periodDate)}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Refresh
                </Button>
              ) : (
                <Button size="sm" className="h-7 px-3 text-xs" onClick={() => {
                  setEditing({ cardId, venueId, periodDate, current: actual?.actual_value });
                  setActualInput(actual ? String(actual.actual_value) : "");
                  setNotes(actual?.notes ?? "");
                }}>Update</Button>
              )}
            />
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

type Tone = "success" | "info" | "warn" | "danger" | "neutral";

function CleanCard(props: {
  venue: string;
  title: string;
  periodLabel: string;
  autoLabel?: string;
  statusTone: Tone | string;
  statusLabel: string;
  heroLabel: string;
  heroValue: string;
  heroSub?: string;
  progressPct: number;
  progressColor: string;
  rows: { label: string; value: string; highlight?: boolean }[];
  notice?: { tone: Tone; text: string } | null;
  footerLeft: string;
  footerAction: React.ReactNode;
}) {
  const tone = (props.statusTone as Tone) ?? "neutral";
  const pillClass: Record<Tone, string> = {
    success: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
    info: "bg-sky-500/10 text-sky-300 ring-sky-500/25",
    warn: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
    danger: "bg-rose-500/10 text-rose-300 ring-rose-500/25",
    neutral: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/25",
  };
  const noticeClass: Record<Tone, string> = {
    success: "bg-emerald-500/[0.06] text-emerald-300/90",
    info: "bg-sky-500/[0.06] text-sky-300/90",
    warn: "bg-amber-500/[0.06] text-amber-300/90",
    danger: "bg-rose-500/[0.06] text-rose-300/90",
    neutral: "bg-zinc-500/[0.06] text-zinc-300/90",
  };
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 overflow-hidden shadow-sm flex flex-col">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-100 font-display leading-snug break-words">
            {props.title}
          </h3>
          <div className="mt-0.5 text-[11px] text-zinc-500 break-words">
            {props.venue} · {props.periodLabel}
            {props.autoLabel && (
              <span className="ml-1.5 inline-block px-1.5 py-[1px] rounded text-[9px] bg-sky-500/10 text-sky-300/90 ring-1 ring-sky-500/20">
                {props.autoLabel}
              </span>
            )}
          </div>
        </div>
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ring-1 whitespace-nowrap ${pillClass[tone] ?? pillClass.neutral}`}>
          {props.statusLabel}
        </span>
      </div>

      {/* Hero row — label left, value right */}
      <div className="px-4 py-2 flex items-end justify-between gap-2 border-t border-zinc-800/40">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 break-words">
          {props.heroLabel}
        </div>
        <div className="text-2xl font-bold tracking-tight text-zinc-50 font-mono whitespace-nowrap">
          {props.heroValue}
        </div>
      </div>
      {props.heroSub && (
        <div className="px-4 -mt-1 pb-2 text-[11px] text-zinc-500 break-words">
          {props.heroSub}
        </div>
      )}

      {/* Slim progress bar */}
      <div className="px-4">
        <div className="h-1 w-full bg-zinc-800/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${props.progressColor}`}
            style={{ width: `${Math.max(2, Math.min(100, props.progressPct))}%` }}
          />
        </div>
      </div>

      {/* Metric rows */}
      {props.rows.length > 0 && (
        <div className="px-4 pt-3 pb-2 space-y-1.5">
          {props.rows.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="text-zinc-500 break-words">{r.label}</span>
              <span className={`font-mono whitespace-nowrap ${r.highlight ? "text-amber-300" : "text-zinc-200"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      )}

      {props.notice && (
        <div className={`mx-4 mb-3 rounded px-2.5 py-1.5 text-[11px] leading-snug break-words ${noticeClass[props.notice.tone]}`}>
          {props.notice.text}
        </div>
      )}

      <div className="mt-auto px-4 py-2 bg-zinc-900/40 border-t border-zinc-800/60 flex items-center justify-between gap-2">
        <div className="text-[10px] text-zinc-500 flex items-center gap-1 min-w-0 break-words">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{props.footerLeft}</span>
        </div>
        <div className="shrink-0">{props.footerAction}</div>
      </div>
    </div>
  );
}
