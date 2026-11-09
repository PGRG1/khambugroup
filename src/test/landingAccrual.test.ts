import { describe, expect, it } from "vitest";
import { accruedStaff, theoreticalStock, menuCostPercent, accruedProfit } from "@/utils/landingAccrual";

describe("landing accrual", () => {
  it("never shows zero staff cost when payroll is not posted: pro-rates last payroll month", () => {
    const r = accruedStaff("2026-11", null, [{ year: 2026, month: 10, gross_salary: 300000, mpf_employer: 0 }], 8, 30, 34, 49000);
    expect(r.basis).toBe("accrued");
    expect(r.amount).toBe(80000);
  });
  it("uses booked staff cost when posted", () => {
    expect(accruedStaff("2026-10", 371780, [], 31, 31, null, 0).amount).toBe(371780);
  });
  it("theoretical stock = sales × menu cost % + waste", () => {
    expect(theoreticalStock(100000, 25, 1500)).toBe(26500);
  });
  it("menu cost % averages priced dishes", () => {
    expect(menuCostPercent([{ cost: 30, price: 100 }, { cost: 20, price: 100 }, { cost: 5, price: 0 }])).toBe(25);
  });
  it("profit so far subtracts accrued costs", () => {
    expect(accruedProfit(100000, 26500, 80000, 5000)).toBe(-11500);
    expect(accruedProfit(100000, null, 80000, 0)).toBeNull();
  });
});
