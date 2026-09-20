import { describe, expect, it } from "vitest";
import {
  aggregateActualsByDate,
  buildProjectionRows,
  computeAutoForecast,
  computeVariance,
  formatForecastNumber,
  formatHkd,
  monthDates,
  NEW_TARGET_COLUMNS,
  parseProjectedInput,
} from "@/utils/dailyProjections";

describe("New Targets daily projections", () => {
  it("generates one row per calendar day of the selected month", () => {
    expect(monthDates(2026, 2)).toHaveLength(28);
    expect(monthDates(2024, 2)).toHaveLength(29);
    const rows = buildProjectionRows(2026, 9, new Map(), new Map());
    expect(rows).toHaveLength(30);
    expect(rows[0].date).toBe("2026-09-01");
    expect(rows[0].day).toBe("Tue");
    expect(rows[29].date).toBe("2026-09-30");
  });

  it("exposes exactly the five columns with only Forecast editable", () => {
    expect(NEW_TARGET_COLUMNS.map((c) => c.label)).toEqual([
      "Date", "Day", "Forecast", "Actual Sales", "Variance",
    ]);
    expect(NEW_TARGET_COLUMNS.filter((c) => c.editable).map((c) => c.key)).toEqual(["forecast"]);
  });

  it("aggregates actual total sales per date from sales records", () => {
    const actuals = aggregateActualsByDate([
      { date: "2026-09-01", total_sales: 1000 },
      { date: "2026-09-01T00:00:00", total_sales: "500.5" },
      { date: "2026-09-02", total_sales: 200 },
      { date: null, total_sales: 999 },
    ]);
    expect(actuals.get("2026-09-01")).toBe(1500.5);
    expect(actuals.get("2026-09-02")).toBe(200);
    expect(actuals.size).toBe(2);
  });

  it("calculates variance as actual minus projected, only when both exist", () => {
    expect(computeVariance(1200, 1000)).toBe(200);
    expect(computeVariance(800, 1000)).toBe(-200);
    expect(computeVariance(500, 0)).toBe(500);
    expect(computeVariance(500, null)).toBeNull();
    expect(computeVariance(null, 500)).toBeNull();
  });

  it("leaves actuals and variance blank for future or missing dates", () => {
    const rows = buildProjectionRows(
      2026, 9,
      new Map([["2026-09-20", 5000]]),
      new Map([["2026-09-01", 4000]]),
    );
    const d1 = rows.find((r) => r.date === "2026-09-01")!;
    expect(d1.actualSales).toBe(4000);
    expect(d1.variance).toBeNull();
    const d20 = rows.find((r) => r.date === "2026-09-20")!;
    expect(d20.projectedSales).toBe(5000);
    expect(d20.actualSales).toBeNull();
    expect(d20.variance).toBeNull();
  });

  it("formats money as HK$ with commas and dashes for blanks", () => {
    expect(formatHkd(1234567.5)).toBe("HK$ 1,234,567.50");
    expect(formatHkd(0)).toBe("HK$ 0.00");
    expect(formatHkd(null)).toBe("—");
  });

  it("formats editable forecasts with commas and exactly two decimals", () => {
    expect(formatForecastNumber(11423.25)).toBe("11,423.25");
    expect(formatForecastNumber(16722.5)).toBe("16,722.50");
    expect(formatForecastNumber(18067)).toBe("18,067.00");
  });

  it("accepts zero and decimals but rejects negatives", () => {
    expect(parseProjectedInput("0")).toEqual({ ok: true, value: 0 });
    expect(parseProjectedInput("1234.56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseProjectedInput("11,423.25")).toEqual({ ok: true, value: 11423.25 });
    expect(parseProjectedInput("")).toEqual({ ok: true, value: null });
    expect(parseProjectedInput("-5").ok).toBe(false);
    expect(parseProjectedInput("abc").ok).toBe(false);
  });
});

/** Sales history helper: n weekly dates counting back from `lastDate`. */
function weeklyHistory(lastDate: string, count: number, value: number | ((i: number) => number)) {
  const m = new Map<string, number>();
  const [y, mo, d] = lastDate.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(y, mo - 1, d - i * 7));
    m.set(dt.toISOString().slice(0, 10), typeof value === "function" ? value(i) : value);
  }
  return m;
}

describe("automatic same-weekday forecast", () => {
  it("requires exactly 8 matching observations", () => {
    // 2026-09-15 is a Tuesday
    const seven = weeklyHistory("2026-09-08", 7, 1000);
    expect(computeAutoForecast("2026-09-15", seven)).toBeNull();
    const eight = weeklyHistory("2026-09-08", 8, 1000);
    expect(computeAutoForecast("2026-09-15", eight)).toBe(1000);
  });

  it("averages only the same weekday and ignores other days", () => {
    const hist = weeklyHistory("2026-09-08", 8, (i) => (i === 0 ? 1800 : 1000));
    // A Wednesday with plenty of Tuesday data has no forecast
    hist.set("2026-09-09", 99999);
    expect(computeAutoForecast("2026-09-15", hist)).toBe((1800 + 7 * 1000) / 8);
    expect(computeAutoForecast("2026-09-16", hist)).toBeNull();
  });

  it("skips dates with no sales record and includes zero-valued records", () => {
    const hist = weeklyHistory("2026-09-08", 9, 800);
    hist.delete("2026-09-01"); // missing record is skipped, older one is used
    hist.set("2026-09-08", 0); // zero is a valid observation
    const avg = computeAutoForecast("2026-09-15", hist)!;
    expect(avg).toBe((0 + 7 * 800) / 8);
  });

  it("never uses sales on or after the target date", () => {
    const hist = weeklyHistory("2026-09-15", 8, 1000);
    hist.set("2026-09-22", 50000);
    // Only 7 dates strictly before 2026-09-15 remain
    expect(computeAutoForecast("2026-09-15", hist)).toBeNull();
  });

  it("prefers a manager override, falls back to Auto when cleared", () => {
    const hist = weeklyHistory("2026-09-08", 8, 1000);
    const actuals = new Map([["2026-09-15", 1200]]);
    const withOverride = buildProjectionRows(2026, 9, new Map([["2026-09-15", 2000]]), actuals, hist);
    const r1 = withOverride.find((r) => r.date === "2026-09-15")!;
    expect(r1.forecastSource).toBe("manager");
    expect(r1.effectiveForecast).toBe(2000);
    expect(r1.variance).toBe(-800);

    const cleared = buildProjectionRows(2026, 9, new Map(), actuals, hist);
    const r2 = cleared.find((r) => r.date === "2026-09-15")!;
    expect(r2.forecastSource).toBe("auto");
    expect(r2.autoForecast).toBe(1000);
    expect(r2.effectiveForecast).toBe(1000);
    expect(r2.variance).toBe(200);
  });

  it("marks rows without enough data as having no forecast", () => {
    const rows = buildProjectionRows(2026, 9, new Map(), new Map(), new Map());
    expect(rows.every((r) => r.forecastSource === "none" && r.effectiveForecast === null)).toBe(true);
  });
});
