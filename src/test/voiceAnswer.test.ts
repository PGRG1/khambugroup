import { describe, expect, it } from "vitest";
import { groundedVoiceAnswer } from "../../supabase/functions/_shared/voiceAnswer";

describe("grounded voice answer", () => {
  it("retains exact figures and qualifying statements from prose", () => {
    expect(groundedVoiceAnswer("## Sales\nSales were HK$ 1,234.56. This excludes missing trading days.\n| Venue | Sales |\n| Assembly | 999 |"))
      .toBe("Sales were HK$ 1,234.56. This excludes missing trading days.");
  });
  it("limits answers to three complete sentences without consuming slots for fillers", () => {
    expect(groundedVoiceAnswer("Sales rose. Costs fell. Labour held. More detail follows."))
      .toBe("Sales rose. Costs fell. Labour held.");
  });
  it("does not truncate a long statement or read table-only data as prose", () => {
    expect(groundedVoiceAnswer("a".repeat(601))).toBe("The detailed answer is in the chat. Please review the figures there.");
    expect(groundedVoiceAnswer("| Revenue | 12000 |" )).toBe("The detailed answer is in the chat. Please review the figures there.");
  });
});