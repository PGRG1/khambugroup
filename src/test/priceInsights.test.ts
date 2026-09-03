import { describe, expect, it } from "vitest";
import {
  buildSupplierInsights,
  isComparableSupplierEntry,
  normalizedSupplierCost,
} from "@/utils/priceInsights";

const entry = (overrides: Partial<Parameters<typeof buildSupplierInsights>[0]["entries"][number]> = {}) => ({
  id: "entry-a",
  productMasterId: "product-1",
  supplierName: "Current Foods",
  purchaseUnit: "case",
  purchasePrice: 120,
  stockUom: "bottle",
  stockQty: 12,
  ...overrides,
});

const baseInput = (overrides: Partial<Parameters<typeof buildSupplierInsights>[0]> = {}) => ({
  entries: [
    entry(),
    entry({ id: "entry-b", supplierName: "Cheaper Foods", purchasePrice: 90, stockQty: 12 }),
    entry({ id: "entry-c", supplierName: "Other Foods", purchasePrice: 150, stockQty: 12 }),
  ],
  purchases: [],
  currentSupplierName: "Current Foods",
  currentPurchasePrice: 120,
  currentStockQty: 12,
  currentPurchaseUnit: "case",
  canonicalStockUom: "bottle",
  asOf: "2026-08-11",
  ...overrides,
});

describe("price insights normalization", () => {
  it("uses purchase price divided by purchase-to-stock quantity", () => {
    expect(normalizedSupplierCost(120, 12)).toBe(10);
  });

  it("requires an exact canonical stock UOM and valid conversion", () => {
    expect(isComparableSupplierEntry({ stockUom: " Bottle ", stockQty: 12 }, "bottle")).toBe(true);
    expect(isComparableSupplierEntry({ stockUom: "case", stockQty: 12 }, "bottle")).toBe(false);
    expect(isComparableSupplierEntry({ stockUom: "bottle", stockQty: 0 }, "bottle")).toBe(false);
  });

  it("bridges only the same canonical product and isolates the current supplier", () => {
    const result = buildSupplierInsights(baseInput({
      entries: [
        entry(),
        entry({ id: "same-product", supplierName: "Other Foods" }),
        entry({ id: "different-product", productMasterId: "product-2", supplierName: "Leak Foods" }),
      ],
    }));
    expect(result.rows.map((row) => row.supplierName)).toEqual(["Other Foods"]);
  });

  it("normalizes the live current invoice price independently of master price", () => {
    const result = buildSupplierInsights(baseInput({ currentPurchasePrice: 60, currentStockQty: 6 }));
    expect(result.currentNormalizedCost).toBe(10);
  });
});

describe("supplier price selection", () => {
  it("prefers the latest positive non-free purchase and otherwise uses master price", () => {
    const result = buildSupplierInsights(baseInput({
      purchases: [
        { supplierName: "Cheaper Foods", price: 1, date: "2026-08-10", quantity: 0 },
        { supplierName: "Cheaper Foods", price: 0, date: "2026-08-09", quantity: 12 },
        { supplierName: "Cheaper Foods", price: 90, date: "2026-07-01", quantity: 12 },
        { supplierName: "Other Foods", price: 100, date: "2026-08-01", quantity: 12, isFree: true },
      ],
    }));
    const cheaper = result.rows.find((row) => row.supplierName === "Cheaper Foods");
    const other = result.rows.find((row) => row.supplierName === "Other Foods");
    expect(cheaper?.purchasePrice).toBe(90);
    expect(cheaper?.source).toBe("Latest invoice");
    expect(other?.purchasePrice).toBe(150);
    expect(other?.source).toBe("Master price");
  });

  it("excludes negative and free purchases from latest-price selection", () => {
    const result = buildSupplierInsights(baseInput({
      purchases: [
        { supplierName: "Cheaper Foods", price: -10, date: "2026-08-10", quantity: 12 },
        { supplierName: "Cheaper Foods", price: 80, date: "2026-08-09", quantity: 12, isFree: true },
      ],
    }));
    const cheaper = result.rows.find((row) => row.supplierName === "Cheaper Foods");
    expect(cheaper?.source).toBe("Master price");
    expect(cheaper?.purchasePrice).toBe(90);
  });

  it("marks missing conversion rows unavailable and excludes them from cheaper count", () => {
    const result = buildSupplierInsights(baseInput({
      entries: [
        entry(),
        entry({ id: "missing", supplierName: "Missing Foods", stockUom: "case", stockQty: 12, purchasePrice: 1 }),
        entry({ id: "cheaper", supplierName: "Cheaper Foods", purchasePrice: 90 }),
      ],
    }));
    const missing = result.rows.find((row) => row.supplierName === "Missing Foods");
    expect(missing?.normalizedCost).toBeNull();
    expect(missing?.unavailableReason).toContain("conversion missing");
    expect(result.cheaperCount).toBe(1);
  });

  it("sorts comparable suppliers by normalized cost and counts only meaningfully cheaper rows", () => {
    const result = buildSupplierInsights(baseInput({
      entries: [
        entry(),
        entry({ id: "same", supplierName: "Same Foods", purchasePrice: 120.005 }),
        entry({ id: "cheaper", supplierName: "Cheaper Foods", purchasePrice: 90 }),
        entry({ id: "cheapest", supplierName: "Cheapest Foods", purchasePrice: 60 }),
      ],
    }));
    expect(result.rows.map((row) => row.supplierName)).toEqual(["Cheapest Foods", "Cheaper Foods", "Same Foods"]);
    expect(result.cheaperCount).toBe(2);
  });

  it("marks a latest purchase stale after 90 days", () => {
    const result = buildSupplierInsights(baseInput({
      purchases: [{ supplierName: "Cheaper Foods", price: 90, date: "2026-05-01", quantity: 12 }],
    }));
    expect(result.rows.find((row) => row.supplierName === "Cheaper Foods")?.stale).toBe(true);
  });
});
