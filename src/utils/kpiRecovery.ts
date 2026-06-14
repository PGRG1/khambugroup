/**
 * Asymmetric daily recovery engine for monthly KPI targets.
 *
 * Rule: monthly target stays constant. Per-day baselines are the original
 * "minimum daily expectation". When MTD actual is BEHIND the MTD target,
 * the remaining gap is redistributed across remaining days using
 * day-of-week weights (heavier on Fri/Sat by virtue of larger baselines)
 * to compute a "required" minimum. The actual displayed minimum is
 *
 *     adjustedMinimum = max(originalBaseline, requiredRecovery)
 *
 * so we never RELAX the minimum when ahead of plan.
 */

export type DowBaselines = Partial<Record<number, number>>; // 0=Sun ... 6=Sat

export interface RecoveryInput {
  monthlyTarget: number;
  /** Per-DOW baselines. Missing days fall back to `defaultBaseline`. */
  dowBaselines: DowBaselines;
  /** Fallback baseline for any DOW not in `dowBaselines` (e.g. flat any-day target). */
  defaultBaseline: number;
  /** YYYY-MM-DD => actual_value for already-recorded days. */
  actualsByDate: Record<string, number>;
  /** Reference date — defaults to today. Must be in YYYY-MM-DD. */
  today: string;
  /** Critical threshold (% of MTD target). Defaults 20. */
  criticalPct?: number;
}

export type RecoveryStatus =
  | "plan_protected"
  | "maintain_standard"
  | "stretch_open"
  | "recovery_required"
  | "critical_recovery";

export interface RecoveryResult {
  // Today
  todayDate: string;
  todayDow: number;
  baselineToday: number;
  requiredToday: number;       // recovery-driven figure (== baseline when ahead)
  adjustedMinimum: number;     // max(baseline, required)
  recoveryAddOn: number;       // adjustedMinimum - baseline (>= 0)
  actualToday: number | null;

  // Month-to-date
  mtdTarget: number;
  mtdActual: number;
  mtdGap: number;              // positive = behind
  monthlyTarget: number;
  remainingTarget: number;     // monthlyTarget - mtdActual (incl today fwd)
  remainingTradingDays: number;
  totalTradingDays: number;

  // Breakdown for planner view
  perDay: Array<{
    date: string;
    dow: number;
    baseline: number;
    actual: number | null;
    isPast: boolean;
    isToday: boolean;
    requiredMinimum: number;   // = baseline for past + ahead days, else recovery-weighted
    adjustedMinimum: number;
  }>;

  status: RecoveryStatus;
  statusLabel: string;
}

const STATUS_LABELS: Record<RecoveryStatus, string> = {
  plan_protected: "Plan Protected",
  maintain_standard: "Maintain Standard",
  stretch_open: "Stretch Still Open",
  recovery_required: "Recovery Required",
  critical_recovery: "Critical Recovery",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function computeRecovery(input: RecoveryInput): RecoveryResult {
  const {
    monthlyTarget,
    dowBaselines,
    defaultBaseline,
    actualsByDate,
    today,
    criticalPct = 20,
  } = input;

  const todayD = parseYmd(today);
  const year = todayD.getFullYear();
  const month = todayD.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weight = (dow: number) => {
    const v = dowBaselines[dow];
    return v && v > 0 ? v : (defaultBaseline > 0 ? defaultBaseline : 1);
  };

  // Build all dates of the month
  const dates: { date: string; dow: number; w: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    dates.push({ date: ymd(dt), dow: dt.getDay(), w: weight(dt.getDay()) });
  }

  const totalW = dates.reduce((s, x) => s + x.w, 0);

  // Past = strictly before today. Today is "remaining".
  const pastDates = dates.filter((x) => x.date < today);
  const remainingDates = dates.filter((x) => x.date >= today);
  const pastW = pastDates.reduce((s, x) => s + x.w, 0);
  const remainingW = remainingDates.reduce((s, x) => s + x.w, 0);

  const mtdTarget = totalW > 0 ? monthlyTarget * (pastW / totalW) : 0;
  const mtdActual = pastDates.reduce(
    (s, x) => s + (actualsByDate[x.date] ?? 0),
    0,
  );
  const mtdGap = mtdTarget - mtdActual; // >0 behind
  const remainingTarget = Math.max(0, monthlyTarget - mtdActual);

  const behind = mtdGap > 0;
  // Recovery distribution across remaining days
  const perDayMap = new Map<string, { required: number; adjusted: number }>();
  for (const d of remainingDates) {
    const baseline = d.w;
    let required = baseline;
    if (behind && remainingW > 0) {
      required = remainingTarget * (d.w / remainingW);
    }
    const adjusted = Math.max(baseline, required);
    perDayMap.set(d.date, { required, adjusted });
  }

  // Today rollup
  const todayEntry = dates.find((x) => x.date === today)!;
  const baselineToday = todayEntry.w;
  const rec = perDayMap.get(today) ?? { required: baselineToday, adjusted: baselineToday };
  const actualToday = actualsByDate[today] ?? null;

  // Status
  let status: RecoveryStatus;
  if (behind) {
    const gapPct = mtdTarget > 0 ? (mtdGap / mtdTarget) * 100 : 0;
    status = gapPct >= criticalPct ? "critical_recovery" : "recovery_required";
  } else {
    if (actualToday === null) status = "stretch_open";
    else if (actualToday >= baselineToday) status = "plan_protected";
    else status = "maintain_standard";
  }

  const perDay = dates.map((x) => {
    const isPast = x.date < today;
    const isToday = x.date === today;
    const baseline = x.w;
    const r = perDayMap.get(x.date);
    const required = r?.required ?? baseline;
    const adjusted = r?.adjusted ?? baseline;
    return {
      date: x.date,
      dow: x.dow,
      baseline,
      actual: actualsByDate[x.date] ?? null,
      isPast,
      isToday,
      requiredMinimum: isPast ? baseline : required,
      adjustedMinimum: isPast ? baseline : adjusted,
    };
  });

  return {
    todayDate: today,
    todayDow: todayEntry.dow,
    baselineToday,
    requiredToday: rec.required,
    adjustedMinimum: rec.adjusted,
    recoveryAddOn: Math.max(0, rec.adjusted - baselineToday),
    actualToday,
    mtdTarget,
    mtdActual,
    mtdGap,
    monthlyTarget,
    remainingTarget,
    remainingTradingDays: remainingDates.length,
    totalTradingDays: dates.length,
    perDay,
    status,
    statusLabel: STATUS_LABELS[status],
  };
}

export const RECOVERY_STATUS_TONE: Record<RecoveryStatus, "success" | "info" | "warn" | "danger" | "neutral"> = {
  plan_protected: "success",
  maintain_standard: "info",
  stretch_open: "info",
  recovery_required: "warn",
  critical_recovery: "danger",
};
