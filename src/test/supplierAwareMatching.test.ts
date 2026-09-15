import { describe, it, expect } from "vitest";
import {
  findTrustedProductMatch,
  reconcileMatchDecision,
  type SupplierMatchRow,
} from "../../supabase/functions/_shared/supplierMatch";
import {
  describeMatchHoldReason,
  reconcileReviewerHold,
  findUniqueExactNameEntry,
  unknownSupplierCodeWarning,
} from "@/utils/supplierMatchPolicy";
import type { PMEntry } from "@/utils/productMasterResolver";

const row = (over: Partial<SupplierMatchRow>): SupplierMatchRow => ({
  internal_sku: "SKU-1",
  supplier: "Jebsen Beverage - Wine",
  supplier_product_name: "Cloudy Bay Sauvignon Blanc 750ml",
  internal_product_name: "Cloudy Bay Sauvignon Blanc 750ml",
  external_sku: "JB-1001",
  purchase_unit: "Bottle",
  ...over,
});

const line = (over: Record<string, unknown> = {}) => ({
  item_code: "",
  description: "Cloudy Bay Sauvignon Blanc 750ml",
  unit: "Bottle",
  ...over,
});

describe("findTrustedProductMatch — supplier-aware evidence order", () => {
  it("matches on exact name with case/punctuation differences and unknown printed SKU", () => {
    const result = findTrustedProductMatch(
      line({ item_code: "ZZ-9999", description: "CLOUDY BAY, SAUVIGNON BLANC 750ML" }),
      "Jebsen Beverage - Wine",
      [row({})],
    );
    expect(result.status).toBe("matched");
    expect(result.row?.internal_sku).toBe("SKU-1");
    expect(result.hardConflict).toBe(false);
    expect(result.warnings.join(" ")).toContain("ZZ-9999");
    expect(result.warnings.join(" ")).toContain("not yet recorded");
  });

  it("matches a known SKU with a compatible exact name", () => {
    const result = findTrustedProductMatch(
      line({ item_code: "JB-1001" }),
      "Jebsen Beverage - Wine",
      [row({})],
    );
    expect(result.status).toBe("matched");
    expect(result.warnings).toHaveLength(0);
  });

  it("blocks when the printed SKU belongs to another item of the same supplier", () => {
    const result = findTrustedProductMatch(
      line({ item_code: "JB-1001", description: "Whispering Angel Rose 750ml" }),
      "Jebsen Beverage - Wine",
      [
        row({}),
        row({ internal_sku: "SKU-2", external_sku: "JB-2002", supplier_product_name: "Whispering Angel Rose 750ml", internal_product_name: "Whispering Angel Rose 750ml" }),
      ],
    );
    expect(result.status).toBe("needs_review");
    expect(result.hardConflict).toBe(true);
    expect(result.reason.toLowerCase()).toContain("registered to a different");
  });

  it("blocks a registered code whose item has a conflicting pack size", () => {
    const result = findTrustedProductMatch(
      line({ item_code: "JB-1001", description: "Cloudy Bay Sauvignon Blanc 375ml" }),
      "Jebsen Beverage - Wine",
      [row({})],
    );
    expect(result.hardConflict).toBe(true);
    expect(result.reason.toLowerCase()).toContain("pack size");
  });

  it("blocks a registered code whose item has a conflicting qualifier", () => {
    const result = findTrustedProductMatch(
      line({ item_code: "JB-2002", description: "Blue Girl Keg 30L empty return", unit: "Keg" }),
      "Jebsen Beverage - Beer",
      [row({
        internal_sku: "SKU-KEG",
        supplier: "Jebsen Beverage - Beer",
        external_sku: "JB-2002",
        supplier_product_name: "Blue Girl Keg 30L",
        internal_product_name: "Blue Girl Keg 30L",
        purchase_unit: "Keg",
      })],
    );
    expect(result.hardConflict).toBe(true);
  });


  it("blocks an exact name with a conflicting purchase UOM", () => {
    const result = findTrustedProductMatch(
      line({ unit: "Case", external_sku: "" }),
      "Jebsen Beverage - Wine",
      [row({ external_sku: "", purchase_unit: "Bottle" })],
    );
    expect(result.hardConflict).toBe(true);
    expect(result.reason.toLowerCase()).toContain("uom");
  });

  it("returns possible_match when two same-supplier products share the name", () => {
    const result = findTrustedProductMatch(
      line({}),
      "Jebsen Beverage - Wine",
      [row({ external_sku: "" }), row({ internal_sku: "SKU-9", external_sku: "" })],
    );
    expect(result.status).toBe("possible_match");
    expect(result.hardConflict).toBe(false);
    expect(result.candidates).toEqual(["SKU-1", "SKU-9"]);
  });

  it("never matches a name that belongs only to another supplier", () => {
    const result = findTrustedProductMatch(
      line({ item_code: "JB-1001" }),
      "Ming Kee",
      [row({})],
    );
    expect(result.status).toBe("unmatched");
    expect(result.row).toBeNull();
  });

  it("keeps a genuinely fuzzy line in review", () => {
    const result = findTrustedProductMatch(
      line({ description: "cloudy bay sauv bl" }),
      "Jebsen Beverage - Wine",
      [row({ external_sku: "" })],
    );
    expect(result.status).toBe("unmatched");
    expect(result.hardConflict).toBe(false);
  });
});

describe("reconcileMatchDecision", () => {
  it("keeps a deterministic match despite a generic reviewer needs_review", () => {
    const local = findTrustedProductMatch(
      line({ item_code: "ZZ-9999", description: "cloudy bay sauvignon blanc 750ml" }),
      "Jebsen Beverage - Wine",
      [row({})],
    );
    const decision = reconcileMatchDecision("needs_review", "Items Master match needs manual review.", local);
    expect(decision.status).toBe("matched");
    expect(decision.blocking).toBe(false);
    expect(decision.internalSku).toBe("SKU-1");
    expect(decision.warnings.join(" ")).toContain("not yet recorded");
  });

  it("never lets confidence override a hard conflict", () => {
    const local = findTrustedProductMatch(
      line({ item_code: "JB-1001", description: "Whispering Angel Rose 750ml" }),
      "Jebsen Beverage - Wine",
      [
        row({}),
        row({ internal_sku: "SKU-2", external_sku: "JB-2002", supplier_product_name: "Whispering Angel Rose 750ml", internal_product_name: "Whispering Angel Rose 750ml" }),
      ],
    );
    const decision = reconcileMatchDecision("matched", "AI is confident", local);
    expect(decision.status).toBe("needs_review");
    expect(decision.blocking).toBe(true);
    expect(decision.internalSku).toBe("");
  });
});

const pmEntry = (over: Partial<PMEntry> = {}): PMEntry => ({
  id: "1",
  internal_sku: "SKU-1",
  internal_product_name: "Cloudy Bay Sauvignon Blanc 750ml",
  supplier_product_name: "Cloudy Bay Sauvignon Blanc 750ml",
  external_sku: "JB-1001",
  supplier: "Jebsen Beverage - Wine",
  purchase_unit: "Bottle",
  ...(over as PMEntry),
});

describe("UI match policy", () => {
  it("does not label a normalized-equal suggestion as Name differs", () => {
    const reason = describeMatchHoldReason({
      description: "CLOUDY BAY, SAUVIGNON BLANC 750ML",
      ambiguous: false,
      top: { entry: pmEntry(), score: 1, rawNameScore: 1, confidence: 1, reasons: [], blockingReasons: [], disqualified: false },
      reviewReason: "Items Master match needs manual review.",
    });
    expect(reason).not.toBe("Name differs");
    expect(reason).toBe("Needs confirmation");
  });

  it("still labels a genuinely different name as Name differs", () => {
    const reason = describeMatchHoldReason({
      description: "Whispering Angel Rose",
      ambiguous: false,
      top: { entry: pmEntry(), score: 0.7, rawNameScore: 0.7, confidence: 0.7, reasons: [], blockingReasons: [], disqualified: false },
    });
    expect(reason).toBe("Name differs");
  });

  it("shows the non-blocking supplier-code note for unknown SKU + exact name", () => {
    const reason = describeMatchHoldReason({
      description: "Cloudy Bay Sauvignon Blanc 750ml",
      ambiguous: false,
      top: { entry: pmEntry(), score: 1, rawNameScore: 1, confidence: 1, reasons: [], blockingReasons: [], disqualified: false },
      unknownSupplierCode: "ZZ-9999",
    });
    expect(reason).toContain("ZZ-9999");
  });

  it("releases a generic reviewer hold for a unique exact supplier-name match", () => {
    const result = reconcileReviewerHold({
      reviewStatus: "needs_review",
      reviewBlocking: ["matched_sku: Items Master match needs manual review."],
      reviewReason: "Items Master match needs manual review.",
      description: "cloudy bay sauvignon blanc 750ml",
      supplierScopedPm: [pmEntry()],
    });
    expect(result.requiresManualAction).toBe(false);
    expect(result.deterministicEntry?.internal_sku).toBe("SKU-1");
  });

  it("keeps a hold when the reviewer reported a real conflict", () => {
    const result = reconcileReviewerHold({
      reviewStatus: "needs_review",
      reviewBlocking: ["matched_sku: Supplier code JB-1001 is registered to a different item (SKU-2) for this supplier."],
      reviewReason: "Supplier code JB-1001 is registered to a different item (SKU-2) for this supplier.",
      description: "cloudy bay sauvignon blanc 750ml",
      supplierScopedPm: [pmEntry()],
    });
    expect(result.requiresManualAction).toBe(true);
    expect(result.deterministicEntry).toBeNull();
  });

  it("keeps a hold for ambiguous duplicates", () => {
    const result = reconcileReviewerHold({
      reviewStatus: "needs_review",
      reviewReason: "Items Master match needs manual review.",
      description: "cloudy bay sauvignon blanc 750ml",
      supplierScopedPm: [pmEntry(), pmEntry({ id: "2", internal_sku: "SKU-9" })],
    });
    expect(result.requiresManualAction).toBe(true);
    expect(findUniqueExactNameEntry("cloudy bay sauvignon blanc 750ml", [pmEntry(), pmEntry({ id: "2", internal_sku: "SKU-9" })])).toBeNull();
  });

  it("flags an unregistered supplier code only when it is truly unknown", () => {
    expect(unknownSupplierCodeWarning("JB-1001", [pmEntry()])).toBeNull();
    expect(unknownSupplierCodeWarning("ZZ-9999", [pmEntry()])).toContain("not yet recorded");
    expect(unknownSupplierCodeWarning("12", [pmEntry()])).toBeNull();
  });
});
