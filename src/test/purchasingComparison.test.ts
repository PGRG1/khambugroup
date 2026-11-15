import { describe, expect, it } from "vitest";
import { comparisonCutoff, withinCutoff } from "@/utils/purchasingOverview";

describe("purchasing overview comparisons", () => {
  it("compares a running month with the same days of last month", () => {
    expect(comparisonCutoff("2026-11", "2026-11-14")).toBe(14);
    // Through the last day with figures, matching the pace chart's "By the 14th".
    expect(comparisonCutoff("2026-11", "2026-11-15", 14)).toBe(14);
    expect(withinCutoff("2026-10-14", 14)).toBe(true);
    expect(withinCutoff("2026-10-15", 14)).toBe(false);
  });
  it("compares whole months once a month is complete, or when last month is shorter", () => {
    expect(comparisonCutoff("2026-10", "2026-11-14")).toBeNull();
    expect(comparisonCutoff("2026-03", "2026-03-30")).toBeNull(); // February has fewer days
    expect(withinCutoff("2026-10-31", null)).toBe(true);
  });
});
