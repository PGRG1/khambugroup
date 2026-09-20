import { describe, expect, it } from "vitest";
import {
  computeForecastOverview,
  resolveComparisonWindow,
  type ForecastVenueInput,
} from "@/utils/revenueForecastOverview";

/** 8 prior same-weekday observations before 2026-09-01 (a Tuesday), each `amount`. */
function weeklyHistory(target: string, amount: number, count = 8): Map<string, number> {
  const out = new Map<string, number>();
  const base = new Date(`${target}T00:00:00Z`);
  for (let i = 1; i <= count; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.set(d.toISOString().slice(0, 10), amount);
  }
  return out;
}

const D = (s: string) => new Date(`${s}T00:00:00`);

function venue(
  id: string,
  name: string,
  salesByDate: Map<string, number>,
  projections = new Map<string, number>(),
): ForecastVenueInput {
  return { venueId: id, venueName: name, salesByDate, projections };
}

describe("resolveComparisonWindow", () => {
  it("clamps a future end date to today", () => {
    const w = resolveComparisonWindow(D("2026-09-01"), D("2026-09-30"), D("2026-09-10"));
    expect(w.ok).toBe(true);
    expect(w.from).toBe("2026-09-01");
    expect(w.to).toBe("2026-09-10");
  });

  it("keeps a past full month intact", () => {
    const w = resolveComparisonWindow(D("2026-08-01"), D("2026-08-31"), D("2026-09-10"));
    expect(w.to).toBe("2026-08-31");
  });

  it("rejects multi-month ranges", () => {
    const w = resolveComparisonWindow(D("2026-07-01"), D("2026-09-30"), D("2026-09-10"));
    expect(w.ok).toBe(false);
    expect(w.reason).toBe("multi-month");
  });

  it("rejects All Time (no range)", () => {
    expect(resolveComparisonWindow(undefined, undefined, D("2026-09-10")).reason).toBe("no-range");
  });
});

describe("computeForecastOverview", () => {
  it("returns unavailable for a multi-month range", () => {
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", new Map())],
      from: D("2026-07-01"),
      to: D("2026-09-30"),
      today: D("2026-09-10"),
    });
    expect(s.status).toBe("unavailable");
    expect(s.forecastTotal).toBeNull();
    expect(s.daily).toEqual([]);
  });

  it("uses the manager override over the auto forecast", () => {
    const hist = weeklyHistory("2026-09-01", 1000);
    hist.set("2026-09-01", 900);
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", hist, new Map([["2026-09-01", 1500]]))],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
    });
    expect(s.status).toBe("ok");
    expect(s.forecastTotal).toBe(1500);
    expect(s.actualComparable).toBe(900);
    expect(s.variance).toBe(-600);
    expect(s.variancePct).toBeCloseTo(-40, 5);
    expect(s.daily[0]).toMatchObject({
      date: "2026-09-01",
      actual: 900,
      forecast: 1500,
      variance: -600,
      scopedVenueCount: 1,
      forecastedVenueCount: 1,
    });
    expect(s.daily[0].variancePct).toBeCloseTo(-40, 5);
  });

  it("computes forecast/actual/variance with complete coverage", () => {
    const hist = weeklyHistory("2026-09-01", 1000);
    hist.set("2026-09-01", 1200);
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", hist)],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
    });
    expect(s.forecastTotal).toBe(1000);
    expect(s.actualComparable).toBe(1200);
    expect(s.variance).toBe(200);
    expect(s.variancePct).toBeCloseTo(20, 5);
  });

  it("sums venue-level forecasts rather than combined history", () => {
    const a = weeklyHistory("2026-09-01", 1000);
    const b = weeklyHistory("2026-09-01", 400);
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", a), venue("v2", "Caliente", b)],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
    });
    expect(s.status).toBe("ok");
    expect(s.forecastTotal).toBe(1400);
    expect(s.scopedVenueDays).toBe(2);
    expect(s.forecastedVenueDays).toBe(2);
    expect(s.daily[0]).toMatchObject({ forecast: 1400, scopedVenueCount: 2, forecastedVenueCount: 2 });
  });

  it("marks the summary incomplete when any scoped venue-day has no forecast", () => {
    const a = weeklyHistory("2026-09-01", 1000);
    const b = weeklyHistory("2026-09-01", 400, 3); // too few observations
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", a), venue("v2", "Caliente", b)],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
    });
    expect(s.status).toBe("incomplete");
    expect(s.variance).toBeNull();
    expect(s.variancePct).toBeNull();
    expect(s.forecastedVenueDays).toBe(1);
    expect(s.scopedVenueDays).toBe(2);
    expect(s.daily[0]).toMatchObject({
      forecast: null,
      variance: null,
      variancePct: null,
      scopedVenueCount: 2,
      forecastedVenueCount: 1,
    });
  });

  it("treats an elapsed date with no sales row as zero actual", () => {
    const hist = weeklyHistory("2026-09-01", 1000);
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", hist)],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
    });
    expect(s.actualComparable).toBe(0);
    expect(s.variance).toBe(-1000);
  });

  it("All Venues ignores an active venue with no history and no projections", () => {
    const a = weeklyHistory("2026-09-01", 1000);
    const empty = new Map<string, number>();
    const s = computeForecastOverview({
      venues: [
        venue("v1", "Assembly", a),
        venue("v2", "Caliente", weeklyHistory("2026-09-01", 400)),
        venue("v3", "Arca", empty),
      ],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
      excludeEmptyVenues: true,
    });
    expect(s.status).toBe("ok");
    expect(s.scopedVenueDays).toBe(2);
    expect(s.forecastTotal).toBe(1400);
    expect(s.daily[0].scopedVenueCount).toBe(2);
  });

  it("All Venues keeps a venue that has projections but no sales history", () => {
    const s = computeForecastOverview({
      venues: [venue("v3", "Arca", new Map(), new Map([["2026-09-01", 500]]))],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
      excludeEmptyVenues: true,
    });
    expect(s.status).toBe("ok");
    expect(s.forecastTotal).toBe(500);
  });

  it("All Venues with only empty venues is unavailable", () => {
    const s = computeForecastOverview({
      venues: [venue("v3", "Arca", new Map())],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
      excludeEmptyVenues: true,
    });
    expect(s.status).toBe("unavailable");
    expect(s.reason).toBe("no-venues");
  });

  it("a specifically selected empty venue is not ignored and shows incomplete", () => {
    const s = computeForecastOverview({
      venues: [venue("v3", "Arca", new Map())],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
      excludeEmptyVenues: false,
    });
    expect(s.status).toBe("incomplete");
    expect(s.scopedVenueDays).toBe(1);
    expect(s.forecastedVenueDays).toBe(0);
  });

  it("a relevant venue with history but insufficient forecast still marks incomplete", () => {
    const a = weeklyHistory("2026-09-01", 1000);
    const b = weeklyHistory("2026-09-01", 400, 3); // history exists, but too few for a forecast
    const s = computeForecastOverview({
      venues: [venue("v1", "Assembly", a), venue("v2", "Caliente", b)],
      from: D("2026-09-01"),
      to: D("2026-09-01"),
      today: D("2026-09-01"),
      excludeEmptyVenues: true,
    });
    expect(s.status).toBe("incomplete");
    expect(s.forecastedVenueDays).toBe(1);
    expect(s.scopedVenueDays).toBe(2);
  });
});
