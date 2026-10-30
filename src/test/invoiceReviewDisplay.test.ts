import { describe, expect, it } from "vitest";
import { invoiceReviewDisplay } from "@/utils/invoiceReviewDisplay";

const line = { quantity: "3", unit_price: "169.9", printed_amount: "510", total: "510", review_warnings: ["total: Line total differs due to rounding"] };
const invoice = { ai_total: 1020, review_warnings: ["total_amount: Small rounding difference"], line_items: [line, { ...line }] };
describe("invoice review display-only rounding", () => {
  it("accepts Beverage World sub-dollar rounding without mutating source warnings", () => {
    const display = invoiceReviewDisplay(invoice, 1019.4);
    expect(display.invoice.line_items.map(l => l.review_warnings)).toEqual([[], []]);
    expect(display.invoice.review_warnings).toEqual([]);
    expect(display.accepted).toHaveLength(3);
    expect(invoice.line_items[0].review_warnings).toEqual(["total: Line total differs due to rounding"]);
  });
  it("keeps a difference of exactly HK$ 1", () => {
    const display = invoiceReviewDisplay({ ...invoice, line_items: [{ ...line, printed_amount: "508.7" }] }, 1020);
    expect(display.invoice.line_items[0].review_warnings).toHaveLength(1);
  });
  it("keeps warnings when invoice total differs by HK$ 1", () => {
    expect(invoiceReviewDisplay(invoice, 1019).invoice.line_items[0].review_warnings).toHaveLength(1);
  });
  it("preserves unrelated warnings and every blocker", () => {
    const input = { ...invoice, line_items: [{ ...line, review_warnings: [...line.review_warnings, "unit: Check pack size"], review_blocking: ["quantity: Illegible"] }] };
    const output = invoiceReviewDisplay(input, 1020).invoice.line_items[0];
    expect(output.review_warnings).toEqual(["unit: Check pack size"]);
    expect(output.review_blocking).toEqual(["quantity: Illegible"]);
  });
  it("requires printed evidence", () => {
    expect(invoiceReviewDisplay({ ...invoice, line_items: [{ ...line, printed_amount: "" }] }, 1020).invoice.line_items[0].review_warnings).toHaveLength(1);
  });
  it("does not call discount or tax rounding", () => {
    expect(invoiceReviewDisplay({ ...invoice, line_items: [{ ...line, discount: "0.3" }] }, 1020).invoice.line_items[0].review_warnings).toHaveLength(1);
  });
});