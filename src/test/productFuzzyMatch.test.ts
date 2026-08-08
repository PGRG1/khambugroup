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

  it("does not auto-link unrelated products because of supplier or SKU bonuses", () => {
    const spirits = [
      pm({ internal_sku: "BOLS", external_sku: "100", internal_product_name: "Bols Blue Curacao 70CL", supplier_product_name: "Bols Blue Curacao 70CL", supplier: "Drinks Co" }),
    ];
    const result = classifyCandidates(scoreCandidates(
      { itemCode: "100", description: "MCCORMICK VODKA 100ml" },
      spirits,
      "Drinks Co",
    ));
    expect(result.action).not.toBe("auto_link");
    expect(result.top?.rawNameScore).toBeLessThan(FUZZY.AUTO_LINK_NAME);
  });

  it("blocks auto-link when pack sizes conflict", () => {
    const variants = [pm({ internal_sku: "VODKA-70", internal_product_name: "McCormick Vodka 70CL", supplier_product_name: "McCormick Vodka 70CL", supplier: "Drinks Co" })];
    const result = classifyCandidates(scoreCandidates({ description: "McCormick Vodka 100ml" }, variants, "Drinks Co"));
    expect(result.action).not.toBe("auto_link");
    expect(result.top?.blockingReasons).toContain("size differs");
  });

  it("does not auto-link close alternatives", () => {
    const variants = [
      pm({ internal_sku: "A", internal_product_name: "Stella Artois Bottle 330ml", supplier_product_name: "Stella Artois Bottle 330ml" }),
      pm({ internal_sku: "B", internal_product_name: "Stella Artois Bottles 330ml", supplier_product_name: "Stella Artois Bottles 330ml" }),
    ];
    const result = classifyCandidates(scoreCandidates({ description: "Stella Artois Bottle 330ml" }, variants));
    expect(result.ambiguous).toBe(true);
    expect(result.action).toBe("suggest");
  });
});

describe("honest matching guards", () => {
  const beers: PMEntry[] = [
    pm({ internal_sku: "BR-0010", internal_product_name: "Stella Artois 30L Keg", supplier_product_name: "STELLA ARTOIS - 30L KEG", supplier: "Beer Co" }),
    pm({ internal_sku: "BR-0011", internal_product_name: "Stella Artois 30L Keg - Empty Return", supplier_product_name: "STELLA ARTOIS 30L KEG EMPTY", supplier: "Beer Co" }),
    pm({ internal_sku: "BR-0020", internal_product_name: "Hoegaarden 20L Keg", supplier_product_name: "HOEGAARDEN 20L KEG", supplier: "Beer Co" }),
  ];

  it("matches an empty keg line to the empty keg product, never the full one", () => {
    const cands = scoreCandidates({ description: "STELLA ARTOIS - 30L KEG (B) - EMPTY KEG" }, beers, "Beer Co");
    const { suggestions } = classifyCandidates(cands);
    expect(suggestions[0]?.entry.internal_sku).toBe("BR-0011");
    expect(suggestions.some((c) => c.entry.internal_sku === "BR-0010")).toBe(false);
  });

  it("never suggests the empty variant for a normal line", () => {
    const cands = scoreCandidates({ description: "STELLA ARTOIS - 30L KEG" }, beers, "Beer Co");
    const { suggestions } = classifyCandidates(cands);
    expect(suggestions.some((c) => c.entry.internal_sku === "BR-0011")).toBe(false);
  });

  it("gives no suggestion for an unrelated product sharing only the supplier", () => {
    const cands = scoreCandidates({ description: "MCCORMICK VODKA 100ml" }, beers, "Beer Co");
    const { action, suggestions } = classifyCandidates(cands);
    expect(suggestions).toHaveLength(0);
    expect(action).toBe("ask_ai");
  });

  it("returns nothing for non-product charge lines", () => {
    expect(scoreCandidates({ description: "Delivery Charge" }, beers, "Beer Co")).toHaveLength(0);
    expect(scoreCandidates({ description: "Discount" }, beers, "Beer Co")).toHaveLength(0);
  });

  it("reports the honest name confidence, not the boosted ranking score", () => {
    const [top] = scoreCandidates({ description: "HOEGAARDEN - 20L KEG Ref No. 6B15" }, beers, "Beer Co");
    expect(top.entry.internal_sku).toBe("BR-0020");
    expect(top.confidence).toBe(top.rawNameScore);
    expect(top.confidence).toBeLessThanOrEqual(top.score);
  });

  it("still suggests genuine matches", () => {
    const { suggestions } = classifyCandidates(scoreCandidates({ description: "Strawberry" }, products, "Fresh Co"));
    expect(suggestions[0]?.entry.internal_sku).toBe("BER-0007");
  });
});
