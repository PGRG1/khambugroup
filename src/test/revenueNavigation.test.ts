import { describe, expect, it } from "vitest";
import { detailedTargetsPath, isRevenueRoute, retainCurrentQuery, revenueLanding, revenuePageAllowed, revenueSection } from "@/utils/revenueNavigation";

describe("Revenue navigation", () => {
  it("selects Overview only on the exact overview route", () => {
    expect(revenueSection("/revenue")).toBe("overview");
    expect(revenueSection("/revenue/analysis")).toBe("analysis");
    expect(revenueSection("/revenue/reconciliation")).toBeNull();
  });
  it("covers sales detail and both forecast routes without prefix false positives", () => {
    expect(revenueSection("/sales-data/123")).toBe("sales");
    expect(revenueSection("/revenue/targets-new")).toBe("targets");
    expect(revenueSection("/forecast/caliente")).toBe("targets");
    expect(isRevenueRoute("/forecast-legacy/caliente")).toBe(true);
    expect(isRevenueRoute("/revenue-other")).toBe(false);
    expect(isRevenueRoute("/forecasting")).toBe(false);
  });
  it("lands forecast-only users on daily forecasts and hides wholly inaccessible navigation", () => {
    expect(revenueLanding(false, true)).toBe("/revenue/targets-new");
    expect(revenueLanding(true, true)).toBe("/revenue");
    expect(revenueLanding(false, false)).toBeNull();
  });
  it("bypasses only for admins not previewing", () => {
    expect(revenuePageAllowed(true, false, false)).toBe(true);
    expect(revenuePageAllowed(true, true, false)).toBe(false);
    expect(revenuePageAllowed(false, false, false)).toBe(false);
    expect(revenuePageAllowed(true, true, true)).toBe(true);
  });
  it("preserves an existing detailed venue and current-page query filters", () => {
    expect(detailedTargetsPath("/forecast/caliente")).toBe("/forecast/caliente");
    expect(detailedTargetsPath("/forecast-legacy/hanabi")).toBe("/forecast/hanabi");
    expect(detailedTargetsPath("/revenue/targets-new")).toBeNull();
    expect(retainCurrentQuery("/sales-data", "/sales-data", "?view=other")).toBe("/sales-data?view=other");
    expect(retainCurrentQuery("/revenue", "/sales-data", "?view=other")).toBe("/revenue");
  });
});