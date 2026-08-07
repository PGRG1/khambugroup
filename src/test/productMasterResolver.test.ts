import { describe, expect, it } from "vitest";
import { resolveExactMatch, type PMEntry } from "@/utils/productMasterResolver";

const product: PMEntry = {
  id: "1",
  internal_sku: "SP-001",
  external_sku: "100",
  internal_product_name: "Bols Blue Curacao 70CL",
  supplier_product_name: "Bols Blue Curacao 70CL",
  supplier: "Drinks Co",
};

describe("resolveExactMatch", () => {
  it("rejects short identifiers", () => {
    expect(resolveExactMatch({ itemCode: "100" }, [product], "Drinks Co")).toBeNull();
  });

  it("rejects an exact identifier when the scanned name conflicts", () => {
    const withLongCode = { ...product, external_sku: "ABC100" };
    expect(resolveExactMatch(
      { itemCode: "ABC100", description: "McCormick Vodka 100ml" },
      [withLongCode],
      "Drinks Co",
    )).toBeNull();
  });

  it("accepts an exact identifier when the names agree", () => {
    const withLongCode = { ...product, external_sku: "ABC100" };
    expect(resolveExactMatch(
      { itemCode: "ABC100", description: "Bols Blue Curacao 70CL" },
      [withLongCode],
      "Drinks Co",
    )?.id).toBe("1");
  });
});