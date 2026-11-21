/**
 * Revenue targets by line. A venue-day is made of lines:
 * - the venue's own periods from Settings (any names, any number). None or one period = one "day" line;
 *   two or more = one "period" line each.
 * - "delivery" when the venue sells through delivery platforms (history) or a delivery line was set.
 * - named "event" lines (a buyout is instead a period/day line with a label).
 * Saved rows live in revenue_daily_projections, one per (tenant, venue, date, line_key).
 * Pure: no IO, used by the Targets tab and its tests.
 */

export type LineKind = "day" | "period" | "delivery" | "event";

export type PeriodLike = {
  id: string; venueId: string; name: string; isActive: boolean; isRollupOnly: boolean;
  applicableWeekdays: number[]; effectiveFrom: string; effectiveTo: string | null; sortOrder: number;
};

export type SavedLine = {
  venueId: string; date: string; kind: LineKind; periodId: string | null; label: string | null;
  sales: number; guests: number | null; spend: number | null; bani: boolean; by?: string; at?: string;
};

/** One sales record, reduced to what lines need. */
export type HistRow = { date: string; periodId: string | null; sales: number; guests: number; delivery: number };

export type TargetLine = {
  venueId: string; date: string; kind: LineKind; periodId: string | null; label: string | null;
  /** Shown name: the period's name, "Day", "Delivery" or the event's name. */
  name: string;
  guests: number | null; spend: number | null; target: number | null; sold: number | null;
  source: "Manager" | "Bani plan" | "Auto" | "";
  by?: string; at?: string;
};

export const LOOKBACK = 8;
export const MIN_OBS = 4;

/** Same key as the database's generated line_key. */
export function lineKey(kind: LineKind, periodId: string | null, label: string | null): string {
  return `${kind}:${periodId ?? ""}${kind === "event" ? `:${(label ?? "").trim().toLowerCase()}` : ""}`;
}

const dowOf = (date: string) => new Date(`${date}T00:00:00`).getDay();

/** Operating periods of a venue on a date (0 = Sunday, empty weekdays = every day), in Settings order. */
export function periodsOn(periods: PeriodLike[], venueId: string, date: string): PeriodLike[] {
  const dow = dowOf(date);
  return periods
    .filter((p) => p.venueId === venueId && p.isActive && !p.isRollupOnly
      && (!p.applicableWeekdays.length || p.applicableWeekdays.includes(dow))
      && (!p.effectiveFrom || p.effectiveFrom <= date) && (!p.effectiveTo || p.effectiveTo >= date))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

type Day = { sales: number; guests: number; delivery: number; byPeriod: Map<string, { sales: number; guests: number; delivery: number }> };

/** Sum a venue's sales records per date (all periods together, and per tagged period). */
export function dailyHistory(rows: HistRow[]): Map<string, Day> {
  const m = new Map<string, Day>();
  for (const r of rows) {
    const d = m.get(r.date) ?? { sales: 0, guests: 0, delivery: 0, byPeriod: new Map() };
    d.sales += r.sales || 0; d.guests += r.guests || 0; d.delivery += r.delivery || 0;
    if (r.periodId) {
      const p = d.byPeriod.get(r.periodId) ?? { sales: 0, guests: 0, delivery: 0 };
      p.sales += r.sales || 0; p.guests += r.guests || 0; p.delivery += r.delivery || 0;
      d.byPeriod.set(r.periodId, p);
    }
    m.set(r.date, d);
  }
  return m;
}

/** Guests x spend from the last 8 same weekdays with guests; needs 4. Delivery money is not dine-in spend. */
function autoDineIn(days: { date: string; sales: number; guests: number; delivery: number }[], date: string, withDelivery: boolean) {
  const dow = dowOf(date);
  const prior = days.filter((d) => d.date < date && d.guests > 0 && dowOf(d.date) === dow).sort((a, b) => a.date.localeCompare(b.date)).slice(-LOOKBACK);
  if (prior.length < MIN_OBS) return null;
  const g = prior.reduce((a, d) => a + d.guests, 0);
  const s = prior.reduce((a, d) => a + d.sales - (withDelivery ? d.delivery : 0), 0);
  const guests = Math.round(g / prior.length), spend = Math.round(s / g);
  return { guests, spend, target: guests * spend };
}

/** Delivery from the last 8 same weekdays with sales; needs 4 with delivery. */
function autoDelivery(hist: Map<string, Day>, date: string): number | null {
  const dow = dowOf(date);
  const prior = [...hist.entries()].filter(([d, v]) => d < date && v.sales > 0 && dowOf(d) === dow).sort((a, b) => a[0].localeCompare(b[0])).slice(-LOOKBACK);
  if (prior.filter(([, v]) => v.delivery > 0).length < MIN_OBS) return null;
  return Math.round(prior.reduce((a, [, v]) => a + v.delivery, 0) / prior.length);
}

/** The lines of one venue on one date: saved where set, otherwise the automatic forecast. */
export function venueDayLines(args: {
  venueId: string; date: string; periods: PeriodLike[]; saved: SavedLine[]; hist: Map<string, Day>;
}): TargetLine[] {
  const { venueId, date, hist } = args;
  const saved = args.saved.filter((s) => s.venueId === venueId && s.date === date);
  const find = (kind: LineKind, periodId: string | null) => saved.find((s) => s.kind === kind && (s.periodId ?? null) === periodId);
  const on = periodsOn(args.periods, venueId, date);
  const today = hist.get(date);
  const histDays = [...hist.entries()].map(([d, v]) => ({ date: d, ...v }));
  const deliveryAuto = autoDelivery(hist, date);
  const hasDelivery = deliveryAuto != null || !!find("delivery", null);
  const sold = (v: number | undefined) => (today ? v ?? null : null);

  const fromSaved = (s: SavedLine, name: string, soldV: number | null): TargetLine => ({
    venueId, date, kind: s.kind, periodId: s.periodId, label: s.label, name,
    guests: s.guests, spend: s.spend ?? (s.guests ? Math.round(s.sales / s.guests) : null), target: s.sales, sold: soldV,
    source: s.bani ? "Bani plan" : "Manager", by: s.by, at: s.at,
  });
  const auto = (kind: LineKind, periodId: string | null, name: string, a: { guests: number | null; spend: number | null; target: number } | null, soldV: number | null): TargetLine => ({
    venueId, date, kind, periodId, label: null, name, guests: a?.guests ?? null, spend: a?.spend ?? null, target: a?.target ?? null, sold: soldV, source: a ? "Auto" : "",
  });

  const out: TargetLine[] = [];
  const legacyDay = find("day", null);
  if (on.length >= 2 && !(legacyDay && !saved.some((s) => s.kind === "period"))) {
    for (const p of on) {
      const tagged = histDays.map((d) => ({ date: d.date, ...(d.byPeriod.get(p.id) ?? { sales: 0, guests: 0, delivery: 0 }) }));
      const t = today?.byPeriod.get(p.id);
      const soldV = t ? t.sales - (hasDelivery ? t.delivery : 0) : null;
      const s = find("period", p.id);
      out.push(s ? fromSaved(s, p.name, soldV) : auto("period", p.id, p.name, autoDineIn(tagged, date, hasDelivery), soldV));
    }
  } else {
    const name = on.length === 1 ? on[0].name : "Day";
    const soldV = sold(today ? today.sales - (hasDelivery ? today.delivery : 0) : undefined);
    out.push(legacyDay ? fromSaved(legacyDay, name, soldV) : auto("day", null, name, autoDineIn(histDays, date, hasDelivery), soldV));
  }
  if (hasDelivery) {
    const s = find("delivery", null), soldV = sold(today?.delivery);
    out.push(s ? fromSaved(s, "Delivery", soldV) : auto("delivery", null, "Delivery", deliveryAuto == null ? null : { guests: null, spend: null, target: deliveryAuto }, soldV));
  }
  for (const e of saved.filter((x) => x.kind === "event").sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""))) {
    out.push(fromSaved(e, e.label ?? "Event", null));
  }
  return out;
}

/** Saved rows hold one line each; screens that only need a venue-day total add them up. */
export function sumProjectionRows<T extends { venue_id: string; target_date: string; projected_sales: number | string | null }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.venue_id}|${String(r.target_date).slice(0, 10)}`;
    const p = m.get(k);
    m.set(k, p ? { ...p, projected_sales: Number(p.projected_sales ?? 0) + Number(r.projected_sales ?? 0) } : { ...r });
  }
  return [...m.values()];
}
