import { describe, it, expect } from "vitest";
import { figureProblems, verificationMismatches } from "../../supabase/functions/_shared/receiptAutoPost";
const ok = { date: "2026-10-28", venue: "Assembly", subtotal: 1000, serviceCharge: 100, discount: -50, totalSales: 1050, visa: 800, cash: 250, cardTips: -20 };
describe("receipt auto-post rules", () => {
  it("clean balanced receipt has no figure problems", () => expect(figureProblems(ok, true, "2026-10-30")).toEqual([]));
  it("future date blocks", () => expect(figureProblems({ ...ok, date: "2026-11-01" }, true, "2026-10-30")).toContain("Trading date is in the future"));
  it("unknown venue blocks", () => expect(figureProblems(ok, false, "2026-10-30").length).toBe(1));
  it("payments not matching total blocks", () => expect(figureProblems({ ...ok, cash: 200 }, true, "2026-10-30")).toContain("Payments do not add up to total sales"));
  it("matching second read passes", () => expect(verificationMismatches(ok, { ...ok, discount: 50, cardTips: 20 })).toEqual([]));
  it("second read disagreeing on total blocks", () => expect(verificationMismatches(ok, { ...ok, totalSales: 1150 }).length).toBeGreaterThan(0));
  it("unreadable second read blocks", () => expect(verificationMismatches(ok, null)).toEqual(["Independent check could not read the receipt"]));
});
