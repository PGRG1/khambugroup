import { describe, expect, it } from "vitest";
import { isFreeGoodsLine, resolveGrnAcceptedPrice, resolveGrnUnitCost } from "@/utils/grnLineCost";
import { calculatedInvoiceTotal, invoiceTotalMismatch } from "@/utils/invoiceTotalReconciliation";

describe("GRN free-goods costing", () => {
  it("treats a zero-price line with no other cost signal as free", () => {
    const line = { quantity: 1, unit_price: 0, total: 0 };
    expect(isFreeGoodsLine(line)).toBe(true);
    expect(resolveGrnUnitCost(line)).toBe(0);
    expect(resolveGrnAcceptedPrice(line, 0)).toBe(0);
  });

  it("honours the explicit free-unit flag", () => {
    expect(isFreeGoodsLine({ quantity: 2, unit_price: 100, total: 200, is_free_unit_line: true })).toBe(true);
  });

  it("does NOT treat a zero unit price with a real line total as free", () => {
    const line = { quantity: 4, unit_price: 0, total: 400 };
    expect(isFreeGoodsLine(line)).toBe(false);
    expect(resolveGrnUnitCost(line)).toBe(100);
    expect(resolveGrnAcceptedPrice(line, 100)).toBe(100);
  });

  it("falls back to normalized unit cost for legacy zero-price rows", () => {
    const line = { quantity: 3, unit_price: 0, normalized_unit_cost: 12.5 };
    expect(isFreeGoodsLine(line)).toBe(false);
    expect(resolveGrnUnitCost(line)).toBe(12.5);
  });
});

describe("total reconciliation", () => {
  const lines = [
    { quantity: 2, unit_price: 100, total: 200 },
    // Synthetic returned-keg refund row: never printed in the AMOUNT column.
    { quantity: -1, unit_price: 50, total: -50, counts_toward_total: false },
  ];

  it("excludes synthetic rows from the calculated total", () => {
    expect(calculatedInvoiceTotal(lines, 0)).toBe(200);
    expect(invoiceTotalMismatch({ ai_total: 200, invoice_discount: "0", line_items: lines })).toBe(false);
  });

  it("uses the supplier rounding mode when supplied", () => {
    const rounded = [{ quantity: 3, unit_price: 10.334, total: 31 }];
    expect(calculatedInvoiceTotal(rounded, 0, "integer")).toBe(31);
    expect(
      invoiceTotalMismatch({ ai_total: 31, invoice_discount: "0", line_items: rounded }, { mode: "integer" }),
    ).toBe(false);
  });
});
