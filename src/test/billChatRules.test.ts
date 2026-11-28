import { describe, expect, it } from "vitest";
import { billMayBeShared, canUndoBill, isYes, looksLikeEquipment, splitAmounts, usefulLifeMonths } from "@/utils/billChatRules";

describe("bill split in chat", () => {
  it("fixed amount plus the rest adds to the bill total", () => {
    expect(splitAmounts(1000, [{ venue: "Assembly", kind: "amount", value: 400 }, { venue: "Hanabi", kind: "rest", value: null }])).toEqual({ shares: [{ venue: "Assembly", amount: 400 }, { venue: "Hanabi", amount: 600 }] });
  });
  it("equal three-way split puts the rounding cent on the last venue", () => {
    expect(splitAmounts(100, ["A", "B", "C"].map(v => ({ venue: v, kind: "equal" as const, value: null })))).toEqual({ shares: [{ venue: "A", amount: 33.33 }, { venue: "B", amount: 33.33 }, { venue: "C", amount: 33.34 }] });
  });
  it("percentages that round put the cent on the last venue", () => {
    const r = splitAmounts(100.01, [{ venue: "A", kind: "percent", value: 50 }, { venue: "B", kind: "percent", value: 50 }]);
    expect(r).toEqual({ shares: [{ venue: "A", amount: 50.01 }, { venue: "B", amount: 50 }] });
  });
  it("fixed amounts that don't reach the total are refused", () => {
    expect("problem" in splitAmounts(1000, [{ venue: "A", kind: "amount", value: 300 }, { venue: "B", kind: "amount", value: 300 }])).toBe(true);
  });
});

describe("when Bani asks", () => {
  it("a printed venue alone does not settle a rent bill", () => {
    expect(billMayBeShared({ vendor: "Peel Street Properties", categories: ["Rent"], venueKnown: true })).toBe(true);
  });
  it("a plain venue bill with a known venue is clear", () => {
    expect(billMayBeShared({ vendor: "Ace Cleaning", categories: ["Cleaning"], venueKnown: true })).toBe(false);
  });
  it("no venue means asking", () => {
    expect(billMayBeShared({ vendor: "Ace Cleaning", categories: ["Cleaning"], venueKnown: false })).toBe(true);
    expect(billMayBeShared({ vendor: "Peel Street Properties", categories: ["Rent"], venueKnown: true, venueCount: 1 })).toBe(false);
  });
  it("a single kitchen equipment line is asked about", () => {
    expect(looksLikeEquipment([{ category: "Kitchen Equipment" }])).toBe(true);
    expect(looksLikeEquipment([{ category: "Cleaning" }])).toBe(false);
  });
});

describe("answers", () => {
  it("reads years and months", () => {
    expect(usefulLifeMonths("5 years")).toBe(60);
    expect(usefulLifeMonths("18 months")).toBe(18);
    expect(usefulLifeMonths("no")).toBe(0);
  });
  it("yes is yes", () => { expect(isYes("Yes")).toBe(true); expect(isYes("change Hanabi to 500")).toBe(false); });
  it("undo only while unpaid and the month is open", () => {
    expect(canUndoBill({ paid_amount: 0, payment_status: "unpaid", approval_status: "approved" }, false)).toBe(true);
    expect(canUndoBill({ paid_amount: 10, payment_status: "partial", approval_status: "approved" }, false)).toBe(false);
    expect(canUndoBill({ paid_amount: 0, payment_status: "unpaid", approval_status: "approved" }, true)).toBe(false);
  });
});
