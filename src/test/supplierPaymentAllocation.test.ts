import { describe, expect, it } from "vitest";
import {
  autoAllocateFifo,
  eligibleNetDue,
  isAutoAllocatable,
  isDisputedInvoice,
  splitLedgerByPeriod,
  supplierAdvanceAmount,
  supplierCreditFromBalance,
  unallocatedAmount,
  type AllocatableInvoice,
} from "@/utils/supplierPaymentAllocation";

const inv = (o: Partial<AllocatableInvoice> & { id: string }): AllocatableInvoice => ({
  invoice_date: "2026-01-01",
  outstanding_amount: 100,
  payment_status: "unpaid",
  review_status: "Approved",
  ...o,
});

describe("supplier payment allocation", () => {
  it("records a payment with no allocation and still credits the full amount once", () => {
    const payment = 1000;
    const allocations = autoAllocateFifo(0, [inv({ id: "a" })], "2026-02-01");
    expect(allocations).toEqual([]);
    // Statement credit uses the payment amount, not the allocated amount.
    const ledger = [
      { date: "2026-01-05", debit: 400, credit: 0 },
      { date: "2026-02-01", debit: 0, credit: payment },
    ];
    const balance = ledger.reduce((s, r) => s + r.debit - r.credit, 0);
    expect(balance).toBe(-600);
    expect(unallocatedAmount(payment, 0)).toBe(1000);
  });

  it("FIFO allocates oldest first and stops when the payment is exhausted", () => {
    const invoices = [
      inv({ id: "new", invoice_date: "2026-03-01", outstanding_amount: 500 }),
      inv({ id: "old", invoice_date: "2026-01-01", outstanding_amount: 300 }),
      inv({ id: "mid", invoice_date: "2026-02-01", outstanding_amount: 300 }),
    ];
    expect(autoAllocateFifo(400, invoices, "2026-03-05")).toEqual([
      { invoice_id: "old", amount: 300 },
      { invoice_id: "mid", amount: 100 },
    ]);
  });

  it("never allocates to invoices dated after the payment date", () => {
    const invoices = [inv({ id: "future", invoice_date: "2026-06-01" })];
    expect(autoAllocateFifo(500, invoices, "2026-05-01")).toEqual([]);
    expect(isAutoAllocatable(invoices[0], "2026-05-01")).toBe(false);
  });

  it("skips disputed, voided and fully paid invoices but keeps them recognisable", () => {
    const disputed = inv({ id: "d", review_status: "Disputed" });
    const voided = inv({ id: "v", payment_status: "voided" });
    const paid = inv({ id: "p", outstanding_amount: 0 });
    expect(isDisputedInvoice(disputed)).toBe(true);
    const result = autoAllocateFifo(1000, [disputed, voided, paid, inv({ id: "ok" })], "2026-04-01");
    expect(result).toEqual([{ invoice_id: "ok", amount: 100 }]);
  });

  it("treats an unallocated payment as unallocated, not an advance", () => {
    const invoices = [inv({ id: "a", outstanding_amount: 800 })];
    const due = eligibleNetDue(invoices, "2026-02-01");
    expect(due).toBe(800);
    expect(unallocatedAmount(800, 0)).toBe(800);
    expect(supplierAdvanceAmount(800, due)).toBe(0);
  });

  it("reports an advance only when the payment exceeds the eligible net due", () => {
    const invoices = [inv({ id: "a", outstanding_amount: 200 })];
    expect(supplierAdvanceAmount(500, eligibleNetDue(invoices, "2026-02-01"))).toBe(300);
    expect(supplierCreditFromBalance(-300)).toBe(300);
    expect(supplierCreditFromBalance(120)).toBe(0);
  });

  it("keeps payment = allocated + unallocated", () => {
    const allocations = autoAllocateFifo(750, [inv({ id: "a", outstanding_amount: 500 })], "2026-02-01");
    const allocated = allocations.reduce((s, a) => s + a.amount, 0);
    expect(allocated + unallocatedAmount(750, allocated)).toBe(750);
  });

  it("preserves the brought-forward balance when filtering by period", () => {
    const rows = [
      { date: "2026-01-10", debit: 1000, credit: 0 },
      { date: "2026-01-20", debit: 0, credit: 400 },
      { date: "2026-03-02", debit: 250, credit: 0 },
    ];
    const { broughtForward, rows: visible } = splitLedgerByPeriod(rows, "2026-03-01");
    expect(broughtForward).toBe(600);
    expect(visible).toHaveLength(1);
    const closing = visible.reduce((s, r) => s + r.debit - r.credit, broughtForward);
    expect(closing).toBe(850);
    expect(splitLedgerByPeriod(rows, null).broughtForward).toBe(0);
  });

  it("does not mutate the supplied invoice list (no historical mutation)", () => {
    const invoices = [inv({ id: "a" }), inv({ id: "b", invoice_date: "2025-12-01" })];
    const snapshot = JSON.stringify(invoices);
    autoAllocateFifo(1000, invoices, "2026-04-01");
    expect(JSON.stringify(invoices)).toBe(snapshot);
  });
});
