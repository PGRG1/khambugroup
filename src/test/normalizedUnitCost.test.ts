import { describe, it, expect } from "vitest";
import { computeNormalizedUnitCost, resolvePurchaseToStockQty } from "@/utils/normalizedUnitCost";
import { sanitizeAnomalyOutput } from "../../supabase/functions/_shared/anomalyFlags";

describe("normalized_unit_cost from the Items Master conversion", () => {
  it("divides net purchase cost by purchase-to-stock qty (HK$480 / 24 bottles)", () => {
    expect(computeNormalizedUnitCost({ netUnitCost: 480, supplierStockQty: 24 })).toBe(20);
  });

  it("prefers the supplier-specific conversion over the product master fallback", () => {
    expect(resolvePurchaseToStockQty({ supplierStockQty: 12, productStockQty: 24 })).toBe(12);
    expect(resolvePurchaseToStockQty({ supplierStockQty: null, productStockQty: 24 })).toBe(24);
  });

  it("falls back to unit_price only when net_unit_cost is absent", () => {
    expect(computeNormalizedUnitCost({ netUnitCost: null, unitPrice: 100, supplierStockQty: 4 })).toBe(25);
    expect(computeNormalizedUnitCost({ netUnitCost: 80, unitPrice: 100, supplierStockQty: 4 })).toBe(20);
  });

  it("returns null instead of guessing when the conversion is missing or invalid", () => {
    expect(computeNormalizedUnitCost({ netUnitCost: 480 })).toBeNull();
    expect(computeNormalizedUnitCost({ netUnitCost: 480, supplierStockQty: 0 })).toBeNull();
    expect(computeNormalizedUnitCost({ netUnitCost: 480, supplierStockQty: "abc" })).toBeNull();
    expect(computeNormalizedUnitCost({ netUnitCost: 0, supplierStockQty: 24 })).toBeNull();
    expect(computeNormalizedUnitCost({ netUnitCost: 480, supplierStockQty: 24, matched: false })).toBeNull();
  });

  it("never depends on scanned pack_size text", () => {
    // pack_size is intentionally blank on scanned lines; conversion still resolves.
    expect(computeNormalizedUnitCost({ netUnitCost: 240, productStockQty: 6 })).toBe(40);
  });
});

describe("anomaly flags never warn about missing price normalization", () => {
  it("removes missing_coding flags caused by a null normalized_unit_cost", () => {
    const out = sanitizeAnomalyOutput(
      { confidence: 0.8, flags: [
        { type: "missing_coding", reason: "normalized_unit_cost is null for this line", confidence: 0.9 },
        { type: "duplicate_invoice", reason: "same invoice number", confidence: 0.9 },
      ] },
      [{ id: "l1", normalized_unit_cost: null }],
    );
    expect(out.flags).toHaveLength(1);
    expect(out.flags[0].type).toBe("duplicate_invoice");
  });

  it("skips price comparison flags for lines without a normalized cost", () => {
    const out = sanitizeAnomalyOutput(
      { flags: [
        { type: "price_spike", reason: "cost above median", suspected_ref: { line_id: "l1" } },
        { type: "price_spike", reason: "cost above median", suspected_ref: { line_id: "l2" } },
      ] },
      [{ id: "l1", normalized_unit_cost: null }, { id: "l2", normalized_unit_cost: 20 }],
    );
    expect(out.flags).toHaveLength(1);
    expect(out.flags[0].suspected_ref.line_id).toBe("l2");
  });

  it("keeps legitimate coding flags unrelated to normalization", () => {
    const out = sanitizeAnomalyOutput(
      { flags: [{ type: "missing_coding", reason: "no expense category assigned" }] },
      [{ id: "l1", normalized_unit_cost: null }],
    );
    expect(out.flags).toHaveLength(1);
  });

  it("leaves categorization output untouched (not an anomaly payload)", () => {
    const categorize = { category_id: "c1", coa_account_id: "a1", confidence: 0.9 };
    expect(sanitizeAnomalyOutput(categorize, [{ id: "l1", normalized_unit_cost: null }]))
      .toMatchObject({ category_id: "c1", coa_account_id: "a1", flags: [] });
  });
});
