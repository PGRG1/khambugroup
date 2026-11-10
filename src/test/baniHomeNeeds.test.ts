import { describe, expect, it } from "vitest";
import { needsFromReview } from "../../supabase/functions/chat-assistant/homeNeeds";

const f = (title: string, severity: string, recommendation: string | null) =>
  ({ key: "x." + title, title, severity, assessable: true, statement: title, figures: [{ label: "Amount", value: 1, unit: "hkd", display: "HK$ 1" }], evidence: [], recommendation });

describe("Bani uses Home's things-need-you list", () => {
  it("keeps action and watch findings with a recommendation, action first", () => {
    const review = { specialists: [
      { findings: [f("Watch me", "watch", "Check it"), f("Fine", "ok", "n/a"), f("No advice", "action", null)] },
      { findings: [f("Overdue payables", "action", "Pay or schedule")] },
    ] } as any;
    expect(needsFromReview(review).map((x) => x.title)).toEqual(["Overdue payables", "Watch me"]);
    expect(needsFromReview(review)[0].figures).toEqual(["Amount: HK$ 1"]);
  });
  it("returns nothing when there is no review", () => {
    expect(needsFromReview(null)).toEqual([]);
  });
});
