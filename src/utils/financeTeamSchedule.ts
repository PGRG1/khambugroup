import { localParts } from "../../supabase/functions/_shared/financeTeamReview";

/**
 * Next time the hourly scheduler (runs at minute 5, UTC hours) will prepare a review
 * for a local hour (and optional weekday, 0 = Sunday) in the given timezone.
 */
export function nextScheduledRun(now: Date, timeZone: string, hour: number, weekday: number | null): Date | null {
  const start = new Date(now);
  start.setUTCMinutes(5, 0, 0);
  if (start <= now) start.setUTCHours(start.getUTCHours() + 1);
  for (let i = 0; i < 24 * 8; i++) {
    const t = new Date(start.getTime() + i * 3600000);
    const lp = localParts(t, timeZone);
    if (lp.hour === hour && (weekday == null || lp.weekday === weekday)) return t;
  }
  return null;
}
