// @vitest-environment node
import { describe, it, expect } from "vitest";
import { auditSalesRecord } from "@/utils/salesReceiptCorrections";

const base = { date: "2026-10-24", day: "Saturday", venue: "Hanabi", reportNumber: "1", orders: 10, guests: 20, subtotal: 10000, serviceCharge: 1000, discount: -500, totalSales: 10500,
  visa: 10000, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 600, cardTips: -100 } as any;

describe("post-scan receipt verdict", () => {
  it("says it looks good when totals and payments balance", () => {
    expect(auditSalesRecord(base, ["Hanabi"]).ok).toBe(true);
  });
  it("flags payments short of Total Sales", () => {
    const r = auditSalesRecord({ ...base, cash: 450 }, ["Hanabi"]);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("HK$ 150.00 short of");
  });
  it("flags Total Sales that doesn't equal subtotal + service − discount", () => {
    expect(auditSalesRecord({ ...base, totalSales: 11000, cash: 1100 }, ["Hanabi"]).message).toContain("HK$ 10,500.00");
  });
  it("flags an unknown venue", () => {
    expect(auditSalesRecord(base, ["Assembly"]).ok).toBe(false);
  });
});
