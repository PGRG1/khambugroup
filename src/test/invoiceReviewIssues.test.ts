import { describe, expect, it } from "vitest";
import { buildReviewIssues, issueToneClasses } from "@/utils/invoiceReviewIssues";

describe("invoice review issues", () => {
  it("keeps the exact line warning text visible as its own issue", () => {
    const issues = buildReviewIssues({
      line_items: [{ description: "Mango", review_warnings: ["quantity: Quantity looks doubled."] }],
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      scope: "line",
      severity: "warning",
      label: "Line 1",
      message: "quantity: Quantity looks doubled.",
      field: "line-0-quantity",
      lineIdx: 0,
    });
  });

  it("does not collapse multiple findings on one line", () => {
    const issues = buildReviewIssues({
      line_items: [{
        review_blocking: ["total: Line total does not match."],
        review_warnings: ["unit_price: Price above usual.", "unit: Unit unclear."],
      }],
    });
    expect(issues).toHaveLength(3);
    expect(new Set(issues.map((i) => i.id)).size).toBe(3);
    expect(issues.map((i) => i.severity)).toEqual(["blocking", "warning", "warning"]);
  });

  it("lists header and line findings together for the summary", () => {
    const issues = buildReviewIssues({
      review_blocking: ["total_amount: Totals do not reconcile."],
      review_warnings: ["due_date: Due date assumed."],
      line_items: [{}, { review_warnings: ["description: Ambiguous description."] }],
    });
    expect(issues.map((i) => i.label)).toEqual(["Header", "Header", "Line 2"]);
    expect(issues.map((i) => i.field)).toEqual(["total_amount", "due_date", "line-1-description"]);
  });

  it("navigates to the correct field and line in order", () => {
    const issues = buildReviewIssues({
      review_warnings: ["venue: Venue guessed."],
      line_items: [{ unmatched: true }, { price_changed: true, unit_price: "12.5", master_price: 10 }],
    });
    expect(issues.map((i) => ({ f: i.field, l: i.lineIdx }))).toEqual([
      { f: "venue", l: undefined },
      { f: "line-0-description", l: 0 },
      { f: "line-1-unit_price", l: 1 },
    ]);
    expect(issues[2].message).toContain("12.50");
    expect(issues[2].message).toContain("10.00");
  });

  it("adds synthetic issues only when no equivalent explicit message exists", () => {
    const issues = buildReviewIssues({
      line_items: [{
        unmatched: true,
        price_changed: true,
        unit_price: "9",
        master_price: 8,
        review_warnings: ["No Item Master match found for this line."],
      }],
    });
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toBe("No Item Master match found for this line.");
    expect(issues[1].id).toBe("line-0-price");

    const bare = buildReviewIssues({ line_items: [{ unmatched: true }] });
    expect(bare[0].message).toBe("No Item Master match has been confirmed.");
  });

  it("uses red for blocking and amber for warnings and review", () => {
    expect(issueToneClasses("blocking")).toContain("destructive");
    expect(issueToneClasses("warning")).toContain("amber");
    expect(issueToneClasses("review")).toContain("amber");
    expect(issueToneClasses("warning")).not.toContain("destructive");
  });
});
