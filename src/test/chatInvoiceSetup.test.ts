import { describe, expect, it } from "vitest";
import { categoryPaths, itemSku, parsePrintedSize } from "@/utils/chatInvoiceSetup";

describe("chat invoice setup", () => {
  it("reads the pack size printed in the name", () => {
    expect(parsePrintedSize("Sholo Agave Syrup 5KG")).toEqual({ qty: 5000, unit: "g" });
    expect(parsePrintedSize("Fresh Harvest Dried Habanero Pepper 35g_R")).toEqual({ qty: 35, unit: "g" });
    expect(parsePrintedSize("Motel Mezcal Espadin 750ml")).toEqual({ qty: 750, unit: "ml" });
    expect(parsePrintedSize("Lime cordial 1.5L")).toEqual({ qty: 1500, unit: "ml" });
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
  it("numbers SKUs from the name", () => {
    expect(itemSku("Motel Mezcal", [])).toBe("MOT-0001");
    expect(itemSku("Motel Mezcal", ["MOT-0001", "mot-0002"])).toBe("MOT-0003");
  });
});
