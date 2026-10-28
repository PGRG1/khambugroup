import { describe, expect, it } from "vitest";
import { purchasingOverviewRows, resolvePurchasingMode } from "@/utils/purchasingMode";

const invoices = [{ venue: "Assembly", amount: 100 }, { venue: "Caliente", amount: 200 }, { venue: null, amount: 50 }];
const sales = [{ venue: "Assembly", amount: 1000 }, { venue: "Caliente", amount: 2000 }];
const assemblyOnly = (venue: string | null) => venue === "Assembly";

describe("How you buy", () => {
  it("defaults tenants with no value to each venue buying for itself", () => {
    expect(resolvePurchasingMode(undefined)).toBe("by_venue");
    expect(resolvePurchasingMode(null)).toBe("by_venue");
  });
  it("reads the separate central choice, not combined cost reporting", () => {
    expect(resolvePurchasingMode("central")).toBe("central");
    expect(resolvePurchasingMode("combined")).toBe("by_venue");
  });
  it("central purchasing includes every invoice regardless of the venue picker", () => {
    expect(purchasingOverviewRows(invoices, "central", assemblyOnly).map(row => row.amount)).toEqual([100, 200, 50]);
  });
  it("central spend percentage uses all venues' revenue", () => {
    const spend = purchasingOverviewRows(invoices, "central", assemblyOnly).reduce((n, row) => n + row.amount, 0);
    const revenue = purchasingOverviewRows(sales, "central", assemblyOnly).reduce((n, row) => n + row.amount, 0);
    expect(revenue).toBe(3000);
    expect(spend / revenue * 100).toBeCloseTo(11.6666667);
  });
  it("per-venue purchasing keeps the existing invoice and sales scope", () => {
    expect(purchasingOverviewRows(invoices, "by_venue", assemblyOnly)).toEqual([invoices[0]]);
    expect(purchasingOverviewRows(sales, "by_venue", assemblyOnly)).toEqual([sales[0]]);
  });
});