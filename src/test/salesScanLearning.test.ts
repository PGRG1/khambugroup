import { describe, expect, it } from "vitest";
import { collectScanLearning, diagnoseSalesScan } from "@/utils/salesScanLearning";
import type { SalesRecord } from "@/types/sales";

const base: SalesRecord = {
  date: "2026-10-24", day: "Sat", venue: "Assembly", reportNumber: "1",
  orders: 40, guests: 100, subtotal: 1000, serviceCharge: 100, discount: -100, totalSales: 1000,
  visa: 600, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 400, cardTips: 0,
};

describe("diagnoseSalesScan", () => {
  it("treats a slip whose payments equal Total Sales as balanced", () => {
    expect(diagnoseSalesScan(base).balanced).toBe(true);
  });
  it("points at Cash when payments are short", () => {
    const d = diagnoseSalesScan({ ...base, cash: 280 });
    expect(d.balanced).toBe(false);
    expect(d.fields).toEqual(["cash"]);
    expect(d.message).toContain("HK$ 120.00");
  });
  it("points at Card Tips when payments exceed Total Sales and no tips were read", () => {
    expect(diagnoseSalesScan({ ...base, visa: 650 }).fields).toEqual(["cardTips"]);
  });
  it("flags the revenue lines when Subtotal + Service − Discount ≠ Total Sales", () => {
    expect(diagnoseSalesScan({ ...base, totalSales: 1200 }).fields).toEqual(["subtotal", "serviceCharge", "discount"]);
  });
});

describe("collectScanLearning", () => {
  it("returns nothing when the person changed nothing", () => {
    expect(collectScanLearning(base, base, "Assembly")).toBeNull();
  });
  it("records each corrected field and a learned venue name", () => {
    const saved = { ...base, cardTips: 0, serviceCharge: 220 };
    const l = collectScanLearning({ ...base, serviceCharge: 100 }, saved, "ASSMB-T1");
    expect(l?.scannedVenue).toBe("ASSMB-T1");
    expect(l?.corrections).toEqual([{ field: "serviceCharge", scanned: 100, saved: 220 }]);
  });
});
