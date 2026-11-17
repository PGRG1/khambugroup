import type { VenueServicePeriod } from "@/types/revenueTargetsV2";

/**
 * What kind of shift this is, judged by the venue's own service hours for that weekday,
 * so it works for every venue (lunch places, late bars, past-midnight closes).
 * open = starts at or before opening · close = ends at or after closing · both = does both
 * mid = neither · long = over 10 hours · none = no hours set (no colour, never a wrong one).
 */
export type ShiftKind = "open" | "close" | "both" | "mid" | "long" | "none";

const mins = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
};

export function venueDayHours(periods: VenueServicePeriod[], venueId: string | undefined, day: string) {
  if (!venueId) return null;
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const today = periods.filter(p => p.venueId === venueId && p.isActive && !p.isRollupOnly
    && p.applicableWeekdays.includes(weekday)
    && p.effectiveFrom <= day && (!p.effectiveTo || p.effectiveTo >= day));
  if (!today.length) return null;
  let open = Infinity, close = -Infinity;
  for (const p of today) {
    const s = mins(p.startTime), e0 = mins(p.endTime);
    if (s == null || e0 == null) continue;
    const e = p.crossesMidnight || e0 <= s ? e0 + 1440 : e0;
    open = Math.min(open, s); close = Math.max(close, e);
  }
  return Number.isFinite(open) && Number.isFinite(close) ? { open, close } : null;
}

export function shiftKind(start: string | null | undefined, end: string | null | undefined, hours: number, venueHours: { open: number; close: number } | null): ShiftKind {
  if (hours > 10) return "long";
  if (!venueHours) return "none";
  const s = mins(start), e0 = mins(end);
  if (s == null || e0 == null) return "none";
  const e = e0 <= s ? e0 + 1440 : e0;
  const opens = s <= venueHours.open, closes = e >= venueHours.close;
  return opens && closes ? "both" : opens ? "open" : closes ? "close" : "mid";
}
