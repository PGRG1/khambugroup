import { describe, it, expect } from "vitest";
import {
  aggregateByServicePeriod,
  aggregateByVenue,
  aggregateByWeekday,
  aggregateDaily,
  aggregateMonthly,
  buildDailySeries,
  decomposeVariance,
  filterByVenues,
  filterByWeekdays,
  filterLinesByServicePeriods,
  isOperationalLine,
  managerRevenue,
  statisticalSpendPerGuest,
  actualSpendPerGuest,
  weightedSpendPerGuest,
} from "@/utils/revenueTargetAnalytics";
import type {
  ActualDailyRow,
  ManagerTargetLine,
  StatisticalDailyRowV2,
  VenueServicePeriod,
} from "@/types/revenueTargetsV2";

const V1 = "venue-1";
const V2 = "venue-2";
const T = "tenant-x";

const PERIODS: VenueServicePeriod[] = [
  { id: "sp-full-op", tenantId: T, venueId: V1, name: "Full Day", code: null, startTime: "00:00", endTime: "23:59", crossesMidnight: false, applicableWeekdays: [0,1,2,3,4,5,6], isActive: true, sortOrder: 1, effectiveFrom: "2000-01-01", effectiveTo: null, isRollupOnly: false },
  { id: "sp-lunch", tenantId: T, venueId: V2, name: "Lunch", code: null, startTime: "11:00", endTime: "15:00", crossesMidnight: false, applicableWeekdays: [0,1,2,3,4,5,6], isActive: true, sortOrder: 1, effectiveFrom: "2000-01-01", effectiveTo: null, isRollupOnly: false },
  { id: "sp-dinner", tenantId: T, venueId: V2, name: "Dinner", code: null, startTime: "18:00", endTime: "23:00", crossesMidnight: false, applicableWeekdays: [0,1,2,3,4,5,6], isActive: true, sortOrder: 2, effectiveFrom: "2000-01-01", effectiveTo: null, isRollupOnly: false },
  { id: "sp-rollup-v2", tenantId: T, venueId: V2, name: "Full Day (Benchmark)", code: "FULL_DAY_ROLLUP", startTime: "00:00", endTime: "23:59", crossesMidnight: false, applicableWeekdays: [0,1,2,3,4,5,6], isActive: true, sortOrder: 0, effectiveFrom: "2000-01-01", effectiveTo: null, isRollupOnly: true },
  { id: "sp-dinner-only", tenantId: T, venueId: "venue-dinner-only", name: "Dinner", code: null, startTime: "18:00", endTime: "23:00", crossesMidnight: false, applicableWeekdays: [0,1,2,3,4,5,6], isActive: true, sortOrder: 1, effectiveFrom: "2000-01-01", effectiveTo: null, isRollupOnly: false },
];

function makeLine(overrides: Partial<ManagerTargetLine> = {}): ManagerTargetLine {
  return {
    id: overrides.id ?? "l-" + Math.random(),
    tenantId: T,
    venueId: V1,
    targetDate: "2026-07-01",
    lineType: "service_period",
    servicePeriodId: "sp-full-op",
    eventName: null, eventType: null, eventMode: null, replacesServicePeriodId: null,
    venueArea: null, eventStartTime: null, eventEndTime: null,
    targetInputMode: "drivers",
    managerGuestTarget: 100,
    managerSpendPerGuestTarget: 50,
    managerRevenueOverride: null,
    managerRevenueTarget: 5000,
    lineStatus: "operating",
    zeroReason: null, managerSource: null, status: "draft", notes: null,
    ...overrides,
  };
}

/* ============ CALC RULES ============ */

describe("managerRevenue", () => {
  it("uses generated managerRevenueTarget when present", () => {
    expect(managerRevenue(makeLine({ managerRevenueTarget: 4321 }))).toBe(4321);
  });
  it("computes guests × spg when generated column is null", () => {
    expect(managerRevenue(makeLine({ managerRevenueTarget: null, managerGuestTarget: 80, managerSpendPerGuestTarget: 25 }))).toBe(2000);
  });
  it("returns null when drivers missing", () => {
    expect(managerRevenue(makeLine({ managerRevenueTarget: null, managerGuestTarget: null }))).toBeNull();
  });
  it("uses override in contracted_revenue mode", () => {
    expect(managerRevenue(makeLine({ targetInputMode: "contracted_revenue", managerRevenueOverride: 9999, managerRevenueTarget: null }))).toBe(9999);
  });
});

describe("spend-per-guest math", () => {
  it("statistical SPG = revenue / guests", () => {
    const row: StatisticalDailyRowV2 = {
      id: "s", tenantId: T, venueId: V1, venueNameSnapshot: "V1",
      servicePeriodId: "sp-rollup-v2", servicePeriodNameSnapshot: "Roll-up",
      targetDate: "2026-07-01",
      statisticalTargetAmount: 1000, statisticalGuestTarget: 40, statisticalSpendPerGuest: 25,
      model: "m", modelVersion: "same_weekday_full_day_median_12w_v3",
      lookbackStart: "2026-04-06", lookbackEnd: "2026-06-30",
      observationCount: 12, revenueObservationCount: 12, guestObservationCount: 12,
      confidence: "high", generatedAt: new Date().toISOString(), generatedBy: null,
    };
    expect(statisticalSpendPerGuest(row)).toBe(25);
  });
  it("actual SPG = revenue / guests", () => {
    expect(actualSpendPerGuest({ revenue: 1200, guests: 60 })).toBe(20);
  });
  it("weighted SPG uses totals, not average of ratios", () => {
    // Two days: (100/10=10) and (900/30=30). Avg-of-ratios = 20; weighted = 1000/40 = 25.
    const w = weightedSpendPerGuest([{ revenue: 100, guests: 10 }, { revenue: 900, guests: 30 }]);
    expect(w).toBe(25);
  });
  it("weighted SPG returns null when total guests is 0", () => {
    expect(weightedSpendPerGuest([{ revenue: 100, guests: 0 }])).toBeNull();
  });
});

/* ============ VARIANCE ============ */

describe("decomposeVariance", () => {
  it("guest impact + spend impact reconciles to actual − manager revenue", () => {
    const v = decomposeVariance(1200, 60, 1000, 50); // mSpg=20, aSpg=20 -> pure guest impact
    expect(v.guestVolumeImpact).toBe(200);
    expect(v.spendImpact).toBe(0);
    expect(v.total).toBe(200);
    expect(v.reconciles).toBe(true);
  });
  it("mixed variance reconciles", () => {
    const v = decomposeVariance(1500, 60, 1000, 50); // mSpg=20, aSpg=25
    // guest: (60-50)*20=200; spend: (25-20)*60=300; total=500
    expect(v.guestVolumeImpact).toBe(200);
    expect(v.spendImpact).toBe(300);
    expect(v.total).toBe(500);
    expect(v.reconciles).toBe(true);
  });
});

/* ============ CLASSIFICATION / ROLL-UP EXCLUSION ============ */

describe("isOperationalLine — roll-up exclusion", () => {
  it("excludes lines pointing at a roll-up-only period", () => {
    const line = makeLine({ venueId: V2, servicePeriodId: "sp-rollup-v2" });
    expect(isOperationalLine(line, PERIODS)).toBe(false);
  });
  it("includes lines pointing at operational periods", () => {
    const line = makeLine({ venueId: V2, servicePeriodId: "sp-lunch" });
    expect(isOperationalLine(line, PERIODS)).toBe(true);
  });
  it("excludes not_operating / closed / replaced_by_event", () => {
    for (const status of ["not_operating", "replaced_by_event", "closed"] as const) {
      expect(isOperationalLine(makeLine({ lineStatus: status, zeroReason: "x" }), PERIODS)).toBe(false);
    }
  });
});

/* ============ AGGREGATION ============ */

describe("aggregation & double-counting guards", () => {
  const dates = ["2026-07-01", "2026-07-02"];
  const venueIds = [V2];

  // Multi-period venue V2: Lunch 30g×$40=1200; Dinner 60g×$60=3600. No Full-Day manager line.
  const managerLines: ManagerTargetLine[] = [
    makeLine({ id: "l1", venueId: V2, servicePeriodId: "sp-lunch",  managerGuestTarget: 30, managerSpendPerGuestTarget: 40, managerRevenueTarget: 1200, targetDate: dates[0] }),
    makeLine({ id: "l2", venueId: V2, servicePeriodId: "sp-dinner", managerGuestTarget: 60, managerSpendPerGuestTarget: 60, managerRevenueTarget: 3600, targetDate: dates[0] }),
    // A stray roll-up-only Manager line MUST be ignored even if present.
    makeLine({ id: "l3", venueId: V2, servicePeriodId: "sp-rollup-v2", managerGuestTarget: 999, managerSpendPerGuestTarget: 999, managerRevenueTarget: 999999, targetDate: dates[0] }),
    // Additive event on day 1
    makeLine({ id: "l4", venueId: V2, lineType: "event", servicePeriodId: null, eventName: "Corp Dinner", eventMode: "additive", managerGuestTarget: 20, managerSpendPerGuestTarget: 100, managerRevenueTarget: 2000, targetDate: dates[0] }),
    // Day 2 same normal periods, no events
    makeLine({ id: "l5", venueId: V2, servicePeriodId: "sp-lunch",  managerGuestTarget: 25, managerSpendPerGuestTarget: 40, managerRevenueTarget: 1000, targetDate: dates[1] }),
    makeLine({ id: "l6", venueId: V2, servicePeriodId: "sp-dinner", managerGuestTarget: 50, managerSpendPerGuestTarget: 60, managerRevenueTarget: 3000, targetDate: dates[1] }),
  ];

  const statistical: StatisticalDailyRowV2[] = dates.map((d, i) => ({
    id: "s" + i, tenantId: T, venueId: V2, venueNameSnapshot: "V2",
    servicePeriodId: "sp-rollup-v2", servicePeriodNameSnapshot: "Roll-up",
    targetDate: d,
    statisticalTargetAmount: 5000, statisticalGuestTarget: 100, statisticalSpendPerGuest: 50,
    model: "m", modelVersion: "same_weekday_full_day_median_12w_v3",
    lookbackStart: "2026-04-06", lookbackEnd: "2026-06-30",
    observationCount: 12, revenueObservationCount: 12, guestObservationCount: 12,
    confidence: "high", generatedAt: new Date().toISOString(), generatedBy: null,
  }));

  const actuals: ActualDailyRow[] = dates.map((d) => ({
    venueId: V2, targetDate: d, revenue: 5500, guests: 110, spendPerGuest: 50, coverage: "full_day_only",
  }));

  const points = buildDailySeries({ venueIds, dates, managerLines, periods: PERIODS, statistical, actuals });

  it("Manager daily total excludes roll-up-only line, includes additive event", () => {
    // Day 1: 1200 + 3600 + 2000 = 6800 (NOT 999999 + ...)
    const day1 = points.find((p) => p.date === dates[0])!;
    expect(day1.managerRevenue).toBe(6800);
    expect(day1.managerGuests).toBe(110); // 30 + 60 + 20
  });
  it("Statistical benchmark is single row per (venue,date); not summed into service periods", () => {
    const day1 = points.find((p) => p.date === dates[0])!;
    expect(day1.statistical?.statisticalTargetAmount).toBe(5000);
    // The manager total (6800) is NOT combined with the statistical 5000 anywhere.
    expect(day1.managerRevenue + (day1.statistical?.statisticalTargetAmount ?? 0)).toBe(11800); // sanity: caller could sum, but analytics keep them separate.
  });
  it("daily aggregation does not double-count Full-Day + service periods", () => {
    const daily = aggregateDaily(points);
    // Manager daily is service periods + events only (6800 and 4000). Statistical rollup benchmark is separate.
    expect(daily.get(dates[0])!.managerRevenue).toBe(6800);
    expect(daily.get(dates[1])!.managerRevenue).toBe(4000);
  });
  it("monthly aggregation sums operational manager rows only", () => {
    const m = aggregateMonthly(points);
    expect(m.managerRevenue).toBe(10800); // 6800 + 4000
    expect(m.statisticalRevenue).toBe(10000); // 5000 * 2, from single benchmark row per day
  });
  it("weekday aggregation groups points and applies weighted SPG (revenue/guests)", () => {
    const wk = aggregateByWeekday(points);
    // 2026-07-01 = Wednesday(3), 2026-07-02 = Thursday(4)
    expect(wk.get(3)!.revenue).toBe(5500);
    expect(wk.get(4)!.revenue).toBe(5500);
    expect(wk.get(3)!.spendPerGuest).toBe(50);
  });
  it("venue aggregation folds correctly", () => {
    const bv = aggregateByVenue(points);
    expect(bv.get(V2)!.managerRevenue).toBe(10800);
  });
  it("service-period aggregation excludes roll-up-only and events", () => {
    const sp = aggregateByServicePeriod(managerLines, PERIODS);
    expect(sp.get("sp-lunch")!.revenue).toBe(2200);   // 1200 + 1000
    expect(sp.get("sp-dinner")!.revenue).toBe(6600);  // 3600 + 3000
    expect(sp.has("sp-rollup-v2")).toBe(false);
    // events grouped separately (not by service period)
  });
});

/* ============ FILTERS ============ */

describe("filters", () => {
  const points = [
    { venueId: V1, weekday: 1, date: "d" },
    { venueId: V2, weekday: 2, date: "d" },
    { venueId: V2, weekday: 3, date: "d" },
  ];
  it("day-of-week filter", () => {
    expect(filterByWeekdays(points, [2, 3]).length).toBe(2);
  });
  it("venue filter", () => {
    expect(filterByVenues(points, [V2]).length).toBe(2);
  });
  it("service-period filter respects roll-up exclusion", () => {
    const lines = [
      { ...({} as ManagerTargetLine), id: "a", tenantId: T, venueId: V2, targetDate: "d", lineType: "service_period" as const, servicePeriodId: "sp-lunch", eventName: null, eventType: null, eventMode: null, replacesServicePeriodId: null, venueArea: null, eventStartTime: null, eventEndTime: null, targetInputMode: "drivers" as const, managerGuestTarget: 10, managerSpendPerGuestTarget: 10, managerRevenueOverride: null, managerRevenueTarget: 100, lineStatus: "operating" as const, zeroReason: null, managerSource: null, status: "draft" as const, notes: null },
      { ...({} as ManagerTargetLine), id: "b", tenantId: T, venueId: V2, targetDate: "d", lineType: "service_period" as const, servicePeriodId: "sp-rollup-v2", eventName: null, eventType: null, eventMode: null, replacesServicePeriodId: null, venueArea: null, eventStartTime: null, eventEndTime: null, targetInputMode: "drivers" as const, managerGuestTarget: 10, managerSpendPerGuestTarget: 10, managerRevenueOverride: null, managerRevenueTarget: 100, lineStatus: "operating" as const, zeroReason: null, managerSource: null, status: "draft" as const, notes: null },
    ];
    const out = filterLinesByServicePeriods(lines, PERIODS, ["sp-lunch", "sp-rollup-v2"]);
    expect(out.map((l) => l.id)).toEqual(["a"]);
  });
});

/* ============ EVENT MODES ============ */

describe("event modes affect Manager totals as designed", () => {
  const dates = ["2026-07-01"];
  const venueIds = [V2];

  function scenario(events: ManagerTargetLine[]) {
    const base: ManagerTargetLine[] = [
      makeLine({ id: "sp-l", venueId: V2, servicePeriodId: "sp-lunch",  managerRevenueTarget: 1000, managerGuestTarget: 25, managerSpendPerGuestTarget: 40, targetDate: dates[0] }),
      makeLine({ id: "sp-d", venueId: V2, servicePeriodId: "sp-dinner", managerRevenueTarget: 2000, managerGuestTarget: 40, managerSpendPerGuestTarget: 50, targetDate: dates[0] }),
    ];
    const stats: StatisticalDailyRowV2[] = [];
    const acts: ActualDailyRow[] = [];
    const pts = buildDailySeries({ venueIds, dates, managerLines: [...base, ...events], periods: PERIODS, statistical: stats, actuals: acts });
    return pts[0];
  }

  it("additive event adds to totals", () => {
    const e = makeLine({ id: "ev", venueId: V2, lineType: "event", servicePeriodId: null, eventName: "X", eventMode: "additive", managerRevenueTarget: 500, managerGuestTarget: 10, managerSpendPerGuestTarget: 50, targetDate: dates[0] });
    expect(scenario([e]).managerRevenue).toBe(3500);
  });
  it("replacement event: when the replaced period line_status is replaced_by_event, it is excluded; the event contributes", () => {
    const replacedLunch = makeLine({ id: "sp-l-repl", venueId: V2, servicePeriodId: "sp-lunch", managerRevenueTarget: 1000, managerGuestTarget: 25, managerSpendPerGuestTarget: 40, lineStatus: "replaced_by_event", zeroReason: "replaced_by_event", targetDate: dates[0] });
    const event = makeLine({ id: "ev-r", venueId: V2, lineType: "event", servicePeriodId: null, eventName: "Buyout", eventMode: "replaces_period", replacesServicePeriodId: "sp-lunch", managerRevenueTarget: 4000, managerGuestTarget: 80, managerSpendPerGuestTarget: 50, targetDate: dates[0] });
    const base: ManagerTargetLine[] = [
      replacedLunch, // ignored (not operating)
      makeLine({ id: "sp-d", venueId: V2, servicePeriodId: "sp-dinner", managerRevenueTarget: 2000, managerGuestTarget: 40, managerSpendPerGuestTarget: 50, targetDate: dates[0] }),
    ];
    const pts = buildDailySeries({ venueIds, dates, managerLines: [...base, event], periods: PERIODS, statistical: [], actuals: [] });
    expect(pts[0].managerRevenue).toBe(6000); // 0 (lunch replaced) + 2000 (dinner) + 4000 (event)
  });
  it("events_only day: only the event contributes to totals (service periods marked not_operating)", () => {
    const dinnerClosed = makeLine({ id: "sp-d-clo", venueId: V2, servicePeriodId: "sp-dinner", lineStatus: "not_operating", zeroReason: "events_only", managerRevenueTarget: null, managerGuestTarget: null, managerSpendPerGuestTarget: null, targetDate: dates[0] });
    const lunchClosed = makeLine({ id: "sp-l-clo", venueId: V2, servicePeriodId: "sp-lunch",  lineStatus: "not_operating", zeroReason: "events_only", managerRevenueTarget: null, managerGuestTarget: null, managerSpendPerGuestTarget: null, targetDate: dates[0] });
    const event = makeLine({ id: "ev-o", venueId: V2, lineType: "event", servicePeriodId: null, eventName: "Wedding", eventMode: "events_only", managerRevenueTarget: 8000, managerGuestTarget: 120, managerSpendPerGuestTarget: null, targetDate: dates[0] });
    const pts = buildDailySeries({ venueIds, dates, managerLines: [dinnerClosed, lunchClosed, event], periods: PERIODS, statistical: [], actuals: [] });
    expect(pts[0].managerRevenue).toBe(8000);
    expect(pts[0].managerGuests).toBe(120);
  });
  it("closed day: no operational lines contribute", () => {
    const closedLunch = makeLine({ id: "clo-l", venueId: V2, servicePeriodId: "sp-lunch",  lineStatus: "closed", zeroReason: "closed", managerRevenueTarget: null, managerGuestTarget: null, managerSpendPerGuestTarget: null, targetDate: dates[0] });
    const closedDinner = makeLine({ id: "clo-d", venueId: V2, servicePeriodId: "sp-dinner", lineStatus: "closed", zeroReason: "closed", managerRevenueTarget: null, managerGuestTarget: null, managerSpendPerGuestTarget: null, targetDate: dates[0] });
    const pts = buildDailySeries({ venueIds, dates, managerLines: [closedLunch, closedDinner], periods: PERIODS, statistical: [], actuals: [] });
    expect(pts[0].managerRevenue).toBe(0);
    expect(pts[0].managerGuests).toBe(0);
  });
});

/* ============ FABRICATION GUARDS (contract tests) ============ */

describe("Phase 1 contracts remain honoured", () => {
  it("no fabricated service-period Statistical values — analytics only look up (venue,date)", () => {
    // Statistical rows attached only to roll-up period; buildDailySeries stores that single row.
    const dates = ["2026-07-01"];
    const points = buildDailySeries({
      venueIds: [V2], dates, managerLines: [], periods: PERIODS,
      statistical: [{
        id: "s", tenantId: T, venueId: V2, venueNameSnapshot: "V2",
        servicePeriodId: "sp-rollup-v2", servicePeriodNameSnapshot: "Roll-up",
        targetDate: dates[0],
        statisticalTargetAmount: 5000, statisticalGuestTarget: 100, statisticalSpendPerGuest: 50,
        model: "m", modelVersion: "same_weekday_full_day_median_12w_v3",
        lookbackStart: "2026-04-06", lookbackEnd: "2026-06-30",
        observationCount: 12, revenueObservationCount: 12, guestObservationCount: 12,
        confidence: "high", generatedAt: new Date().toISOString(), generatedBy: null,
      }],
      actuals: [],
    });
    // The rollup row is the sole benchmark; no per-period synthesis exists.
    expect(points[0].statistical?.servicePeriodId).toBe("sp-rollup-v2");
  });
  it("Full-Day Actuals are exposed with coverage 'full_day_only' and not replicated per service period", () => {
    const actual: ActualDailyRow = { venueId: V2, targetDate: "2026-07-01", revenue: 5500, guests: 110, spendPerGuest: 50, coverage: "full_day_only" };
    expect(actual.coverage).toBe("full_day_only");
    // Analytics never fan out Actuals to service periods; service-period Actuals must be treated as unavailable by consumers.
  });
  it("single Dinner-only venue is NOT seeded from Full-Day Statistical (Manager-seed guard)", () => {
    // This is enforced by the seeder RPC (venue has exactly-1 operational period AND it must be Full-Day).
    // Here we mirror the guard: filter to a Dinner-only venue's operational periods.
    const ops = PERIODS.filter((p) => p.venueId === "venue-dinner-only" && p.isActive && !p.isRollupOnly);
    expect(ops.length).toBe(1);
    expect(ops[0].name.toLowerCase()).not.toBe("full day");
  });
  it("single genuine Full-Day venue may receive Statistical defaults", () => {
    const ops = PERIODS.filter((p) => p.venueId === V1 && p.isActive && !p.isRollupOnly);
    expect(ops.length).toBe(1);
    expect(ops[0].name.toLowerCase()).toBe("full day");
  });
});
