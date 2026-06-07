export type KpiStatus =
  | "pending"
  | "on_track"
  | "watch"
  | "behind"
  | "critical"
  | "action_required";

export interface KpiStatusInput {
  target: number;
  actual: number | null;
  warningPct?: number; // e.g. 10
  criticalPct?: number; // e.g. 20
  higherIsBetter?: boolean;
}

export interface KpiStatusResult {
  status: KpiStatus;
  variance: number | null;
  variancePct: number | null;
  label: string;
  tone: "success" | "info" | "warn" | "danger" | "neutral";
}

const LABELS: Record<KpiStatus, string> = {
  pending: "Pending Actual Update",
  on_track: "On Track",
  watch: "Watch",
  behind: "Behind",
  critical: "Critical",
  action_required: "Action Required",
};

const TONES: Record<KpiStatus, KpiStatusResult["tone"]> = {
  pending: "neutral",
  on_track: "success",
  watch: "info",
  behind: "warn",
  critical: "danger",
  action_required: "danger",
};

export function computeKpiStatus({
  target,
  actual,
  warningPct = 10,
  criticalPct = 20,
  higherIsBetter = true,
}: KpiStatusInput): KpiStatusResult {
  if (actual === null || actual === undefined || Number.isNaN(actual)) {
    return { status: "pending", variance: null, variancePct: null, label: LABELS.pending, tone: TONES.pending };
  }
  const variance = actual - target;
  const variancePct = target === 0 ? null : (variance / Math.abs(target)) * 100;

  let status: KpiStatus = "on_track";
  const signed = higherIsBetter ? (variancePct ?? 0) : -(variancePct ?? 0);
  if (signed >= 0) status = "on_track";
  else if (signed >= -warningPct) status = "watch";
  else if (signed >= -criticalPct) status = "behind";
  else status = "critical";

  return { status, variance, variancePct, label: LABELS[status], tone: TONES[status] };
}

export function statusLabel(s: KpiStatus) {
  return LABELS[s];
}
export function statusTone(s: KpiStatus) {
  return TONES[s];
}
