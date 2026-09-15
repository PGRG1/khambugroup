import { describe, it, expect } from "vitest";
import { buildPriceTrends, priceGroupKey, type PriceObservation } from "../../supabase/functions/_shared/priceTrends";

const base: PriceObservation = {
  supplier_id: "sup-1",
  supplier: "Ming Kee Seafood Company Limited",
  invoice_id: "inv-1",
  invoice_number: "SI-001",
  date: "2026-01-05",
  description: "Asahi Super Dry",
  item_code: "ASA20",
  product_master_id: "pm-1",
  unit: "Bottle",
  pack_size: "640ml",
  unit_price: 10,
};

describe("priceGroupKey", () => {
  it("skips rows without a supplier id or item identity", () => {
    expect(priceGroupKey({ ...base, supplier_id: null })).toBeNull();
    expect(priceGroupKey({ ...base, product_master_id: null, item_code: "", description: "" })).toBeNull();
  });

  it("treats unit spelling variants as compatible", () => {
    expect(priceGroupKey({ ...base, unit: "bottle" })).toBe(priceGroupKey({ ...base, unit: " Bottle " }));
  });
});

describe("buildPriceTrends", () => {
  it("does not combine incompatible units", () => {
    const out = buildPriceTrends([
      { ...base, unit: "Bottle", unit_price: 10, date: "2026-01-05" },
      { ...base, invoice_id: "inv-2", unit: "Case", unit_price: 240, date: "2026-02-05" },
    ]);
    expect(out.items).toHaveLength(0);
  });

  it("does not combine different pack sizes", () => {
    const out = buildPriceTrends([
      { ...base, pack_size: "640ml", unit_price: 10, date: "2026-01-05" },
      { ...base, invoice_id: "inv-2", pack_size: "330ml", unit_price: 6, date: "2026-02-05" },
    ]);
    expect(out.items).toHaveLength(0);
  });

  it("never compares across suppliers", () => {
    const out = buildPriceTrends([
      base,
      { ...base, invoice_id: "inv-2", supplier_id: "sup-2", supplier: "Other Co", unit_price: 20, date: "2026-02-05" },
    ]);
    expect(out.items).toHaveLength(0);
  });

  it("reports like-for-like increases with evidence", () => {
    const out = buildPriceTrends([
      base,
      { ...base, invoice_id: "inv-2", invoice_number: "SI-002", unit_price: 12, date: "2026-02-05" },
    ]);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].change_pct).toBe(20);
    expect(out.items[0].direction).toBe("increase");
    expect(out.items[0].observation_count).toBe(2);
    expect(out.items[0].evidence.map((e) => e.invoice_number)).toEqual(["SI-001", "SI-002"]);
  });

  it("reports decreases as decreases", () => {
    const out = buildPriceTrends([
      base,
      { ...base, invoice_id: "inv-2", unit_price: 8, date: "2026-02-05" },
    ]);
    expect(out.items[0].direction).toBe("decrease");
    expect(out.items[0].change_pct).toBe(-20);
  });

  it("counts ambiguous unlinked rows as skipped instead of merging them", () => {
    const out = buildPriceTrends([
      { ...base, supplier_id: null },
      { ...base, invoice_id: "inv-2", supplier_id: null, unit_price: 99 },
    ]);
    expect(out.skipped_ambiguous).toBe(2);
    expect(out.items).toHaveLength(0);
  });

  it("respects the minimum change threshold", () => {
    const out = buildPriceTrends(
      [base, { ...base, invoice_id: "inv-2", unit_price: 10.2, date: "2026-02-05" }],
      { minChangePct: 5 },
    );
    expect(out.items).toHaveLength(0);
  });
});
