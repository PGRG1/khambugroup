import { useCallback, useEffect, useMemo, useState } from "react";
import { useKpiCards, useKpiTargets, useKpiActuals, type KpiCard, type KpiTarget } from "@/hooks/useKpi";
import { useVenues } from "@/hooks/useVenues";
import { computeKpiStatus } from "@/utils/kpiStatus";
import { computeAutoActual, computeAutoActualRange, isAutoKpiType, type AutoKpiType } from "@/utils/kpiAutoActual";
import { computeRecovery, RECOVERY_STATUS_TONE, type DowBaselines } from "@/utils/kpiRecovery";
import { computeMonthlyCostActual, computeMonthlyRevenue, costCategoryFor, isCostKpiType, monthRange, type CostKpiType } from "@/utils/kpiCostActual";
import { asTone, type Tone } from "@/components/kpi/toneStyles";

/**
 * ONE SOURCE OF KPI TRUTH.
 * Both "My View" and "Team View" derive every number, target, tone and
 * "awaiting update" state from this layer. Never re-implement KPI status.
 */

export interface KpiScope {
  cardId: string;
  venueId: string | null;
}

export interface KpiSnapshotRow { label: string; value: string; highlight?: boolean }

export interface KpiSnapshot {
  key: string;
  cardId: string;
  venueId: string | null;
  card: KpiCard;
  kind: "cost" | "recovery" | "simple";
  auto: boolean;
  tone: Tone;
  statusLabel: string;
  hasTarget: boolean;
  /** Primary actual for the current period (null when not yet reported) */
  actualValue: number | null;
  /** Primary required/target value for the current period */
  requiredValue: number | null;
  heroLabel: string;
  heroValue: string;
  heroSub?: string;
  requiredLabel: string;
  progressPct: number;
  rows: KpiSnapshotRow[];
  notice: { tone: Tone; text: string } | null;
  awaitingUpdate: boolean;
  updatedAt: string | null;
  periodDate: string;
  periodLabel: string;
  gapText: string | null;
  footerLeft: string;
  manualEditable: boolean;
}

export const URGENCY_RANK: Record<Tone, number> = { danger: 0, warn: 1, info: 2, neutral: 3, success: 4 };

export function fmtKpi(v: number | null | undefined, unit: string) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (unit === "currency") return `HK$ ${Math.round(v).toLocaleString()}`;
  if (unit === "percent") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}

export function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentPeriodDate(kpi_type: string): string {
  const now = new Date();
  if (kpi_type === "mtd_revenue") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  return todayStr();
}

function isSameDay(iso: string) {
  return iso.slice(0, 10) === todayStr();
}

function dateLabel(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface Options {
  /**
   * When false, automated actuals are computed for display only and never
   * written back from the client (view-only users must not need DB writes).
   */
  persistAuto?: boolean;
}

export function useKpiSnapshots(scopes: KpiScope[], opts: Options = {}) {
  const persistAuto = opts.persistAuto ?? false;
  const { cards } = useKpiCards();
  const { targets } = useKpiTargets();
  const { actuals, upsert, reload: reloadActuals } = useKpiActuals();
  const { venues } = useVenues();

  const [autoToday, setAutoToday] = useState<Record<string, number>>({});
  const [mtdAutoMap, setMtdAutoMap] = useState<Record<string, Record<string, number>>>({});
  const [costMap, setCostMap] = useState<Record<string, { mtdCost: number; mtdRevenue: number }>>({});
  const [refreshing, setRefreshing] = useState(false);

  const scopeSig = useMemo(
    () => scopes.map((s) => `${s.cardId}__${s.venueId ?? ""}`).sort().join("|"),
    [scopes],
  );
  const stableScopes = useMemo(
    () => scopeSig ? scopeSig.split("|").map((k) => {
      const [cardId, venueId] = k.split("__");
      return { cardId, venueId: venueId || null } as KpiScope;
    }) : [],
    [scopeSig],
  );

  const cardById = useCallback((id: string) => cards.find((c) => c.id === id), [cards]);
  const venueNameOf = useCallback(
    (id: string | null) => (id ? venues.find((v) => v.id === id)?.name ?? null : null),
    [venues],
  );

  const monthBounds = useMemo(() => {
    const d = new Date();
    const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }, []);

  const refreshAuto = useCallback(async (cardId: string, venueId: string | null, periodDate: string) => {
    const card = cardById(cardId);
    if (!card || !isAutoKpiType(card.kpi_type)) return;
    try {
      const val = await computeAutoActual(card.kpi_type as AutoKpiType, venueNameOf(venueId), periodDate);
      setAutoToday((m) => ({ ...m, [`${cardId}__${venueId ?? ""}`]: val }));
      if (persistAuto) {
        await upsert({ kpi_card_id: cardId, venue_id: venueId, period_date: periodDate, actual_value: val, actual_source: "sales_data_auto" });
      }
    } catch { /* display-only failure */ }
  }, [cardById, venueNameOf, persistAuto, upsert]);

  const loadCostFor = useCallback(async (cardId: string, venueId: string | null, kpiType: CostKpiType) => {
    try {
      const [mtdCost, mtdRevenue] = await Promise.all([
        computeMonthlyCostActual(costCategoryFor(kpiType), venueNameOf(venueId), monthBounds.start, todayStr()),
        computeMonthlyRevenue(venueNameOf(venueId), monthBounds.start, todayStr()),
      ]);
      setCostMap((m) => ({ ...m, [`${cardId}__${venueId ?? ""}`]: { mtdCost, mtdRevenue } }));
    } catch { /* display-only failure */ }
  }, [venueNameOf, monthBounds.start]);

  // Auto actuals for the current period
  useEffect(() => {
    if (!stableScopes.length || !cards.length) return;
    stableScopes.forEach(({ cardId, venueId }) => {
      const card = cardById(cardId);
      if (!card || !isAutoKpiType(card.kpi_type)) return;
      refreshAuto(cardId, venueId, currentPeriodDate(card.kpi_type));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeSig, cards.length, venues.length]);

  // Month-to-date auto series (recovery maths)
  useEffect(() => {
    if (!stableScopes.length || !cards.length) return;
    (async () => {
      const next: Record<string, Record<string, number>> = {};
      await Promise.all(stableScopes.map(async ({ cardId, venueId }) => {
        const card = cardById(cardId);
        if (!card || !isAutoKpiType(card.kpi_type)) return;
        try {
          const map = await computeAutoActualRange(card.kpi_type as AutoKpiType, venueNameOf(venueId), monthBounds.start, monthBounds.end);
          next[`${cardId}__${venueId ?? ""}`] = map;
        } catch { /* ignore */ }
      }));
      setMtdAutoMap(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeSig, cards.length, venues.length, monthBounds.start]);

  // Cost KPIs
  useEffect(() => {
    if (!stableScopes.length || !cards.length) return;
    stableScopes.forEach(({ cardId, venueId }) => {
      const card = cardById(cardId);
      if (!card || !isCostKpiType(card.kpi_type)) return;
      loadCostFor(cardId, venueId, card.kpi_type as CostKpiType);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeSig, cards.length, venues.length, monthBounds.start]);

  const refreshOne = useCallback(async (cardId: string, venueId: string | null) => {
    const card = cardById(cardId);
    if (!card) return;
    if (isAutoKpiType(card.kpi_type)) await refreshAuto(cardId, venueId, currentPeriodDate(card.kpi_type));
    else if (isCostKpiType(card.kpi_type)) await loadCostFor(cardId, venueId, card.kpi_type as CostKpiType);
  }, [cardById, refreshAuto, loadCostFor]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(stableScopes.map((s) => refreshOne(s.cardId, s.venueId)));
      await reloadActuals();
    } finally { setRefreshing(false); }
  }, [stableScopes, refreshOne, reloadActuals]);

  const snapshots: KpiSnapshot[] = useMemo(() => {
    return stableScopes.map(({ cardId, venueId }) => {
      const card = cardById(cardId);
      if (!card) return null;
      const key = `${cardId}__${venueId ?? ""}`;
      const periodDate = currentPeriodDate(card.kpi_type);
      const auto = isAutoKpiType(card.kpi_type);

      const cardTargets = targets.filter(
        (t) => t.active && t.kpi_card_id === cardId && (t.venue_id === venueId || t.venue_id === null),
      );
      const pickV = <T extends { venue_id: string | null }>(arr: T[]) =>
        arr.find((t) => t.venue_id === venueId) ?? arr.find((t) => t.venue_id === null);
      const monthlyT = pickV(cardTargets.filter((t) => t.target_period === "month")) as KpiTarget | undefined;

      /* ---------------- Cost KPI ---------------- */
      if (isCostKpiType(card.kpi_type)) {
        const cstate = costMap[key] ?? { mtdCost: 0, mtdRevenue: 0 };
        const { daysInMonth, dayOfMonth } = monthRange();
        const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
        const mode = monthlyT?.target_mode ?? "absolute";
        const projectedMonthRev = dayOfMonth > 0 ? (cstate.mtdRevenue / dayOfMonth) * daysInMonth : 0;
        const ceiling = !monthlyT ? null
          : mode === "ratio_of_revenue" ? (monthlyT.target_value / 100) * projectedMonthRev
          : monthlyT.target_value;
        const mtdCeiling = ceiling !== null ? ceiling * (dayOfMonth / daysInMonth) : null;
        const dailyBudgetRemaining = ceiling !== null && daysLeft > 0
          ? Math.max(0, (ceiling - cstate.mtdCost) / daysLeft) : null;
        let tone: Tone = "neutral"; let label = "No Target";
        if (ceiling !== null) {
          if (cstate.mtdCost > ceiling) { tone = "danger"; label = "Over Budget"; }
          else if (mtdCeiling !== null && cstate.mtdCost > mtdCeiling * 1.1) { tone = "warn"; label = "Pacing Hot"; }
          else if (mtdCeiling !== null && cstate.mtdCost > mtdCeiling) { tone = "info"; label = "Slightly Over Pace"; }
          else { tone = "success"; label = "On Budget"; }
        }
        const ratioPct = cstate.mtdRevenue > 0 ? (cstate.mtdCost / cstate.mtdRevenue) * 100 : null;
        const spendPct = ceiling && ceiling > 0 ? Math.min(100, (cstate.mtdCost / ceiling) * 100) : 0;

        const snap: KpiSnapshot = {
          key, cardId, venueId, card, kind: "cost", auto: true, tone, statusLabel: label,
          hasTarget: !!monthlyT,
          actualValue: cstate.mtdCost,
          requiredValue: ceiling,
          heroLabel: "MTD Spend",
          heroValue: fmtKpi(cstate.mtdCost, "currency"),
          heroSub: ceiling !== null ? `of ${fmtKpi(ceiling, "currency")} ceiling` : "no ceiling set",
          requiredLabel: ceiling !== null ? fmtKpi(ceiling, "currency") : "—",
          progressPct: spendPct,
          rows: [
            { label: mode === "ratio_of_revenue" ? "Projected Ceiling" : "Monthly Ceiling", value: ceiling !== null ? fmtKpi(ceiling, "currency") : "—" },
            { label: `Daily Budget · ${daysLeft}d left`, value: dailyBudgetRemaining !== null ? fmtKpi(dailyBudgetRemaining, "currency") : "—" },
            { label: "MTD Revenue", value: fmtKpi(cstate.mtdRevenue, "currency") },
            { label: "Cost Ratio", value: ratioPct !== null ? `${ratioPct.toFixed(1)}%` : "—" },
          ],
          notice: !monthlyT
            ? { tone: "warn", text: "No monthly target set. Add one in KPI Setup → Targets." }
            : mode === "ratio_of_revenue"
              ? { tone: "info", text: `Target: keep cost ≤ ${monthlyT.target_value}% of revenue.` }
              : null,
          awaitingUpdate: false,
          updatedAt: null,
          periodDate,
          periodLabel: `as of ${dateLabel(new Date())}`,
          gapText: ceiling !== null ? `${cstate.mtdCost > ceiling ? "Over" : "Headroom"} ${fmtKpi(Math.abs(ceiling - cstate.mtdCost), "currency")}` : null,
          footerLeft: `Day ${dayOfMonth} of ${daysInMonth}`,
          manualEditable: false,
        };
        return snap;
      }

      /* ---------------- Recovery KPI ---------------- */
      const dayTargets = cardTargets.filter((t) => t.target_period === "day");
      const dowBaselines: DowBaselines = {};
      let defaultBaseline = 0;
      for (const t of dayTargets) {
        if (t.day_of_week !== null && t.day_of_week !== undefined) dowBaselines[t.day_of_week] = t.target_value;
        else if ((t.venue_id ?? null) === venueId || defaultBaseline === 0) defaultBaseline = t.target_value;
      }

      const monthActuals: Record<string, number> = {};
      if (mtdAutoMap[key]) Object.assign(monthActuals, mtdAutoMap[key]);
      for (const a of actuals) {
        if (a.kpi_card_id !== cardId || (a.venue_id ?? null) !== venueId) continue;
        if (a.period_date < monthBounds.start || a.period_date > monthBounds.end) continue;
        monthActuals[a.period_date] = a.actual_value;
      }

      const actualRow = actuals.find((a) => a.kpi_card_id === cardId && (a.venue_id ?? null) === venueId && a.period_date === periodDate);
      const autoValToday = autoToday[key];
      const useRecovery = !!monthlyT && (defaultBaseline > 0 || Object.keys(dowBaselines).length > 0);

      if (useRecovery) {
        const recovery = computeRecovery({
          monthlyTarget: monthlyT!.target_value, dowBaselines, defaultBaseline,
          actualsByDate: monthActuals, today: todayStr(),
          criticalPct: monthlyT!.critical_threshold_pct ?? 20,
        });
        const heroVal = recovery.actualToday !== null ? recovery.actualToday : 0;
        const minVal = recovery.adjustedMinimum || 1;
        const tone = asTone(RECOVERY_STATUS_TONE[recovery.status]);
        const awaitingUpdate = !auto && (!actualRow || !isSameDay(actualRow.updated_at));

        const snap: KpiSnapshot = {
          key, cardId, venueId, card, kind: "recovery", auto, tone, statusLabel: recovery.statusLabel,
          hasTarget: true,
          actualValue: recovery.actualToday,
          requiredValue: recovery.adjustedMinimum,
          heroLabel: "Actual today",
          heroValue: recovery.actualToday !== null ? fmtKpi(recovery.actualToday, card.unit) : "—",
          heroSub: `Minimum ${fmtKpi(recovery.adjustedMinimum, card.unit)}${recovery.recoveryAddOn > 0 ? `  ·  +${fmtKpi(recovery.recoveryAddOn, card.unit)} recovery` : ""}`,
          requiredLabel: fmtKpi(recovery.adjustedMinimum, card.unit),
          progressPct: Math.min(100, (heroVal / minVal) * 100),
          rows: [
            { label: "Original Expectation", value: fmtKpi(recovery.baselineToday, card.unit) },
            { label: "Minimum Required", value: fmtKpi(recovery.adjustedMinimum, card.unit), highlight: recovery.recoveryAddOn > 0 },
            { label: "MTD Target", value: fmtKpi(recovery.mtdTarget, card.unit) },
            { label: "MTD Actual", value: fmtKpi(recovery.mtdActual, card.unit) },
          ],
          notice: recovery.mtdGap > 0
            ? { tone: "danger", text: `Behind by ${fmtKpi(recovery.mtdGap, card.unit)} — minimum lifted to recover by month end.` }
            : { tone: "success", text: `Ahead by ${fmtKpi(-recovery.mtdGap, card.unit)} — original minimum protected.` },
          awaitingUpdate,
          updatedAt: actualRow?.updated_at ?? null,
          periodDate,
          periodLabel: dateLabel(periodDate),
          gapText: recovery.mtdGap > 0
            ? `Behind ${fmtKpi(recovery.mtdGap, card.unit)}`
            : `Ahead ${fmtKpi(-recovery.mtdGap, card.unit)}`,
          footerLeft: actualRow && !awaitingUpdate ? `Updated ${relTime(actualRow.updated_at)}` : "Awaiting today's update",
          manualEditable: !auto,
        };
        return snap;
      }

      /* ---------------- Simple target KPI ---------------- */
      const dow = new Date().getDay();
      const target =
        cardTargets.find((t) => t.calculation_method === "day_of_week" && t.day_of_week === dow && t.venue_id === venueId)
        ?? cardTargets.find((t) => t.venue_id === venueId)
        ?? cardTargets[0];
      const targetValue = target?.target_value ?? 0;
      const actualValue = actualRow ? actualRow.actual_value : (auto && autoValToday !== undefined ? autoValToday : null);
      const status = computeKpiStatus({
        target: targetValue, actual: actualValue,
        warningPct: target?.warning_threshold_pct ?? 10,
        criticalPct: target?.critical_threshold_pct ?? 20,
        higherIsBetter: true,
      });
      const remaining = actualValue !== null && targetValue > 0 ? Math.max(0, targetValue - actualValue) : null;
      const progressPct = actualValue !== null && targetValue > 0 ? Math.min(100, (actualValue / targetValue) * 100) : 0;
      const tone = asTone(status.tone);
      const awaitingUpdate = !auto && (!actualRow || !isSameDay(actualRow.updated_at));

      const snap: KpiSnapshot = {
        key, cardId, venueId, card, kind: "simple", auto, tone, statusLabel: status.label,
        hasTarget: !!target,
        actualValue,
        requiredValue: target ? targetValue : null,
        heroLabel: "Actual",
        heroValue: actualValue !== null ? fmtKpi(actualValue, card.unit) : "—",
        heroSub: `Target ${fmtKpi(targetValue, card.unit)}`,
        requiredLabel: target ? fmtKpi(targetValue, card.unit) : "—",
        progressPct,
        rows: [
          { label: "Target", value: target ? fmtKpi(targetValue, card.unit) : "—" },
          { label: "Remaining", value: remaining !== null && remaining > 0 ? fmtKpi(remaining, card.unit) : "—" },
        ],
        notice: null,
        awaitingUpdate,
        updatedAt: actualRow?.updated_at ?? null,
        periodDate,
        periodLabel: dateLabel(periodDate),
        gapText: remaining !== null && remaining > 0 ? `Short ${fmtKpi(remaining, card.unit)}` : null,
        footerLeft: actualRow && !awaitingUpdate ? `Updated ${relTime(actualRow.updated_at)}` : (actualRow ? "Awaiting today's update" : "Awaiting first update"),
        manualEditable: !auto,
      };
      return snap;
    }).filter(Boolean) as KpiSnapshot[];
  }, [stableScopes, cardById, targets, actuals, costMap, mtdAutoMap, autoToday, monthBounds.start, monthBounds.end]);

  const byKey = useMemo(() => {
    const m = new Map<string, KpiSnapshot>();
    for (const s of snapshots) m.set(s.key, s);
    return m;
  }, [snapshots]);

  return { snapshots, byKey, refreshOne, refreshAll, refreshing, upsertActual: upsert };
}
