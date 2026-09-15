import { describe, it, expect } from "vitest";
import { buildPriceTrends, trendGroupKey, type PriceLine } from "../../supabase/functions/_shared/priceTrends";

const line = (over: Partial<PriceLine>): PriceLine => ({
  supplier_id: "sup-1",
  supplier: "Ming Kee Seafood Company Limited",
  product_master_id: "pm-1",
  item_code: "MK-001",
  description: "Chicken thigh",
  unit: "Case",
  pack_size: "24",
  unit_price: 100,
  invoice_id: "inv-1",
  invoice_number: "SI0001",
  date: "2026-01-05",
  ...over,
});

describe("supplier price trends", () => {
  it("compares same supplier + item + unit/pack and returns source invoices", () => {
    const res = buildPriceTrends([
      line({ unit_price: 100, invoice_id: "inv-1", invoice_number: "SI0001", date: "2026-01-05" }),
      line({ unit_price: 120, invoice_id: "inv-2", invoice_number: "SI0002", date: "2026-02-05" }),
    ]);
    expect(res.items).toHaveLength(1);
    const t = res.items[0];
    expect(t.change_pct).toBe(20);
    expect(t.direction).toBe("increase");
    expect(t.observation_count).toBe(2);
    expect(t.unit).toBe("Case");
    expect(t.pack_size).toBe("24");
    expect(t.sources.map((s) => s.invoice_number)).toEqual(["SI0001", "SI0002"]);
    expect(t.sources.map((s) => s.invoice_id)).toEqual(["inv-1", "inv-2"]);
  });

  it("reports a decrease as a decrease", () => {
    const res = buildPriceTrends([
      line({ unit_price: 100, date: "2026-01-05" }),
      line({ unit_price: 80, invoice_id: "inv-2", date: "2026-02-05" }),
    ]);
    expect(res.items[0].change_pct).toBe(-20);
    expect(res.items[0].direction).toBe("decrease");
  });

  it("does NOT combine incompatible units", () => {
    const res = buildPriceTrends([
      line({ unit: "Case", unit_price: 480, date: "2026-01-05" }),
      line({ unit: "Bottle", unit_price: 20, invoice_id: "inv-2", date: "2026-02-05" }),
    ]);
    expect(res.items).toHaveLength(0);
    expect(res.compared_groups).toBe(0);
    expect(res.skipped_incomparable_lines).toBe(0);
  });

  it("does NOT combine different pack sizes on the same unit", () => {
    const res = buildPriceTrends([
      line({ pack_size: "24", unit_price: 480, date: "2026-01-05" }),
      line({ pack_size: "12", unit_price: 260, invoice_id: "inv-2", date: "2026-02-05" }),
    ]);
    expect(res.items).toHaveLength(0);
  });

  it("treats unit spelling variants as the same basis", () => {
    expect(trendGroupKey(line({ unit: "Case" }))).toBe(trendGroupKey(line({ unit: " case " })));
  });

  it("never compares across suppliers", () => {
    const res = buildPriceTrends([
      line({ supplier_id: "sup-1", unit_price: 100, date: "2026-01-05" }),
      line({ supplier_id: "sup-2", supplier: "Other Co", unit_price: 150, invoice_id: "inv-2", date: "2026-02-05" }),
    ]);
    expect(res.items).toHaveLength(0);
  });

  it("skips lines with no usable unit or identity instead of merging them", () => {
    const res = buildPriceTrends([
      line({ unit: null, unit_price: 100 }),
      line({ unit: null, unit_price: 130, invoice_id: "inv-2", date: "2026-02-05" }),
      line({ product_master_id: null, item_code: null, description: "  ", unit_price: 40, invoice_id: "inv-3" }),
    ]);
    expect(res.items).toHaveLength(0);
    expect(res.skipped_incomparable_lines).toBe(3);
  });

  it("respects the minimum change threshold", () => {
    const res = buildPriceTrends(
      [line({ unit_price: 100, date: "2026-01-05" }), line({ unit_price: 102, invoice_id: "inv-2", date: "2026-02-05" })],
      { min_change_pct: 5 },
    );
    expect(res.items).toHaveLength(0);
    expect(res.compared_groups).toBe(1);
  });
});
