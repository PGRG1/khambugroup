import { describe, it, expect } from "vitest";
import { pruneStaleLineMathFlags, expectedLineTotal, isLineMathReconciled } from "@/utils/invoiceLineMath";

const MATH_FLAG = "Line item total calculation mismatch: 5.7 * 110 = 627.00, extracted 627.00. Difference is 0.00.";

describe("pruneStaleLineMathFlags", () => {
  it("removes the contradictory line-total flag for 5.7 x 110 = 627.00", () => {
    const out = pruneStaleLineMathFlags({
      quantity: "5.7",
      unit_price: "110",
      discount: "0",
      tax_amount: "0",
      total: "627.00",
      review_warnings: [MATH_FLAG],
      review_blocking: [MATH_FLAG],
    });
    expect(out.review_warnings).toEqual([]);
    expect(out.review_blocking).toEqual([]);
  });

  it("removes flags for floating-point representation differences", () => {
    const total = String(0.1 * 3 * 10); // 3.0000000000000004
    const out = pruneStaleLineMathFlags({
      quantity: "3",
      unit_price: "1",
      total,
      review_warnings: ["Line total does not match qty × price"],
    });
    expect(out.review_warnings).toEqual([]);
  });

  it("removes flags when the difference is exactly 0.05", () => {
    const out = pruneStaleLineMathFlags({
      quantity: "1",
      unit_price: "100",
      total: "100.05",
      review_warnings: ["line_total: does not equal quantity * price"],
    });
    expect(out.review_warnings).toEqual([]);
  });

  it("keeps genuine math findings above 0.05", () => {
    const flags = ["Line total does not match"];
    const out = pruneStaleLineMathFlags({
      quantity: "1",
      unit_price: "100",
      total: "100.06",
      review_warnings: flags,
      review_blocking: flags,
    });
    expect(out.review_warnings).toEqual(flags);
    expect(out.review_blocking).toEqual(flags);
  });

  it("preserves unrelated warnings and blocking flags", () => {
    const out = pruneStaleLineMathFlags({
      quantity: "5.7",
      unit_price: "110",
      total: "627.00",
      review_warnings: [MATH_FLAG, "uom: Purchase UOM missing"],
      review_blocking: [MATH_FLAG, "matched_sku: no SKU on file", "quantity: no evidence found"],
    });
    expect(out.review_warnings).toEqual(["uom: Purchase UOM missing"]);
    expect(out.review_blocking).toEqual(["matched_sku: no SKU on file", "quantity: no evidence found"]);
  });

  it("respects fixed discounts", () => {
    const line = { quantity: "2", unit_price: "50", discount_mode: "fixed", discount: "10", total: "90" };
    expect(expectedLineTotal(line)).toBe(90);
    expect(isLineMathReconciled(line)).toBe(true);
  });

  it("respects percentage discounts", () => {
    const line = { quantity: "2", unit_price: "50", discount_mode: "percentage", discount_rate: "10", total: "90" };
    expect(expectedLineTotal(line)).toBe(90);
    expect(isLineMathReconciled(line)).toBe(true);
  });

  it("respects tax amounts", () => {
    const line = { quantity: "2", unit_price: "50", discount: "10", tax_amount: "5", total: "95" };
    expect(expectedLineTotal(line)).toBe(95);
    expect(isLineMathReconciled(line)).toBe(true);
    expect(isLineMathReconciled({ ...line, total: "90" })).toBe(false);
  });
});
