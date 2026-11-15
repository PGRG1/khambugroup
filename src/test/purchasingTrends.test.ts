import { describe, expect, it } from "vitest";
import { purchasingTrends, trendMonths } from "@/utils/purchasingTrends";

const inv = (id: string, date: string, supplier: string, total: number) => ({ id, supplier_id: supplier, invoice_date: date, total_amount: total, discount: 0, venue: "A", created_at: date, review_status: "Approved", has_disputes: false });
const line = (invoice: string, product: string, total: number, quantity: number, unit = "kg") => ({ invoice_id: invoice, product_master_id: product, total, unit_price: total / quantity, unit, quantity });
const products = new Map([
  ["beef", { id: "beef", internal_product_name: "Beef", financial_treatment: "COGS", level1_category: "Food", level2_category: "Meat", unit: "kg" }],
  ["wine", { id: "wine", internal_product_name: "Wine", financial_treatment: "COGS", level1_category: "Beverages", level2_category: "Alcoholic", unit: "btl" }],
  ["keg", { id: "keg", internal_product_name: "Keg deposit", financial_treatment: "Asset - Supplier Deposit", level1_category: "Deposits", level2_category: "Containers", unit: "keg" }],
]);

describe("purchasing trends", () => {
  it("covers the 12 months ending this month", () => {
    expect(trendMonths("2026-11")).toEqual(["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  });
  it("adds up spend, % of sales, categories, items and suppliers month by month", () => {
    const t = purchasingTrends({
      current: "2026-11",
      invoices: [inv("a", "2026-10-03", "s1", 1000), inv("b", "2026-11-02", "s1", 1300), inv("c", "2026-11-05", "s2", 400), inv("old", "2025-01-01", "s1", 999)],
      lines: [line("a", "beef", 1000, 10), line("b", "beef", 1100, 10), line("b", "beef", 200, 1, "case"), line("c", "wine", 400, 4, "btl"), line("c", "keg", 300, 1, "keg")],
      products, sales: [{ date: "2026-10-10", total_sales: 10000, venue: "A" }, { date: "2026-11-10", total_sales: 8500, venue: "A" }],
      supplierNames: new Map([["s1", "Meats"], ["s2", "Vino"]]),
    });
    expect(t.monthly.slice(-2)).toEqual([{ key: "2026-10", spend: 1000, revenue: 10000, pct: 10 }, { key: "2026-11", spend: 1700, revenue: 8500, pct: 20 }]);
    expect(t.monthly[0].spend).toBe(0); // the invoice from Jan 2025 is outside the window
    // Second level, with the top level kept; the keg deposit is not spend.
    expect(t.categories.map((c) => [c.group, c.name, c.months.slice(-2)])).toEqual([["Food", "Meat", [1000, 1300]], ["Beverages", "Alcoholic", [null, 400]]]);
    expect(t.items.map((i) => i.name)).toEqual(["Beef", "Wine"]);
    expect(t.suppliers.map((s) => [s.name, s.months.slice(-2)])).toEqual([["Meats", [1000, 1300]], ["Vino", [null, 400]]]);
  });
});
