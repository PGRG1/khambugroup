import { describe, expect, it } from "vitest";
import { cleanReplies } from "../../supabase/functions/chat-assistant/replies";

describe("cleanReplies", () => {
  it("drops dispute and price-change options when nothing is overcharged", () => {
    expect(cleanReplies(["Dispute & hold HK$0.00", "Request credit note", "Accept new prices"])).toEqual(["Book it", "Full review"]);
    expect(cleanReplies(["Dispute & hold HK$X", "Request credit note", "Accept new prices"])).toEqual(["Book it", "Full review"]);
  });
  it("keeps the options when there is a real overcharge", () => {
    const real = ["Dispute & hold HK$1,085.10", "Request credit note", "Accept new prices"];
    expect(cleanReplies(real)).toEqual(real);
    expect(cleanReplies(["Dispute & hold HK$0.50", "Accept new prices"])).toEqual(["Dispute & hold HK$0.50", "Accept new prices"]);
  });
  it("leaves ordinary replies alone and keeps at most four", () => {
    expect(cleanReplies(["Book it", "Full review"])).toEqual(["Book it", "Full review"]);
    expect(cleanReplies(["a", "b", "c", "d", "e"])).toHaveLength(4);
  });
});
