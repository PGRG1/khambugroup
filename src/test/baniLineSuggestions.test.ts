import { describe, it, expect } from "vitest";
import { buildBaniSuggestions, rawOptionsOf } from "@/utils/baniLineSuggestions";

const pm = [
  { id: "a", supplier_entry_id: "ea", internal_sku: "BF-1", external_sku: "", internal_product_name: "Beef Ribeye NZ", supplier_product_name: "Ribeye NZ Chilled", supplier: "Classic" },
  { id: "b", supplier_entry_id: "eb", internal_sku: "BF-2", external_sku: "", internal_product_name: "Beef Striploin NZ", supplier_product_name: "Striploin NZ", supplier: "Classic" },
];

describe("Bani line suggestions", () => {
  it("offers up to 3 options from the invoice supplier, best first, with reasons", () => {
    const r = buildBaniSuggestions(
      [{ product_master_id: "b", confidence: 0.4, reason: "alt cut" }, { product_master_id: "a", confidence: 0.8, reason: "PS RIB = prime ribeye" }],
      pm as any, { description: "NZ PS RIB 200G" }, "Classic");
    expect(r.map((c) => c.entry.id)).toEqual(["a", "b"]);
    expect(r[0].reasons[0]).toBe("PS RIB = prime ribeye");
  });
  it("drops items outside the supplier scope and low-confidence guesses", () => {
    const r = buildBaniSuggestions([{ product_master_id: "zzz", confidence: 0.9 }, { product_master_id: "a", confidence: 0.2 }], pm as any, { description: "x" }, "Classic");
    expect(r).toEqual([]);
  });
  it("reads legacy single-suggestion output", () => {
    expect(rawOptionsOf({ product_master_id: "a", confidence: 0.7 })).toHaveLength(1);
    expect(rawOptionsOf({ candidates: [{ product_master_id: "a" }, null] })).toHaveLength(1);
  });
});
