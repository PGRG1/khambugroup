import { describe, it, expect } from "vitest";
import {
  buildSpecialists, deterministicSynthesis, evaluatePriorActions, reviewPeriod, validateAiSynthesis, ungroundedNumbers, type ReviewInput, type SaleRow,
} from "../../supabase/functions/_shared/financeTeamReview";
import { nextScheduledRun } from "@/utils/financeTeamSchedule";

const sale = (date: string, p: Partial<SaleRow> = {}): SaleRow => ({
  date, subtotal: 1000, service_charge: 100, discount: 0, total_sales: 1100, guests: 20,
  visa: 1100, mastercard: 0, amex: 0, union_pay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, card_tips: 0, ...p,
});
const base = (over: Partial<ReviewInput> = {}): ReviewInput => ({
  reviewType: "daily", ...reviewPeriod("daily", "2026-10-09"), asOf: "2026-10-10",
  sales: [], comparisonSales: [], invoices: [], comparisonInvoices: [], openPayableInvoices: [], bills: [], bankAccounts: [], ...over,
});
const find = (inp: ReviewInput, key: string) => buildSpecialists(inp).flatMap((s) => s.findings).find((f) => f.key === key)!;

describe("finance team review", () => {
  it("daily compares with the same weekday last week; weekly with the prior 7 days", () => {
    expect(reviewPeriod("daily", "2026-10-09")).toEqual({ periodStart: "2026-10-09", periodEnd: "2026-10-09", comparisonStart: "2026-10-02", comparisonEnd: "2026-10-02" });
    expect(reviewPeriod("weekly", "2026-10-09")).toEqual({ periodStart: "2026-10-03", periodEnd: "2026-10-09", comparisonStart: "2026-09-26", comparisonEnd: "2026-10-02" });
  });

  it("missing sales are reported as cannot assess, not as zero revenue", () => {
    const f = find(base(), "revenue.sales");
    expect(f.assessable).toBe(false);
    expect(f.statement).toMatch(/Cannot assess/);
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
    expect(text).toMatch(/not COGS|not cost of goods sold/);
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
    expect(ungroundedNumbers("HK$ 1,100.00 on 3 days", facts)).toEqual([]);
  });

  it("prior actions are only evaluated against new evidence", () => {
    const sp = buildSpecialists(base({ sales: [sale("2026-10-09")] }));
    const [a, b] = evaluatePriorActions([
      { id: "1", title: "Fix payments", finding_key: "revenue.payment_mismatch", status: "open", due_date: "2026-10-01", assignee_id: null, accepted_at: "" },
      { id: "2", title: "Bank", finding_key: "accounting.bank", status: "open", due_date: null, assignee_id: null, accepted_at: "" },
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
});
