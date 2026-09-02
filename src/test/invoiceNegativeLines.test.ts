import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { computeAcceptedAmount, amountsEqual } from "@/utils/invoiceAcceptedAmount";
import { recalcAllDiscounts } from "@/utils/invoiceRounding";
import {
  isReturnedKegLine,
  resolveReturnedKegEntry,
  KURONAMA_EMPTY_CODE,
  KURONAMA_FILLED_CODE,
} from "@/utils/returnedKegs";

describe("signed accepted amount", () => {
  it("keeps a negative returned-keg invoice fully accepted", () => {
    const lines = [
      { quantity: "12", unit_price: "39.65", total: "475.80" },
      { quantity: "10", unit_price: "111", total: "1110.00" },
      { quantity: "41", unit_price: "50", total: "2050.00" },
      { quantity: "-41", unit_price: "50", total: "-2050.00" },
    ];
    let invoiced = 0;
    let accepted = 0;
    for (const l of lines) {
      const inv = parseFloat(l.total);
      invoiced += inv;
      accepted += computeAcceptedAmount({
        quantity: l.quantity,
        unitPrice: l.unit_price,
        invoicedTotal: inv,
        acceptedQty: undefined,
        acceptedPrice: "",
      });
    }
    expect(invoiced).toBeCloseTo(1585.8, 2);
    expect(accepted).toBeCloseTo(1585.8, 2);
    expect(amountsEqual(invoiced, accepted)).toBe(true);
  });

  it("produces a correctly signed variance when a negative line's accepted qty changes", () => {
    const accepted = computeAcceptedAmount({
      quantity: "-41",
      unitPrice: "50",
      invoicedTotal: -2050,
      acceptedQty: "-40",
      acceptedPrice: "",
    });
    expect(accepted).toBeCloseTo(-2000, 2);
    expect(-2050 - accepted).toBeCloseTo(-50, 2);
  });

  it("keeps a q=0 signed credit override accepted when unchanged", () => {
    const accepted = computeAcceptedAmount({
      quantity: "0",
      unitPrice: "0",
      invoicedTotal: -350.25,
      acceptedQty: "",
      acceptedPrice: "",
    });
    expect(accepted).toBeCloseTo(-350.25, 2);
  });
});

describe("signed header discount", () => {
  it("applies a percentage discount to the net subtotal after a credit line", () => {
    const res = recalcAllDiscounts(
      [
        { quantity: "1", unit_price: "1000" },
        { quantity: "-1", unit_price: "200" },
      ],
      "percentage",
      10,
      0,
      "sum_then_round",
    );
    // Net base = 800 → 10% = 80
    expect(res.headerDiscountAmount).toBeCloseTo(80, 2);
    // No discount allocated to the credit line; shares sum to the header amount.
    expect(res.perLine[1].header_discount_share).toBe(0);
    const sum = res.perLine.reduce((s, l) => s + l.header_discount_share, 0);
    expect(sum).toBeCloseTo(80, 2);
    expect(res.subtotalNet).toBeCloseTo(720, 2);
  });

  it("never creates a discount when the subtotal is <= 0", () => {
    const res = recalcAllDiscounts(
      [{ quantity: "-1", unit_price: "500" }],
      "percentage",
      10,
      0,
      "sum_then_round",
    );
    expect(res.headerDiscountAmount).toBe(0);
    expect(res.subtotalNet).toBeCloseTo(-500, 2);
  });
});

describe("returned keg mapping", () => {
  const line = {
    quantity: "-41",
    item_code: KURONAMA_EMPTY_CODE,
    description: "ASAHI KURONAMA DARK KEG (EMPTY) DEPOSIT - 10L",
    scanned_item_code: "ABAKBKZJ",
    scanned_description: "KURONAMA",
  };

  it("recognises the returned keg line", () => {
    expect(isReturnedKegLine(line)).toBe(true);
  });

  it("never matches the filled Kuronama product", () => {
    const filled = [{ external_sku: KURONAMA_FILLED_CODE, internal_sku: "KURONAMA-10L" }];
    expect(resolveReturnedKegEntry(line, filled)).toBeNull();
  });

  it("matches the dedicated empty-deposit product", () => {
    const products = [
      { external_sku: KURONAMA_FILLED_CODE, internal_sku: "KURONAMA-10L" },
      { external_sku: KURONAMA_EMPTY_CODE, internal_sku: "KURONAMA-EMPTY" },
    ];
    expect(resolveReturnedKegEntry(line, products)?.internal_sku).toBe("KURONAMA-EMPTY");
  });

  it("parse-invoice forces price 50 and uses the dedicated empty code", () => {
    const src = readFileSync("supabase/functions/parse-invoice/index.ts", "utf8");
    expect(src).toContain('item_code: "ABAKBKZJ-EMPTY"');
    expect(src).toContain("li.unit_price = 50;");
    expect(src).toContain("li.total = li.quantity * 50;");
    expect(src).not.toContain('if (!li.unit_price || li.unit_price === 0) li.unit_price = 50;');
  });
});
