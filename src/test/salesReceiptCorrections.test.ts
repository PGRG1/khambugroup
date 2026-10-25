import { describe, expect, it } from "vitest";
import { applySalesChanges, sanitizeSalesChanges } from "@/utils/salesReceiptCorrections";
import type { SalesRecord } from "@/types/sales";

const base: SalesRecord = { date: "2026-10-24", day: "Sat", venue: "Assembly", reportNumber: "", orders: 10, guests: 20, subtotal: 1000, serviceCharge: 0, discount: 0, totalSales: 1000, visa: 1000, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, cardTips: 0 };

describe("sales receipt corrections", () => {
  it("recomputes Total Sales = subtotal + service charge − discount", () => {
    const next = applySalesChanges(base, [{ field: "serviceCharge", value: 100 }, { field: "discount", value: 50 }]);
    expect(next.discount).toBe(-50);
    expect(next.totalSales).toBe(1050);
  });
  it("stores card tips as a negative deduction", () => {
    expect(applySalesChanges(base, [{ field: "cardTips", value: 30 }]).cardTips).toBe(-30);
  });
  it("updates the day when the date changes", () => {
    expect(applySalesChanges(base, [{ field: "date", value: "2026-10-25" }]).day).toBe("Sun");
  });
  it("rejects unknown venues, fields and fractional guests", () => {
    expect(sanitizeSalesChanges([{ field: "venue", value: "Nowhere" }], ["Assembly"])).toBeNull();
    expect(sanitizeSalesChanges([{ field: "id", value: "x" }], ["Assembly"])).toBeNull();
    expect(sanitizeSalesChanges([{ field: "guests", value: "2.5" }], ["Assembly"])).toBeNull();
    expect(sanitizeSalesChanges([{ field: "cash", value: "HK$ 1,450" }], [])).toEqual([{ field: "cash", value: 1450 }]);
  });
});
