import { describe, expect, it } from "vitest";
import {
  aggregateActualsByDate,
  buildProjectionRows,
  computeVariance,
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

  it("exposes exactly the five columns with only Projected Sales editable", () => {
    expect(NEW_TARGET_COLUMNS.map((c) => c.label)).toEqual([
      "Date", "Day", "Projected Sales", "Actual Sales", "Variance",
    ]);
    expect(NEW_TARGET_COLUMNS.filter((c) => c.editable).map((c) => c.key)).toEqual(["projectedSales"]);
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

  it("calculates variance as actual minus projected", () => {
    expect(computeVariance(1200, 1000)).toBe(200);
    expect(computeVariance(800, 1000)).toBe(-200);
    expect(computeVariance(500, null)).toBe(500);
  });

  it("leaves actuals and variance blank for future or missing dates", () => {
    const rows = buildProjectionRows(
      2026, 9,
      new Map([["2026-09-20", 5000]]),
      new Map([["2026-09-01", 4000]]),
    );
    const d1 = rows.find((r) => r.date === "2026-09-01")!;
    expect(d1.actualSales).toBe(4000);
    expect(d1.variance).toBe(4000);
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

  it("accepts zero and decimals but rejects negatives", () => {
    expect(parseProjectedInput("0")).toEqual({ ok: true, value: 0 });
    expect(parseProjectedInput("1234.56")).toEqual({ ok: true, value: 1234.56 });
    expect(parseProjectedInput("")).toEqual({ ok: true, value: null });
    expect(parseProjectedInput("-5").ok).toBe(false);
    expect(parseProjectedInput("abc").ok).toBe(false);
  });
});
