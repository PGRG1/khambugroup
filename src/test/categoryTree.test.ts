import { describe, expect, it } from "vitest";
import { sameCategory, toTidy, productCounts, pathOf, missingLevels, type CatRow } from "@/utils/categoryTree";

const rows: CatRow[] = [
  { id: "a", name: "Food", level: 1, parent_id: null, master_id: "m1" },
  { id: "b", name: "Herbs", level: 2, parent_id: "a", master_id: "m2" },
  { id: "c", name: "Herbs & Spices", level: 2, parent_id: "a", master_id: null },
  { id: "d", name: "Pork", level: 2, parent_id: "a", master_id: "m3" },
  { id: "e", name: "Pork Belly", level: 2, parent_id: "a", master_id: null },
  { id: "f", name: "Adjustements", level: 1, parent_id: null, master_id: null },
  { id: "g", name: "Adjustments", level: 1, parent_id: null, master_id: "m4" },
  { id: "h", name: "Beverages", level: 1, parent_id: null, master_id: "m5" },
];

describe("categories", () => {
  it("spots the same category", () => {
    expect(sameCategory("Cigar", "Cigars")).toBe(true);
    expect(sameCategory("Herbs", "Herbs & Spices")).toBe(true);
    expect(sameCategory("Adjustements", "Adjustments")).toBe(true);
    expect(sameCategory("Pork", "Pork Belly")).toBe(false);
    expect(sameCategory("Beef", "Beer")).toBe(false);
  });
  it("merges the client's own into the master one", () => {
    const products = [{ level1_category: "Food", level2_category: "Herbs & Spices", level3_category: null }, { level1_category: "Adjustements", level2_category: null, level3_category: null }];
    const t = toTidy(rows, productCounts(rows, products));
    expect(t.map((x) => `${x.from.name}>${x.into.name}:${x.products}`)).toEqual(["Adjustements>Adjustments:1", "Herbs & Spices>Herbs:1"]);
  });
  it("paths and missing levels", () => {
    expect(pathOf(rows, rows[2])).toEqual(["Food", "Herbs & Spices"]);
    expect(missingLevels([{ level1_category: "Food", level2_category: "", level3_category: null }, { level1_category: null, level2_category: null, level3_category: null }])).toEqual({ noLevel1: 1, noLevel2: 1 });
  });
});
