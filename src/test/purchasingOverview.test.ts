import { describe, expect, it } from "vitest";
import { previousCalendarMonth, periodIncludes, itemRanking, categoryRanking, monthPace, type OverviewInvoice, type OverviewLine, type OverviewProduct } from "@/utils/purchasingOverview";
const invoice = (id: string, date: string, amount = 100, discount = 0): OverviewInvoice => ({ id, invoice_date: date, total_amount: amount, discount, supplier_id: "supplier", venue: "Assembly", created_at: date, review_status: null, has_disputes: false });
const line = (id: string, price: number, unit: string, total = 100): OverviewLine => ({ invoice_id: "invoice", product_master_id: id, total, unit_price: price, quantity: 1, unit });
const products = new Map<string, OverviewProduct>([
  ["food", { id: "food", internal_product_name: "Exact master name", financial_treatment: "COGS", level1_category: "Food", unit: "kg" }],
  ["deposit", { id: "deposit", internal_product_name: "Keg deposit", financial_treatment: "Asset - Deposit", level1_category: "Drinks", unit: "each" }],
]);
describe("Purchasing Overview rules", () => {
  it("uses the previous calendar month including year rollover", () => { expect(previousCalendarMonth("2026-01")).toBe("2025-12"); expect(previousCalendarMonth("2026-10")).toBe("2026-09"); });
  it("has no previous comparisons for All time or Custom", () => { expect(previousCalendarMonth("all")).toBeNull(); expect(previousCalendarMonth("custom")).toBeNull(); });
  it("includes the final custom day", () => { expect(periodIncludes("2026-10-28", "custom", "2026-10-01", "2026-10-28")).toBe(true); expect(periodIncludes("2026-10-29", "custom", "2026-10-01", "2026-10-28")).toBe(false); });
  it("uses exact master names and excludes unmatched and Asset items", () => { const rows = itemRanking([line("food", 98, "kg"), line("deposit", 300, "each"), { ...line("food", 50, "kg"), product_master_id: null }], [], products); expect(rows.map(row => row.name)).toEqual(["Exact master name"]); expect(rows[0].value).toBe(100); });
  it("averages unit_price, not quantity-weighted price", () => { const rows = itemRanking([line("food", 98, "kg"), { ...line("food", 102, "kg"), quantity: 50 }], [line("food", 100, "kg")], products); expect(rows[0].price).toBe(100); expect(rows[0].priceComparison).toBe("Same"); });
  it("reports Changed only for the same unit", () => { expect(itemRanking([line("food", 105, "kg")], [line("food", 100, "kg")], products)[0].priceComparison).toBe("Changed"); });
  it("cannot compare different or mixed units", () => { expect(itemRanking([line("food", 105, "kg")], [line("food", 100, "case")], products)[0].priceComparison).toBe("Can't compare"); expect(itemRanking([line("food", 105, "kg"), line("food", 100, "case")], [line("food", 100, "kg")], products)[0].priceComparison).toBe("Can't compare"); });
  it("marks items with no previous purchase new and cannot compare prices", () => { const row = itemRanking([line("food", 98, "kg")], [], products)[0]; expect(row.isNew).toBe(true); expect(row.priceComparison).toBe("Can't compare"); });
  it("shows invoice deductions as negative categories", () => { const rows = categoryRanking([line("food", 98, "kg")], [invoice("i", "2026-10-01", 90, 10)], products); expect(rows.find(row => row.id === "deductions")?.value).toBe(-10); });
  it("starts the cumulative revenue percentage at day 3 and stops current data at cutoff", () => { const rows = monthPace("2026-10", [invoice("i", "2026-10-01")], [{ date: "2026-10-01", total_sales: 500, venue: "Assembly" }], 3); expect(rows[0].pct).toBeNull(); expect(rows[1].pct).toBeNull(); expect(rows[2].pct).toBe(20); expect(rows[3].spend).toBeNull(); });
});