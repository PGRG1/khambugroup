import { describe, expect, it } from "vitest";
import { acknowledgeTotalMismatch, dismissHeaderFinding, dismissLineFinding } from "@/utils/invoiceBlockingDismissal";
import { blockingInvoiceTotalMismatch } from "@/utils/invoiceTotalReconciliation";

describe("invoice blocker acknowledgements", () => {
  const mismatchInvoice = {
    ai_total: 100,
    invoice_discount: "0",
    line_items: [{ quantity: 1, unit_price: 120, review_blocking: [] as string[] }],
    notes: "",
    review_blocking: [] as string[],
  };

  it("dismisses the exact total mismatch and writes the audit note", () => {
    expect(blockingInvoiceTotalMismatch(mismatchInvoice)).toBe(true);
    const acknowledged = acknowledgeTotalMismatch(
      mismatchInvoice,
      { printedTotal: 100, calculatedTotal: 120 },
      "2026-09-29T16:00:00.000Z",
    );
    expect(blockingInvoiceTotalMismatch(acknowledged)).toBe(false);
    expect(acknowledged.notes).toContain("[Total mismatch acknowledged @ 2026-09-29T16:00:00.000Z] printed 100.00, calculated 120.00");
  });

  it("blocks again after an amount changes", () => {
    const acknowledged = acknowledgeTotalMismatch(mismatchInvoice, { printedTotal: 100, calculatedTotal: 120 }, "now");
    const changed = { ...acknowledged, line_items: [{ quantity: 1, unit_price: 121, review_blocking: [] }] };
    expect(blockingInvoiceTotalMismatch(changed)).toBe(true);
  });

  it("returns null for stale dismissals so callers do not show success feedback", () => {
    expect(dismissHeaderFinding(mismatchInvoice, 0, "now")).toBeNull();
    expect(dismissLineFinding(mismatchInvoice, 0, 0, "now")).toBeNull();
  });

  it("does not block a returned-keg-only pickup note without a printed total", () => {
    const kegLine = {
      quantity: -2,
      unit_price: 50,
      item_code: "ABADEK",
      description: "EMPTY KEG DEPOSIT",
    };
    expect(blockingInvoiceTotalMismatch({ ai_total: null, line_items: [kegLine] })).toBe(false);
    expect(blockingInvoiceTotalMismatch({ ai_total: 0, line_items: [kegLine] })).toBe(false);
  });
});