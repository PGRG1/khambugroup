import { describe, expect, it } from "vitest";
import { cleanReplies, isHandOver } from "../../supabase/functions/chat-assistant/replies";

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

describe("isHandOver", () => {
  it("treats a file handed over without a question as something to book", () => {
    for (const m of ["", "  ", "here", "delivery today", "VegFresh for Caliente", "book this", "this is the delivery from this morning"]) expect(isHandOver(m)).toBe(true);
  });
  it("lets real questions get an answer", () => {
    for (const m of ["is this price fair", "what is on this invoice", "compare suppliers for this", "check prices please", "can you explain line 3", "any overcharge?"]) expect(isHandOver(m)).toBe(false);
  });
});
