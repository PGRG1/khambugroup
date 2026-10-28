import { describe, expect, it } from "vitest";
import { defaultInvoiceMonth, trailingMonths } from "@/components/procurement/purchasingOverviewPresentation";
import { previousCalendarMonth, periodIncludes, itemRanking, categoryRanking, monthPace, usualPace, budgetByDay, budgetPaceStatus, suggestBudgets, isBudgetableCategory, type OverviewInvoice, type OverviewLine, type OverviewProduct, type BudgetChangeRow } from "@/utils/purchasingOverview";
const invoice = (id: string, date: string, amount = 100, discount = 0): OverviewInvoice => ({ id, invoice_date: date, total_amount: amount, discount, supplier_id: "supplier", venue: "Assembly", created_at: date, review_status: null, has_disputes: false });
const line = (id: string, price: number, unit: string, total = 100): OverviewLine => ({ invoice_id: "invoice", product_master_id: id, total, unit_price: price, quantity: 1, unit });
const products = new Map<string, OverviewProduct>([
  ["food", { id: "food", internal_product_name: "Exact master name", financial_treatment: "COGS", level1_category: "Food", unit: "kg" }],
  ["deposit", { id: "deposit", internal_product_name: "Keg deposit", financial_treatment: "Asset - Deposit", level1_category: "Drinks", unit: "each" }],
]);
describe("Purchasing Overview rules", () => {
  it("defaults October without invoices to September 2026", () => { expect(defaultInvoiceMonth("2026-10", ["2026-08-15", "2026-09-30"])).toBe("2026-09"); });
  it("defaults to the current month when it has invoices", () => { expect(defaultInvoiceMonth("2026-10", ["2026-09-30", "2026-10-01"])).toBe("2026-10"); });
  it("keeps the current month when no invoices exist", () => { expect(defaultInvoiceMonth("2026-10", [])).toBe("2026-10"); });
  it("shows eight calendar months ending at September", () => { expect(trailingMonths("2026-09")).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]); });
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
describe("Purchasing budgets", () => {
  const change = (category: string, oldAmount: number | null, newAmount: number, at: string): BudgetChangeRow => ({ id: at, venue_id: null, month: "2026-10-01", category, old_amount: oldAmount, new_amount: newAmount, reason: null, changed_by: null, changed_at: at });
  it("uses even pace with fewer than 3 complete months", () => {
    const pace = usualPace("2026-10", [invoice("a", "2026-09-10"), invoice("b", "2026-08-10")]);
    expect(pace).toHaveLength(31);
    expect(pace[0]).toBeCloseTo(1 / 31);
    expect(pace[30]).toBe(1);
  });
  it("takes the median daily share across the last complete months", () => {
    const months = ["2026-06", "2026-07", "2026-08", "2026-09"];
    // Each month puts all spend on day 1, 15, 28, 15 respectively → median day-1 share 0, day-15 share 1.
    const rows = [invoice("a", "2026-06-01"), invoice("b", "2026-07-15"), invoice("c", "2026-08-28"), invoice("d", "2026-09-15")];
    const pace = usualPace("2026-10", rows);
    expect(pace[0]).toBe(0);
    expect(pace[14]).toBe(0.5);
    expect(pace[30]).toBe(1);
    expect(months.every(key => rows.some(row => row.invoice_date.startsWith(key)))).toBe(true);
  });
  it("steps the budget line on the day a change was made", () => {
    const current = new Map([["Food", 20000]]);
    const changes = [change("Food", 20000, 26000, "2026-10-15T09:30:00+00:00")];
    const series = budgetByDay("2026-10", changes, current);
    expect(series[13]).toBe(20000);
    expect(series[14]).toBe(26000);
    expect(series[30]).toBe(26000);
  });
  it("uses the first change's old amount before any change and current amount for untouched categories", () => {
    const current = new Map([["Food", 20000], ["Beverages", 8000]]);
    const changes = [change("Food", 15000, 20000, "2026-10-05T10:00:00+00:00")];
    const series = budgetByDay("2026-10", changes, current);
    expect(series[0]).toBe(23000);
    expect(series[4]).toBe(28000);
  });
  it("scales suggestions by actual over expected sales, rounded to 100", () => {
    const suggested = suggestBudgets(new Map([["Food", 20123], ["Beverages", 7960]]), 90000, 100000);
    expect(suggested.get("Food")).toBe(18100);
    expect(suggested.get("Beverages")).toBe(7200);
  });
  it("keeps amounts when there is no expected sales figure", () => {
    expect(suggestBudgets(new Map([["Food", 20000]]), 5000, 0).get("Food")).toBe(20000);
  });
  it("flags ahead of usual pace only when spend passes the expected share", () => {
    const even = usualPace("2026-10", []);
    const under = budgetPaceStatus(4000, 20000, even, 15);
    const ahead = budgetPaceStatus(12000, 20000, even, 15);
    expect(under.ahead).toBe(false);
    expect(under.delta).toBeGreaterThan(0);
    expect(ahead.ahead).toBe(true);
    expect(ahead.spentPct).toBe(60);
  });
  it("excludes deposits and adjustments from budgetable categories", () => {
    expect(isBudgetableCategory("Food")).toBe(true);
    expect(isBudgetableCategory("Deposits")).toBe(false);
    expect(isBudgetableCategory("Adjustements")).toBe(false);
    expect(isBudgetableCategory("Adjustment")).toBe(false);
  });
});
