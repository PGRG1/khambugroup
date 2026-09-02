import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProductMasterEditorPayload, preservesInvoiceLineValues, productMasterEditorForm, syncCanonicalStockUomPayload, validateProductMasterEditor, type ProductMasterEditorForm } from "@/utils/productMasterEditor";

const form: ProductMasterEditorForm = {
  internal_sku: "SKU-1", internal_product_name: "Bottled Water", unit_cost: "10", level1_category: "Drinks", level2_category: "Water", level3_category: "Bottle",
  accounting_category: "purchases", financial_treatment: "COGS", default_coa_account_id: "coa-1", status: "Active", notes: "note", stock_uom: "Bottle", base_unit_type: "Bottle", base_unit_qty: "1", min_stock_qty: "2", reorder_qty: "5", creates_stock_movement: true, purchase_yield: "95", cooking_yield: "100",
  supplier_product_name: "Supplier Case", external_sku: "EXT-1", purchase_unit: "Case", purchase_unit_cost: "120", stock_qty: "24", supplier_accounting_category: "purchases", supplier_status: "Active",
};

describe("product master editor ownership", () => {
  it("keeps Case purchase UOM independent from Bottle stock UOM", () => {
    const payload = buildProductMasterEditorPayload(form);
    expect(payload.product.stock_uom).toBe("Bottle");
    expect(payload.supplier.purchase_unit).toBe("Case");
    expect(payload.supplier.stock_qty).toBe(24);
    expect(payload.cost_per_stock_unit).toBe(5);
  });

  it("prefers canonical stock UOM and falls back to legacy unit", () => {
    const base = { ...form, stock_uom: "" };
    expect(productMasterEditorForm({ ...({} as any), unit: "Bottle", stock_uom: "", unit_cost: 1 }, null).stock_uom).toBe("Bottle");
    expect(productMasterEditorForm({ ...({} as any), unit: "Case", stock_uom: "Bottle", unit_cost: 1 }, null).stock_uom).toBe("Bottle");
    expect(base.stock_uom).toBe("");
  });

  it("validates required positive conversion and bounded yields", () => {
    expect(validateProductMasterEditor({ ...form, stock_qty: "0" })).toContain("greater than zero");
    expect(validateProductMasterEditor({ ...form, purchase_yield: "101" })).toContain("between 1% and 100%");
    expect(validateProductMasterEditor({ ...form, stock_uom: "" })).toContain("Stock UOM");
  });

  it("uses a narrow canonical sync payload", () => {
    expect(syncCanonicalStockUomPayload("  Bottle ")).toEqual({ stock_uom: "Bottle" });
    const payload = buildProductMasterEditorPayload(form);
    expect(payload.supplier).toMatchObject({ purchase_unit: "Case", stock_qty: 24, supplier_product_name: "Supplier Case", external_sku: "EXT-1", purchase_unit_cost: 120 });
  });

  it("preserves invoice draft values while master data changes", () => {
    const line = { quantity: "2", unit_price: "12.5", discount: "1", discount_mode: "fixed", discount_rate: "0", tax_amount: "3", accepted_qty: "1", accepted_price: "11", description: "scanned" };
    expect(preservesInvoiceLineValues(line)).toEqual({ quantity: "2", unit_price: "12.5", discount: "1", discount_mode: "fixed", discount_rate: "0", tax_amount: "3", accepted_qty: "1", accepted_price: "11" });
  });
  it("keeps the price-only action distinct from full editing", () => {
    const source = readFileSync("src/components/invoices/InvoiceScanner.tsx", "utf8");
    expect(source).toContain("Update master price");
    expect(source).toContain("Edit master item");
  });
});
