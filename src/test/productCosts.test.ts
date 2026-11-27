import { describe, expect, it } from "vitest";
import { cheapestIndex, costAfterDeal } from "@/utils/productCosts";

const bot = { purchase_unit: "Bot", purchase_unit_cost: 162, stock_qty: 1, stock_uom: "Bot" };

describe("costAfterDeal", () => {
  it("buy 5 get 1 spreads the price over 6", () => {
    expect(costAfterDeal(bot, { deal_type: "buy_x_get_y_free", buy_qty: 5, free_qty: 1 })).toBeCloseTo(135);
  });
  it("divides a case by its pack size", () => {
    expect(costAfterDeal({ purchase_unit: "Case", purchase_unit_cost: 264, stock_qty: 24, stock_uom: "Bot" })).toBeCloseTo(11);
  });
  it("applies a percent discount or a special price", () => {
    expect(costAfterDeal(bot, { deal_type: "discount", discount_percent: 10 })).toBeCloseTo(145.8);
    expect(costAfterDeal(bot, { deal_type: "discount", special_price: 150 })).toBeCloseTo(150);
  });
  it("is unknown without a unit or price", () => {
    expect(costAfterDeal({ ...bot, purchase_unit: "" })).toBeNull();
    expect(costAfterDeal({ ...bot, stock_uom: "" })).toBeNull();
    expect(costAfterDeal({ ...bot, purchase_unit_cost: 0 })).toBeNull();
  });
});

describe("cheapestIndex", () => {
  it("picks the lowest cost after deal", () => {
    expect(cheapestIndex([{ cost: 150, stock_uom: "Bot" }, { cost: 135, stock_uom: "Bot" }])).toBe(1);
  });
  it("needs two known costs in the same unit, and no tie", () => {
    expect(cheapestIndex([{ cost: 3.5, stock_uom: "Each" }, { cost: null, stock_uom: "" }])).toBeNull();
    expect(cheapestIndex([{ cost: 3, stock_uom: "Each" }, { cost: 2, stock_uom: "Kg" }])).toBeNull();
    expect(cheapestIndex([{ cost: 3, stock_uom: "Bot" }, { cost: 3, stock_uom: "bot" }])).toBeNull();
  });
});
