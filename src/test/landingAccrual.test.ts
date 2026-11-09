import { describe, expect, it } from "vitest";
import { accruedStaff, theoreticalStock, menuCostPercent, accruedProfit, rotaStaff, shiftHours } from "@/utils/landingAccrual";

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
  it("shift hours: worked hours win, else rota less break, overnight wraps, no-show is zero", () => {
    expect(shiftHours({ employee_id: "a", shift_date: "2026-11-01", start_time: "10:00:00", end_time: "18:30:00", break_minutes: 30 })).toBe(8);
    expect(shiftHours({ employee_id: "a", shift_date: "2026-11-01", start_time: "18:00:00", end_time: "02:00:00", break_minutes: 0 })).toBe(8);
    expect(shiftHours({ employee_id: "a", shift_date: "2026-11-01", start_time: "10:00:00", end_time: "18:00:00", break_minutes: 0, actual_hours_worked: 6 })).toBe(6);
    expect(shiftHours({ employee_id: "a", shift_date: "2026-11-01", start_time: "10:00:00", end_time: "18:00:00", break_minutes: 0, no_show: true })).toBe(0);
  });
  it("staff from the rota: this month's rota hours at last payroll month's cost per hour", () => {
    const sh = (e: string, d: string, end = "18:00:00") => ({ employee_id: e, shift_date: d, start_time: "10:00:00", end_time: end, break_minutes: 0 });
    const shifts = [sh("a", "2026-10-01"), sh("a", "2026-10-02"), sh("b", "2026-10-01", "14:00:00"), sh("a", "2026-11-01"), sh("b", "2026-11-01"), sh("c", "2026-11-02"), sh("a", "2026-11-09")];
    const pay = [{ employee_id: "a", year: 2026, month: 10, gross_salary: 1500, mpf_employer: 100 }, { employee_id: "b", year: 2026, month: 10, gross_salary: 400, mpf_employer: 0 }];
    // a: 1600/16h = 100/h; b: 400/4h = 100/h; c has no payroll -> average 2000/20h = 100/h. Up to 8 Nov: 8h+8h+8h.
    expect(rotaStaff("2026-11", "2026-11-08", shifts, pay)).toBe(2400);
    expect(rotaStaff("2026-11", "2026-11-08", shifts, [])).toBeNull();
    expect(rotaStaff("2026-12", "2026-12-08", shifts, pay)).toBeNull();
  });
});
