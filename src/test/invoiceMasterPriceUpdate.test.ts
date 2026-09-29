import { describe, expect, it, vi } from "vitest";
import {
  calculateSupplierItemCosts,
  NO_SUPPLIER_ENTRY_MESSAGE,
  updateSupplierItemPrice,
} from "@/utils/invoiceMasterPriceUpdate";

describe("scanner Items Master price update", () => {
  it("updates the supplier row and linked item costs, then refreshes the parent", async () => {
    const updateSupplier = vi.fn().mockResolvedValue({
      id: "supplier-entry-1",
      product_master_id: "product-1",
      stock_qty: 10,
      base_unit_qty: 1000,
    });
    const readProduct = vi.fn().mockResolvedValue({ id: "product-1", stock_qty: 5, base_unit_qty: 500 });
    const updateProduct = vi.fn().mockResolvedValue(true);
    const refreshParent = vi.fn().mockResolvedValue(undefined);

    const result = await updateSupplierItemPrice(
      { updateSupplier, readProduct, updateProduct, refreshParent },
      { supplierEntryId: "supplier-entry-1", productMasterId: "product-1", newPrice: 110 },
    );

    expect(result).toEqual({ ok: true, costPerStockUnit: 11, costPerBaseUnit: 0.11 });
    expect(updateSupplier).toHaveBeenCalledWith("supplier-entry-1", "product-1", 110);
    expect(updateProduct).toHaveBeenCalledWith("product-1", {
      purchase_unit_cost: 110,
      cost_per_stock_unit: 11,
      cost_per_base_unit: 0.11,
    });
    expect(refreshParent).toHaveBeenCalledOnce();
  });

  it("blocks when the line has no supplier entry", async () => {
    const updateSupplier = vi.fn();
    const result = await updateSupplierItemPrice({
      updateSupplier,
      readProduct: vi.fn(),
      updateProduct: vi.fn(),
      refreshParent: vi.fn(),
    }, { productMasterId: "product-1", newPrice: 110 });

    expect(result).toEqual({ ok: false, message: NO_SUPPLIER_ENTRY_MESSAGE });
    expect(updateSupplier).not.toHaveBeenCalled();
  });

  it("returns an error and does not refresh when zero supplier rows update", async () => {
    const updateProduct = vi.fn();
    const refreshParent = vi.fn();
    const result = await updateSupplierItemPrice({
      updateSupplier: vi.fn().mockResolvedValue(null),
      readProduct: vi.fn(),
      updateProduct,
      refreshParent,
    }, { supplierEntryId: "missing", productMasterId: "product-1", newPrice: 110 });

    expect(result).toEqual({ ok: false, message: "No supplier price row was updated." });
    expect(updateProduct).not.toHaveBeenCalled();
    expect(refreshParent).not.toHaveBeenCalled();
  });

  it("falls back to item quantities and guards zero divisors", () => {
    expect(calculateSupplierItemCosts(
      110,
      { id: "s", product_master_id: "p", stock_qty: 0, base_unit_qty: null },
      { id: "p", stock_qty: 5, base_unit_qty: 0 },
    )).toEqual({ purchase_unit_cost: 110, cost_per_stock_unit: 22, cost_per_base_unit: 0 });
  });
});