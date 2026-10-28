import { describe, expect, it } from "vitest";
import { defaultInvoiceMonth, trailingMonths } from "@/components/procurement/purchasingOverviewPresentation";
import { previousCalendarMonth, periodIncludes, itemRanking, categoryRanking, monthPace, budgetByDay, suggestBudgets, isBudgetableCategory, hongKongDate, purchasingSalesForecast, type OverviewInvoice, type OverviewLine, type OverviewProduct, type BudgetChangeRow } from "@/utils/purchasingOverview";
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
  it("steps the budget line on the day a change was made", () => {
    const current = new Map([["Food", 26000]]);
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
  it("raises suggested total using actual divided by forecast, not the swapped ratio", () => {
    const amounts = suggestBudgets(new Map([["Food", 55000], ["Supplies", 1050]]), 120000, 100000);
    expect(amounts.get("Food")).toBe(66000);
    expect(amounts.get("Supplies")).toBe(1300);
    expect([...amounts.values()].reduce((a, b) => a + b, 0)).toBe(67300);
  });
  it("buckets a change after 16:00 UTC into the next Hong Kong day", () => {
    expect(hongKongDate("2026-10-14T16:00:00Z")).toBe("2026-10-15");
    const series = budgetByDay("2026-10", [change("Food", 20000, 26000, "2026-10-14T16:30:00Z")], new Map([["Food", 26000]]));
    expect(series[13]).toBe(20000);
    expect(series[14]).toBe(26000);
  });
  it("applies first-time sets from day 1 even when set during the month", () => {
    const series = budgetByDay("2026-10", [change("Food", null, 55000, "2026-10-28T01:00:00Z")], new Map([["Food", 55000]]));
    expect(series).toEqual(Array(31).fill(55000));
  });
  it("shows September's 105,000 budget every day when first saved on 28 October", () => {
    const changes = [change("Food", null, 55000, "2026-10-28T01:00:00Z"), change("Beverages", null, 50000, "2026-10-28T01:00:00Z")].map(row => ({ ...row, month: "2026-09-01" }));
    expect(budgetByDay("2026-09", changes, new Map([["Food", 55000], ["Beverages", 50000]]))).toEqual(Array(30).fill(105000));
  });
  it("applies a change made before the month to the whole month", () => {
    expect(budgetByDay("2026-10", [change("Food", 20000, 26000, "2026-09-29T01:00:00Z")], new Map([["Food", 26000]]))).toEqual(Array(31).fill(26000));
  });
  it("applies a change made after the month to the whole month", () => {
    expect(budgetByDay("2026-10", [change("Food", 20000, 18000, "2026-11-02T01:00:00Z")], new Map([["Food", 18000]]))).toEqual(Array(31).fill(18000));
  });
  it("coerces database amounts with Number", () => {
    const row = { ...change("Food", null, 55000, "2026-10-28T01:00:00Z"), new_amount: "55000" } as unknown as BudgetChangeRow;
    expect(budgetByDay("2026-10", [row], new Map([["Food", Number("55000")], ["Beverages", Number("50000")]]))).toEqual(Array(31).fill(105000));
  });
  it("keeps untouched venue contributions in the same category", () => {
    const row = { ...change("Food", 100, 200, "2026-10-03T01:00:00Z"), venue_id: "a" };
    const series = budgetByDay("2026-10", [row], new Map([["Food", 700]]));
    expect(series[0]).toBe(600); expect(series[2]).toBe(700);
  });
  it("steps later in-month changes after a first set", () => {
    const series = budgetByDay("2026-10", [change("Food", null, 50000, "2026-10-05T01:00:00Z"), change("Food", 50000, 55000, "2026-10-15T01:00:00Z")], new Map([["Food", 55000]]));
    expect(series[0]).toBe(50000); expect(series[13]).toBe(50000); expect(series[14]).toBe(55000);
  });
  it("sums separate venue budget histories without conflating their category", () => {
    const a = { ...change("Food", 100, 200, "2026-10-03T01:00:00Z"), venue_id: "a" };
    const b = { ...change("Food", 300, 500, "2026-10-05T01:00:00Z"), venue_id: "b" };
    const series = budgetByDay("2026-10", [a, b], new Map([["Food", 700]]));
    expect(series[0]).toBe(400); expect(series[2]).toBe(500); expect(series[4]).toBe(700);
  });
  it("keeps amounts when there is no expected sales figure", () => {
    expect(suggestBudgets(new Map([["Food", 20000]]), 5000, 0).get("Food")).toBe(20000);
  });
  it("excludes deposits and adjustments from budgetable categories", () => {
    expect(isBudgetableCategory("Food")).toBe(true);
    expect(isBudgetableCategory("Deposits")).toBe(false);
    expect(isBudgetableCategory("Adjustements")).toBe(false);
    expect(isBudgetableCategory("Adjustment")).toBe(false);
  });
});

describe("Purchasing Sales forecast", () => {
  const history = Array.from({ length: 70 }, (_, i) => ({ venue_id: "a", date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10), total_sales: 100 }));
  it("sums every day of October including days after today, with manager override", () => {
    const result = purchasingSalesForecast("2026-10", ["a"], history, [{ venue_id: "a", target_date: "2026-10-31", projected_sales: 500 }], "2026-10-28");
    expect(result.forecast).toBe(3500); expect(result.expected).toBe(2800);
  });
  it("sums effective forecasts per venue, not a group-average weekday forecast", () => {
    const sales = [...history, ...history.map(row => ({ ...row, venue_id: "b", total_sales: 200 }))];
    expect(purchasingSalesForecast("2026-10", ["a", "b"], sales, [], "2026-10-28").forecast).toBe(9300);
  });
  it("recalculates the month picked in the dialog", () => {
    const result = purchasingSalesForecast("2026-11", ["a"], history, [], "2026-10-28");
    expect(result.forecast).toBe(3000); expect(result.expected).toBeNull();
  });
  it("shows no forecast when history and overrides cannot supply any daily forecast", () => {
    expect(purchasingSalesForecast("2026-10", ["a"], [], [], "2026-10-28").forecast).toBeNull();
  });
});
