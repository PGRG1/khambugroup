import { describe, it, expect } from "vitest";
import { checkRecord, missingDays, notePrompt, unusualDay, weekLabel } from "@/utils/salesRecordChecks";
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

import { missingRuns, runLabel, todayInTz } from "@/utils/salesRecordChecks";
describe("missing runs", () => {
  const rec = (venue: string, date: string) => ({ venue, date } as any);
  const venues = [{ id: "a", name: "Assembly" }, { id: "c", name: "Caliente" }, { id: "x", name: "Arca" }];
  const all = [rec("Assembly", "2026-09-01"), rec("Caliente", "2026-10-10")];
  const period = [...["20","21","22","23","24","25"].map((d) => rec("Assembly", `2026-10-${d}`)), rec("Caliente", "2026-10-20"), rec("Caliente", "2026-10-21"), rec("Caliente", "2026-10-22")];
  it("venue with no sales ever is one row, not daily", () => {
    const { runs, neverSold } = missingRuns(period, [...all, ...period], venues, "2026-10-20", "2026-10-26", "2026-10-26");
    expect(neverSold.map((v) => v.name)).toEqual(["Arca"]);
    expect(runs.some((r) => r.venue === "Arca")).toBe(false);
  });
  it("collapses consecutive missing days and never flags today", () => {
    const { runs } = missingRuns(period, [...all, ...period], venues, "2026-10-20", "2026-10-26", "2026-10-26");
    expect(runs).toEqual([{ venue: "Caliente", venueId: "c", start: "2026-10-23", end: "2026-10-25", days: 3 }]);
    expect(runLabel(runs[0])).toBe("23–25 Oct (3 days)");
    expect(runLabel({ start: "2026-10-25", end: "2026-10-25", days: 1 })).toBe("Sun 25 Oct");
  });
  it("starts from the venue's first recorded sale", () => {
    const { runs } = missingRuns([rec("Caliente", "2026-10-12")], [rec("Caliente", "2026-10-10"), rec("Caliente", "2026-10-12")], [venues[1]], "2026-10-01", "2026-10-13", "2026-10-14");
    expect(runs.map((r) => [r.start, r.end])).toEqual([["2026-10-11", "2026-10-11"], ["2026-10-13", "2026-10-13"]]);
  });
  it("today follows Hong Kong time", () => {
    expect(todayInTz("Asia/Hong_Kong", new Date("2026-10-26T18:08:00Z"))).toBe("2026-10-27");
  });
});
