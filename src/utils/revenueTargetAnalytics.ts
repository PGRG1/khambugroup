// Phase 2 pure analytics for Revenue Targets v2.
// Rules (see spec):
//  - Statistical: exactly one Full-Day benchmark per (venue, date); never sum with
//    operational service periods; never distribute into service periods.
//  - Manager totals: sum operational rows only (line_status='operating'); include
//    active event rows; exclude roll-up-only, not_operating, replaced, closed.
//  - Rolled-up Spend/Guest = totalRevenue / totalGuests (never average of ratios).
//  - Actuals are Full-Day only from sales_records for now.

import type {
  ActualDailyRow,
  ManagerTargetLine,
  StatisticalDailyRowV2,
  VenueServicePeriod,
} from "@/types/revenueTargetsV2";

/* ---------------- basic math ---------------- */

export function safeDiv(numer: number, denom: number): number | null {
  if (!denom || !isFinite(denom)) return null;
  return numer / denom;
}

export function managerRevenue(line: Pick<ManagerTargetLine, "targetInputMode" | "managerGuestTarget" | "managerSpendPerGuestTarget" | "managerRevenueOverride" | "managerRevenueTarget">): number | null {
  if (line.targetInputMode === "contracted_revenue") {
    return line.managerRevenueOverride ?? null;
  }
  if (line.managerRevenueTarget != null) return Number(line.managerRevenueTarget);
  const g = line.managerGuestTarget;
  const s = line.managerSpendPerGuestTarget;
  if (g == null || s == null) return null;
  return Number(g) * Number(s);
}

export function actualSpendPerGuest(row: Pick<ActualDailyRow, "revenue" | "guests">): number | null {
  return safeDiv(row.revenue, row.guests);
}

export function statisticalSpendPerGuest(row: Pick<StatisticalDailyRowV2, "statisticalTargetAmount" | "statisticalGuestTarget">): number | null {
  return safeDiv(Number(row.statisticalTargetAmount), Number(row.statisticalGuestTarget ?? 0));
}

/** Weighted rollup: totalRevenue / totalGuests. Never average ratios. */
export function weightedSpendPerGuest(rows: Array<{ revenue: number | null | undefined; guests: number | null | undefined }>): number | null {
  const rev = rows.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
  const g = rows.reduce((a, r) => a + Number(r.guests ?? 0), 0);
  return safeDiv(rev, g);
}

/* ---------------- classification ---------------- */

/** Operational lines only: service_period rows with is_rollup_only=false and event rows. */
export function isOperationalLine(line: ManagerTargetLine, periods: VenueServicePeriod[]): boolean {
  if (line.lineStatus !== "operating") return false;
  if (line.lineType === "event") return true;
  if (!line.servicePeriodId) return false;
  const sp = periods.find((p) => p.id === line.servicePeriodId);
  if (!sp) return false;
  return !sp.isRollupOnly;
}

/** Additive events add revenue to operational service-period totals. */
export function isAdditiveEvent(line: ManagerTargetLine): boolean {
  return line.lineType === "event" && line.lineStatus === "operating" && line.eventMode === "additive";
}

export function isReplacementEvent(line: ManagerTargetLine): boolean {
  return line.lineType === "event" && line.lineStatus === "operating" && (line.eventMode === "replaces_period" || line.eventMode === "partial_replacement");
}

export function isEventsOnly(line: ManagerTargetLine): boolean {
  return line.lineType === "event" && line.lineStatus === "operating" && line.eventMode === "events_only";
}

/* ---------------- aggregation ---------------- */

export interface ManagerAgg {
  revenue: number;
  guests: number;
  spendPerGuest: number | null;
  normalRevenue: number;
  eventRevenue: number;
}

/** Sum operational Manager rows (excludes roll-up-only, not_operating, replaced_by_event, closed). */
export function aggregateManager(lines: ManagerTargetLine[], periods: VenueServicePeriod[]): ManagerAgg {
  let normalRev = 0, eventRev = 0, guests = 0;
  for (const line of lines) {
    if (!isOperationalLine(line, periods)) continue;
    const rev = managerRevenue(line) ?? 0;
    const g = Number(line.managerGuestTarget ?? 0);
    if (line.lineType === "event") eventRev += rev; else normalRev += rev;
    guests += g;
  }
  const revenue = normalRev + eventRev;
  return { revenue, guests, spendPerGuest: safeDiv(revenue, guests), normalRevenue: normalRev, eventRevenue: eventRev };
}

/** Statistical daily benchmark for a venue/date — exactly one row per (venue,date). */
export function statisticalForDate(rows: StatisticalDailyRowV2[], venueId: string, date: string): StatisticalDailyRowV2 | null {
  return rows.find((r) => r.venueId === venueId && r.targetDate === date) ?? null;
}

export interface Aggregate {
  revenue: number;
  guests: number;
  spendPerGuest: number | null;
}

export function sumAggregates(items: Array<{ revenue: number | null | undefined; guests: number | null | undefined }>): Aggregate {
  const revenue = items.reduce((a, r) => a + Number(r.revenue ?? 0), 0);
  const guests = items.reduce((a, r) => a + Number(r.guests ?? 0), 0);
  return { revenue, guests, spendPerGuest: safeDiv(revenue, guests) };
}

/* ---------------- variance ---------------- */

export interface VarianceDecomposition {
  guestVolumeImpact: number;   // (aG - mG) * mSpg
  spendImpact: number;         // (aSpg - mSpg) * aG
  total: number;               // aRev - mRev
  reconciles: boolean;
}

export function decomposeVariance(actualRevenue: number, actualGuests: number, managerRevenue: number, managerGuests: number): VarianceDecomposition {
  const mSpg = managerGuests > 0 ? managerRevenue / managerGuests : 0;
  const aSpg = actualGuests > 0 ? actualRevenue / actualGuests : 0;
  const guestVolumeImpact = (actualGuests - managerGuests) * mSpg;
  const spendImpact = (aSpg - mSpg) * actualGuests;
  const total = actualRevenue - managerRevenue;
  const reconciles = Math.abs(guestVolumeImpact + spendImpact - total) < 0.0001;
  return { guestVolumeImpact, spendImpact, total, reconciles };
}

/* ---------------- day-of-week / period / venue filters ---------------- */

export interface DailyPoint {
  date: string;
  venueId: string;
  weekday: number;               // 0..6, Sunday=0
  managerRevenue: number;
  managerGuests: number;
  actual: ActualDailyRow | null;
  statistical: StatisticalDailyRowV2 | null;
}

export interface BuildDailyArgs {
  venueIds: string[];
  dates: string[]; // ISO YYYY-MM-DD in scope
  managerLines: ManagerTargetLine[];
  periods: VenueServicePeriod[];
  statistical: StatisticalDailyRowV2[];
  actuals: ActualDailyRow[];
}

export function buildDailySeries({ venueIds, dates, managerLines, periods, statistical, actuals }: BuildDailyArgs): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (const venueId of venueIds) {
    for (const date of dates) {
      const linesForDay = managerLines.filter((l) => l.venueId === venueId && l.targetDate === date);
      const mgr = aggregateManager(linesForDay, periods);
      const stat = statisticalForDate(statistical, venueId, date);
      const act = actuals.find((a) => a.venueId === venueId && a.targetDate === date) ?? null;
      out.push({
        date,
        venueId,
        weekday: new Date(date + "T00:00:00Z").getUTCDay(),
        managerRevenue: mgr.revenue,
        managerGuests: mgr.guests,
        actual: act,
        statistical: stat,
      });
    }
  }
  return out;
}

export function filterByWeekdays<T extends { weekday: number }>(points: T[], weekdays: number[]): T[] {
  if (!weekdays.length) return points;
  const set = new Set(weekdays);
  return points.filter((p) => set.has(p.weekday));
}

export function filterByVenues<T extends { venueId: string }>(points: T[], venueIds: string[]): T[] {
  if (!venueIds.length) return points;
  const set = new Set(venueIds);
  return points.filter((p) => set.has(p.venueId));
}

/** Filter operational manager lines by service period; roll-up-only periods excluded automatically. */
export function filterLinesByServicePeriods(lines: ManagerTargetLine[], periods: VenueServicePeriod[], servicePeriodIds: string[]): ManagerTargetLine[] {
  const operational = lines.filter((l) => isOperationalLine(l, periods));
  if (!servicePeriodIds.length) return operational;
  const set = new Set(servicePeriodIds);
  return operational.filter((l) => l.lineType === "event" || (l.servicePeriodId != null && set.has(l.servicePeriodId)));
}

/* ---------------- daily / monthly / weekday / venue rollups ---------------- */

export interface RollupAgg extends Aggregate {
  managerRevenue: number;
  managerGuests: number;
  statisticalRevenue: number;
  statisticalGuests: number;
}

function foldPoints(points: DailyPoint[]): RollupAgg {
  let mRev = 0, mG = 0, aRev = 0, aG = 0, sRev = 0, sG = 0;
  for (const p of points) {
    mRev += p.managerRevenue; mG += p.managerGuests;
    if (p.actual) { aRev += p.actual.revenue; aG += p.actual.guests; }
    if (p.statistical) {
      sRev += Number(p.statistical.statisticalTargetAmount ?? 0);
      sG += Number(p.statistical.statisticalGuestTarget ?? 0);
    }
  }
  return {
    revenue: aRev, guests: aG, spendPerGuest: safeDiv(aRev, aG),
    managerRevenue: mRev, managerGuests: mG,
    statisticalRevenue: sRev, statisticalGuests: sG,
  };
}

export function aggregateDaily(points: DailyPoint[]): Map<string, RollupAgg> {
  const by = new Map<string, DailyPoint[]>();
  for (const p of points) {
    const k = p.date;
    (by.get(k) ?? by.set(k, []).get(k)!).push(p);
  }
  return new Map(Array.from(by.entries()).map(([k, ps]) => [k, foldPoints(ps)]));
}

export function aggregateMonthly(points: DailyPoint[]): RollupAgg {
  return foldPoints(points);
}

export function aggregateByWeekday(points: DailyPoint[]): Map<number, RollupAgg> {
  const by = new Map<number, DailyPoint[]>();
  for (const p of points) {
    (by.get(p.weekday) ?? by.set(p.weekday, []).get(p.weekday)!).push(p);
  }
  return new Map(Array.from(by.entries()).map(([k, ps]) => [k, foldPoints(ps)]));
}

export function aggregateByVenue(points: DailyPoint[]): Map<string, RollupAgg> {
  const by = new Map<string, DailyPoint[]>();
  for (const p of points) {
    (by.get(p.venueId) ?? by.set(p.venueId, []).get(p.venueId)!).push(p);
  }
  return new Map(Array.from(by.entries()).map(([k, ps]) => [k, foldPoints(ps)]));
}

/** Manager totals grouped by operational service period (roll-up periods excluded). */
export function aggregateByServicePeriod(lines: ManagerTargetLine[], periods: VenueServicePeriod[]): Map<string, { revenue: number; guests: number; spendPerGuest: number | null }> {
  const by = new Map<string, { revenue: number; guests: number }>();
  for (const line of lines) {
    if (!isOperationalLine(line, periods)) continue;
    if (line.lineType !== "service_period" || !line.servicePeriodId) continue;
    const key = line.servicePeriodId;
    const cur = by.get(key) ?? { revenue: 0, guests: 0 };
    cur.revenue += managerRevenue(line) ?? 0;
    cur.guests += Number(line.managerGuestTarget ?? 0);
    by.set(key, cur);
  }
  return new Map(Array.from(by.entries()).map(([k, v]) => [k, { ...v, spendPerGuest: safeDiv(v.revenue, v.guests) }]));
}

/* ---------------- target-to-date and remaining-days ---------------- */

export function targetToDate(points: DailyPoint[], asOf: string): RollupAgg {
  return foldPoints(points.filter((p) => p.date <= asOf));
}

export function remainingBusinessDays(points: DailyPoint[], asOf: string): DailyPoint[] {
  return points.filter((p) => p.date > asOf);
}
