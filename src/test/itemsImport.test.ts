import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseItemsSheet } from "@/utils/itemsImport";
import { productNeeds, needsText, boughtAs } from "@/utils/productNeeds";

const header = ["Item name *", "Category *", "Stock unit *", "Supplier *", "Supplier code", "Supplier's item name", "Purchase unit *", "Stock units per purchase unit *", "Price per purchase unit *", "Cost per stock unit", "Recipe unit", "Recipe units per stock unit", "Counts as stock *", "Internal SKU", "Purchase yield %", "Cooking yield %", "Min stock", "Reorder qty", "Status *", "Notes", "Check"];

describe("Items Master upload", () => {
  it("reads template rows by header, skipping blank and example rows", () => {
    const res = parseItemsSheet([
      header,
      ["Red bell pepper", "Food > Vegetables > Peppers / Chillies", "kg", "VegFresh HK", "VF-101", "Red Pepper", "kg", 1, 24.5, 24.5, "g", 1000, "Yes", null, 95, 100, 2, 5, "Active", "Example row: delete before upload", "OK"],
      ["Tiger Beer 330ml", "Beverages > Alcoholic > Beer", "Bottle", "Jebsen Beverage - Beer", "TB330", null, "Case", 24, 312, 13, null, null, "Yes", null, null, null, null, null, null, null, "OK"],
      [null, null, null, null, null, null, null, null, null, "", null, null, null, null, null, null, null, null, null, null, ""],
    ]);
    expect(res.error).toBeUndefined();
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({ row: 3, name: "Tiger Beer 330ml", supplier_code: "TB330", per_purchase: "24", price: "312", counts_as_stock: "Yes", status: "Active", sku: "" });
  });

  it("refuses a file that is not the template", () => {
    expect(parseItemsSheet([["Name", "Price"], ["x", 1]]).error).toMatch(/isn't the Items template/);
  });

  it("ships the template the upload reads", () => {
    expect(readFileSync("public/templates/bani-items-upload-template.xlsx").length).toBeGreaterThan(1000);
  });

  it("only counts what invoices need as setup", () => {
    const ok = { supplier: "ONGO", external_sku: "1", level1_category: "Food", financial_treatment: "COGS", has_account: true, purchase_unit: "Case", purchase_unit_cost: 10, creates_stock_movement: true, stock_uom: "Carton", stock_qty: 12 };
    expect(productNeeds(ok)).toEqual([]);
    expect(productNeeds({ ...ok, purchase_unit: "", purchase_unit_cost: 0 })).toEqual(["No unit", "No price"]);
    expect(needsText(["No unit", "No price"])).toBe("No unit · no price");
    expect(productNeeds({ ...ok, external_sku: "", supplier_product_name: "" })).toEqual(["No supplier code"]);
    expect(productNeeds({ ...ok, has_account: false })).toEqual(["No account"]);
    expect(productNeeds({ ...ok, creates_stock_movement: false, stock_uom: "" })).toEqual([]);
    expect(productNeeds({ ...ok, status: "Inactive", purchase_unit: "" })).toEqual([]);
    expect(boughtAs("Case", 12, "Carton")).toBe("Case of 12 Carton");
    expect(boughtAs("Bag", 1, "Bag")).toBe("Bag");
  });
});
