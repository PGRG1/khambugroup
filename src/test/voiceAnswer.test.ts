import { describe, expect, it } from "vitest";
import { groundedVoiceAnswer, stripToolNames } from "../../supabase/functions/_shared/voiceAnswer";

describe("grounded voice answer", () => {
  it("retains exact figures and qualifying statements from prose", () => {
    expect(groundedVoiceAnswer("## Sales\nSales were HK$ 1,234.56. This excludes missing trading days.\n| Venue | Sales |\n| Assembly | 999 |"))
      .toBe("Sales were HK$ 1,234.56. This excludes missing trading days.");
  });
  it("speaks the whole answer, not just three sentences", () => {
    expect(groundedVoiceAnswer("Sales rose. Costs fell. Labour held. More detail follows."))
      .toBe("Sales rose. Costs fell. Labour held. More detail follows.");
  });
  it("does not read table-only data as prose", () => {
    expect(groundedVoiceAnswer("| Revenue | 12000 |")).toBe("The detailed answer is in the chat. Please review the figures there.");
  });
  it("never exposes internal tool names", () => {
    expect(stripToolNames("Based on get_sales_summary data")).not.toContain("get_sales_summary");
    expect(groundedVoiceAnswer("I checked revenue_summary. Sales were HK$ 10.")).not.toContain("revenue_summary");
  });
});
