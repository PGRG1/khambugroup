import { describe, expect, it } from "vitest";
import {
  buildProductMasterStockUomUpdate,
  buildSupplierStockUomSync,
  buildSupplierUomPayload,
  requiresStockUomConfirmation,
  resolveCanonicalStockUom,
} from "@/utils/quickAddStockUom";

describe("Quick Add stock UOM model", () => {
  it("saves purchase Case and stock Bottle as distinct supplier values", () => {
    const payload = buildSupplierUomPayload({ purchaseUnit: " Case ", stockUom: "Bottle", stockQty: "12" });
    expect(payload).toEqual({ purchase_unit: "Case", stock_uom: "Bottle", stock_qty: 12 });
    expect(payload.purchase_unit).not.toBe(payload.stock_uom);
  });

  it("keeps the purchase -> stock quantity even when the UOMs differ", () => {
    expect(buildSupplierUomPayload({ purchaseUnit: "Case", stockUom: "Bottle", stockQty: 24 }).stock_qty).toBe(24);
    expect(buildSupplierUomPayload({ purchaseUnit: "Bottle", stockUom: "Bottle", stockQty: "" }).stock_qty).toBe(1);
  });

  it("resolves canonical stock UOM with legacy unit fallback only when empty", () => {
    expect(resolveCanonicalStockUom({ stock_uom: "Bottle", unit: "Case" })).toBe("Bottle");
    expect(resolveCanonicalStockUom({ stock_uom: "  ", unit: "Case" })).toBe("Case");
    expect(resolveCanonicalStockUom({ stock_uom: null, unit: null })).toBe("");
  });

  it("allows selecting a blank canonical UOM without confirmation", () => {
    expect(requiresStockUomConfirmation("", "Bottle")).toBe(false);
    expect(buildProductMasterStockUomUpdate("Bottle")).toEqual({ unit: "Bottle", stock_uom: "Bottle" });
  });

  it("requires confirmation when a non-empty canonical UOM is edited", () => {
    expect(requiresStockUomConfirmation("Bottle", "Case")).toBe(true);
    expect(requiresStockUomConfirmation("Bottle", "bottle")).toBe(false);
  });

  it("synchronises canonical stock_uom across supplier rows without touching purchase fields", () => {
    const sync = buildSupplierStockUomSync(" Can ");
    expect(sync).toEqual({ stock_uom: "Can" });
    expect(Object.keys(sync)).not.toContain("purchase_unit");
    expect(Object.keys(sync)).not.toContain("stock_qty");
  });
});
