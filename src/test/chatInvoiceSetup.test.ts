import { describe, expect, it } from "vitest";
import { categoryPaths, parsePrintedSize } from "@/utils/chatInvoiceSetup";
import { nextCode, skuPrefix, supplierPrefix } from "@/utils/codes";

describe("chat invoice setup", () => {
  it("reads the pack size printed in the name", () => {
    expect(parsePrintedSize("Sholo Agave Syrup 5KG")).toEqual({ qty: 5000, unit: "g", pack: 1 });
    expect(parsePrintedSize("Fresh Harvest Dried Habanero Pepper 35g_R")).toEqual({ qty: 35, unit: "g", pack: 1 });
    expect(parsePrintedSize("Motel Mezcal Espadin 750ml")).toEqual({ qty: 750, unit: "ml", pack: 1 });
    expect(parsePrintedSize("Lime cordial 1.5L")).toEqual({ qty: 1500, unit: "ml", pack: 1 });
    expect(parsePrintedSize("Olive Pitted Queens Spain 3.85KG x 4")).toEqual({ qty: 3850, unit: "g", pack: 4 });
    expect(parsePrintedSize("Coke 24 x 330ml")).toEqual({ qty: 330, unit: "ml", pack: 24 });
    expect(parsePrintedSize("Lemons")).toBeNull();
  });
  it("lists leaf categories as L1 › L2 › L3 with the master group", () => {
    const cats = [
      { id: "f", name: "Food", level: 1 as const, parent_id: null, master_id: "mf" },
      { id: "s", name: "Spices & Seasonings", level: 2 as const, parent_id: "f" },
      { id: "d", name: "Dried Chillies", level: 3 as const, parent_id: "s" },
      { id: "z", name: "Frozen", level: 2 as const, parent_id: "f" },
    ];
    expect(categoryPaths(cats, { mf: "COGS" })).toEqual([
      { id: "z", label: "Food › Frozen", l1: "Food", l2: "Frozen", l3: "", group: "COGS" },
      { id: "d", label: "Food › Spices & Seasonings › Dried Chillies", l1: "Food", l2: "Spices & Seasonings", l3: "Dried Chillies", group: "COGS" },
    ]);
  });
  it("gives codes: Level 1 prefix for items, name for suppliers, next free number", () => {
    expect(skuPrefix("Food", "FOD")).toBe("FOD");
    expect(skuPrefix("My Own Stuff")).toBe("MYO");
    expect(nextCode("FOD", [], 4)).toBe("FOD-0001");
    expect(nextCode("BEV", ["BEV-0187", "bev-0188", "BEVX-1"], 4)).toBe("BEV-0189");
    expect(supplierPrefix("Drinks99 International Trading Limited")).toBe("DRI");
    expect(supplierPrefix("The Wine Co")).toBe("WIN");
    expect(nextCode("NOR", ["NOR-001"], 3)).toBe("NOR-002");
  });
});
