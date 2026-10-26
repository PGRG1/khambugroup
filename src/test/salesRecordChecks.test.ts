import { describe, it, expect } from "vitest";
import { checkRecord, collapseMissingDays, firstSaleDates, missingDays, notePrompt, salesListCounts, tenantToday, unusualDay, weekLabel } from "@/utils/salesRecordChecks";
import type { SalesRecord } from "@/types/sales";

const rec = (p: Partial<SalesRecord> = {}): SalesRecord => ({
  date: "2026-10-25", day: "Sun", venue: "Assembly", reportNumber: "1", orders: 10, guests: 20,
  subtotal: 1000, serviceCharge: 100, discount: -100, totalSales: 1000,
  visa: 1000, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, cardTips: 0, ...p,
});

describe("doesn't add up", () => {
  it("a balanced day is fine", () => expect(checkRecord(rec()).ok).toBe(true));
  it("payments more than HK$0.50 short are flagged", () => {
    const c = checkRecord(rec({ visa: 999.4 }));
    expect(c.paymentsWrong).toBe(true);
    expect(c.paymentGap).toBeCloseTo(-0.6);
  });
  it("HK$0.50 or less is tolerated", () => expect(checkRecord(rec({ visa: 999.5 })).ok).toBe(true));
  it("delivery platforms count as payments", () => expect(checkRecord(rec({ visa: 700, deliveroo: 200, keeta: 100 })).ok).toBe(true));
  it("food & drink + service + discounts not equal to total is flagged", () => {
    const c = checkRecord(rec({ serviceCharge: 300 }));
    expect(c.partsWrong).toBe(true);
    expect(c.partsTotal).toBe(1200);
  });
});

describe("missing days", () => {
  const venues = [{ id: "c", name: "Caliente" }, { id: "a", name: "Arca" }];
  it("never flags days before the first-ever sale", () => {
    const history = [rec({ venue: "Caliente", date: "2026-10-24" })];
    expect(missingDays(history, venues, "2026-10-01", "2026-10-31", "2026-10-26", firstSaleDates(history)).map((m) => m.date)).toEqual(["2026-10-25"]);
  });
  it("a venue with no sales ever has no missing-day flags", () => {
    expect(missingDays([], [{ id: "a", name: "Arca" }], "2026-10-01", "2026-10-31", "2026-10-26")).toEqual([]);
  });
  it("uses first-ever history even when no sale falls inside the period", () => {
    const first = firstSaleDates([rec({ venue: "Caliente", date: "2026-09-01" })]);
    expect(missingDays([], venues, "2026-10-24", "2026-10-31", "2026-10-26", first).map((m) => m.date)).toEqual(["2026-10-24", "2026-10-25"]);
  });
  it("today is never missing even if the period ends in the future", () => {
    const history = [rec({ venue: "Caliente", date: "2026-10-24" })];
    expect(missingDays(history, venues, "2026-10-24", "2026-10-31", "2026-10-26").map((m) => m.date)).toEqual(["2026-10-25"]);
  });
  it("yesterday uses Hong Kong's date even when UTC is the previous day", () => {
    const today = tenantToday("Asia/Hong_Kong", new Date("2026-10-25T18:16:00Z"));
    expect(today).toBe("2026-10-26");
    const history = [rec({ venue: "Caliente", date: "2026-10-24" })];
    expect(missingDays(history, venues, "2026-10-24", "2026-10-31", today).map((m) => m.date)).toEqual(["2026-10-25"]);
  });
  it("collapses 23–25 Oct into one three-day run per venue", () => {
    const history = [rec({ venue: "Caliente", date: "2026-10-22" })];
    expect(collapseMissingDays(missingDays(history, venues, "2026-10-22", "2026-10-31", "2026-10-26"))).toEqual([
      { date: "2026-10-23", endDate: "2026-10-25", days: 3, venue: "Caliente", venueId: "c" },
    ]);
  });
  it("Caliente missing 25 Oct remains one single-day run", () => {
    const history = [rec({ venue: "Caliente", date: "2026-10-24" })];
    expect(collapseMissingDays(missingDays(history, venues, "2026-10-24", "2026-10-31", "2026-10-26"))).toEqual([
      { date: "2026-10-25", endDate: "2026-10-25", days: 1, venue: "Caliente", venueId: "c" },
    ]);
  });
  it("does not collapse through a recorded day or between venues", () => {
    const history = [rec({ date: "2026-10-21" }), rec({ date: "2026-10-24" }), rec({ venue: "Caliente", date: "2026-10-21" })];
    const runs = collapseMissingDays(missingDays(history, [...venues, { id: "s", name: "Assembly" }], "2026-10-21", "2026-10-31", "2026-10-26"));
    expect(runs.map((m) => [m.venue, m.date, m.endDate])).toEqual([["Caliente", "2026-10-22", "2026-10-25"], ["Assembly", "2026-10-22", "2026-10-23"], ["Assembly", "2026-10-25", "2026-10-25"]]);
  });
  it("All days counts only distinct dates with records across chosen venues", () => {
    const records = [rec({ date: "2026-10-23" }), rec({ venue: "Caliente", date: "2026-10-23" }), rec({ date: "2026-10-24" })];
    const runs = collapseMissingDays(missingDays(records, venues, "2026-10-23", "2026-10-31", "2026-10-26"));
    expect(salesListCounts(records, runs).days).toBe(2);
  });
  it("Needs attention counts collapsed runs plus each unbalanced record, not Arca", () => {
    const records = [rec({ venue: "Caliente", date: "2026-10-22", visa: 0 }), rec({ date: "2026-10-22", subtotal: 900 })];
    const runs = collapseMissingDays(missingDays(records, venues, "2026-10-22", "2026-10-31", "2026-10-26"));
    expect(salesListCounts(records, runs).attention).toBe(3);
  });
  it("lists venue-days with no record up to yesterday only", () => {
    const m = missingDays([rec({ date: "2026-10-23" })], [{ id: "a", name: "Assembly" }], "2026-10-23", "2026-10-31", "2026-10-26");
    expect(m.map((x) => x.date)).toEqual(["2026-10-24", "2026-10-25"]);
  });
  it("any record (e.g. one service period) counts the day as present", () => {
    const m = missingDays([rec({ date: "2026-10-25", servicePeriodId: "lunch" })], [{ id: "a", name: "Assembly" }], "2026-10-25", "2026-10-25", "2026-10-26");
    expect(m).toEqual([]);
  });
});

describe("note prompt", () => {
  const history = [18, 11, 4].map((d) => rec({ date: `2026-10-${String(d).padStart(2, "0")}`, totalSales: 2000 }));
  it("prompts when sales are 30%+ below the usual weekday", () => {
    expect(unusualDay(rec({ totalSales: 1300 }), history)?.pct).toBe(-35);
    expect(notePrompt(rec({ totalSales: 1300, subtotal: 1300, serviceCharge: 0, discount: 0, visa: 1300 }), history)).toBe("Sales are 35% below a usual Sunday. What happened?");
  });
  it("does not prompt for a normal day", () => {
    expect(notePrompt(rec({ totalSales: 1900, subtotal: 1900, serviceCharge: 0, discount: 0, visa: 1900 }), history)).toBeNull();
  });
  it("prompts when the day doesn't add up", () => {
    expect(notePrompt(rec({ visa: 500 }), history)).toMatch(/doesn't add up/);
  });
});

describe("week groups", () => {
  it("labels this week, last week, then a range", () => {
    expect(weekLabel("2026-10-26", "2026-10-26")).toBe("This week");
    expect(weekLabel("2026-10-25", "2026-10-26")).toBe("Last week");
    expect(weekLabel("2026-10-14", "2026-10-26")).toBe("12–18 Oct");
  });
});

describe("closed days", () => {
  it("a day marked closed is not listed as missing", () => {
    const venues = [{ id: "c", name: "Caliente" }];
    const history = [rec({ venue: "Caliente", date: "2026-10-23" })];
    const closed = new Set(["c|2026-10-24"]);
    expect(missingDays(history, venues, "2026-10-23", "2026-10-31", "2026-10-26", firstSaleDates(history), closed).map((m) => m.date)).toEqual(["2026-10-25"]);
  });
});
