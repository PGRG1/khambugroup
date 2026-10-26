import { describe, it, expect } from "vitest";
import { comparisonWindow, comparisonSentence, targetPace, paceSentence, combineProjectionRows, monthSoFarLabel } from "@/utils/revenueOverview";
import { seatsOn, seatTotals, seatsForDate } from "@/utils/seatHistory";
import type { DailyProjectionRow } from "@/utils/dailyProjections";

const row = (date: string, target: number | null, actual: number | null): DailyProjectionRow => ({
  date, day: "Mon", projectedSales: target, autoForecast: null, effectiveForecast: target, forecastSource: target === null ? "none" : "manager",
  actualSales: actual, variance: target !== null && actual !== null ? actual - target : null,
});

describe("period label", () => {
  it("names the current month 'so far'", () => {
    expect(monthSoFarLabel(new Date(2026, 9, 26))).toBe("October so far");
  });
});

describe("comparison window", () => {
  it("uses the same elapsed days last year when covered", () => {
    const w = comparisonWindow("2026-10-01", "2026-10-31", "2026-10-26", "2025-01-01", "2026-10-26")!;
    expect(w).toMatchObject({ from: "2025-10-01", to: "2025-10-26", days: 26, kind: "last-year", name: "last October" });
  });
  it("falls back to last month when last year has no data", () => {
    const w = comparisonWindow("2026-10-01", "2026-10-31", "2026-10-26", "2026-03-01", "2026-10-26")!;
    expect(w).toMatchObject({ from: "2026-09-01", to: "2026-09-26", kind: "last-month", name: "last September" });
  });
  it("returns null when neither exists", () => {
    expect(comparisonWindow("2026-10-01", "2026-10-31", "2026-10-26", "2026-10-01", "2026-10-26")).toBeNull();
  });
  it("words the difference", () => {
    const w = comparisonWindow("2026-10-01", "2026-10-31", "2026-10-26", "2025-01-01", "2026-10-26")!;
    expect(comparisonSentence(94, 100, w)).toBe("6% less than the same 26 days last October.");
  });
});

describe("target pace", () => {
  it("need per day = (target − sold) ÷ remaining days", () => {
    const rows = [row("2026-10-01", 100, 80), row("2026-10-02", 100, 90), row("2026-10-03", 100, null), row("2026-10-04", 100, null)];
    const p = targetPace(rows, "2026-10-02")!;
    expect(p.target).toBe(400);
    expect(p.sold).toBe(170);
    expect(p.shouldBy).toBe(200);
    expect(p.remainingDays).toBe(2);
    expect(p.needPerDay).toBe(115);
    expect(p.averaging).toBe(85);
    expect(paceSentence(p)).toContain("85% of where you should be by today");
  });
  it("does not count today when today's sales are not in yet", () => {
    const rows = [row("2026-10-01", 100, 100), row("2026-10-02", 100, null), row("2026-10-03", 100, null)];
    const p = targetPace(rows, "2026-10-02")!;
    expect(p.shouldBy).toBe(100);
    expect(p.remainingDays).toBe(2);
  });
  it("sums venues by date", () => {
    const c = combineProjectionRows([[row("2026-10-01", 100, 50)], [row("2026-10-01", 200, null)]]);
    expect(c[0].effectiveForecast).toBe(300);
    expect(c[0].actualSales).toBe(50);
  });
});

describe("seat history", () => {
  const hist = [
    { venue_id: "a", seats: 70, effective_from: "2025-10-01" },
    { venue_id: "a", seats: 80, effective_from: "2026-10-10" },
    { venue_id: "b", seats: 50, effective_from: "2025-10-01" },
  ];
  it("uses the count that applied on each day", () => {
    expect(seatsOn(hist, "a", "2026-10-09")).toBe(70);
    expect(seatsOn(hist, "a", "2026-10-10")).toBe(80);
    expect(seatsOn(hist, "a", "2025-09-30")).toBeNull();
    expect(seatsForDate(hist, ["a", "b"], "2026-10-10")).toBe(130);
  });
  it("seat-days change on the history date", () => {
    const ids = new Map([["A", "a"]]);
    const t = seatTotals([
      { date: "2026-10-09", venue: "A", totalSales: 700, guests: 70 },
      { date: "2026-10-10", venue: "A", totalSales: 800, guests: 80 },
    ], hist, ids);
    expect(t.seatDays).toBe(150);
    expect(t.revenue / t.seatDays).toBe(10);
    expect(t.latestSeats).toBe(80);
  });
  it("leaves out venues with no seats", () => {
    const t = seatTotals([{ date: "2026-10-09", venue: "C", totalSales: 999, guests: 9 }], hist, new Map([["C", "c"]]));
    expect(t.seatDays).toBe(0);
    expect(t.latestSeats).toBeNull();
  });
});
