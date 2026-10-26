// Pure rules for closed days: single closures plus "every weekday" / date-range rules.
export const CLOSURE_REASONS = ["Public holiday", "Typhoon / weather", "Renovation", "Private hire", "Other"] as const;

export interface VenueClosure { id: string; venue_id: string; date: string; reason: string | null; note: string | null; source: string; created_by: string; created_at: string }
export interface VenueClosureRule { id: string; venue_id: string; weekday: number | null; start_date: string; end_date: string | null; reason: string | null; created_at?: string }
export interface ClosedInfo { venueId: string; date: string; reason: string | null; note?: string | null; closure?: VenueClosure; rule?: VenueClosureRule }

const weekdayOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };

/** Does a rule close this date? Weekday rules repeat from start_date (until end_date if set); range rules cover start–end. */
export function ruleCovers(rule: VenueClosureRule, date: string): boolean {
  if (date < rule.start_date) return false;
  if (rule.end_date && date > rule.end_date) return false;
  if (rule.weekday == null) return !!rule.end_date;
  return weekdayOf(date) === rule.weekday;
}

/** Look up a venue-day; single closures win over rules. */
export function makeClosedLookup(closures: VenueClosure[], rules: VenueClosureRule[]) {
  const byKey = new Map(closures.map((c) => [`${c.venue_id}|${c.date}`, c]));
  const rulesByVenue = new Map<string, VenueClosureRule[]>();
  for (const r of rules) rulesByVenue.set(r.venue_id, [...(rulesByVenue.get(r.venue_id) ?? []), r]);
  return (venueId: string, date: string): ClosedInfo | null => {
    const c = byKey.get(`${venueId}|${date}`);
    if (c) return { venueId, date, reason: c.reason, note: c.note, closure: c };
    const rule = (rulesByVenue.get(venueId) ?? []).find((r) => ruleCovers(r, date));
    return rule ? { venueId, date, reason: rule.reason, rule } : null;
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayName = (n: number) => DAY_NAMES[n];
export { weekdayOf };
