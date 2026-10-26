import { describe, it, expect } from "vitest";
import {
  buildSpecialists, deterministicSynthesis, evaluatePriorActions, reviewPeriod, validateAiSynthesis, ungroundedNumbers, priceRises,
  type ReviewInput, type SaleRow,
} from "../../supabase/functions/_shared/financeTeamReview";
import { nextScheduledRun } from "@/utils/financeTeamSchedule";

const sale = (date: string, p: Partial<SaleRow> = {}): SaleRow => ({
  date, subtotal: 1000, service_charge: 100, discount: 0, total_sales: 1100, guests: 20,
  visa: 1100, mastercard: 0, amex: 0, union_pay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, card_tips: 0, ...p,
});
const base = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  reviewType: "daily", ...reviewPeriod("daily", "2026-10-09"), asOf: "2026-10-10",
  sales: [], comparisonSales: [], invoices: [], comparisonInvoices: [], openPayableInvoices: [], bills: [], bankAccounts: [],
  venues: [], priceLines: [], payroll: [], leaveRequests: [], employees: [], nextWeekShifts: [], recentShifts: [], attendance: [],
  expenseBillsMtd: [], expenseBillsPrevMtd: [], settlementBatches: [], salesByMonth: [],
  workDone: { revenue: [], procurement: [], accountant: [], people: [], controller: [] },
  ...over,
});
const find = (inp: ReviewInput, key: string) => buildSpecialists(inp).flatMap((s) => s.findings).find((f) => f.key === key)!;
const roleOf = (inp: ReviewInput, key: string) => buildSpecialists(inp).find((s) => s.findings.some((f) => f.key === key))!.role;

describe("finance team review", () => {
  it("daily compares with the same weekday last week; weekly with the prior 7 days", () => {
    expect(reviewPeriod("daily", "2026-10-09")).toEqual({ periodStart: "2026-10-09", periodEnd: "2026-10-09", comparisonStart: "2026-10-02", comparisonEnd: "2026-10-02" });
    expect(reviewPeriod("weekly", "2026-10-09")).toEqual({ periodStart: "2026-10-03", periodEnd: "2026-10-09", comparisonStart: "2026-09-26", comparisonEnd: "2026-10-02" });
  });

  it("missing sales are reported as cannot assess, not as zero revenue", () => {
    const f = find(base(), "revenue.sales");
    expect(f.assessable).toBe(false);
    expect(f.statement).toMatch(/can't check this yet/i);
    expect(f.figures).toEqual([]);
  });

  it("revenue is subtotal + service charge, with comparison change", () => {
    const f = find(base({ sales: [sale("2026-10-09")], comparisonSales: [sale("2026-10-02", { subtotal: 2000, service_charge: 200 })] }), "revenue.sales");
    expect(f.figures[0].value).toBe(1100);
    expect(f.figures[0].comparison?.value).toBe(2200);
    expect(f.figures[0].comparison?.change_pct).toBe(-50);
    expect(f.severity).toBe("watch");
  });

  it("flags sales records whose payments do not add up to total sales", () => {
    const f = find(base({ sales: [sale("2026-10-09", { visa: 1000 })] }), "revenue.payment_mismatch");
    expect(f.severity).toBe("action");
    expect(f.figures[0].value).toBe(1);
  });

  it("never treats purchases as COGS or bank balance as verified cash", () => {
    const sp = buildSpecialists(base({ bankAccounts: [{ id: "a", account_name: "HSBC", last_reconciled_date: null, latest_txn_date: "2026-10-08", latest_running_balance: 5000, unmatched_in_period: 0 }] }));
    const text = JSON.stringify(sp) + JSON.stringify(deterministicSynthesis(sp));
    expect(text).toMatch(/not cost of goods sold/);
    expect(text).toMatch(/not verified cash/);
    expect(deterministicSynthesis(sp).profit_cash_implication).toMatch(/Profit impact cannot be assessed/);
  });

  it("rejects AI output that invents figures or unknown findings", () => {
    const sp = buildSpecialists(base({ sales: [sale("2026-10-09", { visa: 1000 })] }));
    const facts = JSON.stringify(sp);
    const good = { headline: "One item needs attention.", what_changed: ["Revenue was HK$ 1,100.00."], profit_cash_implication: "Profit cannot be assessed.",
      priorities: [{ finding_key: "revenue.payment_mismatch", why: "Records do not balance." }], specialist_summaries: [{ role: "revenue", summary: "Revenue HK$ 1,100.00." }] };
    expect(validateAiSynthesis(good, sp, facts).ok).toBe(true);
    expect(validateAiSynthesis({ ...good, headline: "Revenue grew to HK$ 9,999.00" }, sp, facts).ok).toBe(false);
    expect(validateAiSynthesis({ ...good, priorities: [{ finding_key: "made.up", why: "x" }] }, sp, facts).ok).toBe(false);
    expect(validateAiSynthesis({ ...good, specialist_summaries: [{ role: "accounting", summary: "x" }] }, sp, facts).ok).toBe(false);
    expect(ungroundedNumbers("HK$ 1,100.00 on 3 days", facts)).toEqual([]);
  });

  it("prior actions are only evaluated against new evidence", () => {
    const sp = buildSpecialists(base({ sales: [sale("2026-10-09")] }));
    const [a, b] = evaluatePriorActions([
      { id: "1", title: "Fix payments", finding_key: "revenue.payment_mismatch", status: "open", due_date: "2026-10-01", assignee_id: null, accepted_at: "" },
      { id: "2", title: "Bank", finding_key: "controller.bank", status: "open", due_date: null, assignee_id: null, accepted_at: "" },
    ], sp, "2026-10-10");
    expect(a.overdue).toBe(true);
    expect(a.evaluation).toMatch(/Not flagged/);
    expect(b.evaluation).toMatch(/No new evidence/);
  });

  it("next scheduled run respects the venue timezone (default Asia/Hong_Kong)", () => {
    const now = new Date("2026-10-10T00:30:00Z"); // 08:30 HKT
    expect(nextScheduledRun(now, "Asia/Hong_Kong", 9, null)?.toISOString()).toBe("2026-10-10T01:05:00.000Z");
    expect(nextScheduledRun(now, "Asia/Hong_Kong", 8, null)?.toISOString()).toBe("2026-10-11T00:05:00.000Z");
    expect(nextScheduledRun(now, "Asia/Hong_Kong", 9, 1)?.toISOString()).toBe("2026-10-12T01:05:00.000Z");
  });

  // ---- new roles and findings ----

  it("produces five roles with the payables under Accountant and bank under Financial Controller", () => {
    const sp = buildSpecialists(base());
    expect(sp.map((s) => s.role)).toEqual(["revenue", "procurement", "accountant", "people", "controller"]);
    expect(roleOf(base(), "accountant.overdue_payables")).toBe("accountant");
    expect(roleOf(base(), "accountant.bills_pending")).toBe("accountant");
    expect(roleOf(base(), "controller.bank")).toBe("controller");
  });

  it("revenue.missing_venues lists active venues with no sales yesterday", () => {
    const inp = base({
      venues: [
        { id: "v1", name: "Assembly", is_active: true },
        { id: "v2", name: "Hanabi", is_active: true },
        { id: "v3", name: "Old Shop", is_active: false },
      ],
      sales: [sale("2026-10-09", { venue_id: "v1" })],
    });
    const f = find(inp, "revenue.missing_venues");
    expect(f.severity).toBe("action");
    expect(f.statement).toContain("Hanabi");
    expect(f.statement).not.toContain("Old Shop");
    expect(f.figures[0].value).toBe(1);
  });

  it("revenue.missing_venues is not assessable without venues", () => {
    const f = find(base(), "revenue.missing_venues");
    expect(f.assessable).toBe(false);
    expect(f.statement).toMatch(/can't check this yet/i);
  });

  it("procurement.price_rises detects a rise and computes monthly impact from last-30-day quantity", () => {
    const inp = base({
      priceLines: [
        { product_key: "p1", item_label: "Striploin", supplier_name: "MeatCo", invoice_date: "2026-09-20", unit_price: 100, quantity: 10 },
        { product_key: "p1", item_label: "Striploin", supplier_name: "MeatCo", invoice_date: "2026-10-05", unit_price: 120, quantity: 5 },
        { product_key: "p2", item_label: "Rice", supplier_name: "DryGoods", invoice_date: "2026-09-15", unit_price: 50, quantity: 20 },
        { product_key: "p2", item_label: "Rice", supplier_name: "DryGoods", invoice_date: "2026-10-01", unit_price: 50, quantity: 20 },
      ],
    });
    const f = find(inp, "procurement.price_rises");
    expect(f.assessable).toBe(true);
    expect(f.statement).toContain("Striploin");
    expect(f.statement).not.toContain("Rice");
    // impact = (120 - 100) × (10 + 5) = 300
    expect(f.figures[0].value).toBe(300);
  });

  it("procurement.price_rises is not assessable with only one invoice per item", () => {
    const f = find(base({ priceLines: [{ product_key: "p1", item_label: "Striploin", supplier_name: "MeatCo", invoice_date: "2026-10-05", unit_price: 120, quantity: 5 }] }), "procurement.price_rises");
    expect(f.assessable).toBe(false);
    expect(f.statement).toMatch(/can't check this yet/i);
    expect(priceRises([], "2026-10-10")).toBeNull();
  });

  it("accountant.due_this_week totals unpaid items due in 7 days and holds disputed ones separately", () => {
    const inv = (id: string, due: string, p: Partial<any> = {}) => ({ id, invoice_date: "2026-10-01", due_date: due, status: p.status ?? "approved", payment_status: "unpaid", total_amount: 1000, remaining_balance: 1000, amount_paid: 0, has_disputes: p.has_disputes ?? false, disputed_amount: 0, voided_at: null, supplier_name: id });
    const inp = base({ openPayableInvoices: [inv("A", "2026-10-12"), inv("B", "2026-10-20"), inv("C", "2026-10-11", { has_disputes: true })] });
    const f = find(inp, "accountant.due_this_week");
    expect(f.figures[0].value).toBe(1000); // only A is due within 7 days and not disputed
    expect(f.figures[1].value).toBe(1);
    expect(f.figures[2].value).toBe(1000); // C on hold
    expect(f.statement).toMatch(/on hold/i);
  });

  it("people.payroll compares the latest run with the previous one", () => {
    const inp = base({
      payroll: [
        { year: 2026, month: 9, employee_id: "e1", actual_total: 10000, forecast_total: null },
        { year: 2026, month: 9, employee_id: "e2", actual_total: 8000, forecast_total: null },
        { year: 2026, month: 8, employee_id: "e1", actual_total: 9000, forecast_total: null },
        { year: 2026, month: 8, employee_id: "e2", actual_total: 9000, forecast_total: null },
      ],
    });
    const f = find(inp, "people.payroll");
    expect(f.assessable).toBe(true);
    expect(f.figures[0].value).toBe(18000);
    expect(f.figures[0].comparison?.value).toBe(18000);
    expect(f.figures[1].value).toBe(2);
  });

  it("people.payroll is not assessable without payroll runs", () => {
    const f = find(base(), "people.payroll");
    expect(f.assessable).toBe(false);
    expect(f.statement).toMatch(/can't check this yet/i);
  });

  it("people.leave_pending counts only waiting requests", () => {
    const f = find(base({ leaveRequests: [
      { id: "1", status: "pending", start_date: "2026-10-12", end_date: "2026-10-13", days: 2 },
      { id: "2", status: "approved", start_date: "2026-10-12", end_date: "2026-10-12", days: 1 },
    ] }), "people.leave_pending");
    expect(f.severity).toBe("watch");
    expect(f.figures[0].value).toBe(1);
  });

  it("people.roster_missing flags staffed venues with no shifts next week", () => {
    const inp = base({
      venues: [{ id: "v1", name: "Assembly", is_active: true }, { id: "v2", name: "Hanabi", is_active: true }],
      employees: [{ id: "e1", venue_id: "v1", status: "active" }, { id: "e2", venue_id: "v2", status: "active" }],
      nextWeekShifts: [{ shift_date: "2026-10-12", employee_id: "e1", actual_hours_worked: null, variance_minutes: null, no_show: null }],
    });
    const f = find(inp, "people.roster_missing");
    expect(f.severity).toBe("watch");
    expect(f.statement).toContain("Hanabi");
    expect(f.statement).not.toContain("Assembly");
  });

  it("people.overtime is not assessable without timesheets, and sums overtime when present", () => {
    expect(find(base(), "people.overtime").assessable).toBe(false);
    const f = find(base({ attendance: [{ date: "2026-10-08", hours_worked: 9, overtime_hours: 1.5 }] }), "people.overtime");
    expect(f.assessable).toBe(true);
    expect(f.figures[0].value).toBe(1.5);
  });

  it("people.staff_cost_ratio needs a full month with both payroll and sales", () => {
    expect(find(base(), "people.staff_cost_ratio").assessable).toBe(false);
    const inp = base({
      payroll: [{ year: 2026, month: 9, employee_id: "e1", actual_total: 28000, forecast_total: null }],
      salesByMonth: [{ year: 2026, month: 9, revenue: 100000 }],
    });
    const f = find(inp, "people.staff_cost_ratio");
    expect(f.assessable).toBe(true);
    expect(f.figures[0].display).toBe("HK$28 of every HK$100");
    const people = buildSpecialists(inp).find((s) => s.role === "people")!;
    expect(people.headline?.value.display).toBe("HK$28 of every HK$100");
  });

  it("controller.running_costs flags categories up more than 20% and HK$1,000", () => {
    const inp = base({
      expenseBillsMtd: [{ bill_date: "2026-10-05", total_amount: 6000, category: "Rent", reversed_at: null }],
      expenseBillsPrevMtd: [{ bill_date: "2026-09-05", total_amount: 4000, category: "Rent", reversed_at: null }],
    });
    const f = find(inp, "controller.running_costs");
    expect(f.severity).toBe("watch");
    expect(f.statement).toContain("Rent");
    expect(find(base(), "controller.running_costs").assessable).toBe(false);
  });

  it("controller.settlements flags due settlements not matched to the bank", () => {
    const inp = base({
      settlementBatches: [
        { id: "b1", settlement_date: "2026-10-08", net_settlement: 5000, bank_transaction_id: null, status: "settled" },
        { id: "b2", settlement_date: "2026-10-07", net_settlement: 3000, bank_transaction_id: "t1", status: "settled" },
      ],
    });
    const f = find(inp, "controller.settlements");
    expect(f.severity).toBe("watch");
    expect(f.figures[0].value).toBe(1);
    expect(f.figures[1].value).toBe(5000);
    expect(find(base(), "controller.settlements").assessable).toBe(false);
  });

  it("headlines and work_done are attached to each role", () => {
    const inp = base({
      sales: [sale("2026-10-09")],
      bankAccounts: [{ id: "a", account_name: "HSBC", last_reconciled_date: null, latest_txn_date: "2026-10-08", latest_running_balance: 5000, unmatched_in_period: 0 }],
      workDone: { revenue: [{ label: "sales records imported", count: 4 }], procurement: [], accountant: [], people: [], controller: [] },
    });
    const sp = buildSpecialists(inp);
    expect(sp.find((s) => s.role === "revenue")!.headline?.value.value).toBe(1100);
    expect(sp.find((s) => s.role === "controller")!.headline?.note).toMatch(/last statement/);
    expect(sp.find((s) => s.role === "revenue")!.work_done[0].count).toBe(4);
  });
});
