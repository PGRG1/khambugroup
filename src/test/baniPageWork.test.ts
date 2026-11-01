import { describe, expect, it } from "vitest";
import { revenuePageWork, workComparisonWindow } from "@/utils/baniPageWork";
const venues = [{ id: "a", name: "Assembly" }, { id: "c", name: "Caliente" }];
const sales = [{ venue: "Assembly", date: "2026-10-01", totalSales: 100 }, { venue: "Caliente", date: "2026-10-01", totalSales: 200 }];
describe("Bani page work", () => {
  it("finds latest past missing day per venue, never today", () => {
    const items = revenuePageWork(sales, venues, "2026-11-01", () => false);
    expect(items.filter(i => i.tone === "amber").map(i => i.id)).toEqual(["missing-2026-10-31"]);
    expect(items[0].href).toBe("/sales-data?view=daily&scan=1");
  });
  it("excludes closed venue-days before grouping", () => {
    const items = revenuePageWork(sales, venues, "2026-11-01", (id, day) => id === "c" && day === "2026-10-31");
    expect(items[0].detail).toContain("Assembly");
    expect(items[0].detail).not.toContain("Caliente");
    expect(items[1].id).toBe("missing-2026-10-30");
  });
  it("does not invent trading history or zero sales when none exists", () => {
    expect(revenuePageWork([], venues, "2026-11-01", () => false)).toEqual([]);
  });
  it("limits opening work to three actual items", () => {
    expect(revenuePageWork(sales, venues, "2026-11-01", () => false)).toHaveLength(3);
  });
  it("compares October 1–31 on November 1, rather than inventing November sales", () => {
    expect(workComparisonWindow("2026-11-01")).toEqual({ start: "2026-10-01", end: "2026-10-31", priorStart: "2025-10-01", priorEnd: "2025-10-31" });
  });
  it("compares only completed MTD days and clamps leap-day last year", () => {
    expect(workComparisonWindow("2026-10-31").end).toBe("2026-10-30");
    expect(workComparisonWindow("2024-03-01").priorEnd).toBe("2023-02-28");
  });
});