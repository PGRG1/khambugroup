import { describe, expect, it } from "vitest";
import {
  canonicalUom,
  canonicalUomCodes,
  findAmbiguousUomValues,
  hasCanonicalEquivalent,
  isLegacyUomVariant,
  normalizeUom,
} from "@/utils/uomNormalization";

describe("UOM normalization", () => {
  it("maps legacy spellings to canonical codes", () => {
    expect(normalizeUom("each", "stock")).toBe("Each");
    expect(normalizeUom("each (legacy)".replace(" (legacy)", ""), "purchase")).toBe("Each");
    expect(normalizeUom("BOT", "stock")).toBe("Bot");
    expect(normalizeUom("Bottle", "purchase")).toBe("Bot");
    expect(normalizeUom("KG", "purchase")).toBe("kg");
    expect(normalizeUom("Litre", "purchase")).toBe("L");
    expect(normalizeUom("CTN", "purchase")).toBe("Carton");
    expect(normalizeUom("PC", "stock")).toBe("Piece");
  });

  it("uses symbol codes for base/recipe units and word codes for pack units", () => {
    expect(normalizeUom("each", "base")).toBe("ea");
    expect(normalizeUom("Litres", "base")).toBe("L");
    expect(normalizeUom("Bot", "base")).toBe("Bot"); // no base equivalent — left untouched
  });

  it("keeps purchase and stock UOM independent", () => {
    expect(normalizeUom("Case", "purchase")).toBe("Case");
    expect(normalizeUom("bottle", "stock")).toBe("Bot");
    expect(normalizeUom("Case", "purchase")).not.toBe(normalizeUom("bottle", "stock"));
  });

  it("never guesses unknown values", () => {
    expect(canonicalUom("Bundle-A", "stock")).toBeNull();
    expect(normalizeUom("Bundle-A", "stock")).toBe("Bundle-A");
    expect(findAmbiguousUomValues(["Bundle-A", "each", "", null], "stock")).toEqual(["Bundle-A"]);
  });

  it("detects legacy duplicates and canonical equivalents", () => {
    expect(isLegacyUomVariant("each", "stock")).toBe(true);
    expect(isLegacyUomVariant("Each", "stock")).toBe(false);
    expect(hasCanonicalEquivalent("bottles", "purchase")).toBe(true);
    expect(hasCanonicalEquivalent("Bundle-A", "purchase")).toBe(false);
  });

  it("exposes canonical option lists without legacy labels", () => {
    const codes = canonicalUomCodes("stock");
    expect(codes.some((c) => c.code === "Each")).toBe(true);
    expect(codes.every((c) => !/legacy/i.test(c.code) && !/legacy/i.test(c.label))).toBe(true);
    expect(codes.every((c) => c.code !== "—" && c.code.trim() !== "")).toBe(true);
  });

  it("leaves historical invoice line unit text untouched", () => {
    const historicalUnit = "BOT x 12";
    // Invoice evidence is never passed through normalization.
    expect(historicalUnit).toBe("BOT x 12");
    expect(canonicalUom(historicalUnit, "purchase")).toBeNull();
  });
});
