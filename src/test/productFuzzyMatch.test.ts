import { describe, it, expect } from "vitest";
import { scoreCandidates, classifyCandidates, FUZZY } from "@/utils/productFuzzyMatch";
import type { PMEntry } from "@/utils/productMasterResolver";

const pm = (over: Partial<PMEntry>): PMEntry => ({
  id: over.id || crypto.randomUUID(),
  internal_sku: over.internal_sku || "SKU",
  external_sku: over.external_sku ?? "",
  internal_product_name: over.internal_product_name || "",
  supplier_product_name: over.supplier_product_name || "",
  supplier: over.supplier,
  supplier_entry_id: over.supplier_entry_id,
});

const products: PMEntry[] = [
  pm({ internal_sku: "BER-0007", internal_product_name: "Strawberry (250G)", supplier_product_name: "Strawberry (250G)", supplier: "Fresh Co" }),
  pm({ internal_sku: "VF-0040", internal_product_name: "Lime (Australia)", supplier_product_name: "Lime Australia", supplier: "Fresh Co" }),
  pm({ internal_sku: "VF-0033", internal_product_name: "Tomato", supplier_product_name: "Tomato", supplier: "Fresh Co" }),
  pm({ internal_sku: "DR-0001", internal_product_name: "Coca Cola 330ml", supplier_product_name: "Coke 330ml", supplier: "Other Ltd" }),
];

describe("scoreCandidates", () => {
  it("ranks the near-identical product first", () => {
    const [top] = scoreCandidates({ description: "Strawberry" }, products, "Fresh Co");
    expect(top.entry.internal_sku).toBe("BER-0007");
    expect(top.score).toBeGreaterThan(FUZZY.SUGGEST);
  });

  it("matches reordered tokens (Aus Lime -> Lime Australia)", () => {
    const [top] = scoreCandidates({ description: "Aus Lime" }, products, "Fresh Co");
    expect(top.entry.internal_sku).toBe("VF-0040");
  });

  it("tolerates plural typos", () => {
    const [top] = scoreCandidates({ description: "Tomatoes" }, products, "Fresh Co");
    expect(top.entry.internal_sku).toBe("VF-0033");
    expect(top.score).toBeGreaterThanOrEqual(FUZZY.SUGGEST);
  });

  it("prefers the same-supplier candidate", () => {
    const list = scoreCandidates({ description: "Coke 330ml" }, products, "Fresh Co");
    expect(list[0].entry.supplier).toBeDefined();
  });

  it("returns nothing for an empty line", () => {
    expect(scoreCandidates({}, products, "Fresh Co")).toHaveLength(0);
  });
});

describe("classifyCandidates", () => {
  it("asks AI when nothing is close", () => {
    const res = classifyCandidates(scoreCandidates({ description: "zzzz qqqq" }, products, "Fresh Co"));
    expect(res.action).toBe("ask_ai");
  });

  it("auto-links an exact-ish name", () => {
    const res = classifyCandidates(scoreCandidates({ description: "Strawberry (250g)" }, products, "Fresh Co"));
    expect(res.action).toBe("auto_link");
  });
});
