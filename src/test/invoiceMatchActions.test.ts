import { describe, expect, it } from "vitest";
import {
  buildMatchLinkPatch,
  buildRemoveMatchPatch,
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
    const merged = { ...line(), ...buildMatchLinkPatch(line(), target) };
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

describe("Remove match", () => {
  it("clears only the link and restores the scanned external fields", () => {
    const merged = { ...line(), ...buildRemoveMatchPatch(line()) };
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
    const merged = { ...overwritten, ...buildRemoveMatchPatch(overwritten) };
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
