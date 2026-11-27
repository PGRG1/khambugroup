import { describe, it, expect } from "vitest";
import { assetClassOf } from "@/hooks/useAssetPolicy";

describe("asset class from a bill line", () => {
  it("reads kitchen, IT, furniture and fit-out", () => {
    expect(assetClassOf("SD-120PF ice machine 54kg/24h")).toBe("kitchen_equipment");
    expect(assetClassOf("製冰機")).toBe("kitchen_equipment");
    expect(assetClassOf("POS terminal")).toBe("it_equipment");
    expect(assetClassOf("Receipt printer")).toBe("it_equipment");
    expect(assetClassOf("Dining chairs x 20")).toBe("furniture_fixtures");
    expect(assetClassOf("Shop fit-out works")).toBe("leasehold_improvements");
  });
  it("plain equipment is kitchen equipment", () => {
    expect(assetClassOf("Equipment")).toBe("kitchen_equipment");
  });
});
