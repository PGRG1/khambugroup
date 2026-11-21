// Read-only rota planning context for Bani: everything a good planner looks at before
// drafting a week, so Bani can propose a first draft instead of asking for every detail.
// Permission-scoped through peopleContext (people_access, per-person access, rota_manager per venue)
// and read with the requester's own client (RLS). Never writes.
import { peopleContext } from "./peopleActions.ts";
import { addDays, monday } from "./peopleRules.ts";
import { WEEKDAYS, hhmm, openingHours, termsOn, usualPattern, weekday } from "./rotaPlanningRules.ts";

type Client = any;
type Row = Record<string, any>;

export const rotaPlanningTool = { type: "function", function: {
  name: "get_rota_planning_context",
  description: "Everything needed to plan one venue's rota week, read-only: the team working there (role, full/part time, weekly contracted hours or null when not set), approved leave and public holidays that week, the venue's opening hours per weekday, each person's usual pattern from the last 4 weeks, shifts already saved for the week, and average sales per weekday from the last 4 weeks. Call this before proposing or discussing a rota, even when there is no history.",
  parameters: { type: "object", properties: { venue: { type: "string", description: "Venue name; omit when the business has one venue" }, week_start: { type: "string", description: "Monday of the week, YYYY-MM-DD" } }, required: ["week_start"] },
} };

async function all(client: Client, table: string, tenant: string, filter?: (q: any) => any) {
  const out: Row[] = [];
  for (let from = 0;; from += 1000) {
    let q = client.from(table).select("*").eq("tenant_id", tenant).range(from, from + 999); if (filter) q = filter(q);
    const { data, error } = await q; if (error) throw new Error(error.message); out.push(...data); if (data.length < 1000) return out;
  }
}

export async function rotaPlanningContext(client: Client, tenant: string, user: string, args: { venue?: string; week_start?: string }) {
  const ctx = await peopleContext(client, tenant, user, {});
  const w = monday(String(args.week_start ?? ""));
  const end = addDays(w, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
  const venue = ctx.venues.length === 1 && !args.venue ? ctx.venues[0] : ctx.venues.find((v: Row) => v.name.toLowerCase() === String(args.venue ?? "").toLowerCase());
  if (!venue) return { ok: false, error: "Which venue?", venues: ctx.venues.map((v: Row) => v.name) };
  const ids = new Set(ctx.people.map((p: Row) => p.id));
  const [rawPeople, terms, periods, leave, holidays, recent, week, sales] = await Promise.all([
    all(client, "hr_employees", tenant),
    all(client, "hr_employment_terms", tenant, q => q.lte("effective_date", end)),
    all(client, "venue_service_periods", tenant, q => q.eq("venue_id", venue.id)),
    all(client, "hr_leave_requests", tenant, q => q.eq("status", "approved").lte("start_date", end).gte("end_date", w)),
    all(client, "hr_holidays", tenant).catch(() => [] as Row[]),
    all(client, "hr_shifts", tenant, q => q.gte("shift_date", addDays(w, -28)).lt("shift_date", w)),
    all(client, "hr_shifts", tenant, q => q.gte("shift_date", w).lte("shift_date", end)),
    all(client, "sales_records", tenant, q => q.gte("date", addDays(w, -28)).lt("date", w)).catch(() => [] as Row[]),
  ]);
  const people = rawPeople.filter(p => ids.has(p.id));
  const team = people.map(p => ({ p, at: termsOn(p, terms, w) }))
    .filter(({ at }) => ["active", "on_leave"].includes(String(at.status)) && String(at.hire_date ?? "") <= end && (!at.end_date || at.end_date >= w)
      && (at.venue_id ? at.venue_id === venue.id : at.venue === venue.name))
    .map(({ p, at }) => {
      const mine = recent.filter(s => s.employee_id === p.id && (!s.venue_id || s.venue_id === venue.id));
      return {
        name: `${p.first_name} ${p.last_name}`.trim(), job_title: at.job_title ?? null,
        employment_type: at.employment_type ?? null,
        weekly_hours: at.weekly_hours == null || at.weekly_hours === "" ? null : Number(at.weekly_hours),
        usual: usualPattern(mine),
        leave: leave.filter(l => l.employee_id === p.id).map(l => ({ from: l.start_date, to: l.end_date })),
        already_this_week: week.filter(s => s.employee_id === p.id).map(s => ({ date: s.shift_date, start: hhmm(s.start_time), end: hhmm(s.end_time), rest: s.shift_type === "RD" })),
      };
    });
  const venueSales = sales.filter(s => s.venue_id ? s.venue_id === venue.id : s.venue === venue.name);
  const avgSales = days.map(day => {
    const same = venueSales.filter(s => weekday(s.date) === weekday(day));
    return { weekday: WEEKDAYS[weekday(day)], average_sales: same.length ? Math.round(same.reduce((n, s) => n + Number(s.total_sales || 0), 0) / same.length) : null, average_guests: same.length ? Math.round(same.reduce((n, s) => n + Number(s.guests || 0), 0) / same.length) : null, days_seen: same.length };
  });
  return {
    ok: true, venue: venue.name, week_start: w, week_end: end,
    opening_hours: openingHours(periods, venue.id, days),
    public_holidays: holidays.filter(h => h.date >= w && h.date <= end).map(h => ({ date: h.date, name: h.name })),
    team, sales_by_weekday_last_4_weeks: avgSales,
    notes: [
      "A proposal is not saved. Show it, let the user change it, and only draft the People card after they agree.",
      "Hong Kong practice: each person gets at least one rest day in every 7 days.",
      ...(team.some(t => t.weekly_hours == null) ? ["Some people have no weekly hours set: ask, or assume and say so."] : []),
      ...(openingHours(periods, venue.id, days).some(d => !d.known) ? ["Opening hours are not set for some days: ask, or assume and say so."] : []),
    ],
  };
}
