// Pure rota-planning helpers (no Deno imports) so they are unit-tested in vitest.
type Row = Record<string, any>;
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const hhmm = (t: string | null | undefined) => (t ?? "").slice(0, 5);

/** Latest approved terms on a day, over the person record (same rule as the Rota page). */
export function termsOn(person: Row, terms: Row[], day: string): Row {
  const rows = terms.filter(t => t.employee_id === person.id && t.effective_date <= day)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || String(a.approved_at ?? "").localeCompare(String(b.approved_at ?? "")));
  return rows.reduce((acc, r) => ({ ...acc, ...(r.values ?? {}) }), { ...person });
}

/** Opening hours per weekday from active service periods (earliest open, latest close). */
export function openingHours(periods: Row[], venueId: string, days: string[]) {
  return days.map(day => {
    const today = periods.filter(p => p.venue_id === venueId && p.is_active && !p.is_rollup_only
      && (p.applicable_weekdays ?? []).includes(weekday(day)) && p.effective_from <= day && (!p.effective_to || p.effective_to >= day));
    if (!today.length) return { date: day, weekday: WEEKDAYS[weekday(day)], open: null, close: null, known: false };
    const sorted = [...today].sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
    const last = [...today].sort((a, b) => (a.crosses_midnight ? 1 : 0) - (b.crosses_midnight ? 1 : 0) || hhmm(a.end_time).localeCompare(hhmm(b.end_time))).at(-1)!;
    return { date: day, weekday: WEEKDAYS[weekday(day)], open: hhmm(sorted[0].start_time), close: hhmm(last.end_time), crosses_midnight: Boolean(last.crosses_midnight), known: true };
  });
}

/** How someone usually works: days a week and most common start/finish, from recent saved shifts. */
export function usualPattern(shifts: Row[]) {
  const worked = shifts.filter(s => s.shift_type !== "RD" && s.status !== "cancelled");
  if (!worked.length) return null;
  const mode = (xs: string[]) => [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const weeks = new Set(worked.map(s => { const d = new Date(`${s.shift_date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })).size || 1;
  return {
    days_per_week: Math.round((worked.length / weeks) * 10) / 10,
    usual_days: [...new Set(worked.map(s => WEEKDAYS[weekday(s.shift_date)]))],
    usual_start: mode(worked.map(s => hhmm(s.start_time))), usual_end: mode(worked.map(s => hhmm(s.end_time))),
  };
}

