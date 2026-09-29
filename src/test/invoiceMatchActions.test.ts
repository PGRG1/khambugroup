import { describe, expect, it } from "vitest";
import {
  buildMatchLinkPatch,
  buildRemoveMatchPatch,
  canonicalizeMatchedLinesForSupplier,
  UNMATCHED_STATE_LABEL,
  type MatchableLine,
  type MatchTargetEntry,
} from "@/utils/invoiceMatchActions";

const line = (): MatchableLine => ({
  item_code: "SUP-1",
  description: "SAN MIGUEL 330ML",
  scanned_item_code: "SUP-1",
  scanned_description: "SAN MIGUEL 330ML",
  quantity: "12",
  unit: "CAN",
  unit_price: "8.50",
  matched_sku: "INT-1",
  matched_internal_name: "San Miguel Beer 330ml",
  matched_stock_uom: "Can",
  matched_purchase_uom: "Case",
  matched_stock_qty_ratio: 24,
  product_master_id: "pm-1",
  supplier_entry_id: "se-1",
  unmatched: false,
  auto_matched: true,
  auto_match_score: 0.95,
});

const target: MatchTargetEntry = {
  id: "pm-2",
  supplier_entry_id: "se-2",
  internal_sku: "INT-2",
  internal_product_name: "San Miguel Light 330ml",
  supplier_product_name: "SAN MIGUEL LIGHT 330ML",
  external_sku: "SUP-2",
  purchase_unit: "Case",
  stock_uom: "Can",
  stock_qty: 24,
};

describe("Change match", () => {
  it("replaces the product link in one atomic patch", () => {
    const patch = buildMatchLinkPatch(line(), target);
    expect(patch.product_master_id).toBe("pm-2");
    expect(patch.supplier_entry_id).toBe("se-2");
    expect(patch.matched_sku).toBe("INT-2");
    expect(patch.unmatched).toBe(false);
    // no field is blanked while switching
    expect(patch.description).toBeTruthy();
    expect(patch.item_code).toBeTruthy();
  });

  it("preserves the scanned invoice evidence when changing match", () => {
    const merged: MatchableLine = { ...line(), ...buildMatchLinkPatch(line(), target) };
    expect(merged.scanned_description).toBe("SAN MIGUEL 330ML");
    expect(merged.scanned_item_code).toBe("SUP-1");
    expect(merged.quantity).toBe("12");
    expect(merged.unit_price).toBe("8.50");
    expect(merged.unit).toBe("CAN");
  });

  it("keeps purchase and stock UOM distinct from the target entry", () => {
    const patch = buildMatchLinkPatch(line(), { ...target, purchase_unit: "Case", stock_uom: "Bot" });
    expect(patch.matched_purchase_uom).toBe("Case");
    expect(patch.matched_stock_uom).toBe("Bot");
    expect(patch.matched_purchase_uom).not.toBe(patch.matched_stock_uom);
  });
});

describe("Link uses Items Master values", () => {
  it("sets master name/SKU while preserving scanned wording", () => {
    const patch = buildMatchLinkPatch(line(), { ...target, supplier_product_name: "San Miguel Pale Pilsen 330ml", external_sku: "SM-330" });
    expect(patch.description).toBe("San Miguel Pale Pilsen 330ml");
    expect(patch.item_code).toBe("SM-330");
    expect(patch.scanned_description).toBe("SAN MIGUEL 330ML");
    expect(patch.scanned_item_code).toBe("SUP-1");
  });
  it("falls back to internal name when supplier name is blank", () => {
    const patch = buildMatchLinkPatch(line(), { ...target, supplier_product_name: "", internal_product_name: "San Miguel Can" });
    expect(patch.description).toBe("San Miguel Can");
  });

  it("applies the same supplier name and SKU for a newly created quick-add entry", () => {
    const quickAddEntry = {
      ...target,
      supplier: "ONGO Food Ltd",
      supplier_product_name: "Face Towel - 96",
      external_sku: "ONGO-FT96",
    };
    const linked = { ...line(), ...buildMatchLinkPatch(line(), quickAddEntry) };
    expect(linked.product_master_id).toBe("pm-2");
    expect(linked.supplier_entry_id).toBe("se-2");
    expect(linked.description).toBe("Face Towel - 96");
    expect(linked.item_code).toBe("ONGO-FT96");
    expect(linked.scanned_description).toBe("SAN MIGUEL 330ML");
  });

  it("refreshes a suggested-item link through its supplier entry", () => {
    const suggestedLine = {
      ...line(),
      product_master_id: null,
      supplier_entry_id: null,
      unmatched: true,
    };
    const linked = { ...suggestedLine, ...buildMatchLinkPatch(suggestedLine, {
      ...target,
      supplier: "ONGO Food Ltd",
      supplier_product_name: "Face Towel - 96",
      external_sku: "ONGO-FT96",
    }) };
    expect(linked.product_master_id).toBe("pm-2");
    expect(linked.supplier_entry_id).toBe("se-2");
    expect(linked.description).toBe("Face Towel - 96");
    expect(linked.item_code).toBe("ONGO-FT96");
    expect(linked.unmatched).toBe(false);
  });

  it("re-derives linked names at save and rejects products without this supplier entry", () => {
    const staleLinked = {
      ...line(),
      description: "96 Good Smile Face Towel - 96/Piece",
      item_code: "OCR-96",
      product_master_id: "pm-2",
      supplier_entry_id: "se-old",
    };
    const valid = canonicalizeMatchedLinesForSupplier([staleLinked], [{
      ...target,
      supplier: "ONGO Food Ltd",
      supplier_product_name: "Face Towel - 96",
      external_sku: "ONGO-FT96",
    }], "ONGO Food Ltd");
    expect(valid.missingSupplierEntryIndexes).toEqual([]);
    expect(valid.lines[0].description).toBe("Face Towel - 96");
    expect(valid.lines[0].item_code).toBe("ONGO-FT96");
    expect(valid.lines[0].scanned_description).toBe("SAN MIGUEL 330ML");

    const invalid = canonicalizeMatchedLinesForSupplier([staleLinked], [{
      ...target,
      supplier: "Another Supplier",
    }], "ONGO Food Ltd");
    expect(invalid.missingSupplierEntryIndexes).toEqual([0]);
    expect(invalid.lines[0].unmatched).toBe(true);
    expect(invalid.lines[0].product_master_id).toBeNull();
    expect(invalid.lines[0].match_hold_reason).toBe("Needs a product for this supplier");
  });
});

describe("Remove match", () => {
  it("clears only the link and restores the scanned external fields", () => {
    const merged: MatchableLine = { ...line(), ...buildRemoveMatchPatch(line()) };
    expect(merged.product_master_id).toBeNull();
    expect(merged.supplier_entry_id).toBeNull();
    expect(merged.matched_sku).toBe("");
    expect(merged.matched_internal_name).toBe("");
    expect(merged.matched_purchase_uom).toBe("");
    expect(merged.matched_stock_uom).toBe("");
    expect(merged.unmatched).toBe(true);
    expect(merged.auto_matched).toBe(false);
  });

  it("preserves external name/SKU, quantities, prices and units", () => {
    const overwritten = { ...line(), description: "San Miguel Light 330ml", item_code: "SUP-2" };
    const merged: MatchableLine = { ...overwritten, ...buildRemoveMatchPatch(overwritten) };
    expect(merged.description).toBe("SAN MIGUEL 330ML");
    expect(merged.item_code).toBe("SUP-1");
    expect(merged.quantity).toBe("12");
    expect(merged.unit_price).toBe("8.50");
    expect(merged.unit).toBe("CAN");
  });

  it("exposes an explicit unmatched state label", () => {
    expect(UNMATCHED_STATE_LABEL).toBe("Unmatched — select or create item");
  });
});
