import { describe, expect, it } from "vitest";
import { confirmedWorkSpeech } from "../../supabase/functions/_shared/voiceWork";
describe("confirmed work speech", () => {
  it("selects revenue only from the confirmed revenue tool", () => {
    expect(confirmedWorkSpeech("get_sales_summary")).toBe("I'm looking at your revenue figures now.");
  });
  it("selects comparisons and supplier work from confirmed tool categories", () => {
    expect(confirmedWorkSpeech("compare_periods")).toBe("I'm comparing the revenue figures for those periods now.");
    expect(confirmedWorkSpeech("get_supplier_price_trends")).toBe("I'm checking those supplier prices now.");
  });
});