import { describe, expect, it } from "vitest";
import { basicsFromLines, isSetupMode, linesForVenue, matchRead, setupMismatches, setupProblems, type SetupLineDef } from "../../supabase/functions/_shared/setupReceipt";

const setup: SetupLineDef[] = [
  { printed: "Net sales", kind: "total" }, { printed: "Covers", kind: "guests" },
  { printed: "Food", kind: "sales" }, { printed: "Wine & beer", kind: "sales" }, { printed: "Svc chg 10%", kind: "service_charge" },
  { printed: "Octopus", kind: "payment" }, { printed: "VISA/MC", kind: "payment" }, { printed: "Cash", kind: "payment" }, { printed: "Foodpanda", kind: "delivery" },
];
const read = (lines: [string, number | null][], extra: Record<string, unknown> = {}) =>
  matchRead({ date: "2026-11-14", venue: "Harbour Kitchen", reportNumber: "Z-88", lines: lines.map(([printed, amount]) => ({ printed, amount })), ...extra }, setup);
const good = read([["Net sales", 10450], ["covers", 82], ["Food", 7200], ["Wine & beer", 2300], ["Svc chg 10%", 950], ["Octopus", 3200], ["VISA/MC", 5400], ["Cash", 850], ["Foodpanda", 1000]]);

describe("setup clients' receipts", () => {
  it("only clients with their own lines (no fixed fields) are read this way", () => {
    expect(isSetupMode([{ legacy_field: null, is_active: true }])).toBe(true);
    expect(isSetupMode([{ legacy_field: "visa", is_active: true }, { legacy_field: null, is_active: true }])).toBe(false);
    expect(isSetupMode([])).toBe(false);
  });
  it("a venue's own setup wins over the all-venues setup", () => {
    const all = [{ venue_id: null, n: 1 }, { venue_id: "v1", n: 2 }];
    expect(linesForVenue(all, "v1").map((l) => l.n)).toEqual([2]);
    expect(linesForVenue(all, "v2").map((l) => l.n)).toEqual([1]);
  });
  it("labels match the setup whatever the case; the day's usual figures come from the lines", () => {
    expect(good.lines.find((l) => l.printed === "Covers")).toMatchObject({ kind: "guests", known: true, amount: 82 });
    expect(basicsFromLines(good.lines)).toMatchObject({ totalSales: 10450, subtotal: 9500, serviceCharge: 950, guests: 82 });
  });
  it("a balanced report with only known lines has no problems", () => {
    expect(setupProblems(good.lines)).toEqual([]);
  });
  it("payments that don't add up, or a new line, hold the day for review", () => {
    const off = read([["Net sales", 10450], ["Octopus", 3200], ["Cash", 850]]);
    expect(setupProblems(off.lines)).toContain("Payments do not add up to total sales");
    const fresh = read([...good.lines.map((l) => [l.printed, l.amount] as [string, number | null]), ["Gift card", 300]]);
    expect(setupProblems(fresh.lines)[0]).toBe("New on this report: Gift card. Map it in the sales report setup");
  });
  it("the second read must agree on every line", () => {
    expect(setupMismatches(good, good)).toEqual([]);
    const second = read([["Net sales", 10450], ["Octopus", 3000], ["VISA/MC", 5400], ["Cash", 850], ["Foodpanda", 1000], ["Food", 7200], ["Wine & beer", 2300], ["Svc chg 10%", 950], ["Covers", 82], ["Tips", 50]]);
    expect(setupMismatches(good, second)).toEqual(["Octopus read as 3000 on the second check", "Tips only found on the second check"]);
    expect(setupMismatches(good, null)).toEqual(["Independent check could not read the receipt"]);
  });
});
